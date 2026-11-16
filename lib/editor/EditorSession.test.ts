import { describe, expect, it, vi } from "vitest";
import { createBlankMapDefinition, createLoadedMapState, validateMapDefinition } from "@/lib/maps/map-definition";
import { createPlacedEntity } from "@/lib/maps/map-entities";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { EditorSession, type SessionChange } from "./editor-session";
import { createTerrainMutations } from "./terrain-brushes";
import { createZoneColumnChanges, getZoneBrushFootprint } from "./zone-tools";

function createSession() {
  const definition = createBlankMapDefinition({ id: "session-test", name: "Session test" });
  definition.zones = [{ id: "zone-1", numericId: 1, label: "One", color: "#336699", displayOrder: 0, visibleInLegend: true, overlayVisible: true, locked: false }];
  const { world } = createLoadedMapState(definition);
  return new EditorSession(definition, world);
}

const raise = (session: EditorSession, x: number, z: number, size = 1) =>
  createTerrainMutations({
    world: session.world,
    operation: "raise",
    center: { x, y: 0, z },
    settings: { shape: size > 1 ? "circle" : "single", size },
    blockId: BLOCK_IDS.Ground,
    zoneId: 0,
  });

describe("editor session", () => {
  it("applies, undoes and redoes terrain edits", () => {
    const session = createSession();
    expect(session.isDirty).toBe(false);
    session.applyTerrain("Raise", raise(session, 5, 5));
    expect(session.world.getBlock(5, 1, 5)).toBe(BLOCK_IDS.Ground);
    expect(session.isDirty).toBe(true);
    expect(session.undoLabel).toBe("Raise");

    expect(session.undo()).toBe("Raise");
    expect(session.world.getBlock(5, 1, 5)).toBe(BLOCK_IDS.Air);
    expect(session.canUndo).toBe(false);
    expect(session.redo()).toBe("Raise");
    expect(session.world.getBlock(5, 1, 5)).toBe(BLOCK_IDS.Ground);
  });

  it("reports only the chunks an edit touched", () => {
    const session = createSession();
    const changes: SessionChange[] = [];
    session.subscribe((change) => changes.push(change));
    session.applyTerrain("Raise", raise(session, 20, 20));
    expect(changes[0].terrainChunks).toEqual(["chunk-1-1"]);
    // A cell on a chunk border also dirties the neighbour whose faces it can hide.
    session.applyTerrain("Raise", raise(session, 16, 20));
    expect(changes[1].terrainChunks.sort()).toEqual(["chunk-0-1", "chunk-1-1"]);
    expect(session.world.dirtyChunks.size).toBe(0);
  });

  it("groups a stroke into one undo step", () => {
    const session = createSession();
    session.beginGroup("Raise stroke");
    session.applyTerrain("Raise", raise(session, 5, 5));
    session.applyTerrain("Raise", raise(session, 5, 5));
    session.applyTerrain("Raise", raise(session, 6, 5));
    session.endGroup();
    expect(session.world.getBlock(5, 2, 5)).toBe(BLOCK_IDS.Ground);
    expect(session.undoLabel).toBe("Raise stroke");

    session.undo();
    expect(session.world.getBlock(5, 1, 5)).toBe(BLOCK_IDS.Air);
    expect(session.world.getBlock(6, 1, 5)).toBe(BLOCK_IDS.Air);
    expect(session.canUndo).toBe(false);
    session.redo();
    expect(session.world.getBlock(5, 2, 5)).toBe(BLOCK_IDS.Ground);
  });

  it("clears redo history when a new edit is made", () => {
    const session = createSession();
    session.applyTerrain("A", raise(session, 5, 5));
    session.undo();
    session.applyTerrain("B", raise(session, 7, 7));
    expect(session.canRedo).toBe(false);
  });

  it("paints and erases zone columns with undo", () => {
    const session = createSession();
    const columns = getZoneBrushFootprint({ x: 10, y: 0, z: 10 }, { shape: "square", size: 3, pathWidth: 1, pathEnds: "square", flattenHeight: 0 }, session.world.config);
    session.applyZoneChanges("Paint zone", createZoneColumnChanges({ world: session.world, columns, mode: "paint", zoneId: 1 }));
    expect(session.world.getColumnZone(10, 10)).toBe(1);
    expect(session.world.getStats().zoneAssignments).toBe(9);
    session.undo();
    expect(session.world.getStats().zoneAssignments).toBe(0);
  });

  it("adds, updates and removes entities, distinguishing structural changes", () => {
    const session = createSession();
    const listener = vi.fn<(change: SessionChange) => void>();
    session.subscribe(listener);
    const crate = createPlacedEntity({ id: "crate", name: "Crate" });

    session.addEntities("Place", [crate]);
    expect(listener.mock.calls[0][0].entitiesStructural).toBe(true);

    session.updateEntities("Move", ["crate"], (entity) => ({ ...entity, transform: { ...entity.transform, position: { x: 4, y: 1, z: 2 } } }));
    expect(listener.mock.calls[1][0]).toMatchObject({ entitiesStructural: false, entitiesUpdated: ["crate"] });
    expect(session.getEntity("crate")?.transform.position.x).toBe(4);

    // An update that changes nothing is not recorded.
    session.updateEntities("Noop", ["crate"], (entity) => entity);
    expect(session.undoLabel).toBe("Move");

    session.removeEntities("Delete", ["crate"]);
    expect(session.getEntities()).toEqual([]);
    session.undo();
    expect(session.getEntity("crate")?.transform.position.x).toBe(4);
    session.undo();
    expect(session.getEntity("crate")?.transform.position.x).toBe(0);
    session.undo();
    expect(session.getEntity("crate")).toBeNull();
  });

  it("changes map fields with undo and keeps untouched fields", () => {
    const session = createSession();
    session.updateMeta("Rename", { name: "Renamed" });
    session.updateMeta("Zone to mini-game", {
      zones: session.getMeta().zones.map((zone) => ({ ...zone, kind: "minigame" as const, minigame: { gameId: "dig" } })),
    });
    expect(session.getMeta().zones[0].minigame?.gameId).toBe("dig");
    session.undo();
    expect(session.getMeta().zones[0].kind).toBeUndefined();
    expect(session.getMeta().name).toBe("Renamed");
    session.undo();
    expect(session.getMeta().name).toBe("Session test");
  });

  it("tracks the saved state through undo and redo", () => {
    const session = createSession();
    session.applyTerrain("Raise", raise(session, 5, 5));
    session.markSaved();
    expect(session.isDirty).toBe(false);
    session.undo();
    expect(session.isDirty).toBe(true);
  });

  it("serialises to a valid map that reloads identically", () => {
    const session = createSession();
    session.applyTerrain("Raise", raise(session, 5, 5, 3));
    session.addEntities("Place", [createPlacedEntity({ id: "crate" })]);
    session.updateMeta("Rename", { name: "Saved" });

    const definition = session.toDefinition();
    expect(validateMapDefinition(definition).ok).toBe(true);
    expect(definition.name).toBe("Saved");
    expect(definition.entities.map((entity) => entity.id)).toEqual(["crate"]);
    expect(definition.blocks.edits.length).toBeGreaterThan(0);
    expect(createLoadedMapState(definition).world.blocks).toEqual(session.world.blocks);
  });

  it("keeps edit cost independent of world size", () => {
    const small = createSession();
    const bigDefinition = createBlankMapDefinition({ id: "big", name: "Big", width: 256, depth: 256 });
    const big = new EditorSession(bigDefinition, createLoadedMapState(bigDefinition).world);
    const time = (session: EditorSession) => {
      const started = performance.now();
      for (let step = 0; step < 200; step += 1) {
        session.applyTerrain("Raise", raise(session, 20 + (step % 10), 20, 3));
        session.undo();
      }
      return performance.now() - started;
    };
    time(small);
    const smallMs = time(small);
    const bigMs = time(big);
    // 16x the cells; an edit that scanned the world would be an order of magnitude slower.
    expect(bigMs).toBeLessThan(smallMs * 4 + 20);
  });
});
