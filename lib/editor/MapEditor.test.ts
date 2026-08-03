import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { serializeMapDocument } from "@/lib/world/map-document";
import { createFlatVoxelWorld } from "@/lib/world/voxel-world";
import { MapEditorSession } from "./map-editor";
import { createTerrainMutations } from "./terrain-brushes";
import { ROTATIONS, SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";

describe("map editor session", () => {
  it("paints only the intended logical cell", () => {
    const editor = new MapEditorSession();

    editor.paint({ x: 4, y: 0, z: 5 }, BLOCK_IDS.Path);

    expect(editor.world.getBlock(4, 0, 5)).toBe(BLOCK_IDS.Path);
    expect(editor.world.getBlock(5, 0, 5)).toBe(BLOCK_IDS.Ground);
  });

  it("does not paint Air cells into new blocks", () => {
    const editor = new MapEditorSession();
    editor.erase({ x: 4, y: 0, z: 5 });

    const result = editor.paint({ x: 4, y: 0, z: 5 }, BLOCK_IDS.Path);

    expect(result.changed).toBe(false);
    expect(result.message?.text).toBe("Paint only changes existing blocks. Use Add Block to fill empty space.");
    expect(editor.world.getBlock(4, 0, 5)).toBe(BLOCK_IDS.Air);
  });

  it("adds a block only into an empty targeted cell", () => {
    const editor = new MapEditorSession();
    const target = { x: 4, y: 1, z: 5 };

    const result = editor.addBlock(target, BLOCK_IDS.Special);

    expect(result.changed).toBe(true);
    expect(editor.world.getBlock(target.x, target.y, target.z)).toBe(BLOCK_IDS.Special);
  });

  it("does not add a block into an occupied targeted cell", () => {
    const editor = new MapEditorSession();

    const result = editor.addBlock({ x: 4, y: 0, z: 5 }, BLOCK_IDS.Path);

    expect(result.changed).toBe(false);
    expect(result.message?.text).toBe("Add target is already occupied.");
    expect(editor.world.getBlock(4, 0, 5)).toBe(BLOCK_IDS.Ground);
  });

  it("erases a cell to Air", () => {
    const editor = new MapEditorSession();

    editor.erase({ x: 4, y: 0, z: 5 });

    expect(editor.world.getBlock(4, 0, 5)).toBe(BLOCK_IDS.Air);
  });

  it("raises by adding one block above the top of a column", () => {
    const editor = new MapEditorSession();

    editor.raise({ x: 4, y: 0, z: 5 }, BLOCK_IDS.Special);

    expect(editor.world.getBlock(4, 1, 5)).toBe(BLOCK_IDS.Special);
    expect(editor.world.getHighestNonAirY(4, 5)).toBe(1);
  });

  it("stops raising safely at Y = 11", () => {
    const editor = new MapEditorSession();
    for (let y = 1; y < 12; y += 1) {
      editor.world.setBlock(4, y, 5, BLOCK_IDS.Ground);
    }
    editor.world.clearDirtyChunks();

    const result = editor.raise({ x: 4, y: 11, z: 5 }, BLOCK_IDS.Special);

    expect(result.changed).toBe(false);
    expect(result.message?.text).toBe("Height limit reached at Y = 11.");
    expect(editor.world.getHighestNonAirY(4, 5)).toBe(11);
  });

  it("lowers only the top block and preserves the Y = 0 base", () => {
    const editor = new MapEditorSession();
    editor.raise({ x: 4, y: 0, z: 5 }, BLOCK_IDS.Special);

    editor.lower({ x: 4, y: 1, z: 5 });
    const baseLowerResult = editor.lower({ x: 4, y: 0, z: 5 });

    expect(editor.world.getBlock(4, 1, 5)).toBe(BLOCK_IDS.Air);
    expect(editor.world.getBlock(4, 0, 5)).toBe(BLOCK_IDS.Ground);
    expect(baseLowerResult.changed).toBe(false);
  });

  it("assigns and clears zones without changing block type", () => {
    const editor = new MapEditorSession();

    editor.assignZone({ x: 4, y: 0, z: 5 }, 4);
    editor.assignZone({ x: 4, y: 0, z: 5 }, 0);

    expect(editor.world.getBlock(4, 0, 5)).toBe(BLOCK_IDS.Ground);
    expect(editor.world.getZone(4, 0, 5)).toBe(0);
  });

  it("places marker anchors at valid snapped grid coordinates and rejects invalid coordinates", () => {
    const editor = new MapEditorSession();

    editor.placeMarker({ x: 4, y: 0, z: 5 });
    const invalid = editor.placeMarker({ x: 64, y: 0, z: 5 });

    expect(editor.entities[0].gridPosition).toEqual({ x: 4, y: 0, z: 5 });
    expect(invalid.changed).toBe(false);
    expect(editor.entities).toHaveLength(1);
  });

  it("toggles an existing marker at the same snapped coordinate", () => {
    const editor = new MapEditorSession();

    editor.placeMarker({ x: 4, y: 1, z: 5 });
    editor.placeMarker({ x: 4, y: 1, z: 5 });

    expect(editor.entities).toHaveLength(0);
  });

  it("undoes and redoes editor operations and clears redo after a new command", () => {
    const editor = new MapEditorSession();

    editor.paint({ x: 4, y: 0, z: 5 }, BLOCK_IDS.Path);
    editor.undo();
    editor.redo();
    editor.undo();
    editor.erase({ x: 6, y: 0, z: 7 });

    expect(editor.world.getBlock(4, 0, 5)).toBe(BLOCK_IDS.Ground);
    expect(editor.world.getBlock(6, 0, 7)).toBe(BLOCK_IDS.Air);
    expect(editor.getSnapshot().redoDepth).toBe(0);
  });

  it("resets to the original flat world", () => {
    const editor = new MapEditorSession();
    editor.erase({ x: 4, y: 0, z: 5 });
    editor.assignZone({ x: 5, y: 0, z: 5 }, 2);
    editor.placeMarker({ x: 6, y: 0, z: 5 });

    editor.resetToFlatMap();

    const stats = editor.world.getStats();
    expect(stats.renderedInstances).toBe(4_096);
    expect(stats.zoneAssignments).toBe(0);
    expect(editor.entities).toHaveLength(0);
  });

  it("export followed by import reproduces identical world changes", () => {
    const editor = new MapEditorSession();
    editor.paint({ x: 4, y: 0, z: 5 }, BLOCK_IDS.Path);
    editor.raise({ x: 4, y: 0, z: 5 }, BLOCK_IDS.Special);
    editor.assignZone({ x: 4, y: 1, z: 5 }, 5);
    editor.placeMarker({ x: 4, y: 1, z: 5 });

    const document = serializeMapDocument(editor.world, editor.entities);
    const imported = new MapEditorSession(createFlatVoxelWorld());
    imported.replaceWithDocument(document, true);

    expect(serializeMapDocument(imported.world, imported.entities)).toEqual(document);
  });

  it("undoes and redoes complete shape-aware cell data", () => {
    const editor = new MapEditorSession();
    const coordinate = { x: 4, y: 1, z: 5 };
    const mutations = createTerrainMutations({
      world: editor.world,
      operation: "fill",
      center: coordinate,
      blockId: BLOCK_IDS.Special,
      shapeId: SHAPE_IDS.STAIR,
      rotation: ROTATIONS.EAST,
      state: 3,
      zoneId: 0,
    });

    editor.applyTerrainMutations("Shape fill", mutations);
    expect(editor.world.getCell(coordinate.x, coordinate.y, coordinate.z)).toMatchObject({
      blockId: BLOCK_IDS.Special,
      shapeId: SHAPE_IDS.STAIR,
      rotation: ROTATIONS.EAST,
      state: 3,
      zoneId: 0,
    });

    editor.undo();
    expect(editor.world.getBlock(coordinate.x, coordinate.y, coordinate.z)).toBe(BLOCK_IDS.Air);
    expect(editor.world.getShape(coordinate.x, coordinate.y, coordinate.z)).toBe(SHAPE_IDS.CUBE);

    editor.redo();
    expect(editor.world.getCell(coordinate.x, coordinate.y, coordinate.z)).toMatchObject({
      blockId: BLOCK_IDS.Special,
      shapeId: SHAPE_IDS.STAIR,
      rotation: ROTATIONS.EAST,
      state: 3,
      zoneId: 2,
    });
  });
});
