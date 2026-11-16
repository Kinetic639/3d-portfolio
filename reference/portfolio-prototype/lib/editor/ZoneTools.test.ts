import { describe, expect, it } from "vitest";
import { createFlatVoxelWorld } from "@/lib/world/voxel-world";
import { createZoneColumnChanges, getZoneRectangleFootprint } from "./zone-tools";

describe("zone area tools", () => {
  it("paints only unassigned columns", () => {
    const world = createFlatVoxelWorld();
    world.setColumnZone(2, 2, 3);

    const changes = createZoneColumnChanges({
      world,
      columns: [{ x: 1, y: 0, z: 2 }, { x: 2, y: 0, z: 2 }],
      mode: "paint",
      zoneId: 1,
    });

    expect(changes).toEqual([{ coordinate: { x: 1, y: 0, z: 2 }, before: 0, after: 1 }]);
  });

  it("replaces existing zone assignments", () => {
    const world = createFlatVoxelWorld();
    world.setColumnZone(2, 2, 3);

    const changes = createZoneColumnChanges({
      world,
      columns: [{ x: 2, y: 0, z: 2 }],
      mode: "replace",
      zoneId: 1,
    });

    expect(changes).toEqual([{ coordinate: { x: 2, y: 0, z: 2 }, before: 3, after: 1 }]);
  });

  it("erases zone assignments independently of terrain cells", () => {
    const world = createFlatVoxelWorld();
    world.setColumnZone(2, 2, 3);

    const changes = createZoneColumnChanges({
      world,
      columns: [{ x: 2, y: 0, z: 2 }],
      mode: "erase",
      zoneId: 1,
    });

    expect(changes).toEqual([{ coordinate: { x: 2, y: 0, z: 2 }, before: 3, after: 0 }]);
  });

  it("creates rectangular X/Z footprints", () => {
    expect(getZoneRectangleFootprint({ x: 2, y: 4, z: 3 }, { x: 4, y: 1, z: 4 })).toEqual([
      { x: 2, y: 1, z: 3 },
      { x: 3, y: 1, z: 3 },
      { x: 4, y: 1, z: 3 },
      { x: 2, y: 1, z: 4 },
      { x: 3, y: 1, z: 4 },
      { x: 4, y: 1, z: 4 },
    ]);
  });
});
