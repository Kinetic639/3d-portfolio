import { FLUID_FLAGS, FLUID_IDS, MAX_HORIZONTAL_FLUID_LEVEL, type FluidId } from "./fluid-types";
import { WaterSimulator } from "./water-simulator";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import type { GridCoordinate } from "@/lib/world/world-config";

export const WATER_SOLVER_VERSION = "water-v1";

export type FluidSettings = {
  infiniteSources: boolean;
  openBoundaryDrains: boolean;
  solverVersion: string;
};

export const DEFAULT_FLUID_SETTINGS: Readonly<FluidSettings> = Object.freeze({
  infiniteSources: true,
  openBoundaryDrains: true,
  solverVersion: WATER_SOLVER_VERSION,
});

export type EncodedFluidSource = GridCoordinate & { fluidId: FluidId };
export type EncodedFluidCell = GridCoordinate & { fluidId: FluidId; level: number; flags: number };

export type FluidDocument = {
  encoding: "fluid-sources-v1";
  settings: FluidSettings;
  sources: EncodedFluidSource[];
  settledCache?: {
    terrainFingerprint: string;
    sourceFingerprint: string;
    solverVersion: string;
    cells: EncodedFluidCell[];
  };
};

export type FluidLoadResult = { cacheStatus: "hit" | "rebuilt" | "empty"; settled: boolean };

export function serializeFluidDocument(world: VoxelWorld, settings: FluidSettings = DEFAULT_FLUID_SETTINGS): FluidDocument {
  const normalized = { ...settings, solverVersion: WATER_SOLVER_VERSION };
  const sources: EncodedFluidSource[] = [];
  const cells: EncodedFluidCell[] = [];
  for (let index = 0; index < world.fluidTypes.length; index += 1) {
    const fluidId = world.fluidTypes[index] as FluidId;
    if (fluidId === FLUID_IDS.None) continue;
    const coordinate = world.getCoordinates(index);
    if (!coordinate) continue;
    const flags = world.fluidFlags[index];
    cells.push({ ...coordinate, fluidId, level: world.fluidLevels[index], flags });
    if ((flags & FLUID_FLAGS.Authored) !== 0) sources.push({ ...coordinate, fluidId });
  }
  sources.sort(compareFluidCoordinates);
  cells.sort(compareFluidCoordinates);
  return {
    encoding: "fluid-sources-v1",
    settings: normalized,
    sources,
    settledCache: {
      terrainFingerprint: fingerprintTerrain(world),
      sourceFingerprint: fingerprintSources(sources, normalized),
      solverVersion: WATER_SOLVER_VERSION,
      cells,
    },
  };
}

// Kept separate from parsing so map validation can report malformed data before touching a world.
export function validateFluidDocument(input: unknown): { ok: true; value: FluidDocument } | { ok: false; error: string } {
  if (!isRecord(input) || input.encoding !== "fluid-sources-v1") return { ok: false, error: "Map fluids must use fluid-sources-v1 encoding." };
  if (!isRecord(input.settings)) return { ok: false, error: "Map fluid settings are required." };
  const settings = input.settings;
  if (typeof settings.infiniteSources !== "boolean" || typeof settings.openBoundaryDrains !== "boolean" || typeof settings.solverVersion !== "string") {
    return { ok: false, error: "Map fluid settings are invalid." };
  }
  const parsedSettings: FluidSettings = { infiniteSources: settings.infiniteSources, openBoundaryDrains: settings.openBoundaryDrains, solverVersion: settings.solverVersion };
  const sources = parseEntries(input.sources, true);
  if (!sources.ok) return sources;
  let settledCache: FluidDocument["settledCache"];
  if (input.settledCache !== undefined) {
    if (!isRecord(input.settledCache) || typeof input.settledCache.terrainFingerprint !== "string" || typeof input.settledCache.sourceFingerprint !== "string" || typeof input.settledCache.solverVersion !== "string") {
      return { ok: false, error: "Map fluid settled cache metadata is invalid." };
    }
    const cells = parseEntries(input.settledCache.cells, false);
    if (!cells.ok) return cells;
    settledCache = { terrainFingerprint: input.settledCache.terrainFingerprint, sourceFingerprint: input.settledCache.sourceFingerprint, solverVersion: input.settledCache.solverVersion, cells: cells.value as EncodedFluidCell[] };
  }
  return { ok: true, value: { encoding: "fluid-sources-v1", settings: parsedSettings, sources: sources.value as EncodedFluidSource[], ...(settledCache ? { settledCache } : {}) } };
}

export function loadFluidDocument(world: VoxelWorld, document: FluidDocument): FluidLoadResult {
  const cache = document.settledCache;
  const cacheValid = cache?.solverVersion === WATER_SOLVER_VERSION &&
    document.settings.solverVersion === WATER_SOLVER_VERSION &&
    cache.terrainFingerprint === fingerprintTerrain(world) &&
    cache.sourceFingerprint === fingerprintSources(document.sources, document.settings);
  if (cacheValid && cache && restoreCache(world, document.sources, cache.cells)) {
    world.clearDirtyFluidChunks();
    return { cacheStatus: "hit", settled: true };
  }
  const simulator = new WaterSimulator(world, { infiniteSources: document.settings.infiniteSources });
  for (const source of document.sources) {
    if (!simulator.setSource(source.x, source.y, source.z)) throw new Error(`Fluid source cannot occupy solid terrain at ${source.x},${source.y},${source.z}.`);
  }
  simulator.scheduleAllSources();
  const result = simulator.settle();
  if (!result.settled) throw new Error("Water simulation exceeded the load settlement limit.");
  world.clearDirtyFluidChunks();
  return { cacheStatus: document.sources.length === 0 ? "empty" : "rebuilt", settled: result.settled };
}

export function fingerprintTerrain(world: VoxelWorld) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < world.blocks.length; i += 1) {
    hash = hashByte(hash, world.blocks[i] & 0xff); hash = hashByte(hash, world.blocks[i] >>> 8);
    hash = hashByte(hash, world.shapes[i]); hash = hashByte(hash, world.rotations[i]); hash = hashByte(hash, world.states[i]);
  }
  return hash.toString(16).padStart(8, "0");
}

export function fingerprintSources(sources: EncodedFluidSource[], settings: FluidSettings) {
  const text = `${settings.infiniteSources ? 1 : 0}|${settings.openBoundaryDrains ? 1 : 0}|${settings.solverVersion}|${[...sources].sort(compareFluidCoordinates).map((s) => `${s.x},${s.y},${s.z},${s.fluidId}`).join(";")}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) hash = hashByte(hash, text.charCodeAt(i) & 0xff);
  return hash.toString(16).padStart(8, "0");
}

function restoreCache(world: VoxelWorld, sources: EncodedFluidSource[], cells: EncodedFluidCell[]) {
  const sourceKeys = new Set(sources.map(key));
  const cachedSources = new Set<string>();
  for (const cell of cells) {
    const source = (cell.flags & FLUID_FLAGS.Source) !== 0;
    const falling = (cell.flags & FLUID_FLAGS.Falling) !== 0;
    const authored = (cell.flags & FLUID_FLAGS.Authored) !== 0;
    if (!world.setFluid(cell.x, cell.y, cell.z, { type: cell.fluidId, level: cell.level, source, falling, authored })) return false;
    if (authored) cachedSources.add(key(cell));
  }
  return sourceKeys.size === cachedSources.size && [...sourceKeys].every((value) => cachedSources.has(value));
}

function parseEntries(input: unknown, sourcesOnly: boolean): { ok: true; value: Array<EncodedFluidSource | EncodedFluidCell> } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: `Map fluid ${sourcesOnly ? "sources" : "cache cells"} must be an array.` };
  const result: Array<EncodedFluidSource | EncodedFluidCell> = []; const seen = new Set<string>();
  for (const value of input) {
    if (!isRecord(value) || !isCoordinate(value) || value.fluidId !== FLUID_IDS.Water) return { ok: false, error: "Map fluid entry has an invalid coordinate or fluid id." };
    const coordinate = { x: value.x, y: value.y, z: value.z, fluidId: FLUID_IDS.Water } as EncodedFluidSource;
    if (seen.has(key(coordinate))) return { ok: false, error: `Duplicate fluid coordinate: ${key(coordinate)}.` };
    seen.add(key(coordinate));
    if (sourcesOnly) result.push(coordinate);
    else {
      if (!Number.isInteger(value.level) || (value.level as number) < 0 || (value.level as number) > MAX_HORIZONTAL_FLUID_LEVEL || !Number.isInteger(value.flags) || (value.flags as number) < 0 || ((value.flags as number) & ~(FLUID_FLAGS.Source | FLUID_FLAGS.Falling | FLUID_FLAGS.Authored)) !== 0 || (((value.flags as number) & FLUID_FLAGS.Authored) !== 0 && ((value.flags as number) & FLUID_FLAGS.Source) === 0)) return { ok: false, error: "Map fluid cache cell has an invalid level or flags." };
      result.push({ ...coordinate, level: value.level as number, flags: value.flags as number });
    }
  }
  return { ok: true, value: result.sort(compareFluidCoordinates) };
}

function isCoordinate(value: Record<string, unknown>): value is Record<string, unknown> & GridCoordinate {
  return [value.x, value.y, value.z].every(Number.isInteger) && (value.x as number) >= 0 && (value.x as number) < 64 && (value.y as number) >= 0 && (value.y as number) < 12 && (value.z as number) >= 0 && (value.z as number) < 64;
}
function compareFluidCoordinates(a: GridCoordinate, b: GridCoordinate) { return a.y - b.y || a.z - b.z || a.x - b.x; }
function key(value: GridCoordinate) { return `${value.x},${value.y},${value.z}`; }
function hashByte(hash: number, value: number) { hash ^= value; return Math.imul(hash, 0x01000193) >>> 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
