import type { NavGrid, Point } from "./nav-grid";

/**
 * Finding a way across the navigation grid (docs/navigation.md, layer 2):
 * A* over 8 neighbours (diagonals only where no corner is cut), then the
 * path is smoothed to the points between which there is no straight line
 * a creature could walk. A goal that cannot be stood on is replaced by the
 * nearest column that can. Pure; at 64 x 64 a search takes a fraction of a
 * millisecond, so there is no hierarchy and no cache.
 */

const NEIGHBOURS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** The nearest standable column to a point (within `radius` columns), as its centre; null when there is none. */
export function nearestStandable(grid: NavGrid, point: Point, radius = 8): Point | null {
  const { column, row } = grid.cellOf(point);
  let best: Point | null = null;
  let bestDistance = Infinity;
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (!grid.standable(column + dx, row + dz)) continue;
      const centre = grid.centre(column + dx, row + dz);
      const distance = Math.hypot(centre.x - point.x, centre.z - point.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = centre;
      }
    }
  }
  return best;
}

/**
 * The way from one point to another, as points to walk through (the start
 * excluded, the goal included). Null when the goal cannot be reached at all.
 */
export function findPath(grid: NavGrid, from: Point, to: Point): Point[] | null {
  const start = grid.cellOf(from);
  let goalPoint = to;
  let goal = grid.cellOf(to);
  if (!grid.standable(goal.column, goal.row)) {
    const nearest = nearestStandable(grid, to);
    if (!nearest) return null;
    goalPoint = nearest;
    goal = grid.cellOf(nearest);
  }
  if (start.column === goal.column && start.row === goal.row) return [goalPoint];

  const { width, depth } = grid;
  const size = width * depth;
  const cost = new Float32Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const heap = new MinHeap();
  const index = (column: number, row: number) => column + width * row;
  const heuristic = (column: number, row: number) => {
    // Octile distance: exact on an empty grid with these step costs.
    const dx = Math.abs(column - goal.column);
    const dz = Math.abs(row - goal.row);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const startIndex = index(start.column, start.row);
  const goalIndex = index(goal.column, goal.row);
  cost[startIndex] = 0;
  heap.push(startIndex, heuristic(start.column, start.row));

  while (heap.size > 0) {
    const current = heap.pop();
    if (current === goalIndex) break;
    if (closed[current]) continue;
    closed[current] = 1;
    const column = current % width;
    const row = (current - column) / width;
    for (const [dx, dz, step] of NEIGHBOURS) {
      const nextColumn = column + dx;
      const nextRow = row + dz;
      // The start may be off the grid's standable columns (a creature pushed aside): it may always step off it.
      if (current !== startIndex && !grid.canStep(column, row, nextColumn, nextRow)) continue;
      if (current === startIndex && !grid.standable(nextColumn, nextRow)) continue;
      const next = index(nextColumn, nextRow);
      if (closed[next]) continue;
      const candidate = cost[current] + step * grid.cost(nextColumn, nextRow);
      if (candidate < cost[next]) {
        cost[next] = candidate;
        cameFrom[next] = current;
        heap.push(next, candidate + heuristic(nextColumn, nextRow));
      }
    }
  }
  if (cameFrom[goalIndex] === -1) return null;

  const cells: number[] = [];
  for (let at = goalIndex; at !== startIndex; at = cameFrom[at]) cells.push(at);
  cells.reverse();
  const points = cells.map((cell) => grid.centre(cell % width, Math.floor(cell / width)));
  points[points.length - 1] = goalPoint;
  return smoothPath(grid, from, points);
}

/** Drops the points a creature can walk past in a straight line (no blocked or too-high column on the way). */
export function smoothPath(grid: NavGrid, from: Point, points: Point[]): Point[] {
  if (points.length <= 1) return points;
  const result: Point[] = [];
  let anchor = from;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[i + 1];
    // Keep this point when the line from the anchor to the one after it is not walkable.
    if (!next || !walkableLine(grid, anchor, next)) {
      result.push(points[i]);
      anchor = points[i];
    }
  }
  return result;
}

/** Whether a creature can walk straight from a to b: every column along the line standable, steps small enough. */
export function walkableLine(grid: NavGrid, a: Point, b: Point) {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const samples = Math.max(1, Math.ceil(length / 0.25));
  let previous = grid.cellOf(a);
  for (let s = 1; s <= samples; s += 1) {
    const t = s / samples;
    const cell = grid.cellOf({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    if (cell.column === previous.column && cell.row === previous.row) continue;
    if (!grid.canStep(previous.column, previous.row, cell.column, cell.row)) return false;
    previous = cell;
  }
  return true;
}

/** Length of a walk through points, from a start. */
export function pathLength(from: Point, points: Point[]) {
  let length = 0;
  let at = from;
  for (const point of points) {
    length += Math.hypot(point.x - at.x, point.z - at.z);
    at = point;
  }
  return length;
}

/** A binary min-heap of grid indices by priority. */
class MinHeap {
  private items: number[] = [];
  private priorities: number[] = [];

  get size() {
    return this.items.length;
  }

  push(item: number, priority: number) {
    this.items.push(item);
    this.priorities.push(priority);
    let at = this.items.length - 1;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (this.priorities[parent] <= this.priorities[at]) break;
      this.swap(at, parent);
      at = parent;
    }
  }

  pop() {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastPriority = this.priorities.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.priorities[0] = lastPriority;
      let at = 0;
      for (;;) {
        const left = at * 2 + 1;
        const right = left + 1;
        let smallest = at;
        if (left < this.items.length && this.priorities[left] < this.priorities[smallest]) smallest = left;
        if (right < this.items.length && this.priorities[right] < this.priorities[smallest]) smallest = right;
        if (smallest === at) break;
        this.swap(at, smallest);
        at = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.priorities[a], this.priorities[b]] = [this.priorities[b], this.priorities[a]];
  }
}
