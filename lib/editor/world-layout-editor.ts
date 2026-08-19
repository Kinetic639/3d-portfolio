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
type LayoutHistoryEntry = Readonly<{ label: string; regionIds: readonly WorldRegionId[] }>;

export type LayoutEditorActionResult = Readonly<{
  changed: boolean;
  byRegion: Readonly<Partial<Record<WorldRegionId, EditorActionResult>>>;
}>;

export class WorldLayoutEditorSession {
  private undoStack: LayoutHistoryEntry[] = [];
  private redoStack: LayoutHistoryEntry[] = [];

  constructor(readonly sessions: EditableRegionSessions) {}

  get undoDepth() { return this.undoStack.length; }
  get redoDepth() { return this.redoStack.length; }

  applyTerrainMutations(label: string, mutations: Readonly<Partial<Record<WorldRegionId, TerrainCellMutation[]>>>): LayoutEditorActionResult {
    const byRegion: Partial<Record<WorldRegionId, EditorActionResult>> = {};
    const changedRegions: WorldRegionId[] = [];
    for (const [regionId, regionMutations] of Object.entries(mutations) as Array<[WorldRegionId, TerrainCellMutation[]]>) {
      const session = this.sessions[regionId];
      if (!session || regionMutations.length === 0) continue;
      const result = session.applyTerrainMutations(label, regionMutations);
      byRegion[regionId] = result;
      if (result.changed) changedRegions.push(regionId);
    }
    if (changedRegions.length > 0) {
      this.undoStack.push({ label, regionIds: changedRegions });
      this.redoStack = [];
    }
    return { changed: changedRegions.length > 0, byRegion };
  }

  undo(): LayoutEditorActionResult {
    const entry = this.undoStack.pop();
    if (!entry) return { changed: false, byRegion: {} };
    const byRegion: Partial<Record<WorldRegionId, EditorActionResult>> = {};
    for (const regionId of [...entry.regionIds].reverse()) {
      const session = this.sessions[regionId];
      if (session) byRegion[regionId] = session.undo();
    }
    this.redoStack.push(entry);
    return { changed: true, byRegion };
  }

  redo(): LayoutEditorActionResult {
    const entry = this.redoStack.pop();
    if (!entry) return { changed: false, byRegion: {} };
    const byRegion: Partial<Record<WorldRegionId, EditorActionResult>> = {};
    for (const regionId of entry.regionIds) {
      const session = this.sessions[regionId];
      if (session) byRegion[regionId] = session.redo();
    }
    this.undoStack.push(entry);
    return { changed: true, byRegion };
  }
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
    for (const global of getGlobalBrushFootprint(center, input.settings, input.operation)) {
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

function getGlobalBrushFootprint(center: GridCoordinate, settings: TerrainBrushSettings, operation: TerrainBrushOperation) {
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
