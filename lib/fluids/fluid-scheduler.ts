export type ScheduledFluidCell = {
  index: number;
  tick: number;
};

export class FluidScheduler {
  private readonly scheduled = new Map<number, number>();

  get size() {
    return this.scheduled.size;
  }

  schedule(index: number, tick = 0) {
    if (!Number.isInteger(index) || index < 0 || !Number.isInteger(tick) || tick < 0) return false;
    const existing = this.scheduled.get(index);
    if (existing !== undefined && existing <= tick) return false;
    this.scheduled.set(index, tick);
    return true;
  }

  drainNextTick(): ScheduledFluidCell[] {
    if (this.scheduled.size === 0) return [];
    let nextTick = Number.POSITIVE_INFINITY;
    for (const tick of this.scheduled.values()) nextTick = Math.min(nextTick, tick);

    const batch: ScheduledFluidCell[] = [];
    for (const [index, tick] of this.scheduled) {
      if (tick !== nextTick) continue;
      batch.push({ index, tick });
      this.scheduled.delete(index);
    }
    return batch.sort((left, right) => left.index - right.index);
  }

  clear() {
    this.scheduled.clear();
  }
}
