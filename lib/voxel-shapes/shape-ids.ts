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
  WATER: 22,
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
