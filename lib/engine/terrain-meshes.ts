import * as THREE from "three";
import { buildSurfaceChunkMesh } from "@/lib/terrain/surface-mesher";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import { getChunkCounts } from "@/lib/world/world-config";

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
  /** Rebuilds the listed chunks ("chunk-x-z") in place. Cost is proportional to the list, not the world. */
  rebuildChunks: (chunkIds: Iterable<string>) => void;
  triangleCount: () => number;
  dispose: () => void;
};

export type TerrainBuildOptions = {
  /** Fraction 0-1, reported between time slices. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Longest stretch of main-thread work before yielding, in ms. */
  sliceBudgetMs?: number;
};

const srgbToLinear = (value: number) => (value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));

function yieldToMain() {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function createChunkGeometry(world: VoxelWorld, chunkX: number, chunkZ: number): THREE.BufferGeometry | null {
  const data = buildSurfaceChunkMesh(world, chunkX, chunkZ);
  if (data.indices.length === 0) return null;

  // The mesher emits sRGB block colours; three.js lights in linear space.
  const colors = new Float32Array(data.colors.length);
  for (let index = 0; index < colors.length; index += 1) colors[index] = srgbToLinear(data.colors[index]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const vertexCount = data.positions.length / 3;
  geometry.setIndex(new THREE.BufferAttribute(vertexCount > 65535 ? data.indices : new Uint16Array(data.indices), 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

export async function buildVoxelTerrain(world: VoxelWorld, options: TerrainBuildOptions = {}): Promise<TerrainSource> {
  const group = new THREE.Group();
  group.name = "terrain";
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const meshes = new Map<string, THREE.Mesh>();
  const counts = getChunkCounts(world.config);
  const total = counts.x * counts.z;
  const budget = options.sliceBudgetMs ?? 8;
  let sliceStart = performance.now();
  let done = 0;

  const setChunk = (chunkX: number, chunkZ: number) => {
    const id = world.getChunkId(chunkX, chunkZ);
    const geometry = createChunkGeometry(world, chunkX, chunkZ);
    const existing = meshes.get(id);
    if (existing) {
      existing.geometry.dispose();
      if (geometry) {
        existing.geometry = geometry;
      } else {
        group.remove(existing);
        meshes.delete(id);
      }
      return;
    }
    if (!geometry) return;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = id;
    // Vertices are already in world space; skip per-frame matrix work.
    mesh.matrixAutoUpdate = false;
    meshes.set(id, mesh);
    group.add(mesh);
  };

  for (let chunkZ = 0; chunkZ < counts.z; chunkZ += 1) {
    for (let chunkX = 0; chunkX < counts.x; chunkX += 1) {
      setChunk(chunkX, chunkZ);
      done += 1;
      if (performance.now() - sliceStart >= budget) {
        options.onProgress?.(done / total);
        await yieldToMain();
        if (options.signal?.aborted) {
          meshes.forEach((mesh) => mesh.geometry.dispose());
          material.dispose();
          throw new DOMException("Terrain build aborted.", "AbortError");
        }
        sliceStart = performance.now();
      }
    }
  }
  options.onProgress?.(1);

  return {
    group,
    rebuildChunks(chunkIds) {
      for (const id of chunkIds) {
        const match = /^chunk-(\d+)-(\d+)$/.exec(id);
        if (match) setChunk(Number(match[1]), Number(match[2]));
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
}
