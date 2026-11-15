import {
  cloneMapDefinition,
  serializeWorldEdits,
  type MapDefinition,
} from "@/lib/maps/map-definition";
import { clonePlacedEntity, type PlacedMapEntity } from "@/lib/maps/map-entities";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import type { TerrainCellMutation } from "./terrain-brushes";
import type { ZoneColumnChange } from "./zone-tools";

/**
 * The editor's document and its history.
 *
 * Every edit is a command that stores only what it changed (cells, zone
 * columns, individual entities, or the map fields it touched), so applying,
 * undoing and redoing cost in proportion to the edit, never to the size of
 * the world. There is one history stack for everything.
 *
 * The session is plain data and logic: no three.js, no React. The viewport
 * and the UI listen to `subscribe` and read what changed from the event.
 */
export type MapMeta = Omit<MapDefinition, "blocks" | "zoneAssignments" | "entities">;

export type SessionChange = {
  /** Chunks whose terrain mesh must be rebuilt. */
  terrainChunks: string[];
  /** Chunks whose zone overlay must be rebuilt. */
  zoneChunks: string[];
  /** Entities whose transform or appearance changed in place. */
  entitiesUpdated: string[];
  /** True when entities were added or removed. */
  entitiesStructural: boolean;
  /** True when map fields other than terrain, zone cells and entities changed. */
  meta: boolean;
};

type EntityDelta = { id: string; before: PlacedMapEntity | null; after: PlacedMapEntity | null };

type Command =
  | { kind: "terrain"; label: string; mutations: TerrainCellMutation[] }
  | { kind: "zones"; label: string; changes: ZoneColumnChange[] }
  | { kind: "entities"; label: string; deltas: EntityDelta[] }
  | { kind: "meta"; label: string; before: Partial<MapMeta>; after: Partial<MapMeta> }
  | { kind: "group"; label: string; commands: Command[] };

const HISTORY_LIMIT = 200;

const emptyChange = (): SessionChange => ({ terrainChunks: [], zoneChunks: [], entitiesUpdated: [], entitiesStructural: false, meta: false });

export class EditorSession {
  readonly world: VoxelWorld;
  private meta: MapMeta;
  private readonly entityById = new Map<string, PlacedMapEntity>();
  private entityOrder: string[] = [];
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private openGroup: { label: string; commands: Command[] } | null = null;
  private readonly listeners = new Set<(change: SessionChange) => void>();
  /** Increases with every applied command; compared with `savedRevision` for the dirty flag. */
  private revision = 0;
  private savedRevision = 0;

  constructor(definition: MapDefinition, world: VoxelWorld) {
    this.world = world;
    const { blocks: _blocks, zoneAssignments: _zones, entities, ...meta } = cloneMapDefinition(definition);
    void _blocks;
    void _zones;
    this.meta = meta;
    for (const entity of entities) {
      this.entityById.set(entity.id, entity);
      this.entityOrder.push(entity.id);
    }
    world.clearDirtyChunks();
    world.clearDirtyZoneChunks();
  }

  subscribe(listener: (change: SessionChange) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getMeta(): Readonly<MapMeta> {
    return this.meta;
  }

  getEntities(): PlacedMapEntity[] {
    return this.entityOrder.map((id) => this.entityById.get(id)!);
  }

  getEntity(id: string) {
    return this.entityById.get(id) ?? null;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  get undoLabel() {
    return this.undoStack[this.undoStack.length - 1]?.label ?? null;
  }

  get redoLabel() {
    return this.redoStack[this.redoStack.length - 1]?.label ?? null;
  }

  get isDirty() {
    return this.revision !== this.savedRevision;
  }

  markSaved() {
    this.savedRevision = this.revision;
    this.emit(emptyChange());
  }

  /** The full map as it would be written to disk. One pass over the world: call on save, not per edit. */
  toDefinition(): MapDefinition {
    const { edits, zoneAssignments } = serializeWorldEdits(this.world);
    return cloneMapDefinition({
      ...this.meta,
      blocks: { encoding: "cell-edits-v2", generator: "flat-v1", edits },
      zoneAssignments,
      entities: this.getEntities(),
    });
  }

  /** Commands run between `beginGroup` and `endGroup` undo as one step (a brush stroke, a drag). */
  beginGroup(label: string) {
    if (!this.openGroup) this.openGroup = { label, commands: [] };
  }

  endGroup() {
    const group = this.openGroup;
    this.openGroup = null;
    if (!group || group.commands.length === 0) return;
    this.pushHistory(group.commands.length === 1 ? { ...group.commands[0], label: group.label } : { kind: "group", ...group });
    this.emit(emptyChange());
  }

  applyTerrain(label: string, mutations: TerrainCellMutation[]) {
    if (mutations.length > 0) this.run({ kind: "terrain", label, mutations });
  }

  applyZoneChanges(label: string, changes: ZoneColumnChange[]) {
    if (changes.length > 0) this.run({ kind: "zones", label, changes });
  }

  addEntities(label: string, entities: PlacedMapEntity[]) {
    const deltas = entities
      .filter((entity) => !this.entityById.has(entity.id))
      .map((entity) => ({ id: entity.id, before: null, after: clonePlacedEntity(entity) }));
    if (deltas.length > 0) this.run({ kind: "entities", label, deltas });
  }

  removeEntities(label: string, ids: string[]) {
    const deltas = ids
      .filter((id) => this.entityById.has(id))
      .map((id) => ({ id, before: clonePlacedEntity(this.entityById.get(id)!), after: null }));
    if (deltas.length > 0) this.run({ kind: "entities", label, deltas });
  }

  /** Replaces entities with updated copies. Entities that did not change are skipped. */
  updateEntities(label: string, ids: string[], update: (entity: PlacedMapEntity) => PlacedMapEntity) {
    const deltas: EntityDelta[] = [];
    for (const id of ids) {
      const before = this.entityById.get(id);
      if (!before) continue;
      const after = update(clonePlacedEntity(before));
      if (after.id !== id) throw new Error("An entity update must not change the entity id.");
      if (JSON.stringify(before) !== JSON.stringify(after)) deltas.push({ id, before: clonePlacedEntity(before), after });
    }
    if (deltas.length > 0) this.run({ kind: "entities", label, deltas });
  }

  /** Changes map fields other than terrain, zone cells and entities (name, zones, environment, bounds...). */
  updateMeta(label: string, patch: Partial<MapMeta>) {
    const before: Partial<MapMeta> = {};
    const after: Partial<MapMeta> = {};
    for (const key of Object.keys(patch) as Array<keyof MapMeta>) {
      if (JSON.stringify(this.meta[key]) === JSON.stringify(patch[key])) continue;
      (before as Record<string, unknown>)[key] = this.meta[key];
      (after as Record<string, unknown>)[key] = structuredClone(patch[key]);
    }
    if (Object.keys(after).length > 0) this.run({ kind: "meta", label, before, after });
  }

  undo() {
    this.endGroup();
    const command = this.undoStack.pop();
    if (!command) return null;
    const change = emptyChange();
    this.execute(command, "revert", change);
    this.redoStack.push(command);
    this.revision += 1;
    this.emit(change);
    return command.label;
  }

  redo() {
    this.endGroup();
    const command = this.redoStack.pop();
    if (!command) return null;
    const change = emptyChange();
    this.execute(command, "apply", change);
    this.undoStack.push(command);
    this.revision += 1;
    this.emit(change);
    return command.label;
  }

  private run(command: Command) {
    const change = emptyChange();
    this.execute(command, "apply", change);
    this.revision += 1;
    if (this.openGroup) this.openGroup.commands.push(command);
    else this.pushHistory(command);
    this.emit(change);
  }

  private pushHistory(command: Command) {
    this.undoStack.push(command);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  private execute(command: Command, direction: "apply" | "revert", change: SessionChange) {
    const forward = direction === "apply";
    switch (command.kind) {
      case "group": {
        const commands = forward ? command.commands : [...command.commands].reverse();
        for (const child of commands) this.execute(child, direction, change);
        break;
      }
      case "terrain": {
        const mutations = forward ? command.mutations : [...command.mutations].reverse();
        for (const mutation of mutations) {
          this.world.setCell({
            ...mutation.coordinate,
            blockId: forward ? mutation.afterBlock : mutation.beforeBlock,
            shapeId: forward ? mutation.afterShape : mutation.beforeShape,
            rotation: forward ? mutation.afterRotation : mutation.beforeRotation,
            state: forward ? mutation.afterState : mutation.beforeState,
            zoneId: forward ? mutation.afterZone : mutation.beforeZone,
          });
        }
        break;
      }
      case "zones": {
        const changes = forward ? command.changes : [...command.changes].reverse();
        for (const zone of changes) {
          this.world.setColumnZone(zone.coordinate.x, zone.coordinate.z, forward ? zone.after : zone.before);
        }
        break;
      }
      case "entities":
        for (const delta of command.deltas) {
          const next = forward ? delta.after : delta.before;
          const existed = this.entityById.has(delta.id);
          if (next) {
            this.entityById.set(delta.id, clonePlacedEntity(next));
            if (!existed) {
              this.entityOrder.push(delta.id);
              change.entitiesStructural = true;
            } else {
              change.entitiesUpdated.push(delta.id);
            }
          } else if (existed) {
            this.entityById.delete(delta.id);
            this.entityOrder = this.entityOrder.filter((id) => id !== delta.id);
            change.entitiesStructural = true;
          }
        }
        break;
      case "meta":
        this.meta = { ...this.meta, ...structuredClone(forward ? command.after : command.before) };
        change.meta = true;
        break;
    }
    // The world records which chunks its mutators touched; hand them to the listeners and reset.
    for (const id of this.world.dirtyChunks) if (!change.terrainChunks.includes(id)) change.terrainChunks.push(id);
    for (const id of this.world.dirtyZoneChunks) if (!change.zoneChunks.includes(id)) change.zoneChunks.push(id);
    this.world.clearDirtyChunks();
    this.world.clearDirtyZoneChunks();
  }

  private emit(change: SessionChange) {
    for (const listener of [...this.listeners]) listener(change);
  }
}
