import { describe, expect, it } from "vitest";
import { getShapeDefinition, SHAPE_DEFINITIONS, SHAPE_REGISTRY } from "./shape-registry";
import { ROTATIONS, SHAPE_IDS, SHAPE_ID_VALUES } from "./shape-ids";

describe("shape registry", () => {
  it("keeps stable unique shape ids", () => {
    expect(SHAPE_IDS.CUBE).toBe(0);
    expect(SHAPE_IDS.WATER).toBe(22);
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

  it("marks water as fluid and non-supporting", () => {
    const water = getShapeDefinition(SHAPE_IDS.WATER);
    const sample = water.surfaceAt(0, 0, ROTATIONS.NORTH, 15);

    expect(water.renderLayer).toBe("water");
    expect(sample.fluid).toBe(true);
    expect(sample.solidSupport).toBe(false);
    expect(sample.walkable).toBe(false);
  });

  it("defines visibly distinct cut-corner, stair-corner, pillar and water geometry", () => {
    const cube = getShapeDefinition(SHAPE_IDS.CUBE);
    const cutCorner = getShapeDefinition(SHAPE_IDS.CUT_CORNER);
    const outerCorner = getShapeDefinition(SHAPE_IDS.SLOPE_OUTER_CORNER);
    const innerCorner = getShapeDefinition(SHAPE_IDS.SLOPE_INNER_CORNER);
    const completePillar = getShapeDefinition(SHAPE_IDS.PILLAR_MIDDLE);
    const water = getShapeDefinition(SHAPE_IDS.WATER);

    expect(cutCorner.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(outerCorner.name).toBe("Outer Stair Corner");
    expect(innerCorner.name).toBe("Inner Stair Corner");
    expect(outerCorner.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(innerCorner.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(completePillar.name).toBe("Complete Pillar");
    expect(completePillar.faces(ROTATIONS.NORTH, 0).length).toBeGreaterThan(cube.faces(ROTATIONS.NORTH, 0).length);
    expect(water.faces(ROTATIONS.NORTH, 15)).toHaveLength(1);
  });
});
