import { BLOCK_IDS, type BlockId } from "@/lib/world/block-registry";
import {
  createMapStateFromDocument,
  type MapDocument,
  type MapEntityAnchor,
  serializeMapDocument,
} from "@/lib/world/map-document";
import { createFlatVoxelWorld, type RenderChunk, type VoxelWorld } from "@/lib/world/voxel-world";
import type { GridCoordinate } from "@/lib/world/world-config";
import type { TerrainCellMutation } from "./terrain-brushes";
import type { ZoneColumnChange } from "./zone-tools";
import { DEFAULT_ROTATION, DEFAULT_SHAPE_ID, DEFAULT_STATE, type CellRotation, type ShapeId } from "@/lib/voxel-shapes/shape-ids";
import { EMPTY_FLUID_CELL, FLUID_FLAGS, FLUID_IDS, type FluidCell, type FluidLayerSnapshot } from "@/lib/fluids/fluid-types";
import { canTerrainStateContainFluid } from "@/lib/fluids/fluid-containment";
import { WaterSimulator } from "@/lib/fluids/water-simulator";
import { DEFAULT_FLUID_SETTINGS, type FluidSettings } from "@/lib/fluids/fluid-document";

export type EditorTool =
  | "select"
  | "paint"
  | "add"
  | "erase"
  | "raise"
  | "lower"
  | "flatten"
  | "fill"
  | "clear"
  | "path"
  | "removePath"
  | "zone"
  | "removeZone"
  | "marker"
  | "entity"
  | "navigation"
  | "waterSource"
  | "waterRemove"
  | "waterInspect";

export type EditorMessage = {
  type: "info" | "error";
  text: string;
};

export type EditorSnapshot = {
  world: VoxelWorld;
  entities: MapEntityAnchor[];
  savedDocument: MapDocument;
  undoDepth: number;
  redoDepth: number;
  hasUnsavedChanges: boolean;
  blockEditCount: number;
  zoneAssignmentCount: number;
  entityAnchorCount: number;
};

type CellChange = {
  coordinate: GridCoordinate;
  before: CellData;
  after: CellData;
};

type CellData = {
  blockId: BlockId;
  shapeId: ShapeId;
  rotation: CellRotation;
  state: number;
  zoneId: number;
  fluid: FluidCell;
};

type ZoneChange = {
  coordinate: GridCoordinate;
  before: number;
  after: number;
};

type EntityChange = {
  before: MapEntityAnchor[];
  after: MapEntityAnchor[];
};

type EditorCommand = {
  label: string;
  cells?: CellChange[];
  zones?: ZoneChange[];
  entities?: EntityChange;
};

export type EditorActionResult = {
  changed: boolean;
  rebuiltChunkIds: string[];
  rebuiltChunks: RenderChunk[];
  message?: EditorMessage;
};

export type WaterEditOptions = {
  infiniteSources?: boolean;
  settle?: boolean;
};

export type BasinFillPreview = {
  cells: GridCoordinate[];
  leaksAtBoundary: boolean;
};

const HISTORY_LIMIT = 80;

export class MapEditorSession {
  world: VoxelWorld;
  entities: MapEntityAnchor[];
  savedDocument: MapDocument;
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];
  private currentDocument: MapDocument;
  private documentDirty = false;
  private hasPendingChanges = false;
  private cachedSnapshot: EditorSnapshot | null = null;
  private savedFluidLayer: FluidLayerSnapshot;
  private fluidSettings: FluidSettings;

  constructor(world = createFlatVoxelWorld(), entities: MapEntityAnchor[] = [], fluidSettings: FluidSettings = DEFAULT_FLUID_SETTINGS) {
    this.world = world;
    this.entities = entities.map(cloneEntity);
    this.fluidSettings = { ...fluidSettings };
    this.savedDocument = serializeMapDocument(this.world, this.entities, this.fluidSettings);
    this.currentDocument = this.savedDocument;
    this.savedFluidLayer = this.world.cloneFluidLayer();
  }

  getSnapshot(): EditorSnapshot {
    if (this.cachedSnapshot && !this.documentDirty) {
      return this.cachedSnapshot;
    }

    const document = this.getCurrentDocument();
    this.cachedSnapshot = {
      world: this.world,
      entities: this.entities.map(cloneEntity),
      savedDocument: this.savedDocument,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
      hasUnsavedChanges: this.hasPendingChanges,
      blockEditCount: document.edits.length,
      zoneAssignmentCount: document.zones.length,
      entityAnchorCount: document.entities.length,
    };

    return this.cachedSnapshot;
  }

  applyTool(tool: EditorTool, coordinate: GridCoordinate, paintBlockId: BlockId, zoneId: number): EditorActionResult {
    switch (tool) {
      case "paint":
        return this.paint(coordinate, paintBlockId);
      case "add":
        return this.addBlock(coordinate, paintBlockId);
      case "erase":
        return this.erase(coordinate);
      case "raise":
        return this.raise(coordinate, paintBlockId);
      case "lower":
        return this.lower(coordinate);
      case "flatten":
        return this.flattenColumn(coordinate, paintBlockId);
      case "fill":
        return this.addBlock(coordinate, paintBlockId);
      case "clear":
        return this.erase(coordinate);
      case "path":
        return this.paint(coordinate, BLOCK_IDS.Path);
      case "removePath":
        return this.paint(coordinate, BLOCK_IDS.Ground);
      case "zone":
        return this.assignZone(coordinate, zoneId);
      case "removeZone":
        return this.assignZone(coordinate, 0);
      case "marker":
        return this.placeMarker(coordinate);
      case "select":
      default:
        return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [] };
    }
  }

  paint(coordinate: GridCoordinate, blockId: BlockId): EditorActionResult {
    if (blockId === BLOCK_IDS.Air) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [], message: { type: "error", text: "Paint requires a non-Air block." } };
    }

    const before = this.world.getBlock(coordinate.x, coordinate.y, coordinate.z);
    if (before === BLOCK_IDS.Air) {
      return {
        changed: false,
        rebuiltChunkIds: [],
        rebuiltChunks: [],
        message: { type: "info", text: "Paint only changes existing blocks. Use Add Block to fill empty space." },
      };
    }

    return this.applyCommand({
      label: "Paint",
      cells: [{
        coordinate,
        before: this.captureCell(coordinate),
        after: { ...this.captureCell(coordinate), blockId },
      }],
    });
  }

  addBlock(coordinate: GridCoordinate, blockId: BlockId): EditorActionResult {
    if (blockId === BLOCK_IDS.Air) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [], message: { type: "error", text: "Add Block requires a non-Air block." } };
    }

    if (!this.world.isInsideWorld(coordinate.x, coordinate.y, coordinate.z)) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [], message: { type: "error", text: "Add target is out of bounds." } };
    }

    const before = this.world.getBlock(coordinate.x, coordinate.y, coordinate.z);
    if (before !== BLOCK_IDS.Air) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [], message: { type: "info", text: "Add target is already occupied." } };
    }

    return this.applyCommand({
      label: "Add Block",
      cells: [{
        coordinate,
        before: this.captureCell(coordinate),
        after: { blockId, shapeId: DEFAULT_SHAPE_ID, rotation: DEFAULT_ROTATION, state: DEFAULT_STATE, zoneId: this.world.getZone(coordinate.x, coordinate.y, coordinate.z), fluid: { ...EMPTY_FLUID_CELL } },
      }],
    });
  }

  erase(coordinate: GridCoordinate): EditorActionResult {
    return this.applyCommand({
      label: "Erase",
      cells: [{
        coordinate,
        before: this.captureCell(coordinate),
        after: { blockId: BLOCK_IDS.Air, shapeId: DEFAULT_SHAPE_ID, rotation: DEFAULT_ROTATION, state: DEFAULT_STATE, zoneId: this.world.getColumnZone(coordinate.x, coordinate.z), fluid: this.world.getFluid(coordinate.x, coordinate.y, coordinate.z) },
      }],
    });
  }

  raise(coordinate: GridCoordinate, paintBlockId: BlockId): EditorActionResult {
    const topY = this.world.getHighestNonAirY(coordinate.x, coordinate.z);
    const nextY = topY === null ? 0 : topY + 1;

    if (nextY >= this.world.config.height) {
      return {
        changed: false,
        rebuiltChunkIds: [],
        rebuiltChunks: [],
        message: { type: "error", text: "Height limit reached at Y = 11." },
      };
    }

    const sourceBlock = topY === null ? BLOCK_IDS.Ground : this.world.getBlock(coordinate.x, topY, coordinate.z);
    const blockId = paintBlockId === BLOCK_IDS.Air ? sourceBlock : paintBlockId;
    const target = { x: coordinate.x, y: nextY, z: coordinate.z };

    return this.applyCommand({
      label: "Raise",
      cells: [{
        coordinate: target,
        before: this.captureCell(target),
        after: { blockId, shapeId: DEFAULT_SHAPE_ID, rotation: DEFAULT_ROTATION, state: DEFAULT_STATE, zoneId: this.world.getZone(target.x, target.y, target.z), fluid: { ...EMPTY_FLUID_CELL } },
      }],
    });
  }

  lower(coordinate: GridCoordinate): EditorActionResult {
    const topY = this.world.getHighestNonAirY(coordinate.x, coordinate.z);

    if (topY === null) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [], message: { type: "info", text: "Column is already empty." } };
    }

    if (topY === 0) {
      return {
        changed: false,
        rebuiltChunkIds: [],
        rebuiltChunks: [],
        message: { type: "info", text: "Lower stops at Y = 0. Use Erase to make a hole." },
      };
    }

    const target = { x: coordinate.x, y: topY, z: coordinate.z };

    return this.applyCommand({
      label: "Lower",
      cells: [{
        coordinate: target,
        before: this.captureCell(target),
        after: { blockId: BLOCK_IDS.Air, shapeId: DEFAULT_SHAPE_ID, rotation: DEFAULT_ROTATION, state: DEFAULT_STATE, zoneId: this.world.getColumnZone(target.x, target.z), fluid: this.world.getFluid(target.x, target.y, target.z) },
      }],
    });
  }

  flattenColumn(coordinate: GridCoordinate, paintBlockId: BlockId): EditorActionResult {
    const cells: CellChange[] = [];
    const targetBlock = paintBlockId === BLOCK_IDS.Air ? BLOCK_IDS.Ground : paintBlockId;

    for (let y = 0; y < this.world.config.height; y += 1) {
      const cellCoordinate = { x: coordinate.x, y, z: coordinate.z };
      const before = this.captureCell(cellCoordinate);
      const afterBlock = y <= coordinate.y ? targetBlock : BLOCK_IDS.Air;
      const after = afterBlock === BLOCK_IDS.Air
        ? { blockId: BLOCK_IDS.Air, shapeId: DEFAULT_SHAPE_ID, rotation: DEFAULT_ROTATION, state: DEFAULT_STATE, zoneId: this.world.getColumnZone(cellCoordinate.x, cellCoordinate.z), fluid: before.fluid }
        : { ...before, blockId: afterBlock };
      cells.push({ coordinate: cellCoordinate, before, after });
    }

    return this.applyCommand({ label: "Flatten", cells });
  }

  applyTerrainMutations(label: string, mutations: TerrainCellMutation[], recordHistory = true): EditorActionResult {
    const merged = new Map<string, TerrainCellMutation>();
    for (const mutation of mutations) {
      const key = coordinateKey(mutation.coordinate);
      const existing = merged.get(key);
      merged.set(key, existing ? {
          ...mutation,
          beforeBlock: existing.beforeBlock,
          beforeShape: existing.beforeShape,
          beforeRotation: existing.beforeRotation,
          beforeState: existing.beforeState,
          beforeZone: existing.beforeZone,
        } : mutation);
    }
    const uniqueMutations = [...merged.values()];

    return this.applyCommand({
      label,
      cells: uniqueMutations
        .filter((mutation) => (
          mutation.beforeBlock !== mutation.afterBlock ||
          mutation.beforeShape !== mutation.afterShape ||
          mutation.beforeRotation !== mutation.afterRotation ||
          mutation.beforeState !== mutation.afterState ||
          mutation.beforeZone !== mutation.afterZone
        ))
        .map((mutation) => ({
          coordinate: mutation.coordinate,
          before: {
            blockId: mutation.beforeBlock,
            shapeId: mutation.beforeShape,
            rotation: mutation.beforeRotation,
            state: mutation.beforeState,
            zoneId: mutation.beforeZone,
            fluid: this.world.getFluid(mutation.coordinate.x, mutation.coordinate.y, mutation.coordinate.z),
          },
          after: {
            blockId: mutation.afterBlock,
            shapeId: mutation.afterShape,
            rotation: mutation.afterRotation,
            state: mutation.afterState,
            zoneId: mutation.afterZone,
            fluid: canTerrainStateContainFluid(mutation.afterBlock, mutation.afterShape, this.world.getFluid(mutation.coordinate.x, mutation.coordinate.y, mutation.coordinate.z).type)
              ? this.world.getFluid(mutation.coordinate.x, mutation.coordinate.y, mutation.coordinate.z)
              : { ...EMPTY_FLUID_CELL },
          },
        })),
      zones: uniqueMutations
        .filter((mutation) => mutation.beforeZone !== mutation.afterZone)
        .map((mutation) => ({
          coordinate: mutation.coordinate,
          before: mutation.beforeZone,
          after: mutation.afterZone,
        })),
    }, recordHistory);
  }

  applyZoneColumnChanges(label: string, changes: ZoneColumnChange[]): EditorActionResult {
    return this.applyCommand({
      label,
      zones: changes.map((change) => ({
        coordinate: change.coordinate,
        before: change.before,
        after: change.after,
      })),
    });
  }

  assignZone(coordinate: GridCoordinate, zoneId: number): EditorActionResult {
    if (!Number.isInteger(zoneId) || zoneId < 0 || zoneId > 10) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [], message: { type: "error", text: "Zone ID must be 0-10." } };
    }

    return this.applyCommand({
      label: "Assign Zone",
      zones: [{
        coordinate,
        before: this.world.getZone(coordinate.x, coordinate.y, coordinate.z),
        after: zoneId,
      }],
    });
  }

  placeMarker(coordinate: GridCoordinate): EditorActionResult {
    if (!this.world.isInsideWorld(coordinate.x, coordinate.y, coordinate.z)) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [], message: { type: "error", text: "Marker coordinate is out of bounds." } };
    }

    const existingMarker = this.getMarkerAt(coordinate);
    if (existingMarker) {
      return this.removeMarker(existingMarker.id);
    }

    const nextEntities = [
      ...this.entities.map(cloneEntity),
      {
        id: createMarkerId(coordinate, this.entities.length),
        type: "marker" as const,
        gridPosition: { ...coordinate },
        rotationY: 0,
      },
    ];

    return this.applyCommand({
      label: "Place Marker",
      entities: {
        before: this.entities.map(cloneEntity),
        after: nextEntities,
      },
    });
  }

  getMarkerAt(coordinate: GridCoordinate) {
    return this.entities.find((entity) => (
      entity.gridPosition.x === coordinate.x &&
      entity.gridPosition.y === coordinate.y &&
      entity.gridPosition.z === coordinate.z
    )) ?? null;
  }

  removeMarker(id: string): EditorActionResult {
    const nextEntities = this.entities.filter((entity) => entity.id !== id).map(cloneEntity);
    if (nextEntities.length === this.entities.length) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [] };
    }

    return this.applyCommand({
      label: "Remove Marker",
      entities: {
        before: this.entities.map(cloneEntity),
        after: nextEntities,
      },
    });
  }

  applyWaterSources(coordinates: GridCoordinate[], options: WaterEditOptions = {}): EditorActionResult {
    return this.applyFluidSimulationCommand("Place Water Source", (simulator) => {
      coordinates.forEach((coordinate) => simulator.setSource(coordinate.x, coordinate.y, coordinate.z));
    }, options);
  }

  removeWaterSources(coordinates: GridCoordinate[], options: WaterEditOptions = {}): EditorActionResult {
    return this.applyFluidSimulationCommand("Remove Water Source", (simulator) => {
      coordinates.forEach((coordinate) => simulator.removeSource(coordinate.x, coordinate.y, coordinate.z));
    }, options);
  }

  settleWater(infiniteSources = true): EditorActionResult {
    return this.applyFluidSimulationCommand("Settle Water", (simulator) => {
      simulator.scheduleAllSources();
    }, { infiniteSources, settle: true });
  }

  clearDerivedWater(): EditorActionResult {
    const before = this.world.cloneFluidLayer();
    const after = cloneFluidSnapshot(before);
    for (let index = 0; index < after.types.length; index += 1) {
      const flags = after.flags[index];
      if (after.types[index] !== FLUID_IDS.None && (flags & FLUID_FLAGS.Source) === 0) {
        after.types[index] = FLUID_IDS.None;
        after.levels[index] = 0;
        after.flags[index] = 0;
      }
    }
    return this.applyFluidSnapshots("Clear Derived Water", before, after);
  }

  resetWater(): EditorActionResult {
    return this.applyFluidSnapshots("Reset Water", this.world.cloneFluidLayer(), cloneFluidSnapshot(this.savedFluidLayer));
  }

  previewBasinFill(origin: GridCoordinate, targetY = origin.y): BasinFillPreview {
    const surfaceOrigin = this.resolveBasinSurfaceOrigin(origin, targetY);
    if (!surfaceOrigin) return { cells: [], leaksAtBoundary: false };
    const cells: GridCoordinate[] = [];
    const pending: GridCoordinate[] = [surfaceOrigin];
    const visited = new Set<string>();
    let leaksAtBoundary = false;
    for (let cursor = 0; cursor < pending.length; cursor += 1) {
      const coordinate = pending[cursor];
      const key = coordinateKey(coordinate);
      if (visited.has(key)) continue;
      visited.add(key);
      if (!this.world.canContainFluid(coordinate.x, coordinate.y, coordinate.z, FLUID_IDS.Water)) continue;
      cells.push(coordinate);
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const next = { x: coordinate.x + dx, y: surfaceOrigin.y, z: coordinate.z + dz };
        if (!this.world.isInsideWorld(next.x, next.y, next.z)) {
          leaksAtBoundary = true;
          continue;
        }
        if (!visited.has(coordinateKey(next))) pending.push(next);
      }
    }
    return { cells, leaksAtBoundary };
  }

  private resolveBasinSurfaceOrigin(origin: GridCoordinate, targetY: number) {
    const requested = { x: origin.x, y: targetY, z: origin.z };
    if (this.world.canContainFluid(requested.x, requested.y, requested.z, FLUID_IDS.Water)) return requested;

    const above = { x: origin.x, y: targetY + 1, z: origin.z };
    return this.world.canContainFluid(above.x, above.y, above.z, FLUID_IDS.Water) ? above : null;
  }

  fillWaterBasin(origin: GridCoordinate, targetY = origin.y, infiniteSources = true): EditorActionResult {
    const preview = this.previewBasinFill(origin, targetY);
    if (preview.leaksAtBoundary) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [], message: { type: "error", text: "Basin reaches an open world boundary." } };
    }
    if (preview.cells.length === 0) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [], message: { type: "info", text: "No containable basin cells found." } };
    }
    return this.applyWaterSources(preview.cells, { infiniteSources, settle: true });
  }

  undo(): EditorActionResult {
    const command = this.undoStack.pop();
    if (!command) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [] };
    }

    this.applyCommandState(command, "before");
    this.redoStack.push(command);
    this.markDocumentDirty();

    return this.flushDirtyChunks();
  }

  redo(): EditorActionResult {
    const command = this.redoStack.pop();
    if (!command) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [] };
    }

    this.applyCommandState(command, "after");
    this.undoStack.push(command);
    this.markDocumentDirty();

    return this.flushDirtyChunks();
  }

  replaceWithDocument(document: MapDocument, markSaved: boolean): EditorActionResult {
    const beforeDocument = this.getCurrentDocument();
    const imported = createMapStateFromDocument(document);

    this.world = imported.world;
    this.entities = imported.entities;
    this.fluidSettings = { ...(document.fluids?.settings ?? DEFAULT_FLUID_SETTINGS) };
    this.currentDocument = document;
    this.documentDirty = false;
    this.cachedSnapshot = null;
    this.hasPendingChanges = !markSaved;
    this.world.createRenderChunks().forEach((chunk) => this.world.dirtyChunks.add(chunk.id));

    const result = this.flushDirtyChunks();
    this.undoStack.push({
      label: "Import",
      entities: { before: beforeDocument.entities, after: document.entities },
      cells: collectDocumentCellChanges(beforeDocument, document),
      zones: collectDocumentZoneChanges(beforeDocument, document),
    });
    this.trimHistory();
    this.redoStack = [];

    if (markSaved) {
      this.savedDocument = this.currentDocument;
      this.hasPendingChanges = false;
      this.savedFluidLayer = this.world.cloneFluidLayer();
    }

    return result;
  }

  resetToDocument(document: MapDocument): EditorActionResult {
    return this.replaceWithDocument(document, false);
  }

  resetToFlatMap(): EditorActionResult {
    return this.replaceWithDocument(serializeMapDocument(createFlatVoxelWorld(), []), false);
  }

  markSaved() {
    this.savedDocument = this.getCurrentDocument();
    this.hasPendingChanges = false;
    this.cachedSnapshot = null;
    this.savedFluidLayer = this.world.cloneFluidLayer();
  }

  setInfiniteWaterSources(enabled: boolean) {
    if (this.fluidSettings.infiniteSources === enabled) return;
    this.fluidSettings = { ...this.fluidSettings, infiniteSources: enabled };
    this.markDocumentDirty();
  }

  private applyFluidSimulationCommand(label: string, mutate: (simulator: WaterSimulator) => void, options: WaterEditOptions) {
    const before = this.world.cloneFluidLayer();
    const simulatedWorld = this.world.clone();
    const simulator = new WaterSimulator(simulatedWorld, { infiniteSources: options.infiniteSources ?? true });
    mutate(simulator);
    if (options.settle ?? true) simulator.settle();
    return this.applyFluidSnapshots(label, before, simulatedWorld.cloneFluidLayer());
  }

  private applyFluidSnapshots(label: string, before: FluidLayerSnapshot, after: FluidLayerSnapshot) {
    const cells: CellChange[] = [];
    for (let index = 0; index < before.types.length; index += 1) {
      if (before.types[index] === after.types[index] && before.levels[index] === after.levels[index] && before.flags[index] === after.flags[index]) continue;
      const coordinate = this.world.getCoordinates(index);
      if (!coordinate) continue;
      const base = this.captureCell(coordinate);
      cells.push({
        coordinate,
        before: { ...base, fluid: fluidFromSnapshot(before, index) },
        after: { ...base, fluid: fluidFromSnapshot(after, index) },
      });
    }
    return this.applyCommand({ label, cells });
  }

  private applyCommand(command: EditorCommand, recordHistory = true): EditorActionResult {
    if (!hasCommandChanges(command)) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [] };
    }

    this.applyCommandState(command, "after");
    if (recordHistory) {
      this.undoStack.push(command);
      this.trimHistory();
      this.redoStack = [];
    }
    this.markDocumentDirty();

    return this.flushDirtyChunks();
  }

  private applyCommandState(command: EditorCommand, side: "before" | "after") {
    for (const change of command.cells ?? []) {
      this.world.setCell({
        ...change.coordinate,
        ...change[side],
      });
      this.world.setFluid(change.coordinate.x, change.coordinate.y, change.coordinate.z, change[side].fluid);
    }

    for (const change of command.zones ?? []) {
      this.world.setZone(change.coordinate.x, change.coordinate.y, change.coordinate.z, change[side]);
    }

    if (command.entities) {
      this.entities = command.entities[side].map(cloneEntity);
    }
  }

  private getCurrentDocument() {
    if (this.documentDirty) {
      this.currentDocument = serializeMapDocument(this.world, this.entities, this.fluidSettings);
      this.documentDirty = false;
    }

    return this.currentDocument;
  }

  private markDocumentDirty() {
    this.documentDirty = true;
    this.hasPendingChanges = true;
    this.cachedSnapshot = null;
  }

  private flushDirtyChunks(): EditorActionResult {
    const rebuiltChunks = this.world.rebuildDirtyChunks();
    const rebuiltChunkIds = [...new Set([...rebuiltChunks.map((chunk) => chunk.id), ...this.world.dirtyFluidChunks])];

    return { changed: rebuiltChunkIds.length > 0, rebuiltChunkIds, rebuiltChunks };
  }

  private captureCell(coordinate: GridCoordinate): CellData {
    return {
      blockId: this.world.getBlock(coordinate.x, coordinate.y, coordinate.z),
      shapeId: this.world.getShape(coordinate.x, coordinate.y, coordinate.z),
      rotation: this.world.getRotation(coordinate.x, coordinate.y, coordinate.z),
      state: this.world.getState(coordinate.x, coordinate.y, coordinate.z),
      zoneId: this.world.getZone(coordinate.x, coordinate.y, coordinate.z),
      fluid: this.world.getFluid(coordinate.x, coordinate.y, coordinate.z),
    };
  }

  private trimHistory() {
    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.splice(0, this.undoStack.length - HISTORY_LIMIT);
    }
  }
}

function collectDocumentCellChanges(before: MapDocument, after: MapDocument): CellChange[] {
  const baseWorld = createFlatVoxelWorld();
  const beforeMap = new Map(before.edits.map((edit) => [coordinateKey(edit), edit]));
  const afterMap = new Map(after.edits.map((edit) => [coordinateKey(edit), edit]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const changes: CellChange[] = [];

  for (const key of keys) {
    const coordinate = parseCoordinateKey(key);
    const baseCell = {
      blockId: baseWorld.getBlock(coordinate.x, coordinate.y, coordinate.z),
      shapeId: baseWorld.getShape(coordinate.x, coordinate.y, coordinate.z),
      rotation: baseWorld.getRotation(coordinate.x, coordinate.y, coordinate.z),
      state: baseWorld.getState(coordinate.x, coordinate.y, coordinate.z),
      zoneId: 0,
      fluid: { ...EMPTY_FLUID_CELL },
    };
    const beforeEdit = beforeMap.get(key);
    const afterEdit = afterMap.get(key);
    changes.push({
      coordinate,
      before: beforeEdit ? editToCellData(beforeEdit, baseCell) : baseCell,
      after: afterEdit ? editToCellData(afterEdit, baseCell) : baseCell,
    });
  }

  return changes;
}

function editToCellData(edit: MapDocument["edits"][number], fallback: CellData): CellData {
  return {
    blockId: edit.blockId,
    shapeId: edit.shapeId ?? fallback.shapeId,
    rotation: edit.rotation ?? fallback.rotation,
    state: edit.state ?? fallback.state,
    zoneId: fallback.zoneId,
    fluid: fallback.fluid,
  };
}

function sameCellData(left: CellData, right: CellData) {
  return (
    left.blockId === right.blockId &&
    left.shapeId === right.shapeId &&
    left.rotation === right.rotation &&
    left.state === right.state &&
    left.zoneId === right.zoneId
    && left.fluid.type === right.fluid.type
    && left.fluid.level === right.fluid.level
    && left.fluid.source === right.fluid.source
    && left.fluid.falling === right.fluid.falling
    && Boolean(left.fluid.authored) === Boolean(right.fluid.authored)
  );
}

function hasCommandChanges(command: EditorCommand) {
  return (
    (command.cells?.some((change) => !sameCellData(change.before, change.after)) ?? false)
    || (command.zones?.some((change) => change.before !== change.after) ?? false)
    || (command.entities ? JSON.stringify(command.entities.before) !== JSON.stringify(command.entities.after) : false)
  );
}


function cloneFluidSnapshot(snapshot: FluidLayerSnapshot): FluidLayerSnapshot {
  return {
    types: new Uint8Array(snapshot.types),
    levels: new Uint8Array(snapshot.levels),
    flags: new Uint8Array(snapshot.flags),
  };
}

function fluidFromSnapshot(snapshot: FluidLayerSnapshot, index: number): FluidCell {
  if (snapshot.types[index] === FLUID_IDS.None) return { ...EMPTY_FLUID_CELL };
  return {
    type: FLUID_IDS.Water,
    level: snapshot.levels[index],
    source: (snapshot.flags[index] & FLUID_FLAGS.Source) !== 0,
    falling: (snapshot.flags[index] & FLUID_FLAGS.Falling) !== 0,
    authored: (snapshot.flags[index] & FLUID_FLAGS.Authored) !== 0,
  };
}

function collectDocumentZoneChanges(before: MapDocument, after: MapDocument): ZoneChange[] {
  const beforeMap = new Map(before.zones.map((zone) => [zoneCoordinateKey(zone), zone.zoneId]));
  const afterMap = new Map(after.zones.map((zone) => [zoneCoordinateKey(zone), zone.zoneId]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  return [...keys].map((key) => ({
    coordinate: parseZoneCoordinateKey(key),
    before: beforeMap.get(key) ?? 0,
    after: afterMap.get(key) ?? 0,
  }));
}

function createMarkerId(coordinate: GridCoordinate, salt: number) {
  return `marker-${coordinate.x}-${coordinate.y}-${coordinate.z}-${Date.now().toString(36)}-${salt}`;
}

function coordinateKey(coordinate: GridCoordinate) {
  return `${coordinate.x},${coordinate.y},${coordinate.z}`;
}

function zoneCoordinateKey(coordinate: Pick<GridCoordinate, "x" | "z">) {
  return `${coordinate.x},${coordinate.z}`;
}

function parseCoordinateKey(key: string): GridCoordinate {
  const [x, y, z] = key.split(",").map(Number);
  return { x, y, z };
}

function parseZoneCoordinateKey(key: string): GridCoordinate {
  const [x, z] = key.split(",").map(Number);
  return { x, y: 0, z };
}

function cloneEntity(entity: MapEntityAnchor): MapEntityAnchor {
  return {
    id: entity.id,
    type: "marker",
    gridPosition: { ...entity.gridPosition },
    rotationY: entity.rotationY,
    offset: entity.offset ? { ...entity.offset } : undefined,
    metadata: entity.metadata ? { ...entity.metadata } : undefined,
  };
}
