import type { SurfaceChunkMeshData } from "@/lib/terrain/surface-mesher";

/**
 * Chunk vertex data as the terrain material reads it (see terrain-material.ts).
 * No three.js here: the world-builder worker packs chunks with this module.
 */
/** One chunk's vertex data in the layout the terrain material reads. All arrays are transferable. */
export type TerrainChunkBuffers = {
  positions: Float32Array;
  normals: Int8Array;
  /** sRGB bytes, exactly the block colours. */
  colors: Uint8Array;
  uvs: Float32Array;
  tex: Uint8Array;
  reveal: Float32Array;
  indices: Uint16Array | Uint32Array;
  /** What the entry needs to know about this chunk, worked out while packing so the main thread never scans vertices. */
  summary: TerrainChunkSummary;
};

export type TerrainChunkSummary = {
  /** Largest reveal delay in the chunk. */
  revealEnd: number;
  /** Loader platform vertices in the chunk: sums for the centre, highest y for the top. Null when there are none. */
  platform: { sumX: number; sumZ: number; count: number; top: number } | null;
};

function summarise(positions: Float32Array, reveal: Float32Array): TerrainChunkSummary {
  let revealEnd = 0;
  let platform: TerrainChunkSummary["platform"] = null;
  for (let vertex = 0; vertex < reveal.length / 4; vertex += 1) {
    const delay = reveal[vertex * 4 + 3];
    if (delay >= 0) {
      if (delay > revealEnd) revealEnd = delay;
      continue;
    }
    platform ??= { sumX: 0, sumZ: 0, count: 0, top: -Infinity };
    platform.sumX += positions[vertex * 3];
    platform.sumZ += positions[vertex * 3 + 2];
    platform.count += 1;
    platform.top = Math.max(platform.top, positions[vertex * 3 + 1]);
  }
  return { revealEnd, platform };
}

/** Packs a meshed chunk for the terrain material. Null when the chunk has no geometry. */
export function packTerrainChunk(data: SurfaceChunkMeshData): TerrainChunkBuffers | null {
  if (data.indices.length === 0) return null;
  const vertexCount = data.positions.length / 3;
  const normals = new Int8Array(vertexCount * 3);
  const colors = new Uint8Array(vertexCount * 3);
  for (let n = 0; n < vertexCount * 3; n += 1) {
    normals[n] = Math.round(data.normals[n] * 127);
    colors[n] = Math.round(data.colors[n] * 255);
  }
  let tex: Uint8Array;
  let reveal: Float32Array;
  if (data.packed) {
    ({ tex, reveal } = data.packed);
  } else {
    tex = new Uint8Array(vertexCount * 4);
    reveal = new Float32Array(vertexCount * 4);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      tex[vertex * 4] = data.textureKinds[vertex];
      tex[vertex * 4 + 1] = data.textureVariants[vertex];
      tex[vertex * 4 + 2] = data.uvRotations[vertex] + (data.uvMirrors[vertex] > 0.5 ? 4 : 0);
      tex[vertex * 4 + 3] = Math.round(data.variations[vertex] * 255);
      reveal[vertex * 4] = data.cellOrigins[vertex * 3];
      reveal[vertex * 4 + 1] = data.cellOrigins[vertex * 3 + 1];
      reveal[vertex * 4 + 2] = data.cellOrigins[vertex * 3 + 2];
      reveal[vertex * 4 + 3] = data.centerFlags[vertex] > 0.5 ? -1 : data.revealDelays[vertex];
    }
  }
  return {
    positions: data.positions,
    normals,
    colors,
    uvs: data.uvs,
    tex,
    reveal,
    indices: vertexCount > 65535 ? data.indices : new Uint16Array(data.indices),
    summary: summarise(data.positions, reveal),
  };
}

export function terrainChunkTransferables(buffers: TerrainChunkBuffers): Transferable[] {
  return [buffers.positions.buffer, buffers.normals.buffer, buffers.colors.buffer, buffers.uvs.buffer, buffers.tex.buffer, buffers.reveal.buffer, buffers.indices.buffer];
}
