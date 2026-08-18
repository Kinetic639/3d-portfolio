import { EMPTY_FLUID_CELL, FLUID_IDS, MAX_HORIZONTAL_FLUID_LEVEL, type FluidCell } from "./fluid-types";
import { FluidScheduler } from "./fluid-scheduler";
import { hasDownwardOpening, selectHorizontalFlowTargets, WATER_HORIZONTAL_DIRECTIONS } from "./water-rules";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import type { GridCoordinate } from "@/lib/world/world-config";

export type WaterSimulatorOptions = {
  infiniteSources?: boolean;
};

export type WaterSimulationResult = {
  changedCells: number[];
  processedTriggers: number;
  settled: boolean;
};

type WaterCandidate = GridCoordinate & {
  level: number;
  falling: boolean;
};

export class WaterSimulator {
  readonly scheduler = new FluidScheduler();
  readonly infiniteSources: boolean;
  private readonly authoredSources = new Set<number>();
  private managedCells = new Set<number>();
  private logicalTick = 0;

  constructor(readonly world: VoxelWorld, options: WaterSimulatorOptions = {}) {
    this.infiniteSources = options.infiniteSources ?? true;
    for (let index = 0; index < world.fluidTypes.length; index += 1) {
      if (world.fluidTypes[index] === FLUID_IDS.None) continue;
      this.managedCells.add(index);
      const coordinate = world.getCoordinates(index);
      if (coordinate && world.getFluid(coordinate.x, coordinate.y, coordinate.z).source) this.authoredSources.add(index);
    }
  }

  setSource(x: number, y: number, z: number) {
    const index = this.world.getIndex(x, y, z);
    if (index === null || !this.world.setFluidSource(x, y, z, FLUID_IDS.Water)) return false;
    this.authoredSources.add(index);
    this.managedCells.add(index);
    this.scheduleCell(x, y, z);
    return true;
  }

  removeSource(x: number, y: number, z: number) {
    const index = this.world.getIndex(x, y, z);
    if (index === null || !this.authoredSources.delete(index)) return false;
    this.world.clearFluid(x, y, z);
    this.scheduleCell(x, y, z);
    return true;
  }

  scheduleCell(x: number, y: number, z: number, delay = 0) {
    const index = this.world.getIndex(x, y, z);
    if (index === null) return false;
    return this.scheduler.schedule(index, this.logicalTick + delay);
  }

  notifyTerrainChanged(x: number, y: number, z: number) {
    const changedIndex = this.world.getIndex(x, y, z);
    if (changedIndex !== null && !this.world.getFluid(x, y, z).source) {
      this.authoredSources.delete(changedIndex);
    }
    this.scheduleCell(x, y, z);
    for (const direction of WATER_HORIZONTAL_DIRECTIONS) {
      this.scheduleCell(x + direction.x, y, z + direction.z);
    }
    this.scheduleCell(x, y - 1, z);
    this.scheduleCell(x, y + 1, z);
  }

  step(): WaterSimulationResult {
    const batch = this.scheduler.drainNextTick();
    if (batch.length === 0) return { changedCells: [], processedTriggers: 0, settled: true };
    this.logicalTick = batch[0].tick + 1;
    const changedCells = this.rebuildWaterGraph();
    return { changedCells, processedTriggers: batch.length, settled: this.scheduler.size === 0 };
  }

  settle(maxSteps = 10_000): WaterSimulationResult {
    const changed = new Set<number>();
    let processedTriggers = 0;
    let steps = 0;
    while (this.scheduler.size > 0 && steps < maxSteps) {
      const result = this.step();
      processedTriggers += result.processedTriggers;
      result.changedCells.forEach((index) => changed.add(index));
      steps += 1;
    }
    return {
      changedCells: [...changed].sort((left, right) => left - right),
      processedTriggers,
      settled: this.scheduler.size === 0,
    };
  }

  private rebuildWaterGraph() {
    const desired = this.deriveWaterGraph();
    const candidates = new Set([...this.managedCells, ...desired.keys()]);
    const changed: number[] = [];

    for (const index of [...candidates].sort((left, right) => left - right)) {
      const coordinate = this.world.getCoordinates(index);
      if (!coordinate) continue;
      const next = desired.get(index) ?? EMPTY_FLUID_CELL;
      const current = this.world.getFluid(coordinate.x, coordinate.y, coordinate.z);
      if (sameFluid(current, next)) continue;
      this.world.setFluid(coordinate.x, coordinate.y, coordinate.z, { ...next });
      changed.push(index);
    }
    this.managedCells = new Set(desired.keys());
    return changed;
  }

  private deriveWaterGraph() {
    let generatedSources = new Set<number>();
    let desired = this.propagate(generatedSources);
    if (!this.infiniteSources) return desired;

    while (true) {
      const nextGenerated = this.findGeneratedSources(desired);
      if (setsEqual(generatedSources, nextGenerated)) return desired;
      generatedSources = nextGenerated;
      desired = this.propagate(generatedSources);
    }
  }

  private propagate(generatedSources: Set<number>) {
    const desired = new Map<number, FluidCell>();
    const queue: WaterCandidate[] = [];
    for (const index of [...this.authoredSources, ...generatedSources].sort((a, b) => a - b)) {
      const coordinate = this.world.getCoordinates(index);
      if (!coordinate || !this.world.canContainFluid(coordinate.x, coordinate.y, coordinate.z, FLUID_IDS.Water)) continue;
      desired.set(index, { type: FLUID_IDS.Water, level: 0, source: true, falling: false });
      queue.push({ ...coordinate, level: 0, falling: false });
    }

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (hasDownwardOpening(this.world, current)) {
        this.offerCandidate(desired, queue, { x: current.x, y: current.y - 1, z: current.z, level: current.level, falling: true });
        continue;
      }

      const nextLevel = current.falling ? 1 : current.level + 1;
      if (nextLevel > MAX_HORIZONTAL_FLUID_LEVEL) continue;
      for (const target of selectHorizontalFlowTargets(this.world, current)) {
        this.offerCandidate(desired, queue, { ...target, level: nextLevel, falling: false });
      }
    }
    return desired;
  }

  private offerCandidate(desired: Map<number, FluidCell>, queue: WaterCandidate[], candidate: WaterCandidate) {
    const index = this.world.getIndex(candidate.x, candidate.y, candidate.z);
    if (index === null || this.authoredSources.has(index)) return;
    const existing = desired.get(index);
    const next = { type: FLUID_IDS.Water, level: candidate.level, source: false, falling: candidate.falling } as const;
    if (existing && compareFluidStrength(existing, next) <= 0) return;
    desired.set(index, next);
    queue.push(candidate);
  }

  private findGeneratedSources(desired: Map<number, FluidCell>) {
    const generated = new Set<number>();
    for (const [index, fluid] of desired) {
      if (fluid.falling || this.authoredSources.has(index)) continue;
      const coordinate = this.world.getCoordinates(index);
      if (!coordinate || coordinate.y === 0 || hasDownwardOpening(this.world, coordinate)) continue;
      let sourceNeighbors = 0;
      for (const direction of WATER_HORIZONTAL_DIRECTIONS) {
        const neighborIndex = this.world.getIndex(coordinate.x + direction.x, coordinate.y, coordinate.z + direction.z);
        if (neighborIndex !== null && desired.get(neighborIndex)?.source) sourceNeighbors += 1;
      }
      if (sourceNeighbors >= 2) generated.add(index);
    }
    return generated;
  }
}

function compareFluidStrength(left: FluidCell, right: FluidCell) {
  if (left.source !== right.source) return left.source ? -1 : 1;
  if (left.falling !== right.falling) return left.falling ? -1 : 1;
  return left.level - right.level;
}

function sameFluid(left: FluidCell, right: FluidCell) {
  return left.type === right.type && left.level === right.level && left.source === right.source && left.falling === right.falling;
}

function setsEqual(left: Set<number>, right: Set<number>) {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}
