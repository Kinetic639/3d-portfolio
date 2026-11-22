import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createBakedQuery } from "@/lib/engine/baked-terrain";
import type { TerrainChunkBuffers } from "@/lib/engine/terrain-chunk";
import { packTerrainChunk } from "@/lib/engine/terrain-chunk";
import { createVoxelWorldQuery } from "@/lib/engine/world-query";
import { createBlankMapDefinition, createLoadedMapState, createMapDefinitionFromWorld, type MapDefinition } from "@/lib/maps/map-definition";
import { writeMap } from "@/lib/maps/map-store";
import { createDefaultZone } from "@/lib/maps/zone-authoring";
import { buildSurfaceChunkMesh } from "@/lib/terrain/surface-mesher";
import { SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { getChunkCounts } from "@/lib/world/world-config";
import { bakeMap } from "./bake-map";
import { bakeMapToDisk, getBakeStatus, listFreshBakes } from "./bake-store";
import { decodeBakedMeshes } from "./baked-decode";
import { bakedInt8, decodeBakedWorld } from "./baked-format";

/** A 64 x 64 map with a hill of mixed materials, slopes, stairs and slabs on it, a pit, and optionally a mini-game zone over part of the hill. */
function createTestMap(withMinigameZone: boolean): MapDefinition {
  const blank = createBlankMapDefinition({ id: "bake-test", name: "Bake test", width: 64, depth: 64 });
  const { world } = createLoadedMapState(blank);
  for (let z = 20; z < 40; z += 1) {
    for (let x = 20; x < 40; x += 1) {
      const height = Math.max(0, 4 - Math.floor(Math.hypot(x - 30, z - 30) / 2));
      for (let y = 1; y <= height; y += 1) world.setBlock(x, y, z, (x + z) % 3 === 0 ? BLOCK_IDS.Stone : BLOCK_IDS.Ground);
      if (height > 0 && height < 4) {
        // Shaped cells on the hill's flanks: what a bake must keep exactly.
        world.setBlock(x, height + 1, z, BLOCK_IDS.MossyStone);
        world.setShape(x, height + 1, z, [SHAPE_IDS.SLOPE_SHALLOW, SHAPE_IDS.STAIR, SHAPE_IDS.SLAB, SHAPE_IDS.SLOPE_OUTER_CORNER][(x * 7 + z) % 4]);
        world.setRotation(x, height + 1, z, ((x + z) % 4) as 0 | 1 | 2 | 3);
      }
    }
  }
  world.setBlock(10, 0, 10, BLOCK_IDS.Air);
  const zone = { ...createDefaultZone(1), kind: "minigame" as const, minigame: { gameId: "dig" } };
  if (withMinigameZone) {
    for (let z = 26; z < 36; z += 1) for (let x = 24; x < 32; x += 1) world.setColumnZone(x, z, 1);
  }
  return createMapDefinitionFromWorld({ ...blank, world, zones: withMinigameZone ? [zone] : [] });
}

/** Every face of a set of meshes, as a sortable record of all its vertex data. */
function faceRecords(meshes: TerrainChunkBuffers[]) {
  const records: string[] = [];
  for (const mesh of meshes) {
    for (let face = 0; face < mesh.indices.length / 6; face += 1) {
      const first = mesh.indices[face * 6];
      const values: number[] = [];
      for (let corner = 0; corner < 4; corner += 1) {
        const vertex = first + corner;
        values.push(
          ...mesh.positions.subarray(vertex * 3, vertex * 3 + 3),
          ...mesh.normals.subarray(vertex * 3, vertex * 3 + 3),
          ...mesh.colors.subarray(vertex * 3, vertex * 3 + 3),
          ...mesh.uvs.subarray(vertex * 2, vertex * 2 + 2),
          ...mesh.tex.subarray(vertex * 4, vertex * 4 + 4),
          ...mesh.reveal.subarray(vertex * 4, vertex * 4 + 4),
        );
      }
      records.push(values.join(","));
    }
  }
  return records.sort();
}

function liveFaces(map: MapDefinition) {
  const { world } = createLoadedMapState(map);
  const counts = getChunkCounts(world.config);
  const chunks: TerrainChunkBuffers[] = [];
  for (let z = 0; z < counts.z; z += 1) {
    for (let x = 0; x < counts.x; x += 1) {
      const buffers = packTerrainChunk(buildSurfaceChunkMesh(world, x, z, { skipMappings: true, packed: true }));
      if (buffers) chunks.push(buffers);
    }
  }
  return faceRecords(chunks);
}

const asArrayBuffer = (file: Uint8Array) => file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;

describe("bakeMap", () => {
  it("decodes to exactly the faces the live mesher draws: same shapes, textures and reveal data", async () => {
    const map = createTestMap(false);
    const { file, header } = await bakeMap(map);
    const baked = decodeBakedWorld(asArrayBuffer(file));
    expect(baked.header.map.id).toBe("bake-test");
    expect(header.stats.bytes).toBe(file.byteLength);
    expect(header.stats.faces).toBe(header.stats.sourceFaces);
    expect(header.voxelZones).toEqual([]);

    const meshes = decodeBakedMeshes(baked);
    // 64 x 64 is one tile of 4 x 4 chunks, plus the loader platform's own mesh.
    expect(meshes.map((mesh) => mesh.id).sort()).toEqual(["loader", "tile-0-0"]);
    expect(faceRecords(meshes.map((mesh) => mesh.buffers))).toEqual(liveFaces(map));
  });

  it("keeps mini-game zones as voxels and the whole still matches the live terrain", async () => {
    const map = createTestMap(true);
    const { file, header } = await bakeMap(map);
    expect(header.voxelZones).toHaveLength(1);
    const [zone] = header.voxelZones;
    // The zone's columns plus one all round are live; one more ring is stored for neighbours.
    expect(zone.live).toEqual({ minX: 23, maxX: 32, minZ: 25, maxZ: 36 });
    expect(zone.stored).toEqual({ minX: 22, maxX: 33, minZ: 24, maxZ: 37 });

    const baked = decodeBakedWorld(asArrayBuffer(file));
    const meshes = decodeBakedMeshes(baked);
    const zoneMesh = meshes.find((mesh) => mesh.id === "zone-1")!;
    expect(zoneMesh).toBeTruthy();
    // No baked tile face lies inside the live columns.
    for (const mesh of meshes.filter((candidate) => candidate.id.startsWith("tile-"))) {
      for (let vertex = 0; vertex < mesh.buffers.reveal.length / 4; vertex += 1) {
        const x = mesh.buffers.reveal[vertex * 4] + 31.5;
        const z = mesh.buffers.reveal[vertex * 4 + 2] + 31.5;
        expect(x >= 23 && x <= 32 && z >= 25 && z <= 36).toBe(false);
      }
    }
    expect(faceRecords(meshes.map((mesh) => mesh.buffers))).toEqual(liveFaces(map));
  });

  it("stores terrain height per column and answers rays like the voxel world does", async () => {
    const map = createTestMap(false);
    const { world } = createLoadedMapState(map);
    const { file } = await bakeMap(map);
    const baked = decodeBakedWorld(asArrayBuffer(file));
    const heights = bakedInt8(baked, baked.header.heights);
    expect(heights[30 + 64 * 30]).toBe(5);
    expect(heights[5 + 64 * 5]).toBe(1);

    const bakedQuery = createBakedQuery(baked);
    const voxelQuery = createVoxelWorldQuery(world);
    const direction = { x: 0, y: -Math.sin(0.96), z: -Math.cos(0.96) };
    for (const [x, z] of [[-20, 25], [0.4, 12.3], [7.7, 2.1], [25.2, -10.4]]) {
      const origin = { x, y: 40, z: z + 30 };
      const expected = voxelQuery.raycast(origin, direction)!;
      const actual = bakedQuery.raycast(origin, direction)!;
      expect([actual.x, actual.z]).toEqual([expected.x, expected.z]);
    }
    expect(bakedQuery.surfaceHeight(30, 30)).toBe(voxelQuery.surfaceHeight(30, 30));
    expect(bakedQuery.columnZone(200, 3)).toBe(0);

    // Where creatures stand: the exact surface, the same baked as live at every column's centre;
    // partial shapes (slabs, stairs, slopes) are lower than the top of their cell.
    let partial = 0;
    for (let z = 0; z < 64; z += 1) {
      for (let x = 0; x < 64; x += 1) {
        const centre = voxelQuery.cellToWorld(x, 0, z);
        const live = voxelQuery.groundAt(centre.x, centre.z);
        expect(bakedQuery.groundAt(centre.x, centre.z)).toBeCloseTo(live, 1);
        if (live < voxelQuery.surfaceHeight(x, z) - 0.01) partial += 1;
      }
    }
    expect(partial).toBeGreaterThan(0);
  });
});

describe("bake store", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bake-store-"));
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("reports missing, fresh and stale bakes", async () => {
    const map = createTestMap(false);
    writeMap(map, { root });
    expect(getBakeStatus("bake-test", root).state).toBe("missing");

    const record = await bakeMapToDisk("bake-test", { root });
    expect(getBakeStatus("bake-test", root)).toMatchObject({ state: "fresh", record: { hash: record.hash } });
    expect(listFreshBakes(root)).toEqual({ "bake-test": record.hash });

    // Saving again without changes only moves the timestamp: still fresh.
    writeMap(map, { root });
    expect(getBakeStatus("bake-test", root).state).toBe("fresh");

    writeMap({ ...map, name: "Changed" }, { root });
    expect(getBakeStatus("bake-test", root).state).toBe("stale");
    expect(listFreshBakes(root)).toEqual({});
  });
});
