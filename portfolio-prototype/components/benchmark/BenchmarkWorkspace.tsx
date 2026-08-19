"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { compareBenchmarkRuns } from "@/lib/benchmark/comparison";
import { runBenchmark } from "@/lib/benchmark/runner";
import { BENCHMARK_SCENARIOS } from "@/lib/benchmark/scenarios";
import {
  BENCHMARK_STORAGE_KEY,
  type BenchmarkConfiguration,
  type BenchmarkHistory,
  type BenchmarkRun,
  type BenchmarkStatus,
} from "@/lib/benchmark/types";
import {
  clearBenchmarkHistory,
  createBenchmarkFilename,
  createEmptyBenchmarkHistory,
  deleteBenchmarkRun,
  discoverBenchmarkMaps,
  exportBenchmarkHistoryJson,
  exportBenchmarkRunJson,
  importBenchmarkJson,
  loadBenchmarkHistory,
  saveBenchmarkRun,
} from "@/lib/benchmark/storage";
import { DEFAULT_AUTHORED_MAP_ID } from "@/lib/maps/map-registry";

const PortfolioExperience = dynamic(() => import("@/components/experience/PortfolioExperience"), { ssr: false });

const SHORT_PRESET = { warmupMs: 2_000, measurementMs: 5_000, repetitions: 1 };
const STANDARD_PRESET = { warmupMs: 5_000, measurementMs: 30_000, repetitions: 3 };

export default function BenchmarkWorkspace({ enabled }: { enabled: boolean }) {
  const [maps, setMaps] = useState(() => discoverBenchmarkMaps(null));
  const [history, setHistory] = useState<BenchmarkHistory>(() => createEmptyBenchmarkHistory());
  const [status, setStatus] = useState<BenchmarkStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [configuration, setConfiguration] = useState<BenchmarkConfiguration>({
    mapId: DEFAULT_AUTHORED_MAP_ID,
    scenarioId: "idle-overview",
    warmupMs: STANDARD_PRESET.warmupMs,
    measurementMs: STANDARD_PRESET.measurementMs,
    repetitions: STANDARD_PRESET.repetitions,
    restMs: 1_000,
    dpr: null,
    buildLabel: "",
    commit: "",
    notes: "",
    saveInvalidRuns: false,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMaps(discoverBenchmarkMaps(localStorage));
      const loaded = loadBenchmarkHistory(localStorage);
      setHistory(loaded.history);
      if (!loaded.ok) setMessage(loaded.message);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const selectedMap = maps.find((map) => map.id === configuration.mapId) ?? maps[0];
  const selectedScenario = BENCHMARK_SCENARIOS.find((scenario) => scenario.id === configuration.scenarioId) ?? BENCHMARK_SCENARIOS[0];
  const comparison = useMemo(() => {
    const [first, second] = selectedRunIds.map((id) => history.runs.find((run) => run.id === id)).filter((run): run is BenchmarkRun => Boolean(run));
    return first && second ? compareBenchmarkRuns(first, second) : null;
  }, [history.runs, selectedRunIds]);
  const selectedRuns = useMemo(
    () => selectedRunIds.map((id) => history.runs.find((run) => run.id === id)).filter((run): run is BenchmarkRun => Boolean(run)),
    [history.runs, selectedRunIds],
  );

  if (!enabled) {
    return (
      <main className="benchmark-page">
        <section className="benchmark-unavailable">
          <h1>Benchmark workspace disabled</h1>
          <p>Enable it in development or set the explicit benchmark profiling flag for production builds.</p>
        </section>
      </main>
    );
  }

  const updateConfig = (patch: Partial<BenchmarkConfiguration>) => setConfiguration((current) => ({ ...current, ...patch }));

  const start = async () => {
    if (isRunning || !selectedMap) return;
    setMessage(null);
    try {
      const handle = await runBenchmark({
        configuration,
        mapName: selectedMap.name,
        mode: process.env.NODE_ENV === "production" ? "production-profiling" : "development",
        onStatus: setStatus,
      });
      cancelRef.current = handle.cancel;
      setIsRunning(true);
      const run = await handle.promise;
      cancelRef.current = null;
      setIsRunning(false);
      if (run.validity.valid || configuration.saveInvalidRuns) {
        const nextHistory = saveBenchmarkRun(localStorage, run);
        setHistory(nextHistory);
        setSelectedRunIds((current) => [...current.slice(-1), run.id]);
      }
    } catch (error) {
      cancelRef.current = null;
      setIsRunning(false);
      setMessage(error instanceof Error ? error.message : "Benchmark failed.");
    }
  };

  const cancel = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    setIsRunning(false);
  };

  const copyJsonToClipboard = async (json: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(json);
      setMessage(successMessage);
    } catch {
      setMessage("Clipboard copy failed. Use Export JSON instead.");
    }
  };

  const exportRun = (run: BenchmarkRun) => downloadJson(createBenchmarkFilename(run), exportBenchmarkRunJson(run));
  const exportAll = () => downloadJson(`benchmark-history-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, exportBenchmarkHistoryJson(history));
  const copyRun = (run: BenchmarkRun) => void copyJsonToClipboard(exportBenchmarkRunJson(run), "Benchmark report JSON copied.");
  const copySelected = () => {
    if (selectedRuns.length === 1) {
      copyRun(selectedRuns[0]);
      return;
    }
    const selectedHistory: BenchmarkHistory = { ...history, runs: selectedRuns };
    void copyJsonToClipboard(exportBenchmarkHistoryJson(selectedHistory), "Selected benchmark reports copied.");
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const raw = await file.text();
      const result = importBenchmarkJson(localStorage, raw);
      setHistory(result.history);
      setMessage(`Imported ${result.imported} benchmark result${result.imported === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    }
  };

  return (
    <main className="benchmark-page">
      <section className="benchmark-viewport" aria-label="Benchmark viewport">
        <PortfolioExperience key={configuration.mapId} initialMapId={configuration.mapId} benchmarkMode />
      </section>
      <aside className="benchmark-panel" aria-label="Performance benchmark workspace">
        <header>
          <div>
            <span>Development Tool</span>
            <h1>Performance Benchmark</h1>
          </div>
          <button type="button" onClick={() => window.location.assign("/")}>Restore viewport</button>
        </header>

        <section className="benchmark-section">
          <h2>Configuration</h2>
          <label>Map<select value={configuration.mapId} onChange={(event) => updateConfig({ mapId: event.target.value })}>{maps.map((map) => <option key={map.id} value={map.id}>{map.name} · {map.sourceLabel}</option>)}</select></label>
          <label>Scenario<select value={configuration.scenarioId} onChange={(event) => updateConfig({ scenarioId: event.target.value as BenchmarkConfiguration["scenarioId"] })}>{BENCHMARK_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}{scenario.supported ? "" : " (unsupported)"}</option>)}</select></label>
          <div className="benchmark-inline">
            <label>Warm-up seconds<input type="number" min={0} value={configuration.warmupMs / 1000} onChange={(event) => updateConfig({ warmupMs: Math.max(0, Number(event.target.value) * 1000) })} /></label>
            <label>Measure seconds<input type="number" min={1} value={configuration.measurementMs / 1000} onChange={(event) => updateConfig({ measurementMs: Math.max(1, Number(event.target.value)) * 1000 })} /></label>
            <label>Reps<input type="number" min={1} max={20} value={configuration.repetitions} onChange={(event) => updateConfig({ repetitions: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} /></label>
          </div>
          <div className="benchmark-inline">
            <label>DPR override<input type="number" min={0.5} max={3} step={0.25} placeholder="current" value={configuration.dpr ?? ""} onChange={(event) => updateConfig({ dpr: event.target.value ? Number(event.target.value) : null })} /></label>
            <label>Build label<input value={configuration.buildLabel} onChange={(event) => updateConfig({ buildLabel: event.target.value })} /></label>
            <label>Commit<input value={configuration.commit} onChange={(event) => updateConfig({ commit: event.target.value })} /></label>
          </div>
          <label>Notes<textarea value={configuration.notes} onChange={(event) => updateConfig({ notes: event.target.value })} /></label>
          <div className="benchmark-actions">
            <button type="button" onClick={() => updateConfig(SHORT_PRESET)}>Short test preset</button>
            <button type="button" onClick={() => updateConfig(STANDARD_PRESET)}>Standard preset</button>
            <button type="button" disabled={isRunning || !selectedScenario.supported} onClick={start}>Start benchmark</button>
            <button type="button" disabled={!isRunning} onClick={cancel}>Cancel</button>
          </div>
        </section>

        <section className="benchmark-section" aria-live="polite">
          <h2>Runtime Status</h2>
          <div className="benchmark-progress"><span style={{ width: `${Math.round((status?.progress ?? 0) * 100)}%` }} /></div>
          <dl className="benchmark-metrics">
            <div><dt>Phase</dt><dd>{status?.label ?? "Idle"}</dd></div>
            <div><dt>Map</dt><dd>{selectedMap?.name ?? configuration.mapId}</dd></div>
            <div><dt>FPS</dt><dd>{status?.fps ?? "-"}</dd></div>
            <div><dt>Frame</dt><dd>{status?.frameMs ? `${status.frameMs} ms` : "-"}</dd></div>
            <div><dt>Rep</dt><dd>{status ? `${status.repetition}/${status.repetitions}` : "-"}</dd></div>
            <div><dt>Remaining</dt><dd>{status ? `${(status.remainingMs / 1000).toFixed(1)}s` : "-"}</dd></div>
          </dl>
          {message ? <p className="benchmark-message">{message}</p> : null}
        </section>

        <section className="benchmark-section">
          <h2>History</h2>
          <div className="benchmark-actions">
            <button type="button" disabled={history.runs.length === 0} onClick={exportAll}>Export all</button>
            <button type="button" disabled={selectedRuns.length === 0} onClick={copySelected}>Copy selected JSON</button>
            <button type="button" onClick={() => fileInputRef.current?.click()}>Import JSON</button>
            <button type="button" disabled={history.runs.length === 0} onClick={() => setHistory(clearBenchmarkHistory(localStorage))}>Clear history</button>
          </div>
          <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={(event) => void importFile(event.target.files?.[0])} />
          <div className="benchmark-history-table">
            {history.runs.slice().reverse().map((run) => (
              <article key={run.id} className={selectedRunIds.includes(run.id) ? "selected" : ""}>
                <button type="button" onClick={() => setSelectedRunIds((current) => current.includes(run.id) ? current.filter((id) => id !== run.id) : [...current.slice(-1), run.id])}>
                  <strong>{run.map.name}</strong>
                  <span>{new Date(run.createdAt).toLocaleString()} · {run.scenario.name}</span>
                  <span>{run.summary.meanFps.toFixed(1)} fps · P95 {run.summary.p95FrameMs.toFixed(2)} ms · P99 {run.summary.p99FrameMs.toFixed(2)} ms · Worst {run.summary.maxFrameMs.toFixed(2)} ms</span>
                  <span>Draws {run.renderer.calls.mean ?? "-"} · Tris {run.renderer.triangles.mean ?? "-"} · {run.validity.valid ? "valid" : "invalid"}</span>
                  <span>Map {run.map.dimensions.x}x{run.map.dimensions.y}x{run.map.dimensions.z} · Blocks {formatNullable(run.world.solidBlocks)} solid / {formatNullable(run.world.airCells)} air · Faces {formatNullable(run.world.visibleFaces)}</span>
                  <span>Terrain {formatNullable(run.world.renderedTerrainTriangles)} tris · Chunks {formatNullable(run.world.activeChunks)} active / {formatNullable(run.world.dirtyChunks)} dirty · Instances {run.renderer.instances.mean ?? "-"}</span>
                  <span>Prefabs {formatNullable(run.world.staticPrefabCount)} static / {formatNullable(run.world.dynamicPrefabCount)} dynamic · Objects {formatNullable(run.world.visibleObjectCount)} visible / {formatNullable(run.world.interactiveObjectCount)} interactive</span>
                </button>
                <div>
                  <button type="button" onClick={() => exportRun(run)}>Export</button>
                  <button type="button" onClick={() => copyRun(run)}>Copy JSON</button>
                  <button type="button" onClick={() => setHistory(deleteBenchmarkRun(localStorage, run.id))}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {comparison ? (
          <section className="benchmark-section">
            <h2>Comparison</h2>
            <dl className="benchmark-metrics">
              <div><dt>Class</dt><dd>{comparison.classification}</dd></div>
              <div><dt>P95 delta</dt><dd>{comparison.p95DeltaMs.toFixed(2)} ms / {comparison.p95DeltaPercent.toFixed(1)}%</dd></div>
              <div><dt>Mean delta</dt><dd>{comparison.meanDeltaMs.toFixed(2)} ms / {comparison.meanDeltaPercent.toFixed(1)}%</dd></div>
              <div><dt>Draw delta</dt><dd>{comparison.drawCallDelta ?? "-"}</dd></div>
            </dl>
            {[...comparison.warnings, ...comparison.reasons].map((warning) => <p key={warning} className="benchmark-message">{warning}</p>)}
          </section>
        ) : null}
        <footer>Storage key: <code>{BENCHMARK_STORAGE_KEY}</code></footer>
      </aside>
    </main>
  );
}

function downloadJson(filename: string, json: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatNullable(value: number | null) {
  return value === null ? "-" : Intl.NumberFormat("en-US").format(value);
}
