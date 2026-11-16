import type { PortfolioBenchmarkBridge } from "@/components/experience/PortfolioExperience";
import { collectBenchmarkEnvironment, getUsedJsHeapSize } from "./environment";
import { combineRendererSummaries, RendererMetricsAccumulator } from "./renderer-metrics";
import { getBenchmarkScenario, getScenarioCamera } from "./scenarios";
import { calculateFrameSummary, combineFrameSummaries } from "./statistics";
import {
  BENCHMARK_SCHEMA_VERSION,
  type BenchmarkConfiguration,
  type BenchmarkRepetition,
  type BenchmarkRun,
  type BenchmarkStatus,
} from "./types";

type RunnerOptions = {
  configuration: BenchmarkConfiguration;
  mapName: string;
  projectVersion?: string;
  mode: "development" | "production-profiling";
  onStatus: (status: BenchmarkStatus) => void;
};

type RunnerState = {
  cancelled: boolean;
  visibilityInterruptions: number;
};

export async function runBenchmark(options: RunnerOptions) {
  const state: RunnerState = { cancelled: false, visibilityInterruptions: 0 };
  let removeVisibilityListener: (() => void) | null = null;

  const cancel = () => {
    state.cancelled = true;
  };

  const promise = (async () => {
    const bridge = await waitForBridge(state, options);
    const scenario = getBenchmarkScenario(options.configuration.scenarioId);
    if (!scenario.supported) {
      throw new Error(`${scenario.name} is unsupported in the current architecture.`);
    }

    removeVisibilityListener = watchVisibility(state);
    publish(options, "loading-map", "Loading map", 0, 0);
    if (!bridge.loadMap(options.configuration.mapId)) {
      throw new Error(`Map ${options.configuration.mapId} could not be loaded.`);
    }

    await waitForReady(bridge, options, state);
    bridge.setDpr(options.configuration.dpr);
    bridge.setInputEnabled(false);

    if (scenario.id === "expansion-reveal") {
      bridge.prepareReveal();
    } else {
      bridge.enterLoadedMap();
    }

    publish(options, "settling-scene", "Settling scene", 0, 0);
    bridge.setCamera(getScenarioCamera(scenario.id, 0));
    await delay(700, state);

    const repetitions: BenchmarkRepetition[] = [];
    const validityReasons: string[] = [];

    for (let repetition = 1; repetition <= options.configuration.repetitions; repetition += 1) {
      if (state.visibilityInterruptions > 0) {
        validityReasons.push("Page visibility changed during benchmark.");
      }

      publish(options, "warm-up", "Warm-up", repetition, options.configuration.warmupMs);
      await runTimedPhase({
        durationMs: options.configuration.warmupMs,
        scenarioId: scenario.id,
        bridge,
        measuring: false,
        state,
        options,
        repetition,
      });

      if (scenario.id === "expansion-reveal") {
        bridge.prepareReveal();
        await delay(250, state);
      }

      publish(options, "measuring", `Measuring repetition ${repetition} of ${options.configuration.repetitions}`, repetition, options.configuration.measurementMs);
      const startedAt = new Date().toISOString();
      if (scenario.id === "expansion-reveal") {
        bridge.startReveal();
      }
      const measured = await runTimedPhase({
        durationMs: options.configuration.measurementMs,
        scenarioId: scenario.id,
        bridge,
        measuring: true,
        state,
        options,
        repetition,
      });
      const endedAt = new Date().toISOString();
      repetitions.push({
        index: repetition,
        summary: measured.summary,
        renderer: measured.renderer,
        startedAt,
        endedAt,
        visibilityInterruptions: state.visibilityInterruptions,
      });

      if (repetition < options.configuration.repetitions) {
        publish(options, "resting", "Resting between repetitions", repetition, options.configuration.restMs);
        await delay(options.configuration.restMs, state);
      }
    }

    publish(options, "calculating", "Calculating results", options.configuration.repetitions, 0);
    const readyState = bridge.getReadyState();
    const worldMetrics = bridge.getWorldMetrics();
    const canvas = document.querySelector(".map-canvas-layer canvas") as HTMLCanvasElement | null;
    const environment = collectBenchmarkEnvironment({ mode: options.mode, visibilityInterruptions: state.visibilityInterruptions, canvas });
    const valid = validityReasons.length === 0 && !state.cancelled;
    const run: BenchmarkRun = {
      id: createBenchmarkRunId(),
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      projectVersion: options.projectVersion,
      buildLabel: options.configuration.buildLabel || undefined,
      commit: options.configuration.commit || undefined,
      notes: options.configuration.notes || undefined,
      map: {
        id: readyState.mapId,
        name: readyState.mapName || options.mapName,
        revision: readyState.mapRevision,
        dimensions: worldMetrics.mapDimensions,
      },
      scenario: {
        id: scenario.id,
        name: scenario.name,
        configuration: {},
      },
      environment,
      features: {
        terrain: true,
        staticPrefabs: true,
        dynamicPrefabs: true,
        interactionRaycasting: scenario.id === "interaction-raycast",
      },
      configuration: options.configuration,
      summary: combineFrameSummaries(repetitions),
      repetitions,
      renderer: combineRendererSummaries(repetitions.map((repetition) => repetition.renderer)),
      world: { ...worldMetrics, jsHeapSize: getUsedJsHeapSize(), animatedObjectCount: null, activeAnimationMixers: null, raycastsPerformed: null, objectsTestedByRaycasting: null, meanRaycastDurationMs: null, maxRaycastDurationMs: null, reactCommitCount: null, zustandStateChangeCount: null },
      gpu: null,
      validity: { valid, reasons: validityReasons },
    };

    bridge.setInputEnabled(true);
    bridge.setDpr(null);
    bridge.resetCamera();
    publish(options, "complete", "Complete", options.configuration.repetitions, 0);
    return run;
  })().catch((error) => {
    const bridge = window.__portfolioBenchmarkBridge;
    bridge?.setInputEnabled(true);
    bridge?.setDpr(null);
    publish(options, state.cancelled ? "cancelled" : "failed", state.cancelled ? "Cancelled" : "Failed", 0, 0, error instanceof Error ? error.message : "Benchmark failed.");
    throw error;
  }).finally(() => {
    removeVisibilityListener?.();
  });

  return { promise, cancel };
}

async function waitForBridge(state: RunnerState, options: RunnerOptions): Promise<PortfolioBenchmarkBridge> {
  publish(options, "waiting-for-assets", "Waiting for assets", 0, 0);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (state.cancelled) throw new Error("Benchmark cancelled.");
    if (window.__portfolioBenchmarkBridge) return window.__portfolioBenchmarkBridge;
    await delay(50, state);
  }
  throw new Error("Benchmark bridge did not become available.");
}

async function waitForReady(bridge: PortfolioBenchmarkBridge, options: RunnerOptions, state: RunnerState) {
  for (const phase of [
    ["waiting-for-assets", "Waiting for assets"] as const,
    ["warming-shaders", "Warming shaders"] as const,
  ]) {
    publish(options, phase[0], phase[1], 0, 0);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (state.cancelled) throw new Error("Benchmark cancelled.");
      const ready = bridge.getReadyState();
      if (ready.terrainReady && ready.shaderWarm && ready.metricsReady) return;
      await delay(50, state);
    }
  }
}

async function runTimedPhase(input: {
  durationMs: number;
  scenarioId: string;
  bridge: PortfolioBenchmarkBridge;
  measuring: boolean;
  state: RunnerState;
  options: RunnerOptions;
  repetition: number;
}) {
  const samples = new Float32Array(Math.max(1, Math.ceil(input.durationMs / 4)));
  let count = 0;
  let lastTimestamp = 0;
  let lastStatusPublish = 0;
  const startedAt = performance.now();
  const renderer = new RendererMetricsAccumulator();
  const canvas = document.querySelector(".map-canvas-layer canvas") as HTMLCanvasElement | null;

  await new Promise<void>((resolve, reject) => {
    const tick = (timestamp: number) => {
      if (input.state.cancelled) {
        reject(new Error("Benchmark cancelled."));
        return;
      }
      const elapsed = timestamp - startedAt;
      if (lastTimestamp > 0 && input.measuring && count < samples.length) {
        samples[count] = timestamp - lastTimestamp;
        count += 1;
        renderer.sample(window.__portfolioExperienceMetrics, canvas);
      }
      lastTimestamp = timestamp;
      if (input.scenarioId === "scripted-camera") {
        input.bridge.setCamera(getScenarioCamera("scripted-camera", Math.min(1, elapsed / Math.max(input.durationMs, 1))));
      } else if (input.scenarioId === "dense-closeup") {
        input.bridge.setCamera(getScenarioCamera("dense-closeup", 0));
      }

      if (elapsed - lastStatusPublish >= 250 || elapsed >= input.durationMs) {
        lastStatusPublish = elapsed;
        publish(input.options, input.measuring ? "measuring" : "warm-up", input.measuring ? `Measuring repetition ${input.repetition} of ${input.options.configuration.repetitions}` : "Warm-up", input.repetition, Math.max(0, input.durationMs - elapsed), null, elapsed / Math.max(input.durationMs, 1));
      }
      if (elapsed >= input.durationMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  return {
    summary: calculateFrameSummary(samples.slice(0, count), input.durationMs),
    renderer: renderer.summarize(),
  };
}

function watchVisibility(state: RunnerState) {
  const listener = () => {
    if (document.visibilityState === "hidden") {
      state.visibilityInterruptions += 1;
    }
  };
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

function publish(options: RunnerOptions, phase: BenchmarkStatus["phase"], label: string, repetition: number, remainingMs: number, message: string | null = null, progress?: number) {
  const metrics = window.__portfolioExperienceMetrics;
  options.onStatus({
    phase,
    label,
    elapsedMs: 0,
    remainingMs,
    repetition,
    repetitions: options.configuration.repetitions,
    progress: progress ?? 0,
    fps: metrics?.fps ?? null,
    frameMs: metrics?.frameMs ?? null,
    mapId: options.configuration.mapId,
    scenarioId: options.configuration.scenarioId,
    message,
  });
}

function delay(ms: number, state: RunnerState) {
  return new Promise<void>((resolve, reject) => {
    window.setTimeout(() => {
      if (state.cancelled) reject(new Error("Benchmark cancelled."));
      else resolve();
    }, ms);
  });
}

function createBenchmarkRunId() {
  return `bench-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
