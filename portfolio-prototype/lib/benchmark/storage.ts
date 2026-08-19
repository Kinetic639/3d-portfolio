import { MAP_DRAFT_STORAGE_PREFIX, listMapRegistryEntries } from "@/lib/maps/map-registry";
import {
  BENCHMARK_SCHEMA_VERSION,
  BENCHMARK_STORAGE_KEY,
  MAX_BENCHMARK_HISTORY,
  type BenchmarkHistory,
  type BenchmarkMapOption,
  type BenchmarkRun,
} from "./types";

export type BenchmarkStorageResult =
  | { ok: true; history: BenchmarkHistory; recovered: boolean; message?: string }
  | { ok: false; history: BenchmarkHistory; recovered: boolean; message: string };

export function createEmptyBenchmarkHistory(): BenchmarkHistory {
  return { schemaVersion: BENCHMARK_SCHEMA_VERSION, updatedAt: new Date().toISOString(), runs: [] };
}

export function loadBenchmarkHistory(storage: Storage): BenchmarkStorageResult {
  const raw = safeGetItem(storage, BENCHMARK_STORAGE_KEY);
  if (!raw) return { ok: true, history: createEmptyBenchmarkHistory(), recovered: false };
  try {
    const parsed = JSON.parse(raw);
    const validation = validateBenchmarkHistory(parsed);
    if (!validation.ok) {
      return { ok: false, history: createEmptyBenchmarkHistory(), recovered: true, message: validation.message };
    }
    return { ok: true, history: validation.history, recovered: false };
  } catch {
    return { ok: false, history: createEmptyBenchmarkHistory(), recovered: true, message: "Benchmark history is corrupted and was ignored." };
  }
}

export function saveBenchmarkRun(storage: Storage, run: BenchmarkRun, limit = MAX_BENCHMARK_HISTORY) {
  const loaded = loadBenchmarkHistory(storage);
  const runs = [...loaded.history.runs.filter((candidate) => candidate.id !== run.id), run].slice(-limit);
  const history: BenchmarkHistory = { schemaVersion: BENCHMARK_SCHEMA_VERSION, updatedAt: new Date().toISOString(), runs };
  safeSetItem(storage, BENCHMARK_STORAGE_KEY, JSON.stringify(history));
  return history;
}

export function deleteBenchmarkRun(storage: Storage, runId: string) {
  const loaded = loadBenchmarkHistory(storage);
  const history: BenchmarkHistory = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    runs: loaded.history.runs.filter((run) => run.id !== runId),
  };
  safeSetItem(storage, BENCHMARK_STORAGE_KEY, JSON.stringify(history));
  return history;
}

export function clearBenchmarkHistory(storage: Storage) {
  const history = createEmptyBenchmarkHistory();
  safeSetItem(storage, BENCHMARK_STORAGE_KEY, JSON.stringify(history));
  return history;
}

export function importBenchmarkJson(storage: Storage, raw: string, allowDuplicateCopy = false) {
  const parsed = JSON.parse(raw);
  const incoming = isBenchmarkRun(parsed)
    ? [parsed]
    : validateBenchmarkHistory(parsed).ok
      ? (parsed as BenchmarkHistory).runs
      : null;
  if (!incoming) {
    throw new Error("Unsupported benchmark JSON schema.");
  }

  const loaded = loadBenchmarkHistory(storage).history;
  const ids = new Set(loaded.runs.map((run) => run.id));
  const imported: BenchmarkRun[] = [];
  for (const run of incoming) {
    if (!isBenchmarkRun(run)) continue;
    if (ids.has(run.id) && !allowDuplicateCopy) continue;
    const nextRun = ids.has(run.id) ? { ...run, id: `${run.id}-import-${Date.now().toString(36)}` } : run;
    ids.add(nextRun.id);
    imported.push(nextRun);
  }

  const history: BenchmarkHistory = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    runs: [...loaded.runs, ...imported].slice(-MAX_BENCHMARK_HISTORY),
  };
  safeSetItem(storage, BENCHMARK_STORAGE_KEY, JSON.stringify(history));
  return { history, imported: imported.length };
}

export function exportBenchmarkRunJson(run: BenchmarkRun) {
  return JSON.stringify(run, null, 2);
}

export function exportBenchmarkHistoryJson(history: BenchmarkHistory) {
  return JSON.stringify(history, null, 2);
}

export function createBenchmarkFilename(run: BenchmarkRun) {
  const timestamp = run.createdAt.replace(/[:.]/g, "-");
  return `benchmark-${run.map.id}-${run.scenario.id}-${timestamp}.json`;
}

export function discoverBenchmarkMaps(storage: Storage | null): BenchmarkMapOption[] {
  const entries = listMapRegistryEntries({ includeDevelopment: true }).map((entry) => ({ ...entry, sourceLabel: entry.developmentOnly ? "bundled dev" : "bundled" }));
  if (!storage) return entries;
  const seen = new Set(entries.map((entry) => entry.id));
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(MAP_DRAFT_STORAGE_PREFIX)) continue;
    const id = key.slice(MAP_DRAFT_STORAGE_PREFIX.length);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    entries.push({
      id,
      name: `${id} draft`,
      kind: "custom",
      runtimeMode: "dynamic-voxel",
      source: key,
      enabled: true,
      developmentOnly: true,
      sourceLabel: "local draft",
    });
  }
  return entries;
}

export function validateBenchmarkHistory(value: unknown): { ok: true; history: BenchmarkHistory } | { ok: false; message: string } {
  if (!isRecord(value)) return { ok: false, message: "Benchmark history must be an object." };
  if (value.schemaVersion !== BENCHMARK_SCHEMA_VERSION) return { ok: false, message: `Unsupported benchmark schema version: ${String(value.schemaVersion)}.` };
  if (!Array.isArray(value.runs)) return { ok: false, message: "Benchmark history must contain runs." };
  const runs = value.runs.filter(isBenchmarkRun);
  return { ok: true, history: { schemaVersion: BENCHMARK_SCHEMA_VERSION, updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(), runs } };
}

export function isBenchmarkRun(value: unknown): value is BenchmarkRun {
  if (!isRecord(value)) return false;
  return value.schemaVersion === BENCHMARK_SCHEMA_VERSION &&
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    isRecord(value.map) &&
    typeof value.map.id === "string" &&
    isRecord(value.scenario) &&
    typeof value.scenario.id === "string" &&
    isRecord(value.summary) &&
    Array.isArray(value.repetitions) &&
    isRecord(value.validity) &&
    typeof value.validity.valid === "boolean";
}

function safeGetItem(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch (error) {
    throw new Error(error instanceof DOMException && error.name === "QuotaExceededError" ? "Benchmark history quota exceeded." : "Benchmark history could not be saved.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
