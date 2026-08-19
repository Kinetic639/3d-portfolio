export const SHAPE_IDS = {
  CUBE: 0,
  SLAB: 1,
  STAIR: 2,
  SLOPE_SHALLOW: 3,
  SLOPE_STEEP: 4,
  SLOPE_OUTER_CORNER: 5,
  SLOPE_INNER_CORNER: 6,
  CUT_CORNER: 7,
  WALL: 8,
  BEAM: 9,
  PILLAR_BASE: 10,
  PILLAR_MIDDLE: 11,
  PILLAR_CAP: 12,
  ROOF_FLAT: 13,
  ROOF_SHALLOW: 14,
  ROOF_STEEP: 15,
  ROOF_OUTER_CORNER: 16,
  ROOF_INNER_CORNER: 17,
  FENCE: 18,
  PIPE_SHORT: 19,
  PIPE_LONG: 20,
  PIPE_CORNER: 21,
  TERRAIN_CORNER: 23,
  ROOF_HOLLOW: 24,
  RUBBLE_SMALL: 25,
  RUBBLE_MEDIUM: 26,
  STALACTITE_SMALL: 27,
  STALACTITE_LARGE: 28,
  CRYSTAL_SMALL: 29,
  CRYSTAL_MEDIUM: 30,
  CRYSTAL_LARGE: 31,
  PIPE: 32,
  ROOF: 33,
  WOODEN_WALL_FULL: 34,
  ICE_CHUNKS: 35,
  ICE_CHUNKS_MEDIUM: 36,
  ICICLES: 37,
  ICICLES_LARGE: 38,
  STAIR_INVERTED: 39,
  STAIR_LOW: 40,
  STAIR_OUTER_CORNER_INVERTED: 41,
  STAIR_INNER_CORNER_INVERTED: 42,
  FENCE_POST: 43,
  FENCE_CORNER: 44,
  FENCE_T: 45,
  FENCE_CROSS: 46,
  FENCE_GATE: 47,
  RETAINING_WALL_LOW: 48,
  TERRAIN_RAISED_EDGE: 49,
  TERRAIN_DIAGONAL_BANK: 50,
  WOODEN_WALL_END: 51,
  WOODEN_WALL_CORNER: 52,
  WOODEN_WALL_T: 53,
  WOODEN_WALL_CROSS: 54,
  WOODEN_WALL_GATE: 55,
  STAIR_LOW_OUTER_CORNER: 56,
  STAIR_LOW_INNER_CORNER: 57,
  SOLID_WOODEN_WALL_FULL: 58,
  SOLID_WOODEN_WALL_END: 59,
  SOLID_WOODEN_WALL_CORNER: 60,
  SOLID_WOODEN_WALL_T: 61,
  SOLID_WOODEN_WALL_CROSS: 62,
  SOLID_WOODEN_WALL_GATE: 63,
  QUARTER_SLAB: 64,
  LOW_RAMP: 65,
  DIAGONAL_RAMP: 66,
  TERRACE_LEDGE: 73,
  // Modular, tileable route-building set: each piece is either fully one
  // height or split between two heights along a straight/corner boundary,
  // so any number of them can be placed edge-to-edge to build a path of
  // arbitrary width and shape (interior tiles + boundary tiles + corner
  // tiles), the same way FENCE_*/WOODEN_WALL_* are already modular.
  INSET_TRAIL_CENTER: 74,
  INSET_TRAIL_EDGE: 75,
  INSET_TRAIL_OUTER_CORNER: 76,
  INSET_TRAIL_INNER_CORNER: 77,
  // Curb line: a thin raised lip (Quarter Slab tall, 0.25) hugging one edge
  // of the cell, plus a small nub for turning a corner — placed on top of
  // otherwise-flat terrain (a Cube, a Quarter Slab platform, ...) to trace
  // a boundary line, not a shape that replaces the floor underneath it.
  CURB_EDGE: 81,
  CURB_CORNER: 82,
  // Half-height (0.125) versions of the two above, for a lower lip/step.
  CURB_EDGE_LOW: 83,
  CURB_CORNER_LOW: 84,
  // Rubble/rock clusters weighted into one corner of the cell (rotate to
  // pick which corner) instead of centered like RUBBLE_SMALL/MEDIUM, so a
  // sharp terrain corner can be broken up into a jagged rock edge instead.
  CORNER_RUBBLE_SMALL: 85,
  CORNER_RUBBLE_MEDIUM: 86,
  CORNER_RUBBLE_LARGE: 87,
  CORNER_ROCK_OUTCROP_MEDIUM: 88,
  CORNER_ROCK_OUTCROP_LARGE: 89,
  // Lopsided counterparts of the three CORNER_RUBBLE_* above — reach much
  // further along one axis than the other instead of tapering evenly.
  CORNER_RUBBLE_SMALL_ASYMMETRICAL: 90,
  CORNER_RUBBLE_MEDIUM_ASYMMETRICAL: 91,
  CORNER_RUBBLE_LARGE_ASYMMETRICAL: 92,
} as const;

export type ShapeId = (typeof SHAPE_IDS)[keyof typeof SHAPE_IDS];

export const ROTATIONS = {
  NORTH: 0,
  EAST: 1,
  SOUTH: 2,
  WEST: 3,
} as const;

export type CellRotation = (typeof ROTATIONS)[keyof typeof ROTATIONS];

export const DEFAULT_SHAPE_ID = SHAPE_IDS.CUBE;
export const DEFAULT_ROTATION = ROTATIONS.NORTH;
export const DEFAULT_STATE = 0;

export const SHAPE_ID_VALUES = Object.values(SHAPE_IDS) as ShapeId[];
export const ROTATION_VALUES = Object.values(ROTATIONS) as CellRotation[];

export function isKnownShapeId(value: number): value is ShapeId {
  return Number.isInteger(value) && SHAPE_ID_VALUES.includes(value as ShapeId);
}

export function normalizeShapeId(value: number): ShapeId {
  return isKnownShapeId(value) ? value : DEFAULT_SHAPE_ID;
}

export function normalizeRotation(value: number): CellRotation {
  return ROTATION_VALUES.includes(value as CellRotation) ? value as CellRotation : DEFAULT_ROTATION;
}

export function normalizeState(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 255 ? value : DEFAULT_STATE;
}
