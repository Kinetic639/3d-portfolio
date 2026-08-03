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
  const points: Array<[number, number, number]> = [
    [-0.5, -0.5, -0.5],
    [0.5, -0.5, -0.5],
    [0.5, -0.5, 0.5],
    [-0.5, -0.5, 0.5],
    [-0.5, high, 0.5],
    [0.5, high, 0.5],
  ];
  const verts = points.map((point) => rotatePoint(point, rotation));
  return [
    { direction: "ny", normal: FACE_NORMALS.ny, occlusion: "partial", corners: [verts[0], verts[1], verts[2], verts[3]] },
    { direction: "pz", normal: FACE_NORMALS.pz, occlusion: "partial", corners: [verts[3], verts[2], verts[5], verts[4]] },
    { direction: "nx", normal: FACE_NORMALS.nx, occlusion: "partial", corners: [verts[0], verts[3], verts[4], verts[0]] },
    { direction: "px", normal: FACE_NORMALS.px, occlusion: "partial", corners: [verts[1], verts[5], verts[2], verts[1]] },
    { direction: "py", normal: [0, 1, steep ? -1 : -0.55], occlusion: "partial", corners: [verts[0], verts[4], verts[5], verts[1]] },
  ];
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

function pillarFaces(kind: "base" | "middle" | "cap") {
  const shaft = boxFaces({ minX: -0.18, maxX: 0.18, minY: -0.5, maxY: 0.5, minZ: -0.18, maxZ: 0.18 }, "partial");
  const base = boxFaces({ minX: -0.34, maxX: 0.34, minY: -0.5, maxY: -0.26, minZ: -0.34, maxZ: 0.34 }, "partial");
  const cap = boxFaces({ minX: -0.34, maxX: 0.34, minY: 0.26, maxY: 0.5, minZ: -0.34, maxZ: 0.34 }, "partial");
  if (kind === "base") return [...shaft, ...base];
  if (kind === "cap") return [...shaft, ...cap];
  return [...shaft, ...base, ...cap];
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

function makeBoxShape(input: Omit<ShapeDefinition, "supportedRotations" | "bounds" | "faces" | "surfaceAt" | "revealCompatible"> & {
  bounds: ShapeBounds | ((rotation: CellRotation, state: number) => ShapeBounds);
  surfaceHeight?: (rotation: CellRotation, state: number) => number;
  supportedRotations?: CellRotation[];
}): ShapeDefinition {
  const getBounds = typeof input.bounds === "function" ? input.bounds : () => input.bounds as ShapeBounds;
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

export const SHAPE_REGISTRY: Record<ShapeId, ShapeDefinition> = {
  [SHAPE_IDS.CUBE]: makeBoxShape({ id: SHAPE_IDS.CUBE, key: "cube", name: "Cube", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: true, walkable: true, fluid: false, bounds: FULL_BOUNDS }),
  [SHAPE_IDS.SLAB]: makeBoxShape({ id: SHAPE_IDS.SLAB, key: "slab", name: "Slab", category: "terrain", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: true, walkable: true, fluid: false, bounds: slabBounds }),
  [SHAPE_IDS.STAIR]: { id: SHAPE_IDS.STAIR, key: "stair", name: "Stair", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => [...boxFaces({ ...FULL_BOUNDS, maxY: 0 }, "partial"), ...boxFaces({ minX: -0.5, maxX: 0.5, minY: 0, maxY: 0.5, minZ: 0, maxZ: 0.5 }, "partial").map((face) => ({ ...face, corners: face.corners.map((corner) => rotatePoint(corner, rotation)) }))], surfaceAt: (x, z, rotation) => flatSurface(rotateLocal(x, z, rotation).z < 0 ? 0 : 0.5, false, true) },
  [SHAPE_IDS.SLOPE_SHALLOW]: { id: SHAPE_IDS.SLOPE_SHALLOW, key: "slope-shallow", name: "Shallow Slope", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => wedgeFaces(rotation, false), surfaceAt: (x, z, rotation) => ({ ...flatSurface(slopeHeight(x, z, rotation, false), false, true), normal: [0, 0.88, -0.48] }) },
  [SHAPE_IDS.SLOPE_STEEP]: { id: SHAPE_IDS.SLOPE_STEEP, key: "slope-steep", name: "Steep Slope", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => wedgeFaces(rotation, true), surfaceAt: (x, z, rotation) => ({ ...flatSurface(slopeHeight(x, z, rotation, true), false, false), normal: [0, 0.7, -0.7] }) },
  [SHAPE_IDS.SLOPE_OUTER_CORNER]: { id: SHAPE_IDS.SLOPE_OUTER_CORNER, key: "outer-stair-corner", name: "Outer Stair Corner", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => stairCornerFaces(rotation, false), surfaceAt: (x, z, rotation) => flatSurface(Math.max(rotateLocal(x, z, rotation).x, rotateLocal(x, z, rotation).z) > 0 ? 0.5 : 0, false, true) },
  [SHAPE_IDS.SLOPE_INNER_CORNER]: { id: SHAPE_IDS.SLOPE_INNER_CORNER, key: "inner-stair-corner", name: "Inner Stair Corner", category: "transition", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: false, supportsPrefabs: false, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: (rotation) => stairCornerFaces(rotation, true), surfaceAt: (x, z, rotation) => flatSurface(Math.min(rotateLocal(x, z, rotation).x, rotateLocal(x, z, rotation).z) > 0 ? 0.5 : 0, false, true) },
  [SHAPE_IDS.CUT_CORNER]: { id: SHAPE_IDS.CUT_CORNER, key: "cut-corner", name: "Cut Corner", category: "terrain", supportedRotations: ALL_ROTATIONS, renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: true, walkable: true, fluid: false, revealCompatible: true, bounds: () => FULL_BOUNDS, faces: cutCornerFaces, surfaceAt: () => flatSurface(0.5, true, true) },
  [SHAPE_IDS.WALL]: makeBoxShape({ id: SHAPE_IDS.WALL, key: "wall", name: "Wall", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: (rotation) => rotation % 2 === 0 ? { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.08, maxZ: 0.08 } : { minX: -0.08, maxX: 0.08, minY: -0.5, maxY: 0.5, minZ: -0.5, maxZ: 0.5 } }),
  [SHAPE_IDS.BEAM]: makeBoxShape({ id: SHAPE_IDS.BEAM, key: "beam", name: "Beam", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: (_r, state) => state === 1 ? { minX: -0.12, maxX: 0.12, minY: -0.5, maxY: 0.5, minZ: -0.12, maxZ: 0.12 } : state === 2 ? { minX: -0.12, maxX: 0.12, minY: -0.12, maxY: 0.12, minZ: -0.5, maxZ: 0.5 } : { minX: -0.5, maxX: 0.5, minY: -0.12, maxY: 0.12, minZ: -0.12, maxZ: 0.12 } }),
  [SHAPE_IDS.PILLAR_BASE]: { ...makeBoxShape({ id: SHAPE_IDS.PILLAR_BASE, key: "pillar-base", name: "Pillar Base", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: () => pillarFaces("base") },
  [SHAPE_IDS.PILLAR_MIDDLE]: { ...makeBoxShape({ id: SHAPE_IDS.PILLAR_MIDDLE, key: "pillar-middle", name: "Complete Pillar", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: () => pillarFaces("middle") },
  [SHAPE_IDS.PILLAR_CAP]: { ...makeBoxShape({ id: SHAPE_IDS.PILLAR_CAP, key: "pillar-cap", name: "Pillar Cap", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: () => pillarFaces("cap") },
  [SHAPE_IDS.ROOF_FLAT]: makeBoxShape({ id: SHAPE_IDS.ROOF_FLAT, key: "roof-flat", name: "Flat Roof", category: "roof", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: true, fluid: false, bounds: { ...FULL_BOUNDS, minY: 0.2 } }),
  [SHAPE_IDS.ROOF_SHALLOW]: { ...makeBoxShape({ id: SHAPE_IDS.ROOF_SHALLOW, key: "roof-shallow", name: "Shallow Roof", category: "roof", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => wedgeFaces(rotation, false) },
  [SHAPE_IDS.ROOF_STEEP]: { ...makeBoxShape({ id: SHAPE_IDS.ROOF_STEEP, key: "roof-steep", name: "Steep Roof", category: "roof", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }), faces: (rotation) => wedgeFaces(rotation, true) },
  [SHAPE_IDS.ROOF_OUTER_CORNER]: makeBoxShape({ id: SHAPE_IDS.ROOF_OUTER_CORNER, key: "roof-outer-corner", name: "Outer Roof Corner", category: "roof", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }),
  [SHAPE_IDS.ROOF_INNER_CORNER]: makeBoxShape({ id: SHAPE_IDS.ROOF_INNER_CORNER, key: "roof-inner-corner", name: "Inner Roof Corner", category: "roof", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: FULL_BOUNDS }),
  [SHAPE_IDS.FENCE]: makeBoxShape({ id: SHAPE_IDS.FENCE, key: "fence", name: "Fence", category: "structure", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.15, minZ: -0.06, maxZ: 0.06 } }),
  [SHAPE_IDS.PIPE_SHORT]: makeBoxShape({ id: SHAPE_IDS.PIPE_SHORT, key: "pipe-short", name: "Short Pipe", category: "utility", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.28, maxX: 0.28, minY: -0.18, maxY: 0.18, minZ: -0.18, maxZ: 0.18 } }),
  [SHAPE_IDS.PIPE_LONG]: makeBoxShape({ id: SHAPE_IDS.PIPE_LONG, key: "pipe-long", name: "Long Pipe", category: "utility", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: (_r, state) => state === 1 ? { minX: -0.18, maxX: 0.18, minY: -0.5, maxY: 0.5, minZ: -0.18, maxZ: 0.18 } : state === 2 ? { minX: -0.18, maxX: 0.18, minY: -0.18, maxY: 0.18, minZ: -0.5, maxZ: 0.5 } : { minX: -0.5, maxX: 0.5, minY: -0.18, maxY: 0.18, minZ: -0.18, maxZ: 0.18 } }),
  [SHAPE_IDS.PIPE_CORNER]: makeBoxShape({ id: SHAPE_IDS.PIPE_CORNER, key: "pipe-corner", name: "Pipe Corner", category: "utility", renderLayer: "opaque", solid: true, blocksMovement: true, supportsPrefabs: false, walkable: false, fluid: false, bounds: { minX: -0.5, maxX: 0.18, minY: -0.18, maxY: 0.18, minZ: -0.18, maxZ: 0.5 } }),
  [SHAPE_IDS.WATER]: { ...makeBoxShape({ id: SHAPE_IDS.WATER, key: "water", name: "Water", category: "fluid", renderLayer: "water", solid: false, blocksMovement: false, supportsPrefabs: false, walkable: false, fluid: true, bounds: (_r, state) => ({ ...FULL_BOUNDS, maxY: -0.5 + (Math.max(0, Math.min(15, state)) + 1) / 16 }), surfaceHeight: (_r, state) => -0.5 + (Math.max(0, Math.min(15, state)) + 1) / 16 }), faces: (_rotation, state) => waterFaces(state) },
};

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
