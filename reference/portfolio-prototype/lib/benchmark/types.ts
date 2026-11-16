import type { MapRegistryEntry } from "@/lib/maps/map-registry";

export const BENCHMARK_SCHEMA_VERSION = 1;
export const BENCHMARK_STORAGE_KEY = "portfolio.performanceBenchmarks.v1";
export const MAX_BENCHMARK_HISTORY = 100;

export type BenchmarkPhase =
  | "idle"
  | "loading-map"
  | "waiting-for-assets"
  | "warming-shaders"
  | "settling-scene"
  | "warm-up"
  | "measuring"
  | "resting"
  | "calculating"
  | "saving"
  | "complete"
  | "cancelled"
  | "failed";

export type BenchmarkScenarioId = "idle-overview" | "scripted-camera" | "dense-closeup" | "interaction-raycast" | "expansion-reveal";

export type BenchmarkScenarioDefinition = {
  id: BenchmarkScenarioId;
  name: string;
  description: string;
  supported: boolean;
};

export type BenchmarkConfiguration = {
  mapId: string;
  scenarioId: BenchmarkScenarioId;
  warmupMs: number;
  measurementMs: number;
  repetitions: number;
  restMs: number;
  dpr: number | null;
  buildLabel: string;
  commit: string;
  notes: string;
  saveInvalidRuns: boolean;
};

export type BenchmarkStatus = {
  phase: BenchmarkPhase;
  label: string;
  elapsedMs: number;
  remainingMs: number;
  repetition: number;
  repetitions: number;
  progress: number;
  fps: number | null;
  frameMs: number | null;
  mapId: string;
  scenarioId: BenchmarkScenarioId;
  message: string | null;
};

export type FrameTimeSummary = {
  frames: number;
  measuredDurationMs: number;
  meanFrameMs: number;
  p50FrameMs: number;
  p75FrameMs: number;
  p90FrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  minFrameMs: number;
  maxFrameMs: number;
  meanFps: number;
  medianFpsEquivalent: number;
  onePercentLowFps: number;
  slowestOnePercentFrameMs: number;
  above10Ms: ThresholdCount;
  above12_5Ms: ThresholdCount;
  above16_7Ms: ThresholdCount;
  above25Ms: ThresholdCount;
  above33_3Ms: ThresholdCount;
  longFramesAbove50Ms: number;
  longestSequenceAbove16_7Ms: number;
};

export type ThresholdCount = {
  count: number;
  percentage: number;
};

export type RendererMetricSummary = {
  min: number | null;
  max: number | null;
  mean: number | null;
  end: number | null;
};

export type BenchmarkRendererSummary = {
  calls: RendererMetricSummary;
  triangles: RendererMetricSummary;
  lines: RendererMetricSummary;
  points: RendererMetricSummary;
  geometries: RendererMetricSummary;
  textures: RendererMetricSummary;
  programs: RendererMetricSummary;
  dpr: number | null;
  drawingBuffer: { width: number; height: number } | null;
  instances: RendererMetricSummary;
  visibleChunks: RendererMetricSummary;
};

export type BenchmarkWorldSummary = {
  mapDimensions: { x: number; y: number; z: number };
  logicalCells: number | null;
  solidBlocks: number | null;
  airCells: number | null;
  visibleFaces: number | null;
  renderedTerrainVertices: number | null;
  renderedTerrainTriangles: number | null;
  activeChunks: number | null;
  dirtyChunks: number | null;
  chunkRebuildCount: number | null;
  staticBatchRebuildCount: number | null;
  staticPrefabCount: number | null;
  dynamicPrefabCount: number | null;
  interactiveObjectCount: number | null;
  visibleObjectCount: number | null;
  animatedObjectCount: number | null;
  activeAnimationMixers: number | null;
  raycastsPerformed: number | null;
  objectsTestedByRaycasting: number | null;
  meanRaycastDurationMs: number | null;
  maxRaycastDurationMs: number | null;
  reactCommitCount: number | null;
  zustandStateChangeCount: number | null;
  jsHeapSize: number | null;
};

export type BenchmarkEnvironment = {
  userAgent: string;
  platform: string | null;
  logicalCpuCount: number | null;
  deviceMemoryGb: number | null;
  webglVersion: string | null;
  webglVendor: string | null;
  webglRenderer: string | null;
  screen: { width: number; height: number };
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  drawingBuffer: { width: number; height: number } | null;
  reducedMotion: boolean;
  visibilityInterruptions: number;
  mode: "development" | "production-profiling";
};

export type BenchmarkRepetition = {
  index: number;
  summary: FrameTimeSummary;
  renderer: BenchmarkRendererSummary;
  startedAt: string;
  endedAt: string;
  visibilityInterruptions: number;
};

export type BenchmarkRun = {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  projectVersion?: string;
  buildLabel?: string;
  commit?: string;
  notes?: string;
  map: {
    id: string;
    name: string;
    revision: string | null;
    dimensions: { x: number; y: number; z: number };
  };
  scenario: {
    id: BenchmarkScenarioId;
    name: string;
    configuration: Record<string, unknown>;
  };
  environment: BenchmarkEnvironment;
  features: Record<string, boolean>;
  configuration: BenchmarkConfiguration;
  summary: FrameTimeSummary;
  repetitions: BenchmarkRepetition[];
  renderer: BenchmarkRendererSummary;
  world: BenchmarkWorldSummary;
  gpu: null;
  validity: {
    valid: boolean;
    reasons: string[];
  };
};

export type BenchmarkHistory = {
  schemaVersion: 1;
  updatedAt: string;
  runs: BenchmarkRun[];
};

export type BenchmarkMapOption = MapRegistryEntry & {
  sourceLabel: string;
};

export type BenchmarkComparison = {
  compatible: boolean;
  warnings: string[];
  p95DeltaMs: number;
  p95DeltaPercent: number;
  meanDeltaMs: number;
  meanDeltaPercent: number;
  drawCallDelta: number | null;
  triangleDelta: number | null;
  classification: "none" | "warning" | "regression" | "invalid";
  reasons: string[];
};
