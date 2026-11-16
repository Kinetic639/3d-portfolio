/**
 * The last few seconds of the engine's frames, for the perf HUD and tests.
 *
 * The engine renders on demand, so "frames per second" means frames it
 * actually drew: 0 while the world is idle, about the display's refresh rate
 * while something moves. Recording a frame is three writes into typed arrays;
 * reading is done twice a second by the HUD, never per frame.
 */
export type FrameWindow = {
  /** Frames drawn within the window. */
  frames: number;
  /** Frames per second over the window; 0 when idle. */
  fps: number;
  /** Interval between consecutive frames: median, 95th percentile and worst, ms. Null with fewer than two continuous frames. */
  intervalP50: number | null;
  intervalP95: number | null;
  intervalMax: number | null;
  /** CPU time of the engine's update + render per frame: mean and worst, ms. Null with no frames. */
  cpuMean: number | null;
  cpuMax: number | null;
};

const CAPACITY = 512;

export class FrameRecorder {
  private readonly at = new Float64Array(CAPACITY);
  /** Interval to the previous frame, or -1 after an idle gap (not a continuous frame). */
  private readonly interval = new Float32Array(CAPACITY);
  private readonly cpu = new Float32Array(CAPACITY);
  private next = 0;
  private count = 0;

  /** `intervalMs` is 0 (or less) for the first frame after an idle gap. */
  record(at: number, intervalMs: number, cpuMs: number) {
    this.at[this.next] = at;
    this.interval[this.next] = intervalMs > 0 ? intervalMs : -1;
    this.cpu[this.next] = cpuMs;
    this.next = (this.next + 1) % CAPACITY;
    this.count = Math.min(this.count + 1, CAPACITY);
  }

  clear() {
    this.next = 0;
    this.count = 0;
  }

  /** Frames recorded in the `windowMs` before `now`. */
  window(now: number, windowMs = 1000): FrameWindow {
    const intervals: number[] = [];
    let frames = 0;
    let cpuSum = 0;
    let cpuMax = 0;
    for (let offset = 1; offset <= this.count; offset += 1) {
      const index = (this.next - offset + CAPACITY) % CAPACITY;
      if (now - this.at[index] > windowMs) break;
      frames += 1;
      cpuSum += this.cpu[index];
      cpuMax = Math.max(cpuMax, this.cpu[index]);
      if (this.interval[index] > 0) intervals.push(this.interval[index]);
    }
    intervals.sort((a, b) => a - b);
    const pick = (fraction: number) => (intervals.length === 0 ? null : intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * fraction))]);
    return {
      frames,
      fps: Math.round((frames * 1000) / windowMs),
      intervalP50: pick(0.5),
      intervalP95: pick(0.95),
      intervalMax: intervals.length === 0 ? null : intervals[intervals.length - 1],
      cpuMean: frames === 0 ? null : cpuSum / frames,
      cpuMax: frames === 0 ? null : cpuMax,
    };
  }
}
