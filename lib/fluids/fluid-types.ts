export const FLUID_IDS = {
  None: 0,
  Water: 1,
} as const;

export type FluidId = (typeof FLUID_IDS)[keyof typeof FLUID_IDS];

export const FLUID_FLAGS = {
  Source: 1 << 0,
  Falling: 1 << 1,
  Authored: 1 << 2,
} as const;

export const MAX_HORIZONTAL_FLUID_LEVEL = 7;

export type FluidCell = {
  type: FluidId;
  level: number;
  source: boolean;
  falling: boolean;
  authored?: boolean;
};

export type FluidLayerSnapshot = {
  types: Uint8Array;
  levels: Uint8Array;
  flags: Uint8Array;
};

export const EMPTY_FLUID_CELL: Readonly<FluidCell> = Object.freeze({
  type: FLUID_IDS.None,
  level: 0,
  source: false,
  falling: false,
  authored: false,
});

export function isKnownFluidId(value: number): value is FluidId {
  return value === FLUID_IDS.None || value === FLUID_IDS.Water;
}

export function isValidFluidCell(cell: FluidCell) {
  if (!isKnownFluidId(cell.type)) return false;
  if (!Number.isInteger(cell.level) || cell.level < 0 || cell.level > MAX_HORIZONTAL_FLUID_LEVEL) return false;
  if (cell.type === FLUID_IDS.None) {
    return cell.level === 0 && !cell.source && !cell.falling && !cell.authored;
  }
  if (cell.source) {
    return cell.level === 0 && !cell.falling;
  }
  if (cell.authored) return false;
  return true;
}

export function encodeFluidFlags(cell: Pick<FluidCell, "source" | "falling" | "authored">) {
  return (cell.source ? FLUID_FLAGS.Source : 0) | (cell.falling ? FLUID_FLAGS.Falling : 0) | (cell.authored ? FLUID_FLAGS.Authored : 0);
}

export function decodeFluidCell(type: number, level: number, flags: number): FluidCell {
  if (type === FLUID_IDS.None) return { ...EMPTY_FLUID_CELL };
  return {
    type: isKnownFluidId(type) ? type : FLUID_IDS.None,
    level,
    source: (flags & FLUID_FLAGS.Source) !== 0,
    falling: (flags & FLUID_FLAGS.Falling) !== 0,
    authored: (flags & FLUID_FLAGS.Authored) !== 0,
  };
}
