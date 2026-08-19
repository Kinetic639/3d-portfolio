import { FLUID_IDS, MAX_HORIZONTAL_FLUID_LEVEL } from "@/lib/fluids/fluid-types";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import { getWorldMaxY, type GridCoordinate, type WorldPosition } from "@/lib/world/world-config";

export type WaterFaceDirection = "py" | "px" | "nx" | "pz" | "nz";

export type WaterFaceMapping = {
  cellIndex: number;
  direction: WaterFaceDirection;
};

export type WaterChunkMeshData = {
  id: string;
  chunkX: number;
  chunkZ: number;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  flowVectors: Float32Array;
  fallingFlags: Float32Array;
  foamFactors: Float32Array;
  revealDelays: Float32Array;
  indices: Uint32Array;
  faceMappings: WaterFaceMapping[];
  triangleToCell: Uint32Array;
  visibleQuads: number;
  triangles: number;
  bounds: { min: GridCoordinate; max: GridCoordinate };
  boundingBox: { min: WorldPosition; max: WorldPosition };
  buildMs: number;
};

const FULL_SURFACE_HEIGHT = 0.42;
const MIN_SURFACE_HEIGHT = -0.28;
const CELL_BOTTOM_HEIGHT = -0.48;
const HALF_WIDTH = 0.5;

export function buildWaterChunkMesh(world: VoxelWorld, chunkX: number, chunkZ: number): WaterChunkMeshData {
  const startedAt = now();
  const minGridX = chunkX * world.config.chunkSize;
  const minGridZ = chunkZ * world.config.chunkSize;
  const maxGridX = minGridX + world.config.chunkSize - 1;
  const maxGridZ = minGridZ + world.config.chunkSize - 1;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const flowVectors: number[] = [];
  const fallingFlags: number[] = [];
  const foamFactors: number[] = [];
  const revealDelays: number[] = [];
  const indices: number[] = [];
  const faceMappings: WaterFaceMapping[] = [];
  const triangleCells: number[] = [];

  const addQuad = (
    cellIndex: number,
    direction: WaterFaceDirection,
    corners: Array<[number, number, number]>,
    normal: [number, number, number],
    flow: [number, number],
    falling: number,
    foam: number,
    revealDelay: number,
  ) => {
    const offset = positions.length / 3;
    const faceUvs: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
    corners.forEach((corner, index) => {
      positions.push(...corner);
      normals.push(...normal);
      uvs.push(...faceUvs[index]);
      flowVectors.push(...flow);
      fallingFlags.push(falling);
      foamFactors.push(foam);
      revealDelays.push(revealDelay);
    });
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    faceMappings.push({ cellIndex, direction });
    triangleCells.push(cellIndex, cellIndex);
  };

  for (let y = world.config.minY; y <= getWorldMaxY(world.config); y += 1) {
    for (let z = minGridZ; z <= maxGridZ; z += 1) {
      for (let x = minGridX; x <= maxGridX; x += 1) {
        const fluid = world.getFluid(x, y, z);
        if (fluid.type !== FLUID_IDS.Water) continue;
        const cellIndex = world.getIndex(x, y, z);
        if (cellIndex === null) continue;

        const center = world.gridToWorld(x, y, z);
        const west = center.x - HALF_WIDTH;
        const east = center.x + HALF_WIDTH;
        const north = center.z - HALF_WIDTH;
        const south = center.z + HALF_WIDTH;
        const heights = {
          nw: center.y + getWaterCornerHeight(world, x, y, z, -1, -1),
          ne: center.y + getWaterCornerHeight(world, x, y, z, 1, -1),
          se: center.y + getWaterCornerHeight(world, x, y, z, 1, 1),
          sw: center.y + getWaterCornerHeight(world, x, y, z, -1, 1),
        };
        const flow = fluid.falling ? [0, -1] as [number, number] : getWaterFlowVector(world, x, y, z);
        const topFoam = getTopFoamFactor(world, x, y, z);
        const revealDelay = getFluidRevealDelay(x, z, world.config.width, world.config.depth);

        if (world.getFluid(x, y + 1, z).type !== FLUID_IDS.Water) {
          addQuad(cellIndex, "py", [
            [west, heights.nw, north],
            [west, heights.sw, south],
            [east, heights.se, south],
            [east, heights.ne, north],
          ], [0, 1, 0], flow, fluid.falling ? 1 : 0, topFoam, revealDelay);
        }

        addWaterSide(world, addQuad, { x, y, z, cellIndex, center, heights, flow, revealDelay }, "px");
        addWaterSide(world, addQuad, { x, y, z, cellIndex, center, heights, flow, revealDelay }, "nx");
        addWaterSide(world, addQuad, { x, y, z, cellIndex, center, heights, flow, revealDelay }, "pz");
        addWaterSide(world, addQuad, { x, y, z, cellIndex, center, heights, flow, revealDelay }, "nz");
      }
    }
  }

  const bounds = {
    min: { x: minGridX, y: world.config.minY, z: minGridZ },
    max: { x: maxGridX, y: getWorldMaxY(world.config), z: maxGridZ },
  };
  return {
    id: `water-${world.getChunkId(chunkX, chunkZ)}`,
    chunkX,
    chunkZ,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    flowVectors: new Float32Array(flowVectors),
    fallingFlags: new Float32Array(fallingFlags),
    foamFactors: new Float32Array(foamFactors),
    revealDelays: new Float32Array(revealDelays),
    indices: new Uint32Array(indices),
    faceMappings,
    triangleToCell: new Uint32Array(triangleCells),
    visibleQuads: faceMappings.length,
    triangles: faceMappings.length * 2,
    bounds,
    boundingBox: {
      min: world.gridToWorld(minGridX, world.config.minY, minGridZ),
      max: world.gridToWorld(maxGridX, getWorldMaxY(world.config), maxGridZ),
    },
    buildMs: Number((now() - startedAt).toFixed(3)),
  };
}

export function buildWaterChunkMeshes(world: VoxelWorld) {
  const startedAt = now();
  const chunks: WaterChunkMeshData[] = [];
  const chunksPerAxis = world.config.width / world.config.chunkSize;
  for (let chunkZ = 0; chunkZ < chunksPerAxis; chunkZ += 1) {
    for (let chunkX = 0; chunkX < chunksPerAxis; chunkX += 1) {
      chunks.push(buildWaterChunkMesh(world, chunkX, chunkZ));
    }
  }
  return { chunks, totalBuildMs: Number((now() - startedAt).toFixed(3)) };
}

export function getWaterSurfaceHeight(world: VoxelWorld, x: number, y: number, z: number) {
  const fluid = world.getFluid(x, y, z);
  if (fluid.type !== FLUID_IDS.Water) return CELL_BOTTOM_HEIGHT;
  if (fluid.source || fluid.falling || world.getFluid(x, y + 1, z).type === FLUID_IDS.Water) return FULL_SURFACE_HEIGHT;
  const ratio = fluid.level / MAX_HORIZONTAL_FLUID_LEVEL;
  return FULL_SURFACE_HEIGHT + (MIN_SURFACE_HEIGHT - FULL_SURFACE_HEIGHT) * ratio;
}

export function getWaterCornerHeight(world: VoxelWorld, x: number, y: number, z: number, cornerX: -1 | 1, cornerZ: -1 | 1) {
  const contributors = [
    [x, z],
    [x + cornerX, z],
    [x, z + cornerZ],
    [x + cornerX, z + cornerZ],
  ] as const;
  let total = 0;
  let weight = 0;
  for (const [sampleX, sampleZ] of contributors) {
    const fluid = world.getFluid(sampleX, y, sampleZ);
    if (fluid.type !== FLUID_IDS.Water) continue;
    if (world.getFluid(sampleX, y + 1, sampleZ).type === FLUID_IDS.Water) return FULL_SURFACE_HEIGHT;
    const height = getWaterSurfaceHeight(world, sampleX, y, sampleZ);
    const sampleWeight = fluid.source || fluid.falling ? 2 : 1;
    total += height * sampleWeight;
    weight += sampleWeight;
  }
  return weight === 0 ? getWaterSurfaceHeight(world, x, y, z) : total / weight;
}

export function getWaterFlowVector(world: VoxelWorld, x: number, y: number, z: number): [number, number] {
  const center = getWaterSurfaceHeight(world, x, y, z);
  const sample = (sampleX: number, sampleZ: number) => (
    world.getFluid(sampleX, y, sampleZ).type === FLUID_IDS.Water
      ? getWaterSurfaceHeight(world, sampleX, y, sampleZ)
      : center
  );
  const west = sample(x - 1, z);
  const east = sample(x + 1, z);
  const north = sample(x, z - 1);
  const south = sample(x, z + 1);
  let flowX = west - east;
  let flowZ = north - south;
  const length = Math.hypot(flowX, flowZ);
  if (length < 0.0001) return [0, 0];
  flowX /= length;
  flowZ /= length;
  return [flowX, flowZ];
}

type AddQuad = (
  cellIndex: number,
  direction: WaterFaceDirection,
  corners: Array<[number, number, number]>,
  normal: [number, number, number],
  flow: [number, number],
  falling: number,
  foam: number,
  revealDelay: number,
) => void;

function addWaterSide(
  world: VoxelWorld,
  addQuad: AddQuad,
  cell: {
    x: number; y: number; z: number; cellIndex: number; center: WorldPosition;
    heights: { nw: number; ne: number; se: number; sw: number };
    flow: [number, number]; revealDelay: number;
  },
  direction: Exclude<WaterFaceDirection, "py">,
) {
  const offsets = { px: [1, 0], nx: [-1, 0], pz: [0, 1], nz: [0, -1] } as const;
  const [dx, dz] = offsets[direction];
  const neighbor = world.getFluid(cell.x + dx, cell.y, cell.z + dz);
  const neighborHeight = neighbor.type === FLUID_IDS.Water
    ? cell.center.y + getWaterSurfaceHeight(world, cell.x + dx, cell.y, cell.z + dz)
    : cell.center.y + CELL_BOTTOM_HEIGHT;
  const west = cell.center.x - HALF_WIDTH;
  const east = cell.center.x + HALF_WIDTH;
  const north = cell.center.z - HALF_WIDTH;
  const south = cell.center.z + HALF_WIDTH;
  const side = {
    px: { topA: cell.heights.se, topB: cell.heights.ne, corners: [[east, neighborHeight, south], [east, neighborHeight, north]] as Array<[number, number, number]>, normal: [1, 0, 0] as [number, number, number] },
    nx: { topA: cell.heights.nw, topB: cell.heights.sw, corners: [[west, neighborHeight, north], [west, neighborHeight, south]] as Array<[number, number, number]>, normal: [-1, 0, 0] as [number, number, number] },
    pz: { topA: cell.heights.sw, topB: cell.heights.se, corners: [[west, neighborHeight, south], [east, neighborHeight, south]] as Array<[number, number, number]>, normal: [0, 0, 1] as [number, number, number] },
    nz: { topA: cell.heights.ne, topB: cell.heights.nw, corners: [[east, neighborHeight, north], [west, neighborHeight, north]] as Array<[number, number, number]>, normal: [0, 0, -1] as [number, number, number] },
  }[direction];
  if (side.topA <= neighborHeight + 0.001 && side.topB <= neighborHeight + 0.001) return;
  addQuad(cell.cellIndex, direction, [
    side.corners[0], side.corners[1],
    [side.corners[1][0], side.topB, side.corners[1][2]],
    [side.corners[0][0], side.topA, side.corners[0][2]],
  ], side.normal, cell.flow, world.getFluid(cell.x, cell.y, cell.z).falling ? 1 : 0, neighbor.type === FLUID_IDS.Water ? 0.15 : 0.75, cell.revealDelay);
}

function getTopFoamFactor(world: VoxelWorld, x: number, y: number, z: number) {
  let exposed = 0;
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    if (world.getFluid(x + dx, y, z + dz).type !== FLUID_IDS.Water) exposed += 1;
  }
  return exposed / 4;
}

function getFluidRevealDelay(x: number, z: number, width: number, depth: number) {
  const centerX = (width - 1) / 2;
  const centerZ = (depth - 1) / 2;
  const maxDistance = Math.hypot(centerX, centerZ) || 1;
  return Math.hypot(x - centerX, z - centerZ) / maxDistance * 0.78;
}

function now() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
