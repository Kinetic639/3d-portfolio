import { describe, expect, it } from "vitest";
import { drawRelief } from "./minimap-image";
import { traceZone } from "./minimap";

describe("minimap", () => {
  // A 4 x 3 grid: zone 2 is an L of four cells.
  const zones = new Uint8Array([
    2, 2, 0, 0,
    2, 0, 0, 0,
    2, 0, 0, 1,
  ]);
  const columns = { width: 4, depth: 3, zones };

  it("traces a zone as rows of cells and its outline as joined edges", () => {
    const shape = traceZone(columns, 2)!;
    expect(shape.area).toBe("M0 0h2v1h-2zM0 1h1v1h-1zM0 2h1v1h-1z");
    expect(shape.bounds).toEqual({ minX: 0, maxX: 2, minZ: 0, maxZ: 3 });
    // The outline is closed: every edge of the L, with the long sides joined.
    expect(shape.outline).toContain("M0 0h2");
    expect(shape.outline).toContain("M0 0v3");
    // The label sits in a cell of the zone, at its centre.
    expect(zones[Math.floor(shape.labelX) + 4 * Math.floor(shape.labelZ)]).toBe(2);
    expect(traceZone(columns, 9)).toBeNull();
  });

  it("draws each column in its texture's colour, shaded by the steps around it", () => {
    const heights = new Int16Array([2, 2, 2, 2, 2, 5, 2, 2, 2, 2, 2, 2]);
    const textures = new Uint8Array(12).fill(1);
    const pixels = drawRelief({ width: 4, depth: 3, offsetX: 0, offsetZ: 0, heights, textures, zones }, new Map([[1, [100, 150, 50]]]), 2);
    expect(pixels.length).toBe(4 * 2 * 3 * 2 * 3);
    const at = (x: number, y: number) => pixels[(y * 8 + x) * 3 + 1];
    // The raised cell's inner pixel is not darker than flat ground; its top-left edge pixel is.
    expect(at(3, 3)).toBeGreaterThanOrEqual(at(7, 5));
    expect(at(2, 2)).toBeLessThan(at(3, 3));
  });
});
