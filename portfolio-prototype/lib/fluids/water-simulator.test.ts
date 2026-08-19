import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { FLUID_IDS } from "./fluid-types";
import { FluidScheduler } from "./fluid-scheduler";
import { WaterSimulator } from "./water-simulator";

describe("FluidScheduler", () => {
  it("deduplicates cells and drains deterministically by tick then index", () => {
    const scheduler = new FluidScheduler();
    scheduler.schedule(9, 2);
    scheduler.schedule(4, 1);
    scheduler.schedule(2, 1);
    scheduler.schedule(4, 3);
    scheduler.schedule(9, 0);

    expect(scheduler.drainNextTick()).toEqual([{ index: 9, tick: 0 }]);
    expect(scheduler.drainNextTick()).toEqual([{ index: 2, tick: 1 }, { index: 4, tick: 1 }]);
    expect(scheduler.size).toBe(0);
  });
});

describe("WaterSimulator", () => {
  it("spreads exactly seven horizontal levels along a supported channel", () => {
    const world = createChannel(4, 22, 20);
    const simulator = new WaterSimulator(world, { infiniteSources: false });
    simulator.setSource(12, 1, 20);

    expect(simulator.settle().settled).toBe(true);
    for (let distance = 1; distance <= 7; distance += 1) {
      expect(world.getFluid(12 + distance, 1, 20)).toMatchObject({ type: FLUID_IDS.Water, level: distance, falling: false });
    }
    expect(world.getFluid(20, 1, 20).type).toBe(FLUID_IDS.None);
  });

  it("flows downward through the complete in-bounds shaft", () => {
    const world = new VoxelWorld();
    world.setBlock(10, 0, 10, BLOCK_IDS.Ground);
    const simulator = new WaterSimulator(world, { infiniteSources: false });
    simulator.setSource(10, 10, 10);
    simulator.settle();

    for (let y = 1; y < 10; y += 1) {
      expect(world.getFluid(10, y, 10)).toMatchObject({ type: FLUID_IDS.Water, falling: true });
    }
  });

  it("resets horizontal strength when a falling stream lands", () => {
    const world = createChannel(8, 18, 20, 0);
    world.setBlock(12, 1, 20, BLOCK_IDS.Ground);
    const simulator = new WaterSimulator(world, { infiniteSources: false });
    simulator.setSource(12, 4, 20);
    simulator.settle();

    expect(world.getFluid(12, 2, 20).falling).toBe(true);
    expect(world.getFluid(13, 2, 20)).toMatchObject({ type: FLUID_IDS.Water, level: 1, falling: false });
  });

  it("selects the nearest downward opening and includes equal-distance ties", () => {
    const world = createChannel(7, 17, 20);
    world.setBlock(10, 0, 20, BLOCK_IDS.Air);
    world.setBlock(14, 0, 20, BLOCK_IDS.Air);
    const simulator = new WaterSimulator(world, { infiniteSources: false });
    simulator.setSource(12, 1, 20);
    simulator.settle();

    expect(world.getFluid(11, 1, 20).type).toBe(FLUID_IDS.Water);
    expect(world.getFluid(13, 1, 20).type).toBe(FLUID_IDS.Water);
    expect(world.getFluid(12, 1, 19).type).toBe(FLUID_IDS.None);
  });

  it("prefers only the shorter route to a downward opening", () => {
    const world = createChannel(7, 18, 20);
    world.setBlock(10, 0, 20, BLOCK_IDS.Air);
    world.setBlock(16, 0, 20, BLOCK_IDS.Air);
    const simulator = new WaterSimulator(world, { infiniteSources: false });
    simulator.setSource(12, 1, 20);
    simulator.settle();

    expect(world.getFluid(11, 1, 20).type).toBe(FLUID_IDS.Water);
    expect(world.getFluid(13, 1, 20).type).toBe(FLUID_IDS.None);
  });

  it("recedes after its only authored source is removed", () => {
    const world = createChannel(4, 20, 20);
    const simulator = new WaterSimulator(world, { infiniteSources: false });
    simulator.setSource(12, 1, 20);
    simulator.settle();
    expect(world.getStats().fluidCells).toBeGreaterThan(1);

    simulator.removeSource(12, 1, 20);
    simulator.settle();
    expect(world.getStats().fluidCells).toBe(0);
  });

  it("creates a supported infinite source from two horizontal sources when enabled", () => {
    const world = createChannel(9, 15, 20);
    const simulator = new WaterSimulator(world, { infiniteSources: true });
    simulator.setSource(11, 1, 20);
    simulator.setSource(13, 1, 20);
    simulator.settle();

    expect(world.getFluid(12, 1, 20)).toMatchObject({ type: FLUID_IDS.Water, level: 0, source: true, authored: false });
  });

  it("does not create an infinite source when the option is disabled", () => {
    const world = createChannel(9, 15, 20);
    const simulator = new WaterSimulator(world, { infiniteSources: false });
    simulator.setSource(11, 1, 20);
    simulator.setSource(13, 1, 20);
    simulator.settle();

    expect(world.getFluid(12, 1, 20)).toMatchObject({ type: FLUID_IDS.Water, level: 1, source: false });
  });

  it("reroutes after terrain closes an existing channel", () => {
    const world = createChannel(8, 18, 20);
    const simulator = new WaterSimulator(world, { infiniteSources: false });
    simulator.setSource(10, 1, 20);
    simulator.settle();
    expect(world.getFluid(12, 1, 20).type).toBe(FLUID_IDS.Water);

    world.setBlock(11, 1, 20, BLOCK_IDS.Ground);
    simulator.notifyTerrainChanged(11, 1, 20);
    simulator.settle();
    expect(world.getFluid(12, 1, 20).type).toBe(FLUID_IDS.None);
  });

  it("removes a source and its flow when terrain replaces the source cell", () => {
    const world = createChannel(8, 18, 20);
    const simulator = new WaterSimulator(world, { infiniteSources: false });
    simulator.setSource(10, 1, 20);
    simulator.settle();

    world.setBlock(10, 1, 20, BLOCK_IDS.Ground);
    simulator.notifyTerrainChanged(10, 1, 20);
    simulator.settle();
    expect(world.getStats().fluidCells).toBe(0);
  });

  it("propagates and dirties fluid chunks across a chunk boundary", () => {
    const world = createChannel(10, 22, 20);
    world.clearDirtyFluidChunks();
    const simulator = new WaterSimulator(world, { infiniteSources: false });
    simulator.setSource(14, 1, 20);
    simulator.settle();

    expect(world.getFluid(16, 1, 20).type).toBe(FLUID_IDS.Water);
    expect(world.dirtyFluidChunks.has("chunk-0-1")).toBe(true);
    expect(world.dirtyFluidChunks.has("chunk-1-1")).toBe(true);
  });

  it("drains at an open world edge without wrapping into the opposite edge", () => {
    const world = createChannel(0, 8, 20);
    const simulator = new WaterSimulator(world, { infiniteSources: false });
    simulator.setSource(2, 1, 20);
    const result = simulator.settle();

    expect(result.settled).toBe(true);
    expect(world.getFluid(0, 1, 20).type).toBe(FLUID_IDS.Water);
    expect(world.getFluid(63, 1, 20).type).toBe(FLUID_IDS.None);
  });

  it("never enters a solid wall", () => {
    const world = createChannel(8, 18, 20);
    world.setBlock(12, 1, 20, BLOCK_IDS.Ground);
    const simulator = new WaterSimulator(world, { infiniteSources: false });
    simulator.setSource(10, 1, 20);
    simulator.settle();

    expect(world.getFluid(12, 1, 20).type).toBe(FLUID_IDS.None);
    expect(world.getFluid(13, 1, 20).type).toBe(FLUID_IDS.None);
  });

  it("settles a closed basin without escaping its rejecting walls", () => {
    const world = new VoxelWorld();
    for (let z = 18; z <= 22; z += 1) {
      for (let x = 18; x <= 22; x += 1) {
        world.setBlock(x, 0, z, BLOCK_IDS.Ground);
        if (x === 18 || x === 22 || z === 18 || z === 22) {
          world.setBlock(x, 1, z, BLOCK_IDS.Ground);
        }
      }
    }
    const simulator = new WaterSimulator(world, { infiniteSources: false });
    simulator.setSource(20, 1, 20);
    const result = simulator.settle(10);

    expect(result.settled).toBe(true);
    for (let z = 19; z <= 21; z += 1) {
      for (let x = 19; x <= 21; x += 1) {
        expect(world.getFluid(x, 1, z).type).toBe(FLUID_IDS.Water);
      }
    }
    expect(world.getFluid(18, 1, 20).type).toBe(FLUID_IDS.None);
  });

  it("produces byte-identical results regardless of source insertion order", () => {
    const first = createChannel(5, 23, 20);
    const second = createChannel(5, 23, 20);
    const firstSimulator = new WaterSimulator(first, { infiniteSources: false });
    const secondSimulator = new WaterSimulator(second, { infiniteSources: false });
    firstSimulator.setSource(9, 1, 20);
    firstSimulator.setSource(18, 1, 20);
    secondSimulator.setSource(18, 1, 20);
    secondSimulator.setSource(9, 1, 20);

    firstSimulator.settle();
    secondSimulator.settle();
    expect(first.fluidTypes).toEqual(second.fluidTypes);
    expect(first.fluidLevels).toEqual(second.fluidLevels);
    expect(first.fluidFlags).toEqual(second.fluidFlags);
  });
});

function createChannel(minX: number, maxX: number, z: number, floorY = 0) {
  const world = new VoxelWorld();
  for (let x = minX; x <= maxX; x += 1) {
    world.setBlock(x, floorY, z, BLOCK_IDS.Ground);
    world.setBlock(x, floorY + 1, z - 1, BLOCK_IDS.Ground);
    world.setBlock(x, floorY + 1, z + 1, BLOCK_IDS.Ground);
  }
  world.setBlock(minX - 1, floorY + 1, z, BLOCK_IDS.Ground);
  world.setBlock(maxX + 1, floorY + 1, z, BLOCK_IDS.Ground);
  return world;
}
