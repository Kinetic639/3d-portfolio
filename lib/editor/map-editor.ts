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
  | "navigation";

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
  before: BlockId;
  after: BlockId;
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

  constructor(world = createFlatVoxelWorld(), entities: MapEntityAnchor[] = []) {
    this.world = world;
    this.entities = entities.map(cloneEntity);
    this.savedDocument = serializeMapDocument(this.world, this.entities);
    this.currentDocument = this.savedDocument;
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
        before,
        after: blockId,
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
        before,
        after: blockId,
      }],
    });
  }

  erase(coordinate: GridCoordinate): EditorActionResult {
    return this.applyCommand({
      label: "Erase",
      cells: [{
        coordinate,
        before: this.world.getBlock(coordinate.x, coordinate.y, coordinate.z),
        after: BLOCK_IDS.Air,
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
        before: this.world.getBlock(target.x, target.y, target.z),
        after: blockId,
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
        before: this.world.getBlock(target.x, target.y, target.z),
        after: BLOCK_IDS.Air,
      }],
    });
  }

  flattenColumn(coordinate: GridCoordinate, paintBlockId: BlockId): EditorActionResult {
    const cells: CellChange[] = [];
    const targetBlock = paintBlockId === BLOCK_IDS.Air ? BLOCK_IDS.Ground : paintBlockId;

    for (let y = 0; y < this.world.config.height; y += 1) {
      const before = this.world.getBlock(coordinate.x, y, coordinate.z);
      const after = y <= coordinate.y ? targetBlock : BLOCK_IDS.Air;
      cells.push({ coordinate: { x: coordinate.x, y, z: coordinate.z }, before, after });
    }

    return this.applyCommand({ label: "Flatten", cells });
  }

  applyTerrainMutations(label: string, mutations: TerrainCellMutation[]): EditorActionResult {
    const merged = new Map<string, TerrainCellMutation>();
    for (const mutation of mutations) {
      const key = coordinateKey(mutation.coordinate);
      const existing = merged.get(key);
      merged.set(key, existing ? { ...mutation, beforeBlock: existing.beforeBlock, beforeZone: existing.beforeZone } : mutation);
    }
    const uniqueMutations = [...merged.values()];

    return this.applyCommand({
      label,
      cells: uniqueMutations
        .filter((mutation) => mutation.beforeBlock !== mutation.afterBlock)
        .map((mutation) => ({
          coordinate: mutation.coordinate,
          before: mutation.beforeBlock,
          after: mutation.afterBlock,
        })),
      zones: uniqueMutations
        .filter((mutation) => mutation.beforeZone !== mutation.afterZone)
        .map((mutation) => ({
          coordinate: mutation.coordinate,
          before: mutation.beforeZone,
          after: mutation.afterZone,
        })),
    });
  }

  assignZone(coordinate: GridCoordinate, zoneId: number): EditorActionResult {
    if (!Number.isInteger(zoneId) || zoneId < 0 || zoneId > 5) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [], message: { type: "error", text: "Zone ID must be 0-5." } };
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
  }

  private applyCommand(command: EditorCommand): EditorActionResult {
    const hasCellChange = command.cells?.some((change) => change.before !== change.after) ?? false;
    const hasZoneChange = command.zones?.some((change) => change.before !== change.after) ?? false;
    const hasEntityChange = command.entities
      ? JSON.stringify(command.entities.before) !== JSON.stringify(command.entities.after)
      : false;

    if (!hasCellChange && !hasZoneChange && !hasEntityChange) {
      return { changed: false, rebuiltChunkIds: [], rebuiltChunks: [] };
    }

    this.applyCommandState(command, "after");
    this.undoStack.push(command);
    this.trimHistory();
    this.redoStack = [];
    this.markDocumentDirty();

    return this.flushDirtyChunks();
  }

  private applyCommandState(command: EditorCommand, side: "before" | "after") {
    for (const change of command.cells ?? []) {
      this.world.setBlock(change.coordinate.x, change.coordinate.y, change.coordinate.z, change[side]);
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
      this.currentDocument = serializeMapDocument(this.world, this.entities);
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
    const rebuiltChunkIds = rebuiltChunks.map((chunk) => chunk.id);

    return { changed: rebuiltChunkIds.length > 0, rebuiltChunkIds, rebuiltChunks };
  }

  private trimHistory() {
    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.splice(0, this.undoStack.length - HISTORY_LIMIT);
    }
  }
}

function collectDocumentCellChanges(before: MapDocument, after: MapDocument): CellChange[] {
  const baseWorld = createFlatVoxelWorld();
  const beforeMap = new Map(before.edits.map((edit) => [coordinateKey(edit), edit.blockId]));
  const afterMap = new Map(after.edits.map((edit) => [coordinateKey(edit), edit.blockId]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const changes: CellChange[] = [];

  for (const key of keys) {
    const coordinate = parseCoordinateKey(key);
    const baseBlock = baseWorld.getBlock(coordinate.x, coordinate.y, coordinate.z);
    changes.push({
      coordinate,
      before: beforeMap.get(key) ?? baseBlock,
      after: afterMap.get(key) ?? baseBlock,
    });
  }

  return changes;
}

function collectDocumentZoneChanges(before: MapDocument, after: MapDocument): ZoneChange[] {
  const beforeMap = new Map(before.zones.map((zone) => [coordinateKey(zone), zone.zoneId]));
  const afterMap = new Map(after.zones.map((zone) => [coordinateKey(zone), zone.zoneId]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  return [...keys].map((key) => ({
    coordinate: parseCoordinateKey(key),
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

function parseCoordinateKey(key: string): GridCoordinate {
  const [x, y, z] = key.split(",").map(Number);
  return { x, y, z };
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
