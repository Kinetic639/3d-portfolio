import { DEFAULT_ROTATION, DEFAULT_STATE, ROTATIONS, SHAPE_IDS, type CellRotation, type ShapeId } from "./shape-ids";

export type ShapeCategory = "terrain" | "transition" | "structure" | "roof" | "utility" | "fluid";
export type RenderLayer = "opaque" | "water";
export type FaceDirection = "px" | "nx" | "py" | "ny" | "pz" | "nz";
export type Axis = "x" | "y" | "z";

export type ShapeBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export type ShapeSurfaceSample = {
  valid: boolean;
  height: number;
  normal: [number, number, number];
  solidSupport: boolean;
  walkable: boolean;
  fluid: boolean;
};

export type ShapeFace = {
  direction: FaceDirection;
  normal: [number, number, number];
  corners: Array<[number, number, number]>;
  occlusion: "full" | "partial" | "none";
};

export type ShapeDefinition = {
  id: ShapeId;
  key: string;
  name: string;
  category: ShapeCategory;
  supportedRotations: CellRotation[];
  renderLayer: RenderLayer;
  solid: boolean;
  blocksMovement: boolean;
  supportsPrefabs: boolean;
  walkable: boolean;
  fluid: boolean;
  revealCompatible: boolean;
  bounds: (rotation: CellRotation, state: number) => ShapeBounds;
  faces: (rotation: CellRotation, state: number) => ShapeFace[];
  surfaceAt: (localX: number, localZ: number, rotation: CellRotation, state: number) => ShapeSurfaceSample;
};

const ALL_ROTATIONS = [ROTATIONS.NORTH, ROTATIONS.EAST, ROTATIONS.SOUTH, ROTATIONS.WEST];
const FULL_BOUNDS: ShapeBounds = { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.5, maxZ: 0.5 };
const EMPTY_SURFACE: ShapeSurfaceSample = { valid: false, height: 0, normal: [0, 1, 0], solidSupport: false, walkable: false, fluid: false };
export const SHAPE_STATE_VALUE_MASK = 15;
export const SHAPE_STATE_PITCH_SHIFT = 4;
export const SHAPE_STATE_PITCH_MASK = 48;

export function getShapeStateValue(state: number) {
  return state & SHAPE_STATE_VALUE_MASK;
}

export function getShapePitch(state: number) {
  return (state & SHAPE_STATE_PITCH_MASK) >> SHAPE_STATE_PITCH_SHIFT;
}

export function setShapePitch(state: number, pitch: number) {
  return getShapeStateValue(state) | ((pitch & 3) << SHAPE_STATE_PITCH_SHIFT);
}

export const FACE_NORMALS: Record<FaceDirection, [number, number, number]> = {
  px: [1, 0, 0],
  nx: [-1, 0, 0],
  py: [0, 1, 0],
  ny: [0, -1, 0],
  pz: [0, 0, 1],
  nz: [0, 0, -1],
};

export const FACE_NEIGHBOUR_OFFSETS: Record<FaceDirection, [number, number, number]> = {
  px: [1, 0, 0],
  nx: [-1, 0, 0],
  py: [0, 1, 0],
  ny: [0, -1, 0],
  pz: [0, 0, 1],
  nz: [0, 0, -1],
};

function boxFaces(bounds: ShapeBounds, occlusion: ShapeFace["occlusion"] = "partial"): ShapeFace[] {
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  return [
    { direction: "px", normal: FACE_NORMALS.px, occlusion, corners: [[maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [maxX, minY, maxZ]] },
    { direction: "nx", normal: FACE_NORMALS.nx, occlusion, corners: [[minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ], [minX, minY, minZ]] },
    { direction: "py", normal: FACE_NORMALS.py, occlusion, corners: [[minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ]] },
    { direction: "ny", normal: FACE_NORMALS.ny, occlusion, corners: [[minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ]] },
    { direction: "pz", normal: FACE_NORMALS.pz, occlusion, corners: [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]] },
    { direction: "nz", normal: FACE_NORMALS.nz, occlusion, corners: [[maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ]] },
  ];
}

function slabBounds(_rotation: CellRotation, state: number): ShapeBounds {
  state = getShapeStateValue(state);
  if (state === 1) return { ...FULL_BOUNDS, minY: 0 };
  if (state === 2) return { ...FULL_BOUNDS, minY: -0.25, maxY: 0.25 };
  return { ...FULL_BOUNDS, maxY: 0 };
}

function flatSurface(height: number, solidSupport = true, walkable = true, fluid = false): ShapeSurfaceSample {
  return { valid: true, height, normal: [0, 1, 0], solidSupport, walkable, fluid };
}

function rotateLocal(localX: number, localZ: number, rotation: CellRotation) {
  switch (rotation) {
    case ROTATIONS.EAST:
      return { x: -localZ, z: localX };
    case ROTATIONS.SOUTH:
      return { x: -localX, z: -localZ };
    case ROTATIONS.WEST:
      return { x: localZ, z: -localX };
    case ROTATIONS.NORTH:
    default:
      return { x: localX, z: localZ };
  }
}

function slopeHeight(localX: number, localZ: number, rotation: CellRotation, steep: boolean) {
  const rotated = rotateLocal(localX, localZ, rotation);
  const t = Math.max(0, Math.min(1, rotated.z + 0.5));
  const min = -0.5;
  const max = steep ? 0.5 : 0.12;
  return min + (max - min) * t;
}

function wedgeFaces(rotation: CellRotation, steep: boolean): ShapeFace[] {
  const high = steep ? 0.5 : 0.12;
  const verts: Array<[number, number, number]> = [
    [-0.5, -0.5, -0.5],
    [0.5, -0.5, -0.5],
    [0.5, -0.5, 0.5],
    [-0.5, -0.5, 0.5],
    [-0.5, high, 0.5],
    [0.5, high, 0.5],
  ];
  return rotateFaces([
    { direction: "ny", normal: FACE_NORMALS.ny, occlusion: "partial", corners: [verts[0], verts[1], verts[2], verts[3]] },
    { direction: "pz", normal: FACE_NORMALS.pz, occlusion: "partial", corners: [verts[3], verts[2], verts[5], verts[4]] },
    { direction: "nx", normal: FACE_NORMALS.nx, occlusion: "partial", corners: [verts[0], verts[3], verts[4], verts[0]] },
    { direction: "px", normal: FACE_NORMALS.px, occlusion: "partial", corners: [verts[1], verts[5], verts[2], verts[1]] },
    { direction: "py", normal: [0, 1, steep ? -1 : -0.55], occlusion: "partial", corners: [verts[0], verts[4], verts[5], verts[1]] },
  ], rotation);
}

function rotatePoint(point: [number, number, number], rotation: CellRotation): [number, number, number] {
  const [x, y, z] = point;
  switch (rotation) {
    case ROTATIONS.EAST:
      return [-z, y, x];
    case ROTATIONS.SOUTH:
      return [-x, y, -z];
    case ROTATIONS.WEST:
      return [z, y, -x];
    case ROTATIONS.NORTH:
    default:
      return point;
  }
}

function rotateDirection(direction: FaceDirection, rotation: CellRotation): FaceDirection {
  if (direction === "py" || direction === "ny") return direction;
  const order: FaceDirection[] = ["nz", "px", "pz", "nx"];
  const index = order.indexOf(direction);
  return order[(index + rotation) % order.length];
}

function rotateVector(vector: [number, number, number], rotation: CellRotation): [number, number, number] {
  return rotatePoint(vector, rotation);
}

function rotateFace(face: ShapeFace, rotation: CellRotation): ShapeFace {
  return {
    ...face,
    direction: rotateDirection(face.direction, rotation),
    normal: rotateVector(face.normal, rotation),
    corners: face.corners.map((corner) => rotatePoint(corner, rotation)),
  };
}

function rotateFaces(faces: ShapeFace[], rotation: CellRotation): ShapeFace[] {
  return faces.map((face) => rotateFace(face, rotation));
}

function rotateBounds(bounds: ShapeBounds, rotation: CellRotation): ShapeBounds {
  if (rotation === ROTATIONS.NORTH) return bounds;
  const corners: Array<[number, number, number]> = [
    [bounds.minX, bounds.minY, bounds.minZ],
    [bounds.minX, bounds.minY, bounds.maxZ],
    [bounds.minX, bounds.maxY, bounds.minZ],
    [bounds.minX, bounds.maxY, bounds.maxZ],
    [bounds.maxX, bounds.minY, bounds.minZ],
    [bounds.maxX, bounds.minY, bounds.maxZ],
    [bounds.maxX, bounds.maxY, bounds.minZ],
    [bounds.maxX, bounds.maxY, bounds.maxZ],
  ];
  const points = corners.map((point) => rotatePoint(point, rotation));
  return {
    minX: Math.min(...points.map((point) => point[0])),
    maxX: Math.max(...points.map((point) => point[0])),
    minY: Math.min(...points.map((point) => point[1])),
    maxY: Math.max(...points.map((point) => point[1])),
    minZ: Math.min(...points.map((point) => point[2])),
    maxZ: Math.max(...points.map((point) => point[2])),
  };
}

function pitchPoint(point: [number, number, number], pitch: number): [number, number, number] {
  const [x, y, z] = point;
  switch (pitch & 3) {
    case 1:
      return [x, -z, y];
    case 2:
      return [x, -y, -z];
    case 3:
      return [x, z, -y];
    case 0:
    default:
      return point;
  }
}

function vectorToDirection([x, y, z]: [number, number, number]): FaceDirection {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  if (ax >= ay && ax >= az) return x >= 0 ? "px" : "nx";
  if (ay >= ax && ay >= az) return y >= 0 ? "py" : "ny";
  return z >= 0 ? "pz" : "nz";
}

function pitchFaces(faces: ShapeFace[], state: number): ShapeFace[] {
  const pitch = getShapePitch(state);
  if (pitch === 0) return faces;
  const reverseWinding = pitch === 1 || pitch === 3;
  return faces.map((face) => {
    const normal = pitchPoint(face.normal, pitch);
    const corners = face.corners.map((corner) => pitchPoint(corner, pitch));
    return {
      ...face,
      direction: vectorToDirection(normal),
      normal,
      corners: reverseWinding ? corners.reverse() : corners,
    };
  });
}

function pitchBounds(bounds: ShapeBounds, state: number): ShapeBounds {
  const pitch = getShapePitch(state);
  if (pitch === 0) return bounds;
  const corners: Array<[number, number, number]> = [
    [bounds.minX, bounds.minY, bounds.minZ],
    [bounds.minX, bounds.minY, bounds.maxZ],
    [bounds.minX, bounds.maxY, bounds.minZ],
    [bounds.minX, bounds.maxY, bounds.maxZ],
    [bounds.maxX, bounds.minY, bounds.minZ],
    [bounds.maxX, bounds.minY, bounds.maxZ],
    [bounds.maxX, bounds.maxY, bounds.minZ],
    [bounds.maxX, bounds.maxY, bounds.maxZ],
  ];
  const points = corners.map((point) => pitchPoint(point, pitch));
  return {
    minX: Math.min(...points.map((point) => point[0])),
    maxX: Math.max(...points.map((point) => point[0])),
    minY: Math.min(...points.map((point) => point[1])),
    maxY: Math.max(...points.map((point) => point[1])),
    minZ: Math.min(...points.map((point) => point[2])),
    maxZ: Math.max(...points.map((point) => point[2])),
  };
}

function cutCornerFaces(rotation: CellRotation): ShapeFace[] {
  const lowerStrip = boxFaces({ ...FULL_BOUNDS, maxX: 0.16 }, "partial");
  const upperStrip = boxFaces({ ...FULL_BOUNDS, minX: 0.16, minZ: -0.16 }, "partial");
  return rotateFaces([...lowerStrip, ...upperStrip], rotation);
}

function stairCornerFaces(rotation: CellRotation, inner: boolean): ShapeFace[] {
  const lower = boxFaces({ ...FULL_BOUNDS, maxY: 0, maxX: inner ? 0.5 : 0, maxZ: inner ? 0.5 : 0 }, "partial");
  const upperA = boxFaces({ minX: inner ? -0.5 : 0, maxX: 0.5, minY: 0, maxY: 0.5, minZ: -0.5, maxZ: inner ? 0 : 0.5 }, "partial");
  const upperB = boxFaces({ minX: -0.5, maxX: inner ? 0 : 0.5, minY: 0, maxY: 0.5, minZ: inner ? -0.5 : 0, maxZ: 0.5 }, "partial");
  return rotateFaces([...lower, ...upperA, ...upperB], rotation);
}

function invertedStairCornerFaces(rotation: CellRotation, inner: boolean): ShapeFace[] {
  const upper = boxFaces({ ...FULL_BOUNDS, minY: 0, maxX: inner ? 0.5 : 0, maxZ: inner ? 0.5 : 0 }, "partial");
  const lowerA = boxFaces({ minX: inner ? -0.5 : 0, maxX: 0.5, minY: -0.5, maxY: 0, minZ: -0.5, maxZ: inner ? 0 : 0.5 }, "partial");
  const lowerB = boxFaces({ minX: -0.5, maxX: inner ? 0 : 0.5, minY: -0.5, maxY: 0, minZ: inner ? -0.5 : 0, maxZ: 0.5 }, "partial");
  return rotateFaces([...upper, ...lowerA, ...lowerB], rotation);
}

function stairFaces(rotation: CellRotation, variant: "standard" | "inverted" | "low"): ShapeFace[] {
  if (variant === "inverted") {
    return rotateFaces([
      ...boxFaces({ ...FULL_BOUNDS, minY: 0 }, "partial"),
      ...boxFaces({ minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0, minZ: 0, maxZ: 0.5 }, "partial"),
    ], rotation);
  }

  if (variant === "low") {
    return rotateFaces([
      ...boxFaces({ minX: -0.5, maxX: 0.5, minY: -0.5, maxY: -0.26, minZ: -0.5, maxZ: -0.16 }, "partial"),
      ...boxFaces({ minX: -0.5, maxX: 0.5, minY: -0.5, maxY: -0.02, minZ: -0.16, maxZ: 0.18 }, "partial"),
      ...boxFaces({ minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.22, minZ: 0.18, maxZ: 0.5 }, "partial"),
    ], rotation);
  }

  return rotateFaces([
    ...boxFaces({ ...FULL_BOUNDS, maxY: 0 }, "partial"),
    ...boxFaces({ minX: -0.5, maxX: 0.5, minY: 0, maxY: 0.5, minZ: 0, maxZ: 0.5 }, "partial"),
  ], rotation);
}

function lowStairCornerFaces(rotation: CellRotation, inner: boolean): ShapeFace[] {
  const tierA = boxFaces({
    minX: -0.5,
    maxX: inner ? 0.5 : -0.16,
    minY: -0.5,
    maxY: -0.26,
    minZ: -0.5,
    maxZ: inner ? 0.5 : -0.16,
  }, "partial");
  const tierB = boxFaces({
    minX: inner ? -0.16 : -0.16,
    maxX: inner ? 0.5 : 0.18,
    minY: -0.5,
    maxY: -0.02,
    minZ: inner ? -0.16 : -0.16,
    maxZ: inner ? 0.5 : 0.18,
  }, "partial");
  const tierC = boxFaces({
    minX: inner ? 0.18 : 0.18,
    maxX: 0.5,
    minY: -0.5,
    maxY: 0.22,
    minZ: inner ? 0.18 : 0.18,
    maxZ: 0.5,
  }, "partial");

  if (inner) {
    const notch = boxFaces({ minX: -0.5, maxX: -0.16, minY: -0.5, maxY: -0.02, minZ: -0.5, maxZ: -0.16 }, "partial");
    return rotateFaces([...tierA, ...tierB, ...tierC, ...notch], rotation);
  }

  return rotateFaces([...tierA, ...tierB, ...tierC], rotation);
}

function pillarFaces(kind: "base" | "middle" | "cap") {
  const shaft = boxFaces({ minX: -0.18, maxX: 0.18, minY: -0.5, maxY: 0.5, minZ: -0.18, maxZ: 0.18 }, "partial");
  const base = boxFaces({ minX: -0.34, maxX: 0.34, minY: -0.5, maxY: -0.26, minZ: -0.34, maxZ: 0.34 }, "partial");
  const cap = boxFaces({ minX: -0.34, maxX: 0.34, minY: 0.26, maxY: 0.5, minZ: -0.34, maxZ: 0.34 }, "partial");
  if (kind === "base") return [...shaft, ...base];
  if (kind === "cap") return [...shaft, ...cap];
  return [...shaft, ...base, ...cap];
}

function terrainCornerFaces(rotation: CellRotation): ShapeFace[] {
  return rotateFaces([
    ...boxFaces({ minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0, minZ: -0.5, maxZ: 0.5 }, "partial"),
    ...boxFaces({ minX: -0.5, maxX: 0, minY: 0, maxY: 0.5, minZ: -0.5, maxZ: 0 }, "partial"),
  ], rotation);
}

function hollowRoofFaces(rotation: CellRotation): ShapeFace[] {
  const leftSlope = boxFaces({ minX: -0.5, maxX: -0.08, minY: -0.5, maxY: 0.5, minZ: -0.5, maxZ: 0.5 }, "partial");
  const rightSlope = boxFaces({ minX: 0.08, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.5, maxZ: 0.5 }, "partial");
  const ridge = boxFaces({ minX: -0.08, maxX: 0.08, minY: 0.18, maxY: 0.5, minZ: -0.5, maxZ: 0.5 }, "partial");
  return rotateFaces([...leftSlope, ...rightSlope, ...ridge], rotation);
}

function gableRoofFaces(rotation: CellRotation): ShapeFace[] {
  const left = wedgeFaces(ROTATIONS.NORTH, false).map((face) => ({
    ...face,
    corners: face.corners.map(([x, y, z]) => [x * 0.5 - 0.25, y, z] as [number, number, number]),
  }));
  const right = wedgeFaces(ROTATIONS.SOUTH, false).map((face) => ({
    ...face,
    corners: face.corners.map(([x, y, z]) => [x * 0.5 + 0.25, y, z] as [number, number, number]),
  }));
  const ridge = boxFaces({ minX: -0.08, maxX: 0.08, minY: 0.12, maxY: 0.5, minZ: -0.5, maxZ: 0.5 }, "partial");
  return rotateFaces([...left, ...right, ...ridge], rotation);
}

function woodenWallFullFaces(rotation: CellRotation): ShapeFace[] {
  return woodenWallFaces(rotation, "full");
}

function woodenWallSegmentFaces(axis: "x" | "z", min: number, max: number): ShapeFace[] {
  if (axis === "z") {
    return rotateFaces(woodenWallSegmentFaces("x", min, max), ROTATIONS.EAST);
  }

  const width = max - min;
  const boardInset = Math.min(0.1, width * 0.22);
  const boardGap = width / 3;
  const boards = [
    boxFaces({ minX: min, maxX: min + boardGap - boardInset, minY: -0.5, maxY: 0.5, minZ: -0.09, maxZ: 0.09 }, "partial"),
    boxFaces({ minX: min + boardGap + boardInset * 0.35, maxX: min + boardGap * 2 - boardInset * 0.35, minY: -0.5, maxY: 0.5, minZ: -0.08, maxZ: 0.08 }, "partial"),
    boxFaces({ minX: min + boardGap * 2 + boardInset, maxX: max, minY: -0.5, maxY: 0.5, minZ: -0.09, maxZ: 0.09 }, "partial"),
  ];
  const braces = [
    boxFaces({ minX: min, maxX: max, minY: -0.38, maxY: -0.28, minZ: -0.12, maxZ: 0.12 }, "partial"),
    boxFaces({ minX: min, maxX: max, minY: 0.28, maxY: 0.38, minZ: -0.12, maxZ: 0.12 }, "partial"),
  ];
  return [...boards.flat(), ...braces.flat()];
}

function woodenWallPoleFaces(): ShapeFace[] {
  return [
    ...boxFaces({ minX: -0.13, maxX: 0.13, minY: -0.5, maxY: 0.5, minZ: -0.13, maxZ: 0.13 }, "partial"),
    ...boxFaces({ minX: -0.18, maxX: 0.18, minY: 0.34, maxY: 0.5, minZ: -0.18, maxZ: 0.18 }, "partial"),
  ];
}

function woodenWallFaces(rotation: CellRotation, type: "full" | "end" | "corner" | "t" | "cross" | "gate"): ShapeFace[] {
  const pole = woodenWallPoleFaces();
  const fullX = woodenWallSegmentFaces("x", -0.5, 0.5);
  const eastX = woodenWallSegmentFaces("x", -0.02, 0.5);
  const westX = woodenWallSegmentFaces("x", -0.5, 0.02);
  const northZ = woodenWallSegmentFaces("z", -0.02, 0.5);
  const fullZ = woodenWallSegmentFaces("z", -0.5, 0.5);
  const gate = [
    ...boxFaces({ minX: -0.5, maxX: -0.34, minY: -0.5, maxY: 0.5, minZ: -0.13, maxZ: 0.13 }, "partial"),
    ...boxFaces({ minX: 0.34, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.13, maxZ: 0.13 }, "partial"),
    ...boxFaces({ minX: -0.42, maxX: 0.42, minY: -0.34, maxY: -0.22, minZ: -0.11, maxZ: 0.11 }, "partial"),
    ...boxFaces({ minX: -0.42, maxX: 0.42, minY: 0.24, maxY: 0.36, minZ: -0.11, maxZ: 0.11 }, "partial"),
    ...boxFaces({ minX: -0.06, maxX: 0.06, minY: -0.38, maxY: 0.38, minZ: -0.1, maxZ: 0.1 }, "partial"),
  ];

  if (type === "end") return rotateFaces([...pole, ...eastX], rotation);
  if (type === "corner") return rotateFaces([...pole, ...eastX, ...northZ], rotation);
  if (type === "t") return rotateFaces([...pole, ...fullX, ...northZ], rotation);
  if (type === "cross") return rotateFaces([...pole, ...fullX, ...fullZ], rotation);
  if (type === "gate") return rotateFaces(gate, rotation);
  return rotateFaces([...westX, ...eastX], rotation);
}

function solidWoodenWallSegmentFaces(axis: "x" | "z", min: number, max: number): ShapeFace[] {
  if (axis === "z") {
    return rotateFaces(solidWoodenWallSegmentFaces("x", min, max), ROTATIONS.EAST);
  }

  const width = max - min;
  const boardGap = width / 3;
  const boards = [
    boxFaces({ minX: min, maxX: min + boardGap - 0.02, minY: -0.5, maxY: 0.5, minZ: -0.09, maxZ: 0.09 }, "partial"),
    boxFaces({ minX: min + boardGap + 0.02, maxX: min + boardGap * 2 - 0.02, minY: -0.5, maxY: 0.5, minZ: -0.08, maxZ: 0.08 }, "partial"),
    boxFaces({ minX: min + boardGap * 2 + 0.02, maxX: max, minY: -0.5, maxY: 0.5, minZ: -0.09, maxZ: 0.09 }, "partial"),
  ];
  const braces = [
    boxFaces({ minX: min, maxX: max, minY: -0.38, maxY: -0.28, minZ: -0.12, maxZ: 0.12 }, "partial"),
    boxFaces({ minX: min, maxX: max, minY: 0.28, maxY: 0.38, minZ: -0.12, maxZ: 0.12 }, "partial"),
  ];

  return [...boards.flat(), ...braces.flat()];
}

function solidWoodenWallConnectorFaces(): ShapeFace[] {
  return [
    ...boxFaces({ minX: -0.12, maxX: 0.12, minY: -0.5, maxY: 0.5, minZ: -0.12, maxZ: 0.12 }, "partial"),
    ...boxFaces({ minX: -0.18, maxX: 0.18, minY: -0.5, maxY: -0.36, minZ: -0.18, maxZ: 0.18 }, "partial"),
    ...boxFaces({ minX: -0.18, maxX: 0.18, minY: 0.36, maxY: 0.5, minZ: -0.18, maxZ: 0.18 }, "partial"),
  ];
}

function solidWoodenWallFaces(rotation: CellRotation, type: "full" | "end" | "corner" | "t" | "cross" | "gate"): ShapeFace[] {
  const connector = solidWoodenWallConnectorFaces();
  const fullX = solidWoodenWallSegmentFaces("x", -0.5, 0.5);
  const eastX = solidWoodenWallSegmentFaces("x", -0.02, 0.5);
  const westX = solidWoodenWallSegmentFaces("x", -0.5, 0.02);
  const northZ = solidWoodenWallSegmentFaces("z", -0.02, 0.5);
  const fullZ = solidWoodenWallSegmentFaces("z", -0.5, 0.5);
  const gate = [
    ...boxFaces({ minX: -0.5, maxX: -0.34, minY: -0.5, maxY: 0.5, minZ: -0.12, maxZ: 0.12 }, "partial"),
    ...boxFaces({ minX: 0.34, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.12, maxZ: 0.12 }, "partial"),
    ...solidWoodenWallSegmentFaces("x", -0.34, 0.34),
  ];

  if (type === "end") return rotateFaces([...connector, ...eastX], rotation);
  if (type === "corner") return rotateFaces([...connector, ...eastX, ...northZ], rotation);
  if (type === "t") return rotateFaces([...connector, ...fullX, ...northZ], rotation);
  if (type === "cross") return rotateFaces([...connector, ...fullX, ...fullZ], rotation);
  if (type === "gate") return rotateFaces(gate, rotation);
  return rotateFaces(fullX, rotation);
}

function fenceFaces(rotation: CellRotation, type: "line" | "post" | "corner" | "t" | "cross" | "gate"): ShapeFace[] {
  const post = boxFaces({ minX: -0.08, maxX: 0.08, minY: -0.5, maxY: 0.42, minZ: -0.08, maxZ: 0.08 }, "partial");
  const railX = [
    ...boxFaces({ minX: -0.5, maxX: 0.5, minY: -0.16, maxY: -0.04, minZ: -0.045, maxZ: 0.045 }, "partial"),
    ...boxFaces({ minX: -0.5, maxX: 0.5, minY: 0.18, maxY: 0.3, minZ: -0.045, maxZ: 0.045 }, "partial"),
  ];
  const railXPositive = [
    ...boxFaces({ minX: -0.02, maxX: 0.5, minY: -0.16, maxY: -0.04, minZ: -0.045, maxZ: 0.045 }, "partial"),
    ...boxFaces({ minX: -0.02, maxX: 0.5, minY: 0.18, maxY: 0.3, minZ: -0.045, maxZ: 0.045 }, "partial"),
  ];
  const railZ = [
    ...boxFaces({ minX: -0.045, maxX: 0.045, minY: -0.16, maxY: -0.04, minZ: -0.5, maxZ: 0.5 }, "partial"),
    ...boxFaces({ minX: -0.045, maxX: 0.045, minY: 0.18, maxY: 0.3, minZ: -0.5, maxZ: 0.5 }, "partial"),
  ];
  const railZPositive = [
    ...boxFaces({ minX: -0.045, maxX: 0.045, minY: -0.16, maxY: -0.04, minZ: -0.02, maxZ: 0.5 }, "partial"),
    ...boxFaces({ minX: -0.045, maxX: 0.045, minY: 0.18, maxY: 0.3, minZ: -0.02, maxZ: 0.5 }, "partial"),
  ];
  const gate = [
    ...boxFaces({ minX: -0.42, maxX: -0.3, minY: -0.5, maxY: 0.34, minZ: -0.045, maxZ: 0.045 }, "partial"),
    ...boxFaces({ minX: 0.3, maxX: 0.42, minY: -0.5, maxY: 0.34, minZ: -0.045, maxZ: 0.045 }, "partial"),
    ...boxFaces({ minX: -0.42, maxX: 0.42, minY: -0.1, maxY: 0.02, minZ: -0.045, maxZ: 0.045 }, "partial"),
    ...boxFaces({ minX: -0.42, maxX: 0.42, minY: 0.18, maxY: 0.3, minZ: -0.045, maxZ: 0.045 }, "partial"),
  ];

  if (type === "post") return rotateFaces(post, rotation);
  if (type === "corner") return rotateFaces([...post, ...railXPositive, ...railZPositive], rotation);
  if (type === "t") return rotateFaces([...post, ...railX, ...railZPositive], rotation);
  if (type === "cross") return rotateFaces([...post, ...railX, ...railZ], rotation);
  if (type === "gate") return rotateFaces(gate, rotation);
  return rotateFaces([...post, ...railX], rotation);
}

function rubbleFaces(size: "small" | "medium"): ShapeFace[] {
  const scale = size === "small" ? 0.7 : 0.92;
  const height = size === "small" ? -0.08 : 0.22;
  return [
    ...boxFaces({ minX: -0.34 * scale, maxX: 0.16 * scale, minY: -0.5, maxY: height, minZ: -0.28 * scale, maxZ: 0.3 * scale }, "partial"),
    ...boxFaces({ minX: -0.06 * scale, maxX: 0.36 * scale, minY: -0.5, maxY: height - 0.12, minZ: -0.36 * scale, maxZ: 0.02 * scale }, "partial"),
    ...boxFaces({ minX: -0.22 * scale, maxX: 0.28 * scale, minY: -0.5, maxY: height - 0.18, minZ: 0.08 * scale, maxZ: 0.36 * scale }, "partial"),
  ];
}

function iceChunkFaces(size: "small" | "medium"): ShapeFace[] {
  const scale = size === "small" ? 0.78 : 1;
  const height = size === "small" ? 0.02 : 0.25;
  return [
    ...boxFaces({ minX: -0.38 * scale, maxX: 0.02 * scale, minY: -0.5, maxY: height, minZ: -0.34 * scale, maxZ: 0.1 * scale }, "partial"),
    ...boxFaces({ minX: -0.06 * scale, maxX: 0.36 * scale, minY: -0.5, maxY: height - 0.08, minZ: -0.12 * scale, maxZ: 0.34 * scale }, "partial"),
    ...boxFaces({ minX: -0.22 * scale, maxX: 0.24 * scale, minY: -0.5, maxY: height - 0.16, minZ: 0.16 * scale, maxZ: 0.42 * scale }, "partial"),
  ];
}

function hangingSpikeFaces(size: "small" | "large"): ShapeFace[] {
  const radius = size === "small" ? 0.16 : 0.28;
  const low = size === "small" ? -0.32 : -0.5;
  return [
    ...boxFaces({ minX: -radius, maxX: radius, minY: 0.08, maxY: 0.5, minZ: -radius, maxZ: radius }, "partial"),
    ...boxFaces({ minX: -radius * 0.58, maxX: radius * 0.58, minY: low, maxY: 0.12, minZ: -radius * 0.58, maxZ: radius * 0.58 }, "partial"),
  ];
}

function crystalFaces(size: "small" | "medium" | "large"): ShapeFace[] {
  const radius = size === "small" ? 0.16 : size === "medium" ? 0.24 : 0.32;
  const height = size === "small" ? 0.18 : size === "medium" ? 0.34 : 0.5;
  return [
    ...boxFaces({ minX: -radius, maxX: radius, minY: -0.5, maxY: height, minZ: -radius, maxZ: radius }, "partial"),
    ...boxFaces({ minX: -radius * 0.6, maxX: radius * 0.6, minY: height - 0.16, maxY: 0.5, minZ: -radius * 0.6, maxZ: radius * 0.6 }, "partial"),
  ];
}

function retainingWallLowFaces(rotation: CellRotation): ShapeFace[] {
  return rotateFaces([
    ...boxFaces({ minX: -0.5, maxX: 0.5, minY: -0.5, maxY: -0.08, minZ: -0.08, maxZ: 0.08 }, "partial"),
    ...boxFaces({ minX: -0.42, maxX: 0.42, minY: -0.08, maxY: 0.06, minZ: -0.12, maxZ: 0.12 }, "partial"),
  ], rotation);
}

function terrainRaisedEdgeFaces(rotation: CellRotation): ShapeFace[] {
  return rotateFaces([
    ...boxFaces({ ...FULL_BOUNDS, maxY: 0 }, "partial"),
    ...boxFaces({ minX: -0.5, maxX: 0.5, minY: 0, maxY: 0.28, minZ: 0.24, maxZ: 0.5 }, "partial"),
  ], rotation);
}

function terrainDiagonalBankFaces(rotation: CellRotation): ShapeFace[] {
  return rotateFaces([
    ...boxFaces({ ...FULL_BOUNDS, maxY: -0.08 }, "partial"),
    ...boxFaces({ minX: -0.5, maxX: 0.08, minY: -0.08, maxY: 0.28, minZ: 0.08, maxZ: 0.5 }, "partial"),
  ], rotation);
}

function waterFaces(state: number): ShapeFace[] {
  const top = -0.5 + (Math.max(0, Math.min(15, state)) + 1) / 16;
  return [{
    direction: "py",
    normal: FACE_NORMALS.py,
    occlusion: "none",
    corners: [[-0.48, top, 0.48], [0.48, top, 0.48], [0.48, top, -0.48], [-0.48, top, -0.48]],
  }];
}

function axisBounds(
  rotation: CellRotation,
  state: number,
  radius: number,
  xLength = 0.5,
  yLength = 0.5,
  zLength = 0.5,
): ShapeBounds {
  const value = getShapeStateValue(state);
  const bounds = value === 1
    ? { minX: -radius, maxX: radius, minY: -yLength, maxY: yLength, minZ: -radius, maxZ: radius }
    : value === 2
      ? { minX: -radius, maxX: radius, minY: -radius, maxY: radius, minZ: -zLength, maxZ: zLength }
      : { minX: -xLength, maxX: xLength, minY: -radius, maxY: radius, minZ: -radius, maxZ: radius };
  return rotateBounds(bounds, rotation);
}

function makeBoxShape(input: Omit<ShapeDefinition, "supportedRotations" | "bounds" | "faces" | "surfaceAt" | "revealCompatible"> & {
  bounds: ShapeBounds | ((rotation: CellRotation, state: number) => ShapeBounds);
  surfaceHeight?: (rotation: CellRotation, state: number) => number;
  supportedRotations?: CellRotation[];
}): ShapeDefinition {
  const getBounds = typeof input.bounds === "function"
    ? input.bounds
    : (rotation: CellRotation) => rotateBounds(input.bounds as ShapeBounds, rotation);
  return {
    ...input,
    supportedRotations: input.supportedRotations ?? ALL_ROTATIONS,
    revealCompatible: true,
    bounds: getBounds,
    faces: (rotation, state) => boxFaces(getBounds(rotation, state), input.id === SHAPE_IDS.CUBE ? "full" : "partial"),
    surfaceAt: (localX, localZ, rotation, state) => {
      void localX;
      void localZ;
      if (input.fluid) return flatSurface(input.surfaceHeight?.(rotation, state) ?? getBounds(rotation, state).maxY, false, false, true);
      if (!input.supportsPrefabs && !input.walkable) return EMPTY_SURFACE;
      return flatSurface(input.surfaceHeight?.(rotation, state) ?? getBounds(rotation, state).maxY, input.supportsPrefabs, input.walkable, false);
    },
  };
}

const BASE_SHAPE_REGISTRY = {
  [SHAPE_IDS.CUBE]: makeBoxShape({ id: SHAPE_IDS.CUBE, key: "cube", name: "Cube", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: true, walkable: true, fluid: false, bounds: FULL_BOUNDS }),
  [SHAPE_IDS.SLAB]: makeBoxShape({ id: SHAPE_IDS.SLAB, key: "slab", name: "Slab", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: true, walkable: true, fluid: false, bounds: slabBounds }),
  [SHAPE_IDS.STAIR]: { id: SHAPE_IDS.STAIR, key: "stair", name: "Stair", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => stairFaces(rotation, "standard"), surfaceAt: (x, z, rotation) => flatSurface(rotateLocal(x, z, rotation).z < 0 ? 0 : 0.5, false, true) },
  [SHAPE_IDS.SLOPE_SHALLOW]: { id: SHAPE_IDS.SLOPE_SHALLOW, key: "slope-shallow", name: "Shallow Slope", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => wedgeFaces(rotation, false), surfaceAt: (x, z, rotation) => ({ ...flatSurface(slopeHeight(x, z, rotation, false), false, true), normal: rotateVector([0, 0.88, -0.48], rotation) }) },
  [SHAPE_IDS.SLOPE_STEEP]: { id: SHAPE_IDS.SLOPE_STEEP, key: "slope-steep", name: "Steep Slope", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => wedgeFaces(rotation, true), surfaceAt: (x, z, rotation) => ({ ...flatSurface(slopeHeight(x, z, rotation, true), false, false), normal: rotateVector([0, 0.7, -0.7], rotation) }) },
  [SHAPE_IDS.SLOPE_OUTER_CORNER]: { id: SHAPE_IDS.SLOPE_OUTER_CORNER, key: "outer-stair-corner", name: "Outer Stair Corner", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => stairCornerFaces(rotation, false), surfaceAt: (x, z, rotation) => flatSurface(Math.max(rotateLocal(x, z, rotation).x, rotateLocal(x, z, rotation).z) > 0 ? 0.5 : 0, false, true) },
  [SHAPE_IDS.SLOPE_INNER_CORNER]: { id: SHAPE_IDS.SLOPE_INNER_CORNER, key: "inner-stair-corner", name: "Inner Stair Corner", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => stairCornerFaces(rotation, true), surfaceAt: (x, z, rotation) => flatSurface(Math.min(rotateLocal(x, z, rotation).x, rotateLocal(x, z, rotation).z) > 0 ? 0.5 : 0, false, true) },
  [SHAPE_IDS.CUT_CORNER]: { id: SHAPE_IDS.CUT_CORNER, key: "cut-corner", name: "Cut Corner", category: "terrain", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: true, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: cutCornerFaces, surfaceAt: () => flatSurface(0.5, true, true) },
  [SHAPE_IDS.WALL]: makeBoxShape({ id: SHAPE_IDS.WALL, key: "wall", name: "Wall", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: (rotation) => rotation % 2 === 0 ? { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.08, maxZ: 0.08 } : { minX: -0.08, maxX: 0.08, minY: -0.5, maxY: 0.5, minZ: -0.5, maxZ: 0.5 } }),
  [SHAPE_IDS.BEAM]: makeBoxShape({ id: SHAPE_IDS.BEAM, key: "beam", name: "Beam", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: (rotation, state) => axisBounds(rotation, state, 0.12) }),
  [SHAPE_IDS.PILLAR_BASE]: { ...makeBoxShape({ id: SHAPE_IDS.PILLAR_BASE, key: "pillar-base", name: "Pillar Base", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => rotateFaces(pillarFaces("base"), rotation) },
  [SHAPE_IDS.PILLAR_MIDDLE]: { ...makeBoxShape({ id: SHAPE_IDS.PILLAR_MIDDLE, key: "pillar-middle", name: "Complete Pillar", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => rotateFaces(pillarFaces("middle"), rotation) },
  [SHAPE_IDS.PILLAR_CAP]: { ...makeBoxShape({ id: SHAPE_IDS.PILLAR_CAP, key: "pillar-cap", name: "Pillar Cap", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => rotateFaces(pillarFaces("cap"), rotation) },
  [SHAPE_IDS.ROOF_FLAT]: makeBoxShape({ id: SHAPE_IDS.ROOF_FLAT, key: "roof-flat", name: "Flat Roof", category: "roof", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: true, fluid: false, bounds: { ...FULL_BOUNDS, minY: 0.2 } }),
  [SHAPE_IDS.ROOF_SHALLOW]: { ...makeBoxShape({ id: SHAPE_IDS.ROOF_SHALLOW, key: "roof-shallow", name: "Shallow Roof", category: "roof", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => wedgeFaces(rotation, false) },
  [SHAPE_IDS.ROOF_STEEP]: { ...makeBoxShape({ id: SHAPE_IDS.ROOF_STEEP, key: "roof-steep", name: "Steep Roof", category: "roof", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => wedgeFaces(rotation, true) },
  [SHAPE_IDS.ROOF_OUTER_CORNER]: makeBoxShape({ id: SHAPE_IDS.ROOF_OUTER_CORNER, key: "roof-outer-corner", name: "Outer Roof Corner", category: "roof", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }),
  [SHAPE_IDS.ROOF_INNER_CORNER]: makeBoxShape({ id: SHAPE_IDS.ROOF_INNER_CORNER, key: "roof-inner-corner", name: "Inner Roof Corner", category: "roof", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }),
  [SHAPE_IDS.FENCE]: { ...makeBoxShape({ id: SHAPE_IDS.FENCE, key: "fence", name: "Fence", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.42, minZ: -0.08, maxZ: 0.08 } }), faces: (rotation) => fenceFaces(rotation, "line") },
  [SHAPE_IDS.PIPE_SHORT]: makeBoxShape({ id: SHAPE_IDS.PIPE_SHORT, key: "pipe-short", name: "Short Pipe", category: "utility", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.28, maxX: 0.28, minY: -0.18, maxY: 0.18, minZ: -0.18, maxZ: 0.18 } }),
  [SHAPE_IDS.PIPE_LONG]: makeBoxShape({ id: SHAPE_IDS.PIPE_LONG, key: "pipe-long", name: "Long Pipe", category: "utility", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: (rotation, state) => axisBounds(rotation, state, 0.18) }),
  [SHAPE_IDS.PIPE_CORNER]: makeBoxShape({ id: SHAPE_IDS.PIPE_CORNER, key: "pipe-corner", name: "Pipe Corner", category: "utility", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.5, maxX: 0.18, minY: -0.18, maxY: 0.18, minZ: -0.18, maxZ: 0.5 } }),
  [SHAPE_IDS.WATER]: { ...makeBoxShape({ id: SHAPE_IDS.WATER, key: "water", name: "Water", category: "fluid", renderLayer: "water", solid: false, blocksMovement: false, supportsPrefabs: false, walkable: false, fluid: true, bounds: (_r, state) => ({ ...FULL_BOUNDS, maxY: -0.5 + (Math.max(0, Math.min(15, state)) + 1) / 16 }), surfaceHeight: (_r, state) => -0.5 + (Math.max(0, Math.min(15, state)) + 1) / 16 }), faces: (_rotation, state) => waterFaces(state) },
  [SHAPE_IDS.TERRAIN_CORNER]: { id: SHAPE_IDS.TERRAIN_CORNER, key: "terrain-corner", name: "Terrain Corner", category: "terrain", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: true, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: terrainCornerFaces, surfaceAt: (x, z, rotation) => flatSurface(rotateLocal(x, z, rotation).x <= 0 && rotateLocal(x, z, rotation).z <= 0 ? 0.5 : 0, true, true) },
  [SHAPE_IDS.ROOF_HOLLOW]: { ...makeBoxShape({ id: SHAPE_IDS.ROOF_HOLLOW, key: "roof-hollow", name: "Hollow Roof", category: "roof", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: hollowRoofFaces },
  [SHAPE_IDS.RUBBLE_SMALL]: { ...makeBoxShape({ id: SHAPE_IDS.RUBBLE_SMALL, key: "rubble-small", name: "Small Rubble", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.28, maxX: 0.28, minY: -0.5, maxY: -0.08, minZ: -0.28, maxZ: 0.28 } }), faces: (rotation) => rotateFaces(rubbleFaces("small"), rotation) },
  [SHAPE_IDS.RUBBLE_MEDIUM]: { ...makeBoxShape({ id: SHAPE_IDS.RUBBLE_MEDIUM, key: "rubble-medium", name: "Medium Rubble", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.42, maxX: 0.42, minY: -0.5, maxY: 0.22, minZ: -0.42, maxZ: 0.42 } }), faces: (rotation) => rotateFaces(rubbleFaces("medium"), rotation) },
  [SHAPE_IDS.STALACTITE_SMALL]: { ...makeBoxShape({ id: SHAPE_IDS.STALACTITE_SMALL, key: "stalactite-small", name: "Small Stalactite", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.16, maxX: 0.16, minY: -0.32, maxY: 0.5, minZ: -0.16, maxZ: 0.16 } }), faces: (rotation) => rotateFaces(hangingSpikeFaces("small"), rotation) },
  [SHAPE_IDS.STALACTITE_LARGE]: { ...makeBoxShape({ id: SHAPE_IDS.STALACTITE_LARGE, key: "stalactite-large", name: "Large Stalactite", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.28, maxX: 0.28, minY: -0.5, maxY: 0.5, minZ: -0.28, maxZ: 0.28 } }), faces: (rotation) => rotateFaces(hangingSpikeFaces("large"), rotation) },
  [SHAPE_IDS.CRYSTAL_SMALL]: { ...makeBoxShape({ id: SHAPE_IDS.CRYSTAL_SMALL, key: "crystal-small", name: "Small Crystal", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.16, maxX: 0.16, minY: -0.5, maxY: 0.5, minZ: -0.16, maxZ: 0.16 } }), faces: (rotation) => rotateFaces(crystalFaces("small"), rotation) },
  [SHAPE_IDS.CRYSTAL_MEDIUM]: { ...makeBoxShape({ id: SHAPE_IDS.CRYSTAL_MEDIUM, key: "crystal-medium", name: "Medium Crystal", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.24, maxX: 0.24, minY: -0.5, maxY: 0.5, minZ: -0.24, maxZ: 0.24 } }), faces: (rotation) => rotateFaces(crystalFaces("medium"), rotation) },
  [SHAPE_IDS.CRYSTAL_LARGE]: { ...makeBoxShape({ id: SHAPE_IDS.CRYSTAL_LARGE, key: "crystal-large", name: "Large Crystal", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.32, maxX: 0.32, minY: -0.5, maxY: 0.5, minZ: -0.32, maxZ: 0.32 } }), faces: (rotation) => rotateFaces(crystalFaces("large"), rotation) },
  [SHAPE_IDS.PIPE]: makeBoxShape({ id: SHAPE_IDS.PIPE, key: "pipe", name: "Pipe", category: "utility", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: (rotation, state) => axisBounds(rotation, state, 0.22) }),
  [SHAPE_IDS.ROOF]: { ...makeBoxShape({ id: SHAPE_IDS.ROOF, key: "roof", name: "Roof", category: "roof", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: gableRoofFaces },
  [SHAPE_IDS.WOODEN_WALL_FULL]: { ...makeBoxShape({ id: SHAPE_IDS.WOODEN_WALL_FULL, key: "wooden-wall-full", name: "Wooden Wall - Full", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: (rotation) => rotation % 2 === 0 ? { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.12, maxZ: 0.12 } : { minX: -0.12, maxX: 0.12, minY: -0.5, maxY: 0.5, minZ: -0.5, maxZ: 0.5 } }), faces: woodenWallFullFaces },
  [SHAPE_IDS.ICE_CHUNKS]: { ...makeBoxShape({ id: SHAPE_IDS.ICE_CHUNKS, key: "ice-chunks", name: "Ice Chunks", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.38, maxX: 0.36, minY: -0.5, maxY: 0.02, minZ: -0.34, maxZ: 0.42 } }), faces: (rotation) => rotateFaces(iceChunkFaces("small"), rotation) },
  [SHAPE_IDS.ICE_CHUNKS_MEDIUM]: { ...makeBoxShape({ id: SHAPE_IDS.ICE_CHUNKS_MEDIUM, key: "ice-chunks-medium", name: "Ice Chunks - Medium", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.42, maxX: 0.42, minY: -0.5, maxY: 0.25, minZ: -0.42, maxZ: 0.42 } }), faces: (rotation) => rotateFaces(iceChunkFaces("medium"), rotation) },
  [SHAPE_IDS.ICICLES]: { ...makeBoxShape({ id: SHAPE_IDS.ICICLES, key: "icicles", name: "Icicles", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.18, maxX: 0.18, minY: -0.36, maxY: 0.5, minZ: -0.18, maxZ: 0.18 } }), faces: (rotation) => rotateFaces(hangingSpikeFaces("small"), rotation) },
  [SHAPE_IDS.ICICLES_LARGE]: { ...makeBoxShape({ id: SHAPE_IDS.ICICLES_LARGE, key: "icicles-large", name: "Large Icicles", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.3, maxX: 0.3, minY: -0.5, maxY: 0.5, minZ: -0.3, maxZ: 0.3 } }), faces: (rotation) => rotateFaces(hangingSpikeFaces("large"), rotation) },
  [SHAPE_IDS.STAIR_INVERTED]: { id: SHAPE_IDS.STAIR_INVERTED, key: "stair-inverted", name: "Inverted Stair", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: false, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => stairFaces(rotation, "inverted"), surfaceAt: () => EMPTY_SURFACE },
  [SHAPE_IDS.STAIR_LOW]: { id: SHAPE_IDS.STAIR_LOW, key: "stair-low", name: "Low Terrain Steps", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => stairFaces(rotation, "low"), surfaceAt: (x, z, rotation) => flatSurface(rotateLocal(x, z, rotation).z < -0.16 ? -0.26 : rotateLocal(x, z, rotation).z < 0.18 ? -0.02 : 0.22, false, true) },
  [SHAPE_IDS.STAIR_OUTER_CORNER_INVERTED]: { id: SHAPE_IDS.STAIR_OUTER_CORNER_INVERTED, key: "outer-stair-corner-inverted", name: "Inverted Outer Stair Corner", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: false, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => invertedStairCornerFaces(rotation, false), surfaceAt: () => EMPTY_SURFACE },
  [SHAPE_IDS.STAIR_INNER_CORNER_INVERTED]: { id: SHAPE_IDS.STAIR_INNER_CORNER_INVERTED, key: "inner-stair-corner-inverted", name: "Inverted Inner Stair Corner", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: false, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => invertedStairCornerFaces(rotation, true), surfaceAt: () => EMPTY_SURFACE },
  [SHAPE_IDS.FENCE_POST]: { ...makeBoxShape({ id: SHAPE_IDS.FENCE_POST, key: "fence-post", name: "Fence Post", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.08, maxX: 0.08, minY: -0.5, maxY: 0.42, minZ: -0.08, maxZ: 0.08 } }), faces: (rotation) => fenceFaces(rotation, "post") },
  [SHAPE_IDS.FENCE_CORNER]: { ...makeBoxShape({ id: SHAPE_IDS.FENCE_CORNER, key: "fence-corner", name: "Fence Corner", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => fenceFaces(rotation, "corner") },
  [SHAPE_IDS.FENCE_T]: { ...makeBoxShape({ id: SHAPE_IDS.FENCE_T, key: "fence-t", name: "Fence T Junction", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => fenceFaces(rotation, "t") },
  [SHAPE_IDS.FENCE_CROSS]: { ...makeBoxShape({ id: SHAPE_IDS.FENCE_CROSS, key: "fence-cross", name: "Fence Cross Junction", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => fenceFaces(rotation, "cross") },
  [SHAPE_IDS.FENCE_GATE]: { ...makeBoxShape({ id: SHAPE_IDS.FENCE_GATE, key: "fence-gate", name: "Fence Gate", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.42, maxX: 0.42, minY: -0.5, maxY: 0.34, minZ: -0.06, maxZ: 0.06 } }), faces: (rotation) => fenceFaces(rotation, "gate") },
  [SHAPE_IDS.RETAINING_WALL_LOW]: { ...makeBoxShape({ id: SHAPE_IDS.RETAINING_WALL_LOW, key: "retaining-wall-low", name: "Low Retaining Wall", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.06, minZ: -0.12, maxZ: 0.12 } }), faces: retainingWallLowFaces },
  [SHAPE_IDS.TERRAIN_RAISED_EDGE]: { id: SHAPE_IDS.TERRAIN_RAISED_EDGE, key: "terrain-raised-edge", name: "Raised Terrain Edge", category: "terrain", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: terrainRaisedEdgeFaces, surfaceAt: (x, z, rotation) => flatSurface(rotateLocal(x, z, rotation).z > 0.24 ? 0.28 : 0, false, true) },
  [SHAPE_IDS.TERRAIN_DIAGONAL_BANK]: { id: SHAPE_IDS.TERRAIN_DIAGONAL_BANK, key: "terrain-diagonal-bank", name: "Diagonal Terrain Bank", category: "terrain", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: terrainDiagonalBankFaces, surfaceAt: (x, z, rotation) => flatSurface(rotateLocal(x, z, rotation).x <= 0.08 && rotateLocal(x, z, rotation).z >= 0.08 ? 0.28 : -0.08, false, true) },
  [SHAPE_IDS.WOODEN_WALL_END]: { ...makeBoxShape({ id: SHAPE_IDS.WOODEN_WALL_END, key: "wooden-wall-end", name: "Wooden Wall - End Pole", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.13, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.13, maxZ: 0.13 } }), faces: (rotation) => woodenWallFaces(rotation, "end") },
  [SHAPE_IDS.WOODEN_WALL_CORNER]: { ...makeBoxShape({ id: SHAPE_IDS.WOODEN_WALL_CORNER, key: "wooden-wall-corner", name: "Wooden Wall - Corner", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => woodenWallFaces(rotation, "corner") },
  [SHAPE_IDS.WOODEN_WALL_T]: { ...makeBoxShape({ id: SHAPE_IDS.WOODEN_WALL_T, key: "wooden-wall-t", name: "Wooden Wall - T Junction", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => woodenWallFaces(rotation, "t") },
  [SHAPE_IDS.WOODEN_WALL_CROSS]: { ...makeBoxShape({ id: SHAPE_IDS.WOODEN_WALL_CROSS, key: "wooden-wall-cross", name: "Wooden Wall - Cross Junction", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => woodenWallFaces(rotation, "cross") },
  [SHAPE_IDS.WOODEN_WALL_GATE]: { ...makeBoxShape({ id: SHAPE_IDS.WOODEN_WALL_GATE, key: "wooden-wall-gate", name: "Wooden Wall - Gate", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.13, maxZ: 0.13 } }), faces: (rotation) => woodenWallFaces(rotation, "gate") },
  [SHAPE_IDS.STAIR_LOW_OUTER_CORNER]: { id: SHAPE_IDS.STAIR_LOW_OUTER_CORNER, key: "stair-low-outer-corner", name: "Low Terrain Steps - Outer Corner", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => lowStairCornerFaces(rotation, false), surfaceAt: (x, z, rotation) => flatSurface(Math.max(rotateLocal(x, z, rotation).x, rotateLocal(x, z, rotation).z) < -0.16 ? -0.26 : Math.max(rotateLocal(x, z, rotation).x, rotateLocal(x, z, rotation).z) < 0.18 ? -0.02 : 0.22, false, true) },
  [SHAPE_IDS.STAIR_LOW_INNER_CORNER]: { id: SHAPE_IDS.STAIR_LOW_INNER_CORNER, key: "stair-low-inner-corner", name: "Low Terrain Steps - Inner Corner", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => lowStairCornerFaces(rotation, true), surfaceAt: (x, z, rotation) => flatSurface(Math.min(rotateLocal(x, z, rotation).x, rotateLocal(x, z, rotation).z) < -0.16 ? -0.26 : Math.min(rotateLocal(x, z, rotation).x, rotateLocal(x, z, rotation).z) < 0.18 ? -0.02 : 0.22, false, true) },
  [SHAPE_IDS.SOLID_WOODEN_WALL_FULL]: { ...makeBoxShape({ id: SHAPE_IDS.SOLID_WOODEN_WALL_FULL, key: "solid-wooden-wall-full", name: "Solid Wooden Wall - Full", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: (rotation) => rotation % 2 === 0 ? { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.12, maxZ: 0.12 } : { minX: -0.12, maxX: 0.12, minY: -0.5, maxY: 0.5, minZ: -0.5, maxZ: 0.5 } }), faces: (rotation) => solidWoodenWallFaces(rotation, "full") },
  [SHAPE_IDS.SOLID_WOODEN_WALL_END]: { ...makeBoxShape({ id: SHAPE_IDS.SOLID_WOODEN_WALL_END, key: "solid-wooden-wall-end", name: "Solid Wooden Wall - End Pole", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.18, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.18, maxZ: 0.18 } }), faces: (rotation) => solidWoodenWallFaces(rotation, "end") },
  [SHAPE_IDS.SOLID_WOODEN_WALL_CORNER]: { ...makeBoxShape({ id: SHAPE_IDS.SOLID_WOODEN_WALL_CORNER, key: "solid-wooden-wall-corner", name: "Solid Wooden Wall - Corner", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => solidWoodenWallFaces(rotation, "corner") },
  [SHAPE_IDS.SOLID_WOODEN_WALL_T]: { ...makeBoxShape({ id: SHAPE_IDS.SOLID_WOODEN_WALL_T, key: "solid-wooden-wall-t", name: "Solid Wooden Wall - T Junction", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => solidWoodenWallFaces(rotation, "t") },
  [SHAPE_IDS.SOLID_WOODEN_WALL_CROSS]: { ...makeBoxShape({ id: SHAPE_IDS.SOLID_WOODEN_WALL_CROSS, key: "solid-wooden-wall-cross", name: "Solid Wooden Wall - Cross Junction", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => solidWoodenWallFaces(rotation, "cross") },
  [SHAPE_IDS.SOLID_WOODEN_WALL_GATE]: { ...makeBoxShape({ id: SHAPE_IDS.SOLID_WOODEN_WALL_GATE, key: "solid-wooden-wall-gate", name: "Solid Wooden Wall - Gate", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.12, maxZ: 0.12 } }), faces: (rotation) => solidWoodenWallFaces(rotation, "gate") },
} satisfies Record<ShapeId, ShapeDefinition>;

export const SHAPE_REGISTRY = Object.fromEntries(
  Object.entries(BASE_SHAPE_REGISTRY).map(([id, shape]) => [
    id,
    {
      ...shape,
      bounds: (rotation: CellRotation, state: number) => pitchBounds(shape.bounds(rotation, getShapeStateValue(state)), state),
      faces: (rotation: CellRotation, state: number) => pitchFaces(shape.faces(rotation, getShapeStateValue(state)), state),
    },
  ]),
) as Record<ShapeId, ShapeDefinition>;

export const SHAPE_DEFINITIONS = Object.values(SHAPE_REGISTRY);

export function getShapeDefinition(shapeId: number): ShapeDefinition {
  return SHAPE_REGISTRY[shapeId as ShapeId] ?? SHAPE_REGISTRY[SHAPE_IDS.CUBE];
}

export function isWaterShape(shapeId: number) {
  return shapeId === SHAPE_IDS.WATER;
}

export function getDefaultShapeState(shapeId: ShapeId) {
  void shapeId;
  return DEFAULT_STATE;
}

export function getDefaultShapeRotation(shapeId: ShapeId) {
  void shapeId;
  return DEFAULT_ROTATION;
}
