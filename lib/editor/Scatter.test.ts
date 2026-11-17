import { describe, expect, it } from "vitest";
import { DEFAULT_SCATTER, mulberry32, scatterPlacements } from "./scatter";

const everywhere = () => true;

describe("scatter", () => {
  it("is the same for the same seed and different for another", () => {
    const a = scatterPlacements({ x: 0, z: 0 }, DEFAULT_SCATTER, everywhere);
    expect(scatterPlacements({ x: 0, z: 0 }, DEFAULT_SCATTER, everywhere)).toEqual(a);
    expect(scatterPlacements({ x: 0, z: 0 }, { ...DEFAULT_SCATTER, seed: 2 }, everywhere)).not.toEqual(a);
    expect(mulberry32(7)()).toBe(mulberry32(7)());
  });

  it("stays within the radius, keeps the spacing and places the count when there is room", () => {
    const settings = { ...DEFAULT_SCATTER, count: 20, radius: 10, spacing: 2 };
    const placements = scatterPlacements({ x: 5, z: -3 }, settings, everywhere);
    expect(placements).toHaveLength(20);
    for (const [index, placement] of placements.entries()) {
      expect(Math.hypot(placement.x - 5, placement.z + 3)).toBeLessThanOrEqual(10);
      for (const other of placements.slice(index + 1)) expect(Math.hypot(placement.x - other.x, placement.z - other.z)).toBeGreaterThanOrEqual(2);
    }
  });

  it("places fewer when the area cannot hold more, and only on ground", () => {
    expect(scatterPlacements({ x: 0, z: 0 }, { ...DEFAULT_SCATTER, count: 100, radius: 2, spacing: 2 }, everywhere).length).toBeLessThan(10);
    const eastOnly = scatterPlacements({ x: 0, z: 0 }, { ...DEFAULT_SCATTER, count: 30 }, (x) => x > 0);
    expect(eastOnly.length).toBeGreaterThan(0);
    expect(eastOnly.every((placement) => placement.x > 0)).toBe(true);
    expect(scatterPlacements({ x: 0, z: 0 }, DEFAULT_SCATTER, () => false)).toEqual([]);
  });

  it("randomises rotation and scale only when asked, within the scale range", () => {
    const fixed = scatterPlacements({ x: 0, z: 0 }, { ...DEFAULT_SCATTER, randomRotation: false, randomScale: false }, everywhere);
    expect(fixed.every((placement) => placement.rotationY === 0 && placement.scale === 1)).toBe(true);
    const varied = scatterPlacements({ x: 0, z: 0 }, { ...DEFAULT_SCATTER, count: 40, radius: 20, scaleMin: 0.5, scaleMax: 2 }, everywhere);
    expect(varied.every((placement) => placement.scale >= 0.5 && placement.scale <= 2)).toBe(true);
    expect(new Set(varied.map((placement) => placement.rotationY)).size).toBe(varied.length);
  });
});
