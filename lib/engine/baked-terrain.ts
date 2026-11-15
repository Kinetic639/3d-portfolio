import * as THREE from "three";
import {
  bakedFloat32,
  bakedInt8,
  bakedUint16,
  bakedUint32,
  bakedUint8,
  type BakedVoxelZone,
  type BakedWorld,
} from "@/lib/bake/baked-format";
import { blurDensity, extractSurface, filterSurface, type DensityVolume } from "@/lib/bake/smooth-mesher";
import type { TerrainSource } from "./terrain-meshes";
import { createHeightfieldQuery, type WorldQuery } from "./world-query";

/**
 * A baked world as renderable terrain: the static tiles as they are, and
 * each mini-game zone meshed here from its stored voxels with the same
 * smooth mesher the bake used, so it lines up with the tiles around it.
 */
const srgbToLinear = (value: number) => (value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
const SRGB_BYTE_TO_LINEAR = Float32Array.from({ length: 256 }, (_, value) => srgbToLinear(value / 255));

export function createBakedQuery(baked: BakedWorld): WorldQuery {
  const { width, depth } = baked.header.map.dimensions;
  return createHeightfieldQuery(width, depth, bakedInt8(baked, baked.header.heights), bakedUint8(baked, baked.header.zones));
}

/** The density volume a baked mini-game zone was stored as, ready for the smooth mesher. */
export function readVoxelZoneVolume(baked: BakedWorld, zone: BakedVoxelZone): DensityVolume {
  const { width, depth } = baked.header.map.dimensions;
  const bytes = bakedUint8(baked, zone.density);
  const density = new Float32Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) density[index] = bytes[index] / 255;
  return {
    ...zone.volume,
    density,
    material: bakedUint16(baked, zone.material).slice(),
    worldOrigin: { x: -(width - 1) / 2, y: 0.5, z: -(depth - 1) / 2 },
    cellSize: 1,
    worldWidth: width,
    worldDepth: depth,
  };
}

export function createBakedTerrain(baked: BakedWorld, options: { smoothing?: number } = {}): TerrainSource {
  const group = new THREE.Group();
  group.name = "terrain";
  // Faceted shading: smooth normals over smoothed terrain wash the relief out; facets keep it readable.
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const meshes: THREE.Mesh[] = [];

  const add = (id: string, geometry: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = id;
    // Vertices are already in world space.
    mesh.matrixAutoUpdate = false;
    meshes.push(mesh);
    group.add(mesh);
  };

  for (const info of baked.header.meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(bakedFloat32(baked, info.positions), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(bakedInt8(baked, info.normals), 3, true));
    const bytes = bakedUint8(baked, info.colors);
    const colors = new Float32Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) colors[index] = SRGB_BYTE_TO_LINEAR[bytes[index]];
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(info.vertexCount <= 65535 ? bakedUint16(baked, info.indices) : bakedUint32(baked, info.indices), 1));
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(...info.bounds.min), new THREE.Vector3(...info.bounds.max));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    add(info.id, geometry);
  }

  const zones = bakedUint8(baked, baked.header.zones);
  const { width } = baked.header.map.dimensions;
  for (const zone of baked.header.voxelZones) {
    const volume = blurDensity(readVoxelZoneVolume(baked, zone), options.smoothing ?? 1);
    const surface = filterSurface(extractSurface(volume, zone.region), (x, z) => zones[x + width * z] === zone.zoneId);
    if (surface.indices.length === 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(surface.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(surface.normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(surface.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(surface.indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    add(`voxel-zone:${zone.zoneId}`, geometry);
  }

  return {
    group,
    meshes: () => meshes,
    // Baked terrain is static; mini-game zones get their own update path with the mini-game.
    rebuildChunks: () => undefined,
    triangleCount: () => meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? 0) / 3, 0),
    dispose() {
      meshes.forEach((mesh) => mesh.geometry.dispose());
      meshes.length = 0;
      material.dispose();
      group.clear();
    },
  };
}
