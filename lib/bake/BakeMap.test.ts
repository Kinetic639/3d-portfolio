import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createBakedQuery, readVoxelZoneVolume } from "@/lib/engine/baked-terrain";
import { createVoxelWorldQuery } from "@/lib/engine/world-query";
import { createBlankMapDefinition, createLoadedMapState, createMapDefinitionFromWorld, type MapDefinition } from "@/lib/maps/map-definition";
import { writeMap } from "@/lib/maps/map-store";
import { createDefaultZone } from "@/lib/maps/zone-authoring";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { bakeMap } from "./bake-map";
import { bakeMapToDisk, getBakeStatus, listFreshBakes } from "./bake-store";
import { bakedFloat32, bakedInt8, decodeBakedWorld } from "./baked-format";
import { blurDensity, buildSmoothSurface, extractSurface, filterSurface, type SmoothSurface } from "./smooth-mesher";

/** A 64 x 64 map with a hill, a pit and, optionally, a mini-game zone over part of the hill. */
function createTestMap(withMinigameZone: boolean): MapDefinition {
  const blank = createBlankMapDefinition({ id: "bake-test", name: "Bake test", width: 64, depth: 64 });
  const { world } = createLoadedMapState(blank);
  for (let z = 20; z < 40; z += 1) {
    for (let x = 20; x < 40; x += 1) {
      const height = Math.max(0, 4 - Math.floor(Math.hypot(x - 30, z - 30) / 2));
      for (let y = 1; y <= height; y += 1) world.setBlock(x, y, z, BLOCK_IDS.Stone);
    }
  }
  world.setBlock(10, 0, 10, BLOCK_IDS.Air);
  const zone = { ...createDefaultZone(1), kind: "minigame" as const, minigame: { gameId: "dig" } };
  if (withMinigameZone) {
    for (let z = 26; z < 36; z += 1) for (let x = 24; x < 32; x += 1) world.setColumnZone(x, z, 1);
  }
  return createMapDefinitionFromWorld({ ...blank, world, zones: withMinigameZone ? [zone] : [] });
}

function triangleKeys(surface: Pick<SmoothSurface, "positions" | "indices">) {
  const keys = new Set<string>();
  for (let triangle = 0; triangle < surface.indices.length / 3; triangle += 1) {
    const corners = [0, 1, 2].map((n) => {
      const at = surface.indices[triangle * 3 + n] * 3;
      return [0, 1, 2].map((axis) => surface.positions[at + axis].toFixed(3)).join(",");
    });
    keys.add(corners.sort().join("|"));
  }
  return keys;
}

describe("bakeMap", () => {
  it("produces a file that decodes to simplified meshes inside the map", async () => {
    const { file, header } = await bakeMap(createTestMap(false));
    const baked = decodeBakedWorld(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
    expect(baked.header.map.id).toBe("bake-test");
    expect(header.stats.bytes).toBe(file.byteLength);
    // Mostly flat ground: simplification removes the bulk of the triangles.
    expect(header.stats.playableTriangles + header.stats.backdropTriangles).toBeLessThan(header.stats.sourceTriangles / 3);
    expect(header.voxelZones).toEqual([]);

    let triangles = 0;
    for (const mesh of baked.header.meshes) {
      const positions = bakedFloat32(baked, mesh.positions);
      expect(positions.length).toBe(mesh.vertexCount * 3);
      triangles += mesh.indexCount / 3;
      for (let n = 0; n < positions.length; n += 3) {
        expect(Math.abs(positions[n])).toBeLessThanOrEqual(32.001);
        expect(Math.abs(positions[n + 2])).toBeLessThanOrEqual(32.001);
        expect(positions[n + 1]).toBeGreaterThan(-1);
        expect(positions[n + 1]).toBeLessThan(6);
      }
    }
    expect(triangles).toBe(header.stats.playableTriangles + header.stats.backdropTriangles);
  });

  it("stores terrain height per column and answers rays like the voxel world does", async () => {
    const map = createTestMap(false);
    const { world } = createLoadedMapState(map);
    const { file } = await bakeMap(map);
    const baked = decodeBakedWorld(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
    const heights = bakedInt8(baked, baked.header.heights);
    expect(heights[30 + 64 * 30]).toBe(5);
    expect(heights[5 + 64 * 5]).toBe(1);

    const bakedQuery = createBakedQuery(baked);
    const voxelQuery = createVoxelWorldQuery(world);
    const direction = { x: 0, y: -Math.sin(0.96), z: -Math.cos(0.96) };
    for (const [x, z] of [[-20, 25], [0.4, 12.3], [-1.6, 4.2], [7.7, 2.1], [25.2, -10.4]]) {
      const origin = { x, y: 40, z: z + 30 };
      const expected = voxelQuery.raycast(origin, direction)!;
      const actual = bakedQuery.raycast(origin, direction)!;
      expect([actual.x, actual.z]).toEqual([expected.x, expected.z]);
      expect(actual.distance).toBeCloseTo(expected.distance, 1);
    }
    expect(bakedQuery.surfaceHeight(30, 30)).toBe(voxelQuery.surfaceHeight(30, 30));
    expect(bakedQuery.columnZone(200, 3)).toBe(0);
  });

  it("leaves mini-game zones out of the static mesh and stores voxels that re-mesh to exactly the missing part", async () => {
    const map = createTestMap(true);
    const { world } = createLoadedMapState(map);
    const { file, header } = await bakeMap(map, { playableError: 0, backdropError: 0 });
    const baked = decodeBakedWorld(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
    expect(header.voxelZones).toHaveLength(1);
    const [zone] = baked.header.voxelZones;
    expect(zone.region).toEqual({ minX: 24, maxX: 31, minZ: 26, maxZ: 35 });

    const inZone = (x: number, z: number) => x >= 24 && x <= 31 && z >= 26 && z <= 35;
    const whole = buildSmoothSurface(world, { minX: 0, maxX: 63, minZ: 0, maxZ: 63 });
    const expected = triangleKeys(filterSurface(whole, inZone));
    const remeshed = triangleKeys(filterSurface(extractSurface(blurDensity(readVoxelZoneVolume(baked, zone)), zone.region), inZone));
    expect(remeshed.size).toBeGreaterThan(100);
    expect(remeshed).toEqual(expected);

    // No static triangle lies inside the zone.
    const zoneBox = { minX: 24 - 32, maxX: 32 - 32, minZ: 26 - 32, maxZ: 36 - 32 };
    for (const mesh of baked.header.meshes) {
      const positions = bakedFloat32(baked, mesh.positions);
      for (let n = 0; n < positions.length; n += 3) {
        const strictlyInside = positions[n] > zoneBox.minX + 0.6 && positions[n] < zoneBox.maxX - 0.6 && positions[n + 2] > zoneBox.minZ + 0.6 && positions[n + 2] < zoneBox.maxZ - 0.6;
        expect(strictlyInside).toBe(false);
      }
    }
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
