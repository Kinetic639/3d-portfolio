/**
 * The navigation grid (docs/navigation.md, layer 1): one cell per column of
 * the map, saying whether a creature can stand there, at what height, and
 * which neighbours it can step to. Built from the terrain (what is standable,
 * from the voxel shapes or the bake) and the map's blocking objects (their
 * footprints). Pure: no three.js, no DOM.
 */

export type Point = { x: number; z: number };

export type NavGrid = {
  width: number;
  depth: number;
  /** Whether a creature can stand in a column. */
  standable: (column: number, row: number) => boolean;
  /** Ground height of a column (world space). */
  height: (column: number, row: number) => number;
  /** Cost of walking through a column (1 is plain ground). */
  cost: (column: number, row: number) => number;
  /** Whether a creature can step from one column to a neighbouring one (diagonals: no corner cutting). */
  canStep: (fromColumn: number, fromRow: number, toColumn: number, toRow: number) => boolean;
  /** World position of a column's centre (x, z). */
  centre: (column: number, row: number) => Point;
  /** The column a world position is in. */
  cellOf: (point: Point) => { column: number; row: number };
};

/** What the grid is built from: the terrain per column and the map's blocking footprints. */
export type NavSource = {
  width: number;
  depth: number;
  /** Whether the terrain of a column can be stood on (walkable surface, room above, not water). */
  terrainStandable: (column: number, row: number) => boolean;
  /** Ground height at a column's centre. */
  groundAt: (column: number, row: number) => number;
  /** Rectangles on the ground that block (the map's objects with collisionMode "blocking"). */
  blockers: Footprint[];
};

/** A blocking object's base on the ground: centre, size and turn (radians, about y). */
export type Footprint = { x: number; z: number; width: number; depth: number; rotation: number };

export const NAV = {
  /** Highest step a creature walks up or down: a slab or a stair step. */
  maxStep: 0.55,
  /** A footprint blocks the columns whose centre it covers, shrunk by this much on each side (trees do not block their neighbours). */
  footprintInset: 0.2,
};

const centreOf = (width: number, depth: number) => (column: number, row: number): Point => ({
  x: column - (width - 1) / 2,
  z: row - (depth - 1) / 2,
});

export function buildNavGrid(source: NavSource): NavGrid {
  const { width, depth } = source;
  const centre = centreOf(width, depth);
  const blocked = new Uint8Array(width * depth);
  for (const blocker of source.blockers) markFootprint(blocked, width, depth, blocker);
  const heights = new Float32Array(width * depth);
  const standable = new Uint8Array(width * depth);
  for (let row = 0; row < depth; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = column + width * row;
      heights[index] = source.groundAt(column, row);
      standable[index] = !blocked[index] && source.terrainStandable(column, row) ? 1 : 0;
    }
  }
  const inside = (column: number, row: number) => column >= 0 && column < width && row >= 0 && row < depth;
  const isStandable = (column: number, row: number) => inside(column, row) && standable[column + width * row] === 1;
  const heightAt = (column: number, row: number) => heights[column + width * row];
  const straight = (a: number, b: number, c: number, d: number) => isStandable(c, d) && Math.abs(heightAt(c, d) - heightAt(a, b)) <= NAV.maxStep;

  return {
    width,
    depth,
    standable: isStandable,
    height: (column, row) => (inside(column, row) ? heightAt(column, row) : 0),
    cost: () => 1,
    canStep(fromColumn, fromRow, toColumn, toRow) {
      if (!isStandable(fromColumn, fromRow) || !straight(fromColumn, fromRow, toColumn, toRow)) return false;
      if (fromColumn === toColumn || fromRow === toRow) return true;
      // A diagonal step needs both columns beside it free: no cutting a corner of a wall or a tree.
      return straight(fromColumn, fromRow, toColumn, fromRow) && straight(fromColumn, fromRow, fromColumn, toRow);
    },
    centre,
    cellOf: (point) => ({
      column: Math.min(width - 1, Math.max(0, Math.floor(point.x + width / 2))),
      row: Math.min(depth - 1, Math.max(0, Math.floor(point.z + depth / 2))),
    }),
  };
}

/** Marks the columns whose centres a (turned) footprint covers. */
function markFootprint(blocked: Uint8Array, width: number, depth: number, footprint: Footprint) {
  const halfW = Math.max(0, footprint.width / 2 - NAV.footprintInset);
  const halfD = Math.max(0, footprint.depth / 2 - NAV.footprintInset);
  const cos = Math.cos(footprint.rotation);
  const sin = Math.sin(footprint.rotation);
  const reach = Math.ceil(Math.hypot(halfW, halfD)) + 1;
  const centre = centreOf(width, depth);
  const column0 = Math.floor(footprint.x + width / 2);
  const row0 = Math.floor(footprint.z + depth / 2);
  for (let row = row0 - reach; row <= row0 + reach; row += 1) {
    for (let column = column0 - reach; column <= column0 + reach; column += 1) {
      if (column < 0 || column >= width || row < 0 || row >= depth) continue;
      const c = centre(column, row);
      // The column's centre in the footprint's own (unturned) frame.
      const dx = c.x - footprint.x;
      const dz = c.z - footprint.z;
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      if (Math.abs(localX) <= halfW && Math.abs(localZ) <= halfD) blocked[column + width * row] = 1;
    }
  }
}
