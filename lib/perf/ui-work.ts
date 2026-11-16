import { useLayoutEffect } from "react";

/**
 * The cost of the world's React UI: how often it updates and how long each
 * update takes, from a component's render to its committed DOM.
 *
 * Every component that subscribes to the bridge calls `useUiWork()`. The
 * time is measured from the start of its render to its layout effect, which
 * runs after React has written the DOM, so it covers render and commit. It
 * works in production builds (React's Profiler does not). Style and layout
 * that the browser does afterwards are not included.
 *
 * Two `performance.now()` calls per render; nothing per frame.
 */
const CAPACITY = 256;

class UiWorkMeter {
  private readonly at = new Float64Array(CAPACITY);
  private readonly duration = new Float32Array(CAPACITY);
  private next = 0;
  private count = 0;
  /** Updates since the page loaded. */
  total = 0;

  record(at: number, durationMs: number) {
    this.at[this.next] = at;
    this.duration[this.next] = durationMs;
    this.next = (this.next + 1) % CAPACITY;
    this.count = Math.min(this.count + 1, CAPACITY);
    this.total += 1;
  }

  /** Updates in the `windowMs` before `now` and their total and worst time, ms. */
  window(now: number, windowMs = 5000) {
    let updates = 0;
    let totalMs = 0;
    let maxMs = 0;
    for (let offset = 1; offset <= this.count; offset += 1) {
      const index = (this.next - offset + CAPACITY) % CAPACITY;
      if (now - this.at[index] > windowMs) break;
      updates += 1;
      totalMs += this.duration[index];
      maxMs = Math.max(maxMs, this.duration[index]);
    }
    return { updates, totalMs, maxMs };
  }

  clear() {
    this.next = 0;
    this.count = 0;
    this.total = 0;
  }
}

export const uiWork = new UiWorkMeter();

/** Measures each render of the calling component; see the module comment. */
export function useUiWork() {
  // A measurement, not render output: the value only reaches the meter, never the DOM.
  // eslint-disable-next-line react-hooks/purity
  const startedAt = typeof performance === "undefined" ? 0 : performance.now();
  useLayoutEffect(() => {
    const now = performance.now();
    uiWork.record(now, now - startedAt);
  });
}
