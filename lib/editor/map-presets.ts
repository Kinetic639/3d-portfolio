import { BLOCK_IDS, type BlockId } from "@/lib/world/block-registry";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { WORLD_CONFIG } from "@/lib/world/world-config";

export type MapPresetId =
  | "flat"
  | "diagnosticIsolated"
  | "diagnosticAdjacent"
  | "diagnosticColumn"
  | "diagnosticRowX"
  | "diagnosticRowZ"
  | "diagnosticBoundaries"
  | "diagnosticChunkBoundary"
  | "portfolioCampus"
  | "terracedIslands"
  | "denseCity"
  | "maxStress";

export type MapPresetDefinition = {
  id: MapPresetId;
  name: string;
  description: string;
};

export const MAP_PRESETS: MapPresetDefinition[] = [
  {
    id: "flat",
    name: "Flat baseline",
    description: "4,096 blocks. Original single-layer map.",
  },
  {
    id: "diagnosticIsolated",
    name: "Diagnostic isolated",
    description: "A single isolated test block plus the permanent center cells.",
  },
  {
    id: "diagnosticAdjacent",
    name: "Diagnostic adjacent",
    description: "Two adjacent blocks with only the shared internal faces removed.",
  },
  {
    id: "diagnosticColumn",
    name: "Diagnostic column",
    description: "A vertical stack for top, bottom and side-face inspection.",
  },
  {
    id: "diagnosticRowX",
    name: "Diagnostic row X",
    description: "A horizontal X-axis row for side-face inspection.",
  },
  {
    id: "diagnosticRowZ",
    name: "Diagnostic row Z",
    description: "A horizontal Z-axis row for side-face inspection.",
  },
  {
    id: "diagnosticBoundaries",
    name: "Diagnostic boundaries",
    description: "Blocks placed on every world boundary.",
  },
  {
    id: "diagnosticChunkBoundary",
    name: "Diagnostic chunk seam",
    description: "Blocks spanning a chunk boundary.",
  },
  {
    id: "portfolioCampus",
    name: "Portfolio campus",
    description: "Low buildings, paths, plazas and sparse detail.",
  },
  {
    id: "terracedIslands",
    name: "Terraced islands",
    description: "Stepped landforms with holes and height variation.",
  },
  {
    id: "denseCity",
    name: "Dense city",
    description: "Many stacked columns, courtyards and skyline clusters.",
  },
  {
    id: "maxStress",
    name: "Max stress",
    description: "Near-capacity layered terrain for worst-case FPS checks.",
  },
];

export function createMapPresetWorld(presetId: MapPresetId) {
  switch (presetId) {
    case "diagnosticIsolated":
      return createDiagnosticIsolatedPreset();
    case "diagnosticAdjacent":
      return createDiagnosticAdjacentPreset();
    case "diagnosticColumn":
      return createDiagnosticColumnPreset();
    case "diagnosticRowX":
      return createDiagnosticRowXPreset();
    case "diagnosticRowZ":
      return createDiagnosticRowZPreset();
    case "diagnosticBoundaries":
      return createDiagnosticBoundariesPreset();
    case "diagnosticChunkBoundary":
      return createDiagnosticChunkBoundaryPreset();
    case "portfolioCampus":
      return createPortfolioCampusPreset();
    case "terracedIslands":
      return createTerracedIslandsPreset();
    case "denseCity":
      return createDenseCityPreset();
    case "maxStress":
      return createMaxStressPreset();
    case "flat":
    default:
      return createBaseWorld();
  }
}

function createDiagnosticIsolatedPreset() {
  const world = new VoxelWorld();
  world.setBlock(22, 2, 31, BLOCK_IDS.Special);
  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function createDiagnosticAdjacentPreset() {
  const world = new VoxelWorld();
  world.setBlock(22, 2, 31, BLOCK_IDS.Special);
  world.setBlock(23, 2, 31, BLOCK_IDS.ZoneGround);
  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function createDiagnosticColumnPreset() {
  const world = new VoxelWorld();
  addColumn(world, 22, 31, 6, BLOCK_IDS.Special);
  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function createDiagnosticRowXPreset() {
  const world = new VoxelWorld();
  for (let x = 18; x <= 27; x += 1) {
    world.setBlock(x, 1, 31, x % 2 === 0 ? BLOCK_IDS.Special : BLOCK_IDS.ZoneGround);
  }
  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function createDiagnosticRowZPreset() {
  const world = new VoxelWorld();
  for (let z = 27; z <= 36; z += 1) {
    world.setBlock(22, 1, z, z % 2 === 0 ? BLOCK_IDS.Special : BLOCK_IDS.ZoneGround);
  }
  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function createDiagnosticBoundariesPreset() {
  const world = new VoxelWorld();
  world.setBlock(0, 1, 31, BLOCK_IDS.Special);
  world.setBlock(WORLD_CONFIG.width - 1, 1, 31, BLOCK_IDS.Special);
  world.setBlock(31, 1, 0, BLOCK_IDS.ZoneGround);
  world.setBlock(31, 1, WORLD_CONFIG.depth - 1, BLOCK_IDS.ZoneGround);
  world.setBlock(28, 0, 28, BLOCK_IDS.Boundary);
  world.setBlock(28, WORLD_CONFIG.height - 1, 28, BLOCK_IDS.Boundary);
  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function createDiagnosticChunkBoundaryPreset() {
  const world = new VoxelWorld();
  world.setBlock(15, 1, 31, BLOCK_IDS.Special);
  world.setBlock(16, 1, 31, BLOCK_IDS.ZoneGround);
  world.setBlock(31, 1, 15, BLOCK_IDS.Special);
  world.setBlock(31, 1, 16, BLOCK_IDS.ZoneGround);
  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function createPortfolioCampusPreset() {
  const world = createBaseWorld();

  forRect(world, 25, 25, 38, 38, 0, BLOCK_IDS.Path);
  forRect(world, 30, 0, 33, 63, 0, BLOCK_IDS.Path);
  forRect(world, 0, 30, 63, 33, 0, BLOCK_IDS.Path);

  addSolidBox(world, 8, 1, 8, 17, 3, 17, BLOCK_IDS.ZoneGround);
  addSolidBox(world, 45, 1, 8, 55, 4, 18, BLOCK_IDS.Special);
  addSolidBox(world, 9, 1, 44, 20, 2, 55, BLOCK_IDS.Boundary);
  addSolidBox(world, 43, 1, 43, 54, 5, 54, BLOCK_IDS.ZoneGround);

  for (let z = 6; z <= 57; z += 6) {
    for (let x = 6; x <= 57; x += 6) {
      if (x >= 24 && x <= 39 && z >= 24 && z <= 39) {
        continue;
      }
      const height = 1 + ((x * 3 + z * 5) % 3);
      addColumn(world, x, z, height, BLOCK_IDS.Boundary);
    }
  }

  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function createTerracedIslandsPreset() {
  const world = new VoxelWorld();
  const center = (WORLD_CONFIG.width - 1) / 2;

  for (let z = 0; z < WORLD_CONFIG.depth; z += 1) {
    for (let x = 0; x < WORLD_CONFIG.width; x += 1) {
      const dx = x - center;
      const dz = z - center;
      const distance = Math.hypot(dx, dz);
      const ripple = Math.sin(x * 0.42) + Math.cos(z * 0.36);

      if (distance > 30 && ripple < 0.25) {
        continue;
      }

      const terrace = Math.max(1, Math.min(7, 8 - Math.floor(distance / 4) + Math.floor(ripple)));
      const blockId = distance < 6 ? BLOCK_IDS.Path : distance < 15 ? BLOCK_IDS.ZoneGround : BLOCK_IDS.Ground;
      addColumn(world, x, z, terrace, blockId);
    }
  }

  for (let z = 7; z < 58; z += 10) {
    for (let x = 7; x < 58; x += 10) {
      carveColumn(world, x, z, 3);
    }
  }

  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function createDenseCityPreset() {
  const world = createBaseWorld();

  for (let z = 2; z < WORLD_CONFIG.depth - 2; z += 1) {
    for (let x = 2; x < WORLD_CONFIG.width - 2; x += 1) {
      const road = x % 9 === 0 || z % 9 === 0 || (x >= 29 && x <= 34) || (z >= 29 && z <= 34);
      if (road) {
        world.setBlock(x, 0, z, BLOCK_IDS.Path);
        continue;
      }

      const height = 1 + ((x * 11 + z * 7 + Math.floor(x / 5) * 3) % 9);
      const blockId = height > 6 ? BLOCK_IDS.Special : height > 3 ? BLOCK_IDS.ZoneGround : BLOCK_IDS.Boundary;
      addColumn(world, x, z, height, blockId);
    }
  }

  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function createMaxStressPreset() {
  const world = new VoxelWorld();

  for (let z = 0; z < WORLD_CONFIG.depth; z += 1) {
    for (let x = 0; x < WORLD_CONFIG.width; x += 1) {
      const slot = (x * 13 + z * 17) % 11;
      const height = slot === 0 ? 12 : slot <= 2 ? 10 : slot <= 5 ? 8 : 6;
      const blockId = slot <= 1 ? BLOCK_IDS.Special : slot <= 4 ? BLOCK_IDS.ZoneGround : BLOCK_IDS.Ground;
      addColumn(world, x, z, height, blockId);
    }
  }

  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function createBaseWorld() {
  const world = new VoxelWorld();

  for (let z = 0; z < WORLD_CONFIG.depth; z += 1) {
    for (let x = 0; x < WORLD_CONFIG.width; x += 1) {
      world.setBlock(x, 0, z, BLOCK_IDS.Ground);
    }
  }

  world.clearDirtyChunks();
  return world;
}

function addColumn(world: VoxelWorld, x: number, z: number, height: number, blockId: BlockId) {
  for (let y = 0; y < Math.min(height, WORLD_CONFIG.height); y += 1) {
    world.setBlock(x, y, z, y === 0 && blockId !== BLOCK_IDS.Path ? BLOCK_IDS.Ground : blockId);
  }
}

function addSolidBox(
  world: VoxelWorld,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  blockId: BlockId,
) {
  for (let y = minY; y <= maxY; y += 1) {
    forRect(world, minX, minZ, maxX, maxZ, y, blockId);
  }
}

function forRect(
  world: VoxelWorld,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  y: number,
  blockId: BlockId,
) {
  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      world.setBlock(x, y, z, blockId);
    }
  }
}

function carveColumn(world: VoxelWorld, x: number, z: number, radius: number) {
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.hypot(dx, dz) > radius) {
        continue;
      }
      for (let y = 0; y < WORLD_CONFIG.height; y += 1) {
        world.setBlock(x + dx, y, z + dz, BLOCK_IDS.Air);
      }
    }
  }
}

function preserveCenterPlaza(world: VoxelWorld) {
  const centerMin = WORLD_CONFIG.width / 2 - 1;
  const centerMax = WORLD_CONFIG.width / 2;

  for (let z = centerMin; z <= centerMax; z += 1) {
    for (let x = centerMin; x <= centerMax; x += 1) {
      for (let y = 0; y < WORLD_CONFIG.height; y += 1) {
        world.setBlock(x, y, z, y === 0 ? BLOCK_IDS.Ground : BLOCK_IDS.Air);
      }
    }
  }
}
