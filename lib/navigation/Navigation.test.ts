import { describe, expect, it } from "vitest";
import { buildNavGrid, type Footprint } from "./nav-grid";
import { findPath, nearestStandable, walkableLine } from "./path";

/** A small grid from a picture: "." ground, "#" wall (not standable), digits are heights. */
function gridFrom(rows: string[], blockers: Footprint[] = []) {
  const depth = rows.length;
  const width = rows[0].length;
  return buildNavGrid({
    width,
    depth,
    terrainStandable: (column, row) => rows[row][column] !== "#",
    groundAt: (column, row) => (/[0-9]/.test(rows[row][column]) ? Number(rows[row][column]) / 2 : 0),
    blockers,
  });
}

/** Every step of a path (from the start) stays on standable columns. */
function staysOnGround(grid: ReturnType<typeof gridFrom>, from: { x: number; z: number }, path: { x: number; z: number }[]) {
  let at = from;
  for (const point of path) {
    if (!walkableLine(grid, at, point)) return false;
    at = point;
  }
  return true;
}

describe("navigation", () => {
  it("goes around a wall, and the smoothed path never crosses it", () => {
    const grid = gridFrom([
      "..........",
      "..........",
      "....#.....",
      "....#.....",
      "....#.....",
      "..........",
    ]);
    const from = grid.centre(1, 3);
    const to = grid.centre(8, 3);
    const path = findPath(grid, from, to)!;
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual(to);
    expect(staysOnGround(grid, from, path)).toBe(true);
    // Smoothed: a few corners, not every column.
    expect(path.length).toBeLessThanOrEqual(4);
  });

  it("does not cut a corner diagonally past a blocked column", () => {
    const grid = gridFrom([
      "...",
      ".#.",
      "...",
    ]);
    expect(grid.canStep(0, 0, 1, 1)).toBe(false);
    expect(grid.canStep(0, 1, 0, 2)).toBe(true);
    expect(grid.canStep(0, 2, 1, 1)).toBe(false);
  });

  it("steps up half a block, not a whole one", () => {
    const grid = gridFrom(["012"]);
    // Heights 0, 0.5, 1: each step is half a block.
    expect(grid.canStep(0, 0, 1, 0)).toBe(true);
    const tall = gridFrom(["02"]);
    expect(tall.canStep(0, 0, 1, 0)).toBe(false);
  });

  it("blocks the columns under a blocking object's footprint, turned as the object is", () => {
    const grid = gridFrom(["......", "......", "......", "......"], [{ x: 0, z: 0, width: 2.4, depth: 1.6, rotation: 0 }]);
    const blocked = [];
    for (let row = 0; row < 4; row += 1) for (let column = 0; column < 6; column += 1) if (!grid.standable(column, row)) blocked.push(`${column},${row}`);
    expect(blocked).toEqual(["2,1", "3,1", "2,2", "3,2"]);
  });

  it("walks to the nearest standable column when the goal is inside a wall, and gives up on an island", () => {
    const grid = gridFrom([
      ".....",
      ".###.",
      ".###.",
      ".....",
    ]);
    const goal = grid.centre(2, 1);
    const near = nearestStandable(grid, goal)!;
    expect(grid.standable(grid.cellOf(near).column, grid.cellOf(near).row)).toBe(true);
    expect(findPath(grid, grid.centre(0, 3), goal)).not.toBeNull();

    const island = gridFrom([
      "..#..",
      "..#..",
      "..#..",
    ]);
    expect(findPath(island, island.centre(0, 1), island.centre(4, 1))).toBeNull();
  });
});
