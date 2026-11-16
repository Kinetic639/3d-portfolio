import type { BenchmarkComparison, BenchmarkRun } from "./types";

export function compareBenchmarkRuns(base: BenchmarkRun, candidate: BenchmarkRun): BenchmarkComparison {
  const warnings: string[] = [];
  if (base.map.id !== candidate.map.id) warnings.push("Different maps.");
  if (base.map.revision !== candidate.map.revision) warnings.push("Different map revisions.");
  if (base.scenario.id !== candidate.scenario.id) warnings.push("Different scenarios.");
  if (base.configuration.dpr !== candidate.configuration.dpr) warnings.push("Different DPR configuration.");
  if (base.environment.viewport.width !== candidate.environment.viewport.width || base.environment.viewport.height !== candidate.environment.viewport.height) warnings.push("Different viewport resolution.");
  if (base.configuration.measurementMs !== candidate.configuration.measurementMs) warnings.push("Different measurement duration.");
  if (JSON.stringify(base.features) !== JSON.stringify(candidate.features)) warnings.push("Different feature flags.");
  if (base.environment.webglRenderer !== candidate.environment.webglRenderer) warnings.push("Different GPU renderer.");

  const p95DeltaMs = round(candidate.summary.p95FrameMs - base.summary.p95FrameMs);
  const meanDeltaMs = round(candidate.summary.meanFrameMs - base.summary.meanFrameMs);
  const p95DeltaPercent = percentDelta(base.summary.p95FrameMs, candidate.summary.p95FrameMs);
  const meanDeltaPercent = percentDelta(base.summary.meanFrameMs, candidate.summary.meanFrameMs);
  const drawCallDelta = nullableDelta(base.renderer.calls.mean, candidate.renderer.calls.mean);
  const triangleDelta = nullableDelta(base.renderer.triangles.mean, candidate.renderer.triangles.mean);
  const regression = classifyRegression(base, candidate, p95DeltaMs, p95DeltaPercent, drawCallDelta, triangleDelta);

  return {
    compatible: warnings.length === 0,
    warnings,
    p95DeltaMs,
    p95DeltaPercent,
    meanDeltaMs,
    meanDeltaPercent,
    drawCallDelta,
    triangleDelta,
    classification: regression.classification,
    reasons: regression.reasons,
  };
}

export function classifyRegression(
  base: BenchmarkRun,
  candidate: BenchmarkRun,
  p95DeltaMs = candidate.summary.p95FrameMs - base.summary.p95FrameMs,
  p95DeltaPercent = percentDelta(base.summary.p95FrameMs, candidate.summary.p95FrameMs),
  drawCallDelta = nullableDelta(base.renderer.calls.mean, candidate.renderer.calls.mean),
  triangleDelta = nullableDelta(base.renderer.triangles.mean, candidate.renderer.triangles.mean),
) {
  if (!base.validity.valid || !candidate.validity.valid) {
    return { classification: "invalid" as const, reasons: ["Invalid runs are not classified."] };
  }

  const reasons: string[] = [];
  let classification: "none" | "warning" | "regression" = "none";
  const warn = (reason: string) => {
    reasons.push(reason);
    if (classification === "none") classification = "warning";
  };
  const regress = (reason: string) => {
    reasons.push(reason);
    classification = "regression";
  };

  if (p95DeltaMs > 1) warn("P95 frame time increased by more than 1 ms.");
  if (p95DeltaPercent > 15) regress("P95 frame time increased by more than 15%.");
  if (drawCallDelta !== null && percentDelta(base.renderer.calls.mean ?? 0, candidate.renderer.calls.mean ?? 0) > 10) warn("Draw calls increased by more than 10%.");
  if (triangleDelta !== null && percentDelta(base.renderer.triangles.mean ?? 0, candidate.renderer.triangles.mean ?? 0) > 20) warn("Triangles increased by more than 20%.");
  if (candidate.summary.above16_7Ms.count - base.summary.above16_7Ms.count > Math.max(5, base.summary.frames * 0.02)) regress("Frames above 16.7 ms increased materially.");
  if ((candidate.world.chunkRebuildCount ?? 0) > 0 || (candidate.world.staticBatchRebuildCount ?? 0) > 0) warn("Idle chunk or static-batch rebuild count was greater than zero.");

  return { classification, reasons };
}

function nullableDelta(base: number | null, candidate: number | null) {
  if (base === null || candidate === null) return null;
  return round(candidate - base);
}

function percentDelta(base: number, candidate: number) {
  if (!Number.isFinite(base) || base === 0) return 0;
  return round(((candidate - base) / base) * 100);
}

function round(value: number) {
  return Number(value.toFixed(3));
}
