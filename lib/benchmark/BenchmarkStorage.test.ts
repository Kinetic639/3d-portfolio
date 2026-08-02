import { describe, expect, it } from "vitest";
import { BENCHMARK_STORAGE_KEY, type BenchmarkRun } from "./types";
import {
  clearBenchmarkHistory,
  createBenchmarkFilename,
  exportBenchmarkHistoryJson,
  importBenchmarkJson,
  loadBenchmarkHistory,
  saveBenchmarkRun,
  validateBenchmarkHistory,
} from "./storage";

describe("benchmark storage", () => {
  it("recovers from corrupted localStorage data", () => {
    const storage = createMemoryStorage();
    storage.setItem(BENCHMARK_STORAGE_KEY, "{bad");
    const loaded = loadBenchmarkHistory(storage);
    expect(loaded.ok).toBe(false);
    expect(loaded.recovered).toBe(true);
    expect(loaded.history.runs).toEqual([]);
  });

  it("serializes, validates and limits history", () => {
    const storage = createMemoryStorage();
    for (let index = 0; index < 3; index += 1) {
      saveBenchmarkRun(storage, createRun(`run-${index}`), 2);
    }
    const loaded = loadBenchmarkHistory(storage);
    expect(loaded.history.runs.map((run) => run.id)).toEqual(["run-1", "run-2"]);
    expect(validateBenchmarkHistory(JSON.parse(exportBenchmarkHistoryJson(loaded.history))).ok).toBe(true);
  });

  it("skips duplicate imports and generates readable filenames", () => {
    const storage = createMemoryStorage();
    const run = createRun("same");
    saveBenchmarkRun(storage, run);
    const result = importBenchmarkJson(storage, JSON.stringify(run));
    expect(result.imported).toBe(0);
    expect(createBenchmarkFilename(run)).toContain("benchmark-map-idle-overview-");
  });

  it("clears history", () => {
    const storage = createMemoryStorage();
    saveBenchmarkRun(storage, createRun("run"));
    expect(clearBenchmarkHistory(storage).runs).toEqual([]);
  });
});

function createRun(id: string): BenchmarkRun {
  const summary = {
    frames: 10,
    measuredDurationMs: 160,
    meanFrameMs: 16,
    p50FrameMs: 16,
    p75FrameMs: 17,
    p90FrameMs: 18,
    p95FrameMs: 19,
    p99FrameMs: 20,
    minFrameMs: 10,
    maxFrameMs: 20,
    meanFps: 62.5,
    medianFpsEquivalent: 62.5,
    onePercentLowFps: 50,
    slowestOnePercentFrameMs: 20,
    above10Ms: { count: 9, percentage: 90 },
    above12_5Ms: { count: 8, percentage: 80 },
    above16_7Ms: { count: 4, percentage: 40 },
    above25Ms: { count: 0, percentage: 0 },
    above33_3Ms: { count: 0, percentage: 0 },
    longFramesAbove50Ms: 0,
    longestSequenceAbove16_7Ms: 2,
  };
  const metric = { min: 1, max: 2, mean: 1.5, end: 2 };
  return {
    id,
    schemaVersion: 1,
    createdAt: "2026-08-02T18:30:00.000Z",
    map: { id: "map", name: "Map", revision: null, dimensions: { x: 64, y: 12, z: 64 } },
    scenario: { id: "idle-overview", name: "Idle overview", configuration: {} },
    environment: {
      userAgent: "test",
      platform: "test",
      logicalCpuCount: 8,
      deviceMemoryGb: null,
      webglVersion: null,
      webglVendor: null,
      webglRenderer: null,
      screen: { width: 1, height: 1 },
      viewport: { width: 1, height: 1 },
      devicePixelRatio: 1,
      drawingBuffer: null,
      reducedMotion: false,
      visibilityInterruptions: 0,
      mode: "development",
    },
    features: {},
    configuration: { mapId: "map", scenarioId: "idle-overview", warmupMs: 1, measurementMs: 1, repetitions: 1, restMs: 1, dpr: null, buildLabel: "", commit: "", notes: "", saveInvalidRuns: false },
    summary,
    repetitions: [],
    renderer: { calls: metric, triangles: metric, lines: metric, points: metric, geometries: metric, textures: metric, programs: { min: null, max: null, mean: null, end: null }, dpr: 1, drawingBuffer: null, instances: metric, visibleChunks: metric },
    world: { mapDimensions: { x: 64, y: 12, z: 64 }, logicalCells: null, solidBlocks: null, airCells: null, visibleFaces: null, renderedTerrainVertices: null, renderedTerrainTriangles: null, activeChunks: null, dirtyChunks: null, chunkRebuildCount: null, staticBatchRebuildCount: null, staticPrefabCount: null, dynamicPrefabCount: null, interactiveObjectCount: null, visibleObjectCount: null, animatedObjectCount: null, activeAnimationMixers: null, raycastsPerformed: null, objectsTestedByRaycasting: null, meanRaycastDurationMs: null, maxRaycastDurationMs: null, reactCommitCount: null, zustandStateChangeCount: null, jsHeapSize: null },
    gpu: null,
    validity: { valid: true, reasons: [] },
  };
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => map.delete(key),
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}
