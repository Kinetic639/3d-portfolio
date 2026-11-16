import { describe, expect, it } from "vitest";
import { createBlankMapDefinition, createLoadedMapState } from "@/lib/maps/map-definition";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { DEFAULT_TERRAIN_BRUSH } from "./terrain-brushes";
import { affectedCount, appendSurfacePlate, effectiveBrush, flattenPreviewCells, isSingleShot, previewCells, toolBlock, toolTarget } from "./editor-tools";

function world() {
  const { world } = createLoadedMapState(createBlankMapDefinition({ id: "tools", name: "Tools", width: 32, depth: 32 }));
  // A step: columns x >= 16 are one block higher.
  for (let z = 0; z < 32; z += 1) for (let x = 16; x < 32; x += 1) world.setBlock(x, 1, z, BLOCK_IDS.Stone);
  return world;
}

const brush5 = { ...DEFAULT_TERRAIN_BRUSH, shape: "square" as const, size: 5 };

describe("editor tools", () => {
  it("raise acts above a column's top, lower on it", () => {
    const w = world();
    expect(toolTarget(w, "raise", { x: 4, y: 0, z: 4 })).toEqual({ x: 4, y: 1, z: 4 });
    expect(toolTarget(w, "lower", { x: 20, y: 0, z: 4 })).toEqual({ x: 20, y: 1, z: 4 });
    expect(toolTarget(w, "paint", { x: 4, y: 0, z: 4 })).toEqual({ x: 4, y: 0, z: 4 });
  });

  it("only brush tools use the brush; add, select and place act on one cell", () => {
    expect(effectiveBrush("raise", brush5).size).toBe(5);
    expect(effectiveBrush("add", brush5).size).toBe(1);
    expect(effectiveBrush("entity", brush5).shape).toBe("single");
    expect(isSingleShot("add")).toBe(true);
    expect(isSingleShot("paint")).toBe(false);
  });

  it("add writes plain ground unless the material is applied", () => {
    expect(toolBlock("add", BLOCK_IDS.Stone, false)).toBe(BLOCK_IDS.Ground);
    expect(toolBlock("add", BLOCK_IDS.Stone, true)).toBe(BLOCK_IDS.Stone);
    expect(toolBlock("paint", BLOCK_IDS.Stone, false)).toBe(BLOCK_IDS.Stone);
  });

  it("flatten previews which columns go up, down or stay", () => {
    const w = world();
    const cells = flattenPreviewCells(w, { x: 16, y: 0, z: 8 }, brush5);
    expect(cells).toHaveLength(25);
    expect(cells.filter((cell) => cell.action === "lower").map((cell) => cell.coordinate.x).sort()).toEqual(Array(15).fill(0).map((_, index) => 16 + Math.floor(index / 5)).sort());
    expect(cells.filter((cell) => cell.action === "unchanged")).toHaveLength(10);
  });

  it("previews exactly what a brush changes, and the area fill rectangle", () => {
    const w = world();
    const input = { world: w, tool: "raise" as const, center: { x: 8, y: 0, z: 8 }, settings: brush5, blockId: BLOCK_IDS.Ground, zoneId: 1, zoneSelectionMode: "brush" as const, zoneAnchor: null };
    expect(previewCells(input)).toHaveLength(25);
    expect(affectedCount(input)).toBe(25);
    const area = previewCells({ ...input, tool: "zone", zoneSelectionMode: "rectangle", zoneAnchor: { x: 2, y: 0, z: 2 }, center: { x: 5, y: 0, z: 4 } });
    expect(area).toHaveLength(12);
  });

  it("surface plates follow the top of the column", () => {
    const w = world();
    const fill: number[] = [];
    const outline: number[] = [];
    expect(appendSurfacePlate(w, 20, 4, fill, outline)).toBe(true);
    // One quad: two triangles, four edges.
    expect(fill).toHaveLength(18);
    expect(outline).toHaveLength(24);
    // Just above the top of the stone step (its top face is at 2; the plate is grown by 2 % and lifted, as in the original).
    for (let index = 1; index < fill.length; index += 3) expect(fill[index]).toBeCloseTo(2.034, 3);
  });
});
