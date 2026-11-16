import * as THREE from "three";
import { createLoadedMapState, type MapDefinition } from "@/lib/maps/map-definition";
import { buildSurfaceChunkMesh } from "@/lib/terrain/surface-mesher";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { getChunkCounts } from "@/lib/world/world-config";
import { packTerrainChunk, type TerrainChunkBuffers } from "./terrain-chunk";
import { createEditorTerrainUniforms, createTerrainGeometry, createTerrainMaterial, createTerrainUniforms, type EditorTerrainUniforms, type TerrainUniforms } from "./terrain-material";
import type { BakedWorld } from "@/lib/bake/baked-format";
import { decodeBakedMeshes } from "@/lib/bake/baked-decode";
import type { WorldBuildMessage, WorldBuildRequest } from "./world-builder.worker";

/**
 * Voxel terrain as chunked three.js meshes, built from the surface mesher.
 *
 * This is the *voxel* view of a map: the editor uses it, mini-game zones use
 * it, and until a map is baked the visitor runtime uses it too. The baked
 * world (smooth static geometry) replaces it behind the same `TerrainSource`
 * shape, so the engine does not care which one it renders.
 *
 * Both draw with the same material from the same kind of vertex data: a
 * baked world is decoded into exactly the buffers the live mesher would have
 * produced, so the entry wave and the look are identical.
 */
export type TerrainSource = {
  group: THREE.Group;
  /** Every renderable mesh, for warm-up. */
  meshes: () => THREE.Mesh[];
  /** Rebuilds the listed chunks ("chunk-x-z") in place. Cost is proportional to the list, not the world. */
  rebuildChunks: (chunkIds: Iterable<string>) => void;
  /** Puts in, replaces or (with null) removes one mesh by id. Mini-games use it for a baked world's zone meshes. */
  setMesh: (id: string, buffers: TerrainChunkBuffers | null) => void;
  triangleCount: () => number;
  /** Reveal and loader uniforms of voxel terrain; absent on sources that have no reveal. */
  uniforms?: TerrainUniforms;
  /** Grid and neutral-colour switches; only on terrain built for the editor. */
  editorUniforms?: EditorTerrainUniforms;
  dispose: () => void;
};

export type TerrainBuildOptions = {
  /** Fraction 0-1. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Longest stretch of main-thread work before yielding, in ms. */
  sliceBudgetMs?: number;
  /** Build with the editor's view options (grid lines, neutral colour). */
  editorView?: boolean;
};

type ChunkBuffers = TerrainChunkBuffers;

function yieldToMain() {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const createGeometry = createTerrainGeometry;

function meshChunk(world: VoxelWorld, chunkX: number, chunkZ: number): ChunkBuffers | null {
  return packTerrainChunk(buildSurfaceChunkMesh(world, chunkX, chunkZ, { skipMappings: true, packed: true }));
}

/** A terrain source. With a voxel world, `rebuildChunks` remeshes chunks from it; without one (a baked world) it is static. */
function createTerrainSource(world: VoxelWorld | null, editorView = false) {
  const group = new THREE.Group();
  group.name = "terrain";
  const uniforms = createTerrainUniforms();
  const editorUniforms = editorView ? createEditorTerrainUniforms() : undefined;
  const material = createTerrainMaterial(uniforms, undefined, editorUniforms);
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
    // Terrain shows the shadows of objects; it casts none (the second pass over every tile would cost more than it shows).
    mesh.receiveShadow = true;
    meshes.set(id, mesh);
    group.add(mesh);
  };

  const source: TerrainSource = {
    group,
    uniforms,
    editorUniforms,
    setMesh: setChunk,
    meshes: () => [...meshes.values()],
    rebuildChunks(chunkIds) {
      if (!world) return;
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
  const { source, setChunk } = createTerrainSource(world, options.editorView);
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
          built = { world, ...createTerrainSource(world, options.editorView) };
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

/**
 * Baked terrain: the visible faces in the file are written out as vertex
 * buffers in the world-builder worker (or here, when workers are missing),
 * then wrapped in geometries. The file's data is transferred to the worker.
 */
export function buildBakedTerrain(baked: BakedWorld, options: TerrainBuildOptions = {}): Promise<TerrainSource> {
  const { source, setChunk } = createTerrainSource(null, options.editorView);
  if (typeof Worker === "undefined") {
    for (const mesh of decodeBakedMeshes(baked)) setChunk(mesh.id, mesh.buffers);
    options.onProgress?.(1);
    return Promise.resolve(source);
  }
  return new Promise<TerrainSource>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./world-builder.worker.ts", import.meta.url), { type: "module" });
    } catch {
      for (const mesh of decodeBakedMeshes(baked)) setChunk(mesh.id, mesh.buffers);
      resolve(source);
      return;
    }
    const finish = (error?: unknown) => {
      worker.terminate();
      options.signal?.removeEventListener("abort", onAbort);
      if (error) {
        source.dispose();
        reject(error);
      } else {
        resolve(source);
      }
    };
    const onAbort = () => finish(new DOMException("World build aborted.", "AbortError"));
    options.signal?.addEventListener("abort", onAbort);
    worker.onerror = (event) => finish(new Error(event.message || "World builder worker failed."));
    worker.onmessage = (event: MessageEvent<WorldBuildMessage>) => {
      const message = event.data;
      if (message.type === "chunk") {
        setChunk(message.id, message);
        options.onProgress?.(message.done / message.total);
      } else if (message.type === "done") {
        options.onProgress?.(1);
        finish();
      } else if (message.type === "error") {
        finish(new Error(message.message));
      }
    };
    // A copy goes to the worker: the caller keeps reading the file's columns.
    const data = baked.data.slice(0);
    worker.postMessage({ type: "decode-baked", header: baked.header, data } satisfies WorldBuildRequest, [data]);
  });
}

/** Baked terrain decoded on this thread; for the editor's baked view. */
export function createBakedTerrainSync(baked: BakedWorld): TerrainSource {
  const { source, setChunk } = createTerrainSource(null);
  for (const mesh of decodeBakedMeshes(baked)) setChunk(mesh.id, mesh.buffers);
  return source;
}

async function buildWorldOnMainThread(definition: MapDefinition, options: TerrainBuildOptions): Promise<BuiltWorld> {
  const { world } = createLoadedMapState(definition);
  return { world, terrain: await buildVoxelTerrain(world, options) };
}
