import { decodeBakedMeshes } from "@/lib/bake/baked-decode";
import type { BakedHeader } from "@/lib/bake/baked-format";
import { createLoadedMapState, type MapDefinition } from "@/lib/maps/map-definition";
import { buildSurfaceChunkMesh } from "@/lib/terrain/surface-mesher";
import { getChunkCounts, type WorldConfig } from "@/lib/world/world-config";
import { packTerrainChunk, terrainChunkTransferables, type TerrainChunkBuffers } from "./terrain-chunk";

/**
 * Builds a map's voxel world and its chunk meshes off the main thread, so the
 * landing page stays responsive while the world loads behind it.
 *
 * Protocol: one `build` request in; then `world` (the voxel arrays, copied),
 * one `chunk` per non-empty chunk (buffers transferred), and `done`; or `error`.
 * A `decode-baked` request writes out a baked world's faces instead: one
 * `chunk` per tile (and the loader platform, and mini-game zones), no `world`.
 */
export type WorldBuildRequest =
  | { type: "build"; definition: MapDefinition }
  | { type: "decode-baked"; header: BakedHeader; data: ArrayBuffer };

export type WorldBuildChunk = TerrainChunkBuffers & {
  type: "chunk";
  id: string;
  done: number;
  total: number;
};

export type WorldBuildMessage =
  | { type: "world"; config: WorldConfig; blocks: Uint16Array; zones: Uint8Array; shapes: Uint8Array; rotations: Uint8Array; states: Uint8Array }
  | WorldBuildChunk
  | { type: "done" }
  | { type: "error"; message: string };

// Typed by hand: the project compiles against the DOM library, not the worker one.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorldBuildRequest>) => void) | null;
  postMessage: (message: WorldBuildMessage, transfer?: Transferable[]) => void;
};

scope.onmessage = (event: MessageEvent<WorldBuildRequest>) => {
  const request = event.data;
  if (request.type === "decode-baked") {
    try {
      const meshes = decodeBakedMeshes({ header: request.header, data: request.data });
      meshes.forEach((mesh, index) => {
        const message: WorldBuildChunk = { type: "chunk", id: mesh.id, ...mesh.buffers, done: index + 1, total: meshes.length };
        scope.postMessage(message, terrainChunkTransferables(mesh.buffers));
      });
      scope.postMessage({ type: "done" } satisfies WorldBuildMessage);
    } catch (error) {
      scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) } satisfies WorldBuildMessage);
    }
    return;
  }
  try {
    const { world } = createLoadedMapState(request.definition);
    // Copies, not transfers: the worker still needs the world to mesh it.
    const worldMessage: WorldBuildMessage = {
      type: "world",
      config: world.config,
      blocks: world.blocks.slice(),
      zones: world.zones.slice(),
      shapes: world.shapes.slice(),
      rotations: world.rotations.slice(),
      states: world.states.slice(),
    };
    scope.postMessage(worldMessage, [worldMessage.blocks.buffer, worldMessage.zones.buffer, worldMessage.shapes.buffer, worldMessage.rotations.buffer, worldMessage.states.buffer]);

    const counts = getChunkCounts(world.config);
    const total = counts.x * counts.z;
    let done = 0;
    for (let chunkZ = 0; chunkZ < counts.z; chunkZ += 1) {
      for (let chunkX = 0; chunkX < counts.x; chunkX += 1) {
        const data = buildSurfaceChunkMesh(world, chunkX, chunkZ, { skipMappings: true, packed: true });
        done += 1;
        const buffers = packTerrainChunk(data);
        if (!buffers) continue;
        const message: WorldBuildChunk = { type: "chunk", id: data.id, ...buffers, done, total };
        scope.postMessage(message, terrainChunkTransferables(buffers));
      }
    }
    scope.postMessage({ type: "done" } satisfies WorldBuildMessage);
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) } satisfies WorldBuildMessage);
  }
};
