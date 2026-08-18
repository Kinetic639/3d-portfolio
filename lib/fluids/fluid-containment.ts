import { BLOCK_IDS, type BlockId } from "@/lib/world/block-registry";
import type { ShapeId } from "@/lib/voxel-shapes/shape-ids";
import { FLUID_IDS, type FluidId } from "./fluid-types";

export function canTerrainStateContainFluid(blockId: BlockId, shapeId: ShapeId, fluidId: FluidId) {
  if (fluidId === FLUID_IDS.None) return true;
  void shapeId;
  // Release one allows water only in empty terrain cells. Partial-shape
  // waterlogging remains closed until explicit occupancy rules are added.
  return blockId === BLOCK_IDS.Air;
}
