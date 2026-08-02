import { describe, expect, it } from "vitest";
import { calculateFrameSummary, combineFrameSummaries, percentile } from "./statistics";

describe("benchmark statistics", () => {
  it("calculates percentiles and FPS from measured duration", () => {
    const summary = calculateFrameSummary([10, 12, 16, 20, 40], 100);
    expect(percentile([10, 20, 30], 0.5)).toBe(20);
    expect(summary.frames).toBe(5);
    expect(summary.meanFrameMs).toBe(19.6);
    expect(summary.meanFps).toBe(50);
    expect(summary.p50FrameMs).toBe(16);
    expect(summary.p95FrameMs).toBeCloseTo(36, 0);
    expect(summary.above16_7Ms.count).toBe(2);
    expect(summary.above33_3Ms.count).toBe(1);
  });

  it("tracks longest slow-frame sequence and slowest one percent", () => {
    const summary = calculateFrameSummary([12, 18, 19, 11, 22, 23, 24], 140);
    expect(summary.longestSequenceAbove16_7Ms).toBe(3);
    expect(summary.longFramesAbove50Ms).toBe(0);
    expect(summary.onePercentLowFps).toBeCloseTo(41.667, 3);
  });

  it("combines repeated summaries without averaging instantaneous FPS", () => {
    const first = { summary: calculateFrameSummary([10, 10, 10], 30) };
    const second = { summary: calculateFrameSummary([20, 20, 20], 60) };
    const combined = combineFrameSummaries([first, second]);
    expect(combined.frames).toBe(6);
    expect(combined.measuredDurationMs).toBe(90);
    expect(combined.meanFps).toBeCloseTo(66.667, 3);
  });
});
