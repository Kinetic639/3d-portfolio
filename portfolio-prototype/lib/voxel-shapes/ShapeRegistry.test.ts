import { describe, expect, it } from "vitest";
import { getShapeDefinition, getShapePitch, setShapePitch, SHAPE_DEFINITIONS, SHAPE_REGISTRY } from "./shape-registry";
import { ROTATIONS, SHAPE_IDS, SHAPE_ID_VALUES } from "./shape-ids";

describe("shape registry", () => {
  it("keeps stable unique shape ids", () => {
    expect(SHAPE_IDS.CUBE).toBe(0);
    expect(SHAPE_IDS.STAIR_INVERTED).toBe(39);
    expect(SHAPE_IDS.TERRAIN_DIAGONAL_BANK).toBe(50);
    expect(SHAPE_IDS.WOODEN_WALL_END).toBe(51);
    expect(SHAPE_IDS.WOODEN_WALL_GATE).toBe(55);
    expect(SHAPE_IDS.STAIR_LOW_OUTER_CORNER).toBe(56);
    expect(SHAPE_IDS.STAIR_LOW_INNER_CORNER).toBe(57);
    expect(SHAPE_IDS.SOLID_WOODEN_WALL_FULL).toBe(58);
    expect(SHAPE_IDS.SOLID_WOODEN_WALL_GATE).toBe(63);
    expect(new Set(SHAPE_ID_VALUES).size).toBe(SHAPE_ID_VALUES.length);
    expect(SHAPE_DEFINITIONS).toHaveLength(SHAPE_ID_VALUES.length);
  });

  it("defines valid bounds, rotations and faces for every shape", () => {
    for (const shape of SHAPE_DEFINITIONS) {
      expect(SHAPE_REGISTRY[shape.id]).toBe(shape);
      expect(shape.supportedRotations.length).toBeGreaterThan(0);
      const bounds = shape.bounds(ROTATIONS.NORTH, 0);
      expect(bounds.minX).toBeLessThanOrEqual(bounds.maxX);
      expect(bounds.minY).toBeLessThanOrEqual(bounds.maxY);
      expect(bounds.minZ).toBeLessThanOrEqual(bounds.maxZ);
      expect(shape.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(0);
    }
  });

  it("falls back to cube for unknown shape ids", () => {
    expect(getShapeDefinition(255).id).toBe(SHAPE_IDS.CUBE);
  });

  it("defines visibly distinct cut-corner, stair-corner and pillar geometry", () => {
    const cube = getShapeDefinition(SHAPE_IDS.CUBE);
    const cutCorner = getShapeDefinition(SHAPE_IDS.CUT_CORNER);
    const outerCorner = getShapeDefinition(SHAPE_IDS.SLOPE_OUTER_CORNER);
    const innerCorner = getShapeDefinition(SHAPE_IDS.SLOPE_INNER_CORNER);
    const completePillar = getShapeDefinition(SHAPE_IDS.PILLAR_MIDDLE);
    const terrainCorner = getShapeDefinition(SHAPE_IDS.TERRAIN_CORNER);
    const hollowRoof = getShapeDefinition(SHAPE_IDS.ROOF_HOLLOW);
    const rubble = getShapeDefinition(SHAPE_IDS.RUBBLE_MEDIUM);
    const stalactite = getShapeDefinition(SHAPE_IDS.STALACTITE_LARGE);
    const crystal = getShapeDefinition(SHAPE_IDS.CRYSTAL_LARGE);
    const pipe = getShapeDefinition(SHAPE_IDS.PIPE);
    const roof = getShapeDefinition(SHAPE_IDS.ROOF);
    const woodenWall = getShapeDefinition(SHAPE_IDS.WOODEN_WALL_FULL);
    const iceChunks = getShapeDefinition(SHAPE_IDS.ICE_CHUNKS_MEDIUM);
    const icicles = getShapeDefinition(SHAPE_IDS.ICICLES_LARGE);
    const lowSteps = getShapeDefinition(SHAPE_IDS.STAIR_LOW);
    const fenceCorner = getShapeDefinition(SHAPE_IDS.FENCE_CORNER);
    const fenceT = getShapeDefinition(SHAPE_IDS.FENCE_T);
    const fenceCross = getShapeDefinition(SHAPE_IDS.FENCE_CROSS);
    const raisedEdge = getShapeDefinition(SHAPE_IDS.TERRAIN_RAISED_EDGE);
    const diagonalBank = getShapeDefinition(SHAPE_IDS.TERRAIN_DIAGONAL_BANK);
    const woodenWallEnd = getShapeDefinition(SHAPE_IDS.WOODEN_WALL_END);
    const woodenWallCorner = getShapeDefinition(SHAPE_IDS.WOODEN_WALL_CORNER);
    const woodenWallT = getShapeDefinition(SHAPE_IDS.WOODEN_WALL_T);
    const woodenWallCross = getShapeDefinition(SHAPE_IDS.WOODEN_WALL_CROSS);
    const woodenWallGate = getShapeDefinition(SHAPE_IDS.WOODEN_WALL_GATE);
    const lowOuterCorner = getShapeDefinition(SHAPE_IDS.STAIR_LOW_OUTER_CORNER);
    const lowInnerCorner = getShapeDefinition(SHAPE_IDS.STAIR_LOW_INNER_CORNER);
    const solidWoodenWall = getShapeDefinition(SHAPE_IDS.SOLID_WOODEN_WALL_FULL);
    const solidWoodenWallEnd = getShapeDefinition(SHAPE_IDS.SOLID_WOODEN_WALL_END);
    const solidWoodenWallCorner = getShapeDefinition(SHAPE_IDS.SOLID_WOODEN_WALL_CORNER);
    const solidWoodenWallT = getShapeDefinition(SHAPE_IDS.SOLID_WOODEN_WALL_T);
    const solidWoodenWallCross = getShapeDefinition(SHAPE_IDS.SOLID_WOODEN_WALL_CROSS);
    const solidWoodenWallGate = getShapeDefinition(SHAPE_IDS.SOLID_WOODEN_WALL_GATE);

    expect(cutCorner.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(outerCorner.name).toBe("Outer Stair Corner");
    expect(innerCorner.name).toBe("Inner Stair Corner");
    expect(outerCorner.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(innerCorner.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(completePillar.name).toBe("Complete Pillar");
    expect(completePillar.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(terrainCorner.name).toBe("Terrain Corner");
    expect(hollowRoof.name).toBe("Hollow Roof");
    expect(rubble.name).toBe("Medium Rubble");
    expect(stalactite.name).toBe("Large Stalactite");
    expect(crystal.name).toBe("Large Crystal");
    expect(pipe.name).toBe("Pipe");
    expect(roof.name).toBe("Roof");
    expect(woodenWall.name).toBe("Wooden Wall - Full");
    expect(iceChunks.name).toBe("Ice Chunks - Medium");
    expect(icicles.name).toBe("Large Icicles");
    expect(rubble.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(stalactite.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(crystal.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(roof.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(woodenWall.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(iceChunks.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(icicles.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(lowSteps.category).toBe("transition");
    expect(serializeFaces(fenceCorner.faces(ROTATIONS.NORTH, 0))).not.toBe(serializeFaces(fenceT.faces(ROTATIONS.NORTH, 0)));
    expect(serializeFaces(fenceT.faces(ROTATIONS.NORTH, 0))).not.toBe(serializeFaces(fenceCross.faces(ROTATIONS.NORTH, 0)));
    expect(raisedEdge.category).toBe("terrain");
    expect(diagonalBank.category).toBe("terrain");
    expect(woodenWallEnd.name).toBe("Wooden Wall - End Pole");
    expect(woodenWallGate.name).toBe("Wooden Wall - Gate");
    expect(serializeFaces(woodenWallCorner.faces(ROTATIONS.NORTH, 0))).not.toBe(serializeFaces(woodenWallT.faces(ROTATIONS.NORTH, 0)));
    expect(serializeFaces(woodenWallT.faces(ROTATIONS.NORTH, 0))).not.toBe(serializeFaces(woodenWallCross.faces(ROTATIONS.NORTH, 0)));
    expect(serializeFaces(woodenWallGate.faces(ROTATIONS.NORTH, 0))).not.toBe(serializeFaces(woodenWall.faces(ROTATIONS.NORTH, 0)));
    expect(lowOuterCorner.name).toBe("Low Terrain Steps - Outer Corner");
    expect(lowInnerCorner.name).toBe("Low Terrain Steps - Inner Corner");
    expect(serializeFaces(lowOuterCorner.faces(ROTATIONS.NORTH, 0))).not.toBe(serializeFaces(lowInnerCorner.faces(ROTATIONS.NORTH, 0)));
    expect(solidWoodenWall.name).toBe("Solid Wooden Wall - Full");
    expect(solidWoodenWallEnd.name).toBe("Solid Wooden Wall - End Pole");
    expect(solidWoodenWallGate.name).toBe("Solid Wooden Wall - Gate");
    expect(serializeFaces(solidWoodenWall.faces(ROTATIONS.NORTH, 0))).not.toBe(serializeFaces(woodenWall.faces(ROTATIONS.NORTH, 0)));
    expect(serializeFaces(solidWoodenWallCorner.faces(ROTATIONS.NORTH, 0))).not.toBe(serializeFaces(solidWoodenWallT.faces(ROTATIONS.NORTH, 0)));
    expect(serializeFaces(solidWoodenWallT.faces(ROTATIONS.NORTH, 0))).not.toBe(serializeFaces(solidWoodenWallCross.faces(ROTATIONS.NORTH, 0)));
    expect(serializeFaces(solidWoodenWallGate.faces(ROTATIONS.NORTH, 0))).not.toBe(serializeFaces(solidWoodenWall.faces(ROTATIONS.NORTH, 0)));
  });

  it("orients axis-based shapes through reusable state values", () => {
    const beam = getShapeDefinition(SHAPE_IDS.BEAM);
    const xBounds = beam.bounds(ROTATIONS.NORTH, 0);
    const yBounds = beam.bounds(ROTATIONS.NORTH, 1);
    const zBounds = beam.bounds(ROTATIONS.NORTH, 2);

    expect(xBounds.maxX - xBounds.minX).toBeGreaterThan(xBounds.maxY - xBounds.minY);
    expect(yBounds.maxY - yBounds.minY).toBeGreaterThan(yBounds.maxX - yBounds.minX);
    expect(zBounds.maxZ - zBounds.minZ).toBeGreaterThan(zBounds.maxX - zBounds.minX);
  });

  it("rotates asymmetric shapes clockwise and counter-clockwise", () => {
    const rotatedShapes = [
      SHAPE_IDS.STAIR,
      SHAPE_IDS.STAIR_INVERTED,
      SHAPE_IDS.STAIR_LOW,
      SHAPE_IDS.STAIR_LOW_OUTER_CORNER,
      SHAPE_IDS.STAIR_LOW_INNER_CORNER,
      SHAPE_IDS.FENCE,
      SHAPE_IDS.FENCE_CORNER,
      SHAPE_IDS.FENCE_T,
      SHAPE_IDS.PIPE_SHORT,
      SHAPE_IDS.PIPE_CORNER,
      SHAPE_IDS.RETAINING_WALL_LOW,
      SHAPE_IDS.TERRAIN_RAISED_EDGE,
      SHAPE_IDS.TERRAIN_DIAGONAL_BANK,
      SHAPE_IDS.RUBBLE_MEDIUM,
      SHAPE_IDS.ICE_CHUNKS,
      SHAPE_IDS.WOODEN_WALL_FULL,
      SHAPE_IDS.WOODEN_WALL_END,
      SHAPE_IDS.WOODEN_WALL_CORNER,
      SHAPE_IDS.WOODEN_WALL_T,
      SHAPE_IDS.WOODEN_WALL_GATE,
      SHAPE_IDS.SOLID_WOODEN_WALL_FULL,
      SHAPE_IDS.SOLID_WOODEN_WALL_END,
      SHAPE_IDS.SOLID_WOODEN_WALL_CORNER,
      SHAPE_IDS.SOLID_WOODEN_WALL_T,
      SHAPE_IDS.SOLID_WOODEN_WALL_GATE,
    ];

    for (const shapeId of rotatedShapes) {
      const shape = getShapeDefinition(shapeId);
      const north = shape.faces(ROTATIONS.NORTH, 0);
      const east = shape.faces(ROTATIONS.EAST, 0);
      const west = shape.faces(ROTATIONS.WEST, 0);

      expect(serializeFaces(east), shape.name).not.toBe(serializeFaces(north));
      expect(serializeFaces(west), shape.name).not.toBe(serializeFaces(north));
    }
  });

  it("stores 90-degree pitch orientation in shape state", () => {
    const wall = getShapeDefinition(SHAPE_IDS.WALL);
    const pitchedState = setShapePitch(0, 1);
    const flatBounds = wall.bounds(ROTATIONS.NORTH, 0);
    const pitchedBounds = wall.bounds(ROTATIONS.NORTH, pitchedState);

    expect(getShapePitch(pitchedState)).toBe(1);
    expect(flatBounds.maxY - flatBounds.minY).toBeGreaterThan(pitchedBounds.maxY - pitchedBounds.minY);
    expect(pitchedBounds.maxZ - pitchedBounds.minZ).toBeGreaterThan(flatBounds.maxZ - flatBounds.minZ);
  });
});

function serializeFaces(faces: ReturnType<ReturnType<typeof getShapeDefinition>["faces"]>) {
  return faces
    .flatMap((face) => face.corners)
    .map((corner) => corner.map((value) => value.toFixed(2)).join(","))
    .join("|");
}
