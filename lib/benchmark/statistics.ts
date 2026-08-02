import type { FrameTimeSummary, ThresholdCount } from "./types";

export function calculateFrameSummary(samples: ArrayLike<number>, durationMs?: number): FrameTimeSummary {
  const frames = samples.length;
  if (frames === 0) {
    return emptyFrameSummary();
  }

  const sorted = Array.from(samples).sort((left, right) => left - right);
  let total = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let above10 = 0;
  let above12_5 = 0;
  let above16_7 = 0;
  let above25 = 0;
  let above33_3 = 0;
  let above50 = 0;
  let currentSlowSequence = 0;
  let longestSlowSequence = 0;

  for (let index = 0; index < frames; index += 1) {
    const value = samples[index];
    total += value;
    min = Math.min(min, value);
    max = Math.max(max, value);
    if (value > 10) above10 += 1;
    if (value > 12.5) above12_5 += 1;
    if (value > 16.7) {
      above16_7 += 1;
      currentSlowSequence += 1;
      longestSlowSequence = Math.max(longestSlowSequence, currentSlowSequence);
    } else {
      currentSlowSequence = 0;
    }
    if (value > 25) above25 += 1;
    if (value > 33.3) above33_3 += 1;
    if (value > 50) above50 += 1;
  }

  const measuredDurationMs = durationMs ?? total;
  const meanFrameMs = total / frames;
  const slowestCount = Math.max(1, Math.ceil(frames * 0.01));
  const slowestOnePercentFrameMs = sorted.slice(-slowestCount).reduce((sum, value) => sum + value, 0) / slowestCount;

  return {
    frames,
    measuredDurationMs: round(measuredDurationMs),
    meanFrameMs: round(meanFrameMs),
    p50FrameMs: round(percentile(sorted, 0.5)),
    p75FrameMs: round(percentile(sorted, 0.75)),
    p90FrameMs: round(percentile(sorted, 0.9)),
    p95FrameMs: round(percentile(sorted, 0.95)),
    p99FrameMs: round(percentile(sorted, 0.99)),
    minFrameMs: round(min),
    maxFrameMs: round(max),
    meanFps: round(frames / (measuredDurationMs / 1000)),
    medianFpsEquivalent: round(1000 / percentile(sorted, 0.5)),
    onePercentLowFps: round(1000 / slowestOnePercentFrameMs),
    slowestOnePercentFrameMs: round(slowestOnePercentFrameMs),
    above10Ms: threshold(above10, frames),
    above12_5Ms: threshold(above12_5, frames),
    above16_7Ms: threshold(above16_7, frames),
    above25Ms: threshold(above25, frames),
    above33_3Ms: threshold(above33_3, frames),
    longFramesAbove50Ms: above50,
    longestSequenceAbove16_7Ms: longestSlowSequence,
  };
}

export function combineFrameSummaries(repetitions: Array<{ summary: FrameTimeSummary }>): FrameTimeSummary {
  if (repetitions.length === 0) return emptyFrameSummary();
  const frames = repetitions.reduce((sum, repetition) => sum + repetition.summary.frames, 0);
  const duration = repetitions.reduce((sum, repetition) => sum + repetition.summary.measuredDurationMs, 0);
  const weighted = (key: keyof Pick<FrameTimeSummary, "meanFrameMs" | "p50FrameMs" | "p75FrameMs" | "p90FrameMs" | "p95FrameMs" | "p99FrameMs" | "slowestOnePercentFrameMs">) =>
    repetitions.reduce((sum, repetition) => sum + repetition.summary[key] * repetition.summary.frames, 0) / Math.max(frames, 1);
  const count = (key: keyof Pick<FrameTimeSummary, "above10Ms" | "above12_5Ms" | "above16_7Ms" | "above25Ms" | "above33_3Ms">) =>
    repetitions.reduce((sum, repetition) => sum + repetition.summary[key].count, 0);

  const above10 = count("above10Ms");
  const above12_5 = count("above12_5Ms");
  const above16_7 = count("above16_7Ms");
  const above25 = count("above25Ms");
  const above33_3 = count("above33_3Ms");
  const slowestOnePercentFrameMs = weighted("slowestOnePercentFrameMs");

  return {
    frames,
    measuredDurationMs: round(duration),
    meanFrameMs: round(weighted("meanFrameMs")),
    p50FrameMs: round(weighted("p50FrameMs")),
    p75FrameMs: round(weighted("p75FrameMs")),
    p90FrameMs: round(weighted("p90FrameMs")),
    p95FrameMs: round(weighted("p95FrameMs")),
    p99FrameMs: round(weighted("p99FrameMs")),
    minFrameMs: Math.min(...repetitions.map((repetition) => repetition.summary.minFrameMs)),
    maxFrameMs: Math.max(...repetitions.map((repetition) => repetition.summary.maxFrameMs)),
    meanFps: round(frames / (duration / 1000)),
    medianFpsEquivalent: round(1000 / weighted("p50FrameMs")),
    onePercentLowFps: round(1000 / slowestOnePercentFrameMs),
    slowestOnePercentFrameMs: round(slowestOnePercentFrameMs),
    above10Ms: threshold(above10, frames),
    above12_5Ms: threshold(above12_5, frames),
    above16_7Ms: threshold(above16_7, frames),
    above25Ms: threshold(above25, frames),
    above33_3Ms: threshold(above33_3, frames),
    longFramesAbove50Ms: repetitions.reduce((sum, repetition) => sum + repetition.summary.longFramesAbove50Ms, 0),
    longestSequenceAbove16_7Ms: Math.max(...repetitions.map((repetition) => repetition.summary.longestSequenceAbove16_7Ms)),
  };
}

export function percentile(sortedSamples: number[], percentileValue: number) {
  if (sortedSamples.length === 0) return 0;
  if (sortedSamples.length === 1) return sortedSamples[0];
  const index = (sortedSamples.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sortedSamples[lower] * (1 - weight) + sortedSamples[upper] * weight;
}

function threshold(count: number, frames: number): ThresholdCount {
  return { count, percentage: round((count / Math.max(frames, 1)) * 100) };
}

function emptyFrameSummary(): FrameTimeSummary {
  const emptyThreshold = { count: 0, percentage: 0 };
  return {
    frames: 0,
    measuredDurationMs: 0,
    meanFrameMs: 0,
    p50FrameMs: 0,
    p75FrameMs: 0,
    p90FrameMs: 0,
    p95FrameMs: 0,
    p99FrameMs: 0,
    minFrameMs: 0,
    maxFrameMs: 0,
    meanFps: 0,
    medianFpsEquivalent: 0,
    onePercentLowFps: 0,
    slowestOnePercentFrameMs: 0,
    above10Ms: emptyThreshold,
    above12_5Ms: emptyThreshold,
    above16_7Ms: emptyThreshold,
    above25Ms: emptyThreshold,
    above33_3Ms: emptyThreshold,
    longFramesAbove50Ms: 0,
    longestSequenceAbove16_7Ms: 0,
  };
}

function round(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}
