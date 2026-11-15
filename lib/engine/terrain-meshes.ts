import * as THREE from "three";
import { createLoadedMapState, type MapDefinition } from "@/lib/maps/map-definition";
import { buildSurfaceChunkMesh } from "@/lib/terrain/surface-mesher";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { getChunkCounts } from "@/lib/world/world-config";
import type { WorldBuildMessage, WorldBuildRequest } from "./world-builder.worker";

/**
 * Voxel terrain as chunked three.js meshes, built from the surface mesher.
 *
 * This is the *voxel* view of a map: the editor uses it, mini-game zones use
 * it, and until a map is baked the visitor runtime uses it too. The baked
 * world (smooth static geometry) replaces it behind the same `TerrainSource`
 * shape, so the engine does not care which one it renders.
 */
export type TerrainSource = {
  group: THREE.Group;
  /** Every renderable mesh, for warm-up. */
  meshes: () => THREE.Mesh[];
  /** Rebuilds the listed chunks ("chunk-x-z") in place. Cost is proportional to the list, not the world. */
  rebuildChunks: (chunkIds: Iterable<string>) => void;
  triangleCount: () => number;
  dispose: () => void;
};

export type TerrainBuildOptions = {
  /** Fraction 0-1. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Longest stretch of main-thread work before yielding, in ms. */
  sliceBudgetMs?: number;
};

type ChunkBuffers = {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint16Array | Uint32Array;
};

const srgbToLinear = (value: number) => (value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));

function yieldToMain() {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function createGeometry(buffers: ChunkBuffers) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(buffers.normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(buffers.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function meshChunk(world: VoxelWorld, chunkX: number, chunkZ: number): ChunkBuffers | null {
  const data = buildSurfaceChunkMesh(world, chunkX, chunkZ, { renderOnly: true });
  if (data.indices.length === 0) return null;
  // The mesher emits sRGB block colours; three.js lights in linear space.
  const colors = new Float32Array(data.colors.length);
  for (let index = 0; index < colors.length; index += 1) colors[index] = srgbToLinear(data.colors[index]);
  const indices = data.positions.length / 3 > 65535 ? data.indices : new Uint16Array(data.indices);
  return { positions: data.positions, normals: data.normals, colors, indices };
}

function createTerrainSource(world: VoxelWorld) {
  const group = new THREE.Group();
  group.name = "terrain";
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const meshes = new Map<string, THREE.Mesh>();

  const setChunk = (id: string, buffers: ChunkBuffers | null) => {
    const existing = meshes.get(id);
    if (existing) {
      existing.geometry.dispose();
      if (buffers) {
        existing.geometry = createGeometry(buffers);
      } else {
        group.remove(existing);
        meshes.delete(id);
      }
      return;
    }
    if (!buffers) return;
    const mesh = new THREE.Mesh(createGeometry(buffers), material);
    mesh.name = id;
    // Vertices are already in world space; skip per-frame matrix work.
    mesh.matrixAutoUpdate = false;
    meshes.set(id, mesh);
    group.add(mesh);
  };

  const source: TerrainSource = {
    group,
    meshes: () => [...meshes.values()],
    rebuildChunks(chunkIds) {
      for (const id of chunkIds) {
        const match = /^chunk-(\d+)-(\d+)$/.exec(id);
        if (match) setChunk(id, meshChunk(world, Number(match[1]), Number(match[2])));
      }
    },
    triangleCount() {
      let triangles = 0;
      meshes.forEach((mesh) => {
        triangles += (mesh.geometry.index?.count ?? 0) / 3;
      });
      return triangles;
    },
    dispose() {
      meshes.forEach((mesh) => mesh.geometry.dispose());
      meshes.clear();
      material.dispose();
      group.clear();
    },
  };
  return { source, setChunk };
}

/** Main-thread build, in time slices. Used when workers are unavailable and by tools. */
export async function buildVoxelTerrain(world: VoxelWorld, options: TerrainBuildOptions = {}): Promise<TerrainSource> {
  const { source, setChunk } = createTerrainSource(world);
  const counts = getChunkCounts(world.config);
  const total = counts.x * counts.z;
  const budget = options.sliceBudgetMs ?? 8;
  let sliceStart = performance.now();
  let done = 0;

  for (let chunkZ = 0; chunkZ < counts.z; chunkZ += 1) {
    for (let chunkX = 0; chunkX < counts.x; chunkX += 1) {
      setChunk(world.getChunkId(chunkX, chunkZ), meshChunk(world, chunkX, chunkZ));
      done += 1;
      if (performance.now() - sliceStart >= budget) {
        options.onProgress?.(done / total);
        await yieldToMain();
        if (options.signal?.aborted) {
          source.dispose();
          throw new DOMException("Terrain build aborted.", "AbortError");
        }
        sliceStart = performance.now();
      }
    }
  }
  options.onProgress?.(1);
  return source;
}

export type BuiltWorld = { world: VoxelWorld; terrain: TerrainSource };

/**
 * Builds the voxel world and its meshes for a map. The heavy work (validating
 * the map, filling the voxel arrays, meshing every chunk) runs in a worker;
 * the main thread only wraps the returned buffers in geometries.
 */
export function buildWorldForMap(definition: MapDefinition, options: TerrainBuildOptions = {}): Promise<BuiltWorld> {
  if (typeof Worker === "undefined") return buildWorldOnMainThread(definition, options);

  return new Promise<BuiltWorld>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./world-builder.worker.ts", import.meta.url), { type: "module" });
    } catch {
      buildWorldOnMainThread(definition, options).then(resolve, reject);
      return;
    }

    let built: { world: VoxelWorld; source: TerrainSource; setChunk: (id: string, buffers: ChunkBuffers | null) => void } | null = null;
    const finish = (error?: unknown) => {
      worker.terminate();
      options.signal?.removeEventListener("abort", onAbort);
      if (error) {
        built?.source.dispose();
        reject(error);
      } else if (built) {
        resolve({ world: built.world, terrain: built.source });
      }
    };
    const onAbort = () => finish(new DOMException("World build aborted.", "AbortError"));
    options.signal?.addEventListener("abort", onAbort);

    worker.onerror = (event) => finish(new Error(event.message || "World builder worker failed."));
    worker.onmessage = (event: MessageEvent<WorldBuildMessage>) => {
      const message = event.data;
      switch (message.type) {
        case "world": {
          const world = new VoxelWorld(message.config, message.blocks, message.zones, message.shapes, message.rotations, message.states);
          built = { world, ...createTerrainSource(world) };
          break;
        }
        case "chunk":
          built?.setChunk(message.id, message);
          options.onProgress?.(message.done / message.total);
          break;
        case "done":
          options.onProgress?.(1);
          finish();
          break;
        case "error":
          finish(new Error(message.message));
          break;
      }
    };
    worker.postMessage({ type: "build", definition } satisfies WorldBuildRequest);
  });
}

async function buildWorldOnMainThread(definition: MapDefinition, options: TerrainBuildOptions): Promise<BuiltWorld> {
  const { world } = createLoadedMapState(definition);
  return { world, terrain: await buildVoxelTerrain(world, options) };
}
