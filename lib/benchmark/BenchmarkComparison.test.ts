import { describe, expect, it } from "vitest";
import { compareBenchmarkRuns } from "./comparison";
import type { BenchmarkRun } from "./types";

describe("benchmark comparison", () => {
  it("classifies P95 regressions and warns about incompatible runs", () => {
    const base = createRun("base", 12, 100, 1000);
    const candidate = createRun("candidate", 15, 112, 1250);
    candidate.environment.viewport.width = 1440;
    const comparison = compareBenchmarkRuns(base, candidate);
    expect(comparison.compatible).toBe(false);
    expect(comparison.warnings).toContain("Different viewport resolution.");
    expect(comparison.classification).toBe("regression");
    expect(comparison.reasons).toEqual(expect.arrayContaining(["P95 frame time increased by more than 15%."]));
  });

  it("does not classify invalid hidden-tab runs as successful regressions", () => {
    const base = createRun("base", 12, 100, 1000);
    const candidate = createRun("candidate", 14, 100, 1000);
    candidate.validity = { valid: false, reasons: ["Page visibility changed during benchmark."] };
    const comparison = compareBenchmarkRuns(base, candidate);
    expect(comparison.classification).toBe("invalid");
  });
});

function createRun(id: string, p95: number, calls: number, triangles: number): BenchmarkRun {
  const threshold = { count: 0, percentage: 0 };
  const metric = { min: calls, max: calls, mean: calls, end: calls };
  const triangleMetric = { min: triangles, max: triangles, mean: triangles, end: triangles };
  return {
    id,
    schemaVersion: 1,
    createdAt: "2026-08-02T18:30:00.000Z",
    map: { id: "map", name: "Map", revision: "rev", dimensions: { x: 64, y: 12, z: 64 } },
    scenario: { id: "scripted-camera", name: "Scripted camera", configuration: {} },
    environment: { userAgent: "ua", platform: "p", logicalCpuCount: 8, deviceMemoryGb: null, webglVersion: null, webglVendor: null, webglRenderer: "gpu", screen: { width: 1920, height: 1080 }, viewport: { width: 1920, height: 1080 }, devicePixelRatio: 1, drawingBuffer: null, reducedMotion: false, visibilityInterruptions: 0, mode: "development" },
    features: { terrain: true },
    configuration: { mapId: "map", scenarioId: "scripted-camera", warmupMs: 1000, measurementMs: 5000, repetitions: 1, restMs: 1000, dpr: null, buildLabel: "", commit: "", notes: "", saveInvalidRuns: false },
    summary: { frames: 300, measuredDurationMs: 5000, meanFrameMs: 12, p50FrameMs: 11, p75FrameMs: 12, p90FrameMs: 13, p95FrameMs: p95, p99FrameMs: p95 + 1, minFrameMs: 9, maxFrameMs: p95 + 2, meanFps: 60, medianFpsEquivalent: 90, onePercentLowFps: 50, slowestOnePercentFrameMs: 20, above10Ms: threshold, above12_5Ms: threshold, above16_7Ms: threshold, above25Ms: threshold, above33_3Ms: threshold, longFramesAbove50Ms: 0, longestSequenceAbove16_7Ms: 0 },
    repetitions: [],
    renderer: { calls: metric, triangles: triangleMetric, lines: { min: null, max: null, mean: null, end: null }, points: { min: null, max: null, mean: null, end: null }, geometries: metric, textures: metric, programs: { min: null, max: null, mean: null, end: null }, dpr: 1, drawingBuffer: null, instances: metric, visibleChunks: metric },
    world: { mapDimensions: { x: 64, y: 12, z: 64 }, logicalCells: null, solidBlocks: null, airCells: null, visibleFaces: null, renderedTerrainVertices: null, renderedTerrainTriangles: null, activeChunks: null, dirtyChunks: null, chunkRebuildCount: null, staticBatchRebuildCount: null, staticPrefabCount: null, dynamicPrefabCount: null, interactiveObjectCount: null, visibleObjectCount: null, animatedObjectCount: null, activeAnimationMixers: null, raycastsPerformed: null, objectsTestedByRaycasting: null, meanRaycastDurationMs: null, maxRaycastDurationMs: null, reactCommitCount: null, zustandStateChangeCount: null, jsHeapSize: null },
    gpu: null,
    validity: { valid: true, reasons: [] },
  };
}
