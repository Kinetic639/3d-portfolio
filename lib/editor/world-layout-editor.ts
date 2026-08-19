import type { MapEditorSession, EditorActionResult } from "./map-editor";
import {
  createTerrainMutations,
  type TerrainBrushOperation,
  type TerrainBrushSettings,
  type TerrainCellMutation,
} from "./terrain-brushes";
import type { BlockId } from "@/lib/world/block-registry";
import type { GridCoordinate } from "@/lib/world/world-config";
import type { CellRotation, ShapeId } from "@/lib/voxel-shapes/shape-ids";
import { globalCellToRegionCell } from "@/lib/world-layout/world-layout-coordinates";
import type { WorldRegionId } from "@/lib/world-layout/world-layout-types";

type EditableRegionSessions = Readonly<Partial<Record<WorldRegionId, MapEditorSession>>>;
type RegionTerrainMutations = Partial<Record<WorldRegionId, TerrainCellMutation[]>>;
type LayoutHistoryEntry = Readonly<{ label: string; mutations: RegionTerrainMutations }>;

export type LayoutEditorActionResult = Readonly<{
  changed: boolean;
  byRegion: Readonly<Partial<Record<WorldRegionId, EditorActionResult>>>;
}>;

export class WorldLayoutEditorSession {
  private undoStack: LayoutHistoryEntry[] = [];
  private redoStack: LayoutHistoryEntry[] = [];
  private activeStroke: { label: string; mutations: RegionTerrainMutations; visitedColumns: Set<string> } | null = null;

  constructor(readonly sessions: EditableRegionSessions) {}

  get undoDepth() { return this.undoStack.length; }
  get redoDepth() { return this.redoStack.length; }

  clearHistory() {
    this.undoStack = [];
    this.redoStack = [];
    this.activeStroke = null;
  }

  beginTerrainStroke(label: string) {
    if (this.activeStroke) return;
    this.activeStroke = { label, mutations: {}, visitedColumns: new Set() };
  }

  endTerrainStroke() {
    const stroke = this.activeStroke;
    if (!stroke) return false;
    this.activeStroke = null;
    if (Object.keys(stroke.mutations).length === 0) return false;
    this.undoStack.push({ label: stroke.label, mutations: stroke.mutations });
    this.redoStack = [];
    return true;
  }

  applyTerrainMutations(label: string, mutations: Readonly<Partial<Record<WorldRegionId, TerrainCellMutation[]>>>): LayoutEditorActionResult {
    const effectiveMutations = this.activeStroke && isColumnStrokeOperation(label)
      ? filterVisitedStrokeColumns(mutations, this.activeStroke.visitedColumns)
      : mutations;
    const byRegion: Partial<Record<WorldRegionId, EditorActionResult>> = {};
    const changedRegions: WorldRegionId[] = [];
    for (const [regionId, regionMutations] of Object.entries(effectiveMutations) as Array<[WorldRegionId, TerrainCellMutation[]]>) {
      const session = this.sessions[regionId];
      if (!session || regionMutations.length === 0) continue;
      const result = session.applyTerrainMutations(label, regionMutations, false);
      byRegion[regionId] = result;
      if (result.changed) changedRegions.push(regionId);
    }
    if (this.activeStroke) {
      const changedMutations = Object.fromEntries(changedRegions.map((regionId) => [regionId, effectiveMutations[regionId]])) as RegionTerrainMutations;
      this.activeStroke.mutations = mergeRegionMutations(this.activeStroke.mutations, changedMutations);
    } else if (changedRegions.length > 0) {
      this.undoStack.push({ label, mutations });
      this.redoStack = [];
    }
    return { changed: changedRegions.length > 0, byRegion };
  }

  undo(): LayoutEditorActionResult {
    const entry = this.undoStack.pop();
    if (!entry) return { changed: false, byRegion: {} };
    const byRegion: Partial<Record<WorldRegionId, EditorActionResult>> = {};
    for (const [regionId, mutations] of Object.entries(entry.mutations).reverse() as Array<[WorldRegionId, TerrainCellMutation[]]>) {
      const session = this.sessions[regionId];
      if (session) byRegion[regionId] = session.applyTerrainMutations(entry.label, mutations.map(invertMutation), false);
    }
    this.redoStack.push(entry);
    return { changed: true, byRegion };
  }

  redo(): LayoutEditorActionResult {
    const entry = this.redoStack.pop();
    if (!entry) return { changed: false, byRegion: {} };
    const byRegion: Partial<Record<WorldRegionId, EditorActionResult>> = {};
    for (const [regionId, mutations] of Object.entries(entry.mutations) as Array<[WorldRegionId, TerrainCellMutation[]]>) {
      const session = this.sessions[regionId];
      if (session) byRegion[regionId] = session.applyTerrainMutations(entry.label, mutations, false);
    }
    this.undoStack.push(entry);
    return { changed: true, byRegion };
  }
}

function isColumnStrokeOperation(label: string) {
  return label === "raise" || label === "lower" || label === "flatten" || label === "paint-path" || label === "remove-path";
}

function filterVisitedStrokeColumns(
  mutations: Readonly<Partial<Record<WorldRegionId, TerrainCellMutation[]>>>,
  visited: Set<string>,
): RegionTerrainMutations {
  const filtered: RegionTerrainMutations = {};
  const newlyVisited = new Set<string>();
  for (const [regionId, regionMutations] of Object.entries(mutations) as Array<[WorldRegionId, TerrainCellMutation[]]>) {
    const accepted = regionMutations.filter((mutation) => {
      const key = `${regionId}:${mutation.coordinate.x},${mutation.coordinate.z}`;
      if (visited.has(key)) return false;
      newlyVisited.add(key);
      return true;
    });
    if (accepted.length > 0) filtered[regionId] = accepted;
  }
  for (const key of newlyVisited) visited.add(key);
  return filtered;
}

function invertMutation(mutation: TerrainCellMutation): TerrainCellMutation {
  return {
    ...mutation,
    beforeBlock: mutation.afterBlock,
    afterBlock: mutation.beforeBlock,
    beforeShape: mutation.afterShape,
    afterShape: mutation.beforeShape,
    beforeRotation: mutation.afterRotation,
    afterRotation: mutation.beforeRotation,
    beforeState: mutation.afterState,
    afterState: mutation.beforeState,
    beforeZone: mutation.afterZone,
    afterZone: mutation.beforeZone,
  };
}

function mergeRegionMutations(current: RegionTerrainMutations, incoming: RegionTerrainMutations): RegionTerrainMutations {
  const merged: RegionTerrainMutations = { ...current };
  for (const [regionId, mutations] of Object.entries(incoming) as Array<[WorldRegionId, TerrainCellMutation[]]>) {
    const cells = new Map<string, TerrainCellMutation>();
    for (const mutation of merged[regionId] ?? []) cells.set(`${mutation.coordinate.x},${mutation.coordinate.y},${mutation.coordinate.z}`, mutation);
    for (const mutation of mutations) {
      const key = `${mutation.coordinate.x},${mutation.coordinate.y},${mutation.coordinate.z}`;
      const existing = cells.get(key);
      cells.set(key, existing ? { ...mutation, beforeBlock: existing.beforeBlock, beforeShape: existing.beforeShape, beforeRotation: existing.beforeRotation, beforeState: existing.beforeState, beforeZone: existing.beforeZone } : mutation);
    }
    merged[regionId] = [...cells.values()];
  }
  return merged;
}

export function createLayoutTerrainMutations(input: {
  sessions: EditableRegionSessions;
  operation: TerrainBrushOperation;
  centers: readonly GridCoordinate[];
  settings: TerrainBrushSettings;
  blockId: BlockId;
  shapeId?: ShapeId;
  rotation?: CellRotation;
  state?: number;
  zoneId: number;
}) {
  const mutations: Partial<Record<WorldRegionId, TerrainCellMutation[]>> = {};
  const visited = new Set<string>();

  for (const center of input.centers) {
    for (const global of getLayoutTerrainFootprint(center, input.settings, input.operation)) {
      const resolved = globalCellToRegionCell(global);
      if (!resolved || !input.sessions[resolved.regionId]) continue;
      const key = `${resolved.regionId}:${resolved.local.x},${resolved.local.y},${resolved.local.z}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const session = input.sessions[resolved.regionId]!;
      const regionMutations = createTerrainMutations({
        world: session.world,
        operation: input.operation,
        center: resolved.local,
        settings: { ...input.settings, shape: "single", size: 1, pathWidth: 1 },
        blockId: input.blockId,
        shapeId: input.shapeId,
        rotation: input.rotation,
        state: input.state,
        zoneId: input.zoneId,
      });
      (mutations[resolved.regionId] ??= []).push(...regionMutations);
    }
  }
  return mutations;
}

export function getLayoutTerrainFootprint(center: GridCoordinate, settings: TerrainBrushSettings, operation: TerrainBrushOperation) {
  const requestedSize = operation === "paint-path" || operation === "remove-path" ? settings.pathWidth : settings.size;
  const size = Math.max(1, Math.floor(requestedSize));
  if ((settings.shape === "single" && operation !== "paint-path" && operation !== "remove-path") || size <= 1) return [{ ...center }];
  const radius = Math.floor(size / 2);
  const round = operation === "paint-path" || operation === "remove-path"
    ? settings.pathEnds === "round"
    : settings.shape === "circle";
  const cells: GridCoordinate[] = [];
  for (let z = center.z - radius; z <= center.z + radius; z += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      if (round && Math.hypot(x - center.x, z - center.z) > radius + 0.001) continue;
      cells.push({ x, y: center.y, z });
    }
  }
  return cells;
}
