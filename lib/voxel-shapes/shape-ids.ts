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
