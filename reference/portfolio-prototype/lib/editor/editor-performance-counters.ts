export type EditorPerformanceCounterName =
  | "canvasMounts"
  | "canvasResizes"
  | "rendererSetSizeCalls"
  | "cameraProjectionUpdates"
  | "terrainChunkRebuilds"
  | "completeWorldRebuilds"
  | "entityBatchRebuilds"
  | "raycasts"
  | "sceneTraversals"
  | "mapValidations"
  | "mapSerializations"
  | "draftWrites"
  | "layoutPersistenceWrites"
  | "editorPanelPublishes"
  | "editorToolbarRenders"
  | "reactMetricUpdates";

export type EditorPerformanceCounters = Record<EditorPerformanceCounterName, number>;

export const EDITOR_PERFORMANCE_COUNTER_NAMES: EditorPerformanceCounterName[] = [
  "canvasMounts",
  "canvasResizes",
  "rendererSetSizeCalls",
  "cameraProjectionUpdates",
  "terrainChunkRebuilds",
  "completeWorldRebuilds",
  "entityBatchRebuilds",
  "raycasts",
  "sceneTraversals",
  "mapValidations",
  "mapSerializations",
  "draftWrites",
  "layoutPersistenceWrites",
  "editorPanelPublishes",
  "editorToolbarRenders",
  "reactMetricUpdates",
];

const createCounters = (): EditorPerformanceCounters => Object.fromEntries(
  EDITOR_PERFORMANCE_COUNTER_NAMES.map((name) => [name, 0]),
) as EditorPerformanceCounters;

declare global {
  interface Window {
    __portfolioEditorPerfCounters?: EditorPerformanceCounters;
  }
}

export function incrementEditorPerfCounter(name: EditorPerformanceCounterName, amount = 1) {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
    return;
  }

  const counters = window.__portfolioEditorPerfCounters ?? createCounters();
  counters[name] += amount;
  window.__portfolioEditorPerfCounters = counters;
}

export function getEditorPerfCountersSnapshot(): EditorPerformanceCounters {
  if (typeof window === "undefined") {
    return createCounters();
  }

  const counters = window.__portfolioEditorPerfCounters ?? createCounters();
  window.__portfolioEditorPerfCounters = counters;
  return { ...counters };
}
