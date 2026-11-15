import { createLoadedMapState, type MapDefinition } from "@/lib/maps/map-definition";
import { buildSurfaceChunkMesh } from "@/lib/terrain/surface-mesher";
import { getChunkCounts, type WorldConfig } from "@/lib/world/world-config";

/**
 * Builds a map's voxel world and its chunk meshes off the main thread, so the
 * landing page stays responsive while the world loads behind it.
 *
 * Protocol: one `build` request in; then `world` (the voxel arrays, copied),
 * one `chunk` per non-empty chunk (buffers transferred), and `done`; or `error`.
 */
export type WorldBuildRequest = { type: "build"; definition: MapDefinition };

export type WorldBuildChunk = {
  type: "chunk";
  id: string;
  positions: Float32Array;
  normals: Float32Array;
  /** Linear-space vertex colours. */
  colors: Float32Array;
  indices: Uint16Array | Uint32Array;
  done: number;
  total: number;
};

export type WorldBuildMessage =
  | { type: "world"; config: WorldConfig; blocks: Uint16Array; zones: Uint8Array; shapes: Uint8Array; rotations: Uint8Array; states: Uint8Array }
  | WorldBuildChunk
  | { type: "done" }
  | { type: "error"; message: string };

const srgbToLinear = (value: number) => (value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
// Typed by hand: the project compiles against the DOM library, not the worker one.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorldBuildRequest>) => void) | null;
  postMessage: (message: WorldBuildMessage, transfer?: Transferable[]) => void;
};

scope.onmessage = (event: MessageEvent<WorldBuildRequest>) => {
  try {
    const { world } = createLoadedMapState(event.data.definition);
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
        const data = buildSurfaceChunkMesh(world, chunkX, chunkZ);
        done += 1;
        if (data.indices.length === 0) continue;
        const colors = new Float32Array(data.colors.length);
        for (let index = 0; index < colors.length; index += 1) colors[index] = srgbToLinear(data.colors[index]);
        const indices = data.positions.length / 3 > 65535 ? data.indices : new Uint16Array(data.indices);
        const message: WorldBuildChunk = { type: "chunk", id: data.id, positions: data.positions, normals: data.normals, colors, indices, done, total };
        scope.postMessage(message, [message.positions.buffer, message.normals.buffer, message.colors.buffer, message.indices.buffer]);
      }
    }
    scope.postMessage({ type: "done" } satisfies WorldBuildMessage);
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) } satisfies WorldBuildMessage);
  }
};
