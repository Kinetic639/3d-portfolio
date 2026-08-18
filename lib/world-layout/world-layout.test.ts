import { describe, expect, it } from "vitest";
import { WORLD_REGION_IDS } from "./world-layout-types";
import {
  WORLD_REGION_SLOTS,
  createCenterOnlyWorldLayout,
  getWorldRegionSlot,
  validateWorldLayoutDefinition,
} from "./world-region";

describe("world layout contracts", () => {
  it("defines all nine immutable region slots with unique offsets", () => {
    expect(WORLD_REGION_IDS).toHaveLength(9);
    expect(Object.isFrozen(WORLD_REGION_SLOTS)).toBe(true);

    const offsets = WORLD_REGION_IDS.map((id) => {
      const slot = getWorldRegionSlot(id);
      expect(Object.isFrozen(slot)).toBe(true);
      expect(Object.isFrozen(slot.offset)).toBe(true);
      return `${slot.offset.x},${slot.offset.z}`;
    });

    expect(new Set(offsets).size).toBe(9);
    expect(getWorldRegionSlot("center")).toEqual({ id: "center", role: "playable", offset: { x: 0, z: 0 } });
  });

  it("accepts a center-only compatibility layout", () => {
    const layout = createCenterOnlyWorldLayout({
      id: "portfolio-world",
      name: "Portfolio World",
      centerMapId: "portfolio-primary-flat",
    });

    expect(validateWorldLayoutDefinition(layout)).toEqual({ ok: true, layout });
  });

  it("accepts a complete 3x3 layout", () => {
    const result = validateWorldLayoutDefinition({
      schemaVersion: 1,
      id: "complete-world",
      name: "Complete World",
      regions: WORLD_REGION_IDS.map((id) => ({
        id,
        role: WORLD_REGION_SLOTS[id].role,
        mapId: `portfolio-${id}`,
      })),
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.layout.regions).toHaveLength(9);
  });

  it("rejects duplicate region ids and map ids", () => {
    const result = validateWorldLayoutDefinition({
      schemaVersion: 1,
      id: "invalid-world",
      name: "Invalid World",
      regions: [
        { id: "center", role: "playable", mapId: "same-map" },
        { id: "center", role: "playable", mapId: "same-map" },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("Duplicate world region id: center.");
      expect(result.errors).toContain("Duplicate world region mapId: same-map.");
    }
  });

  it("rejects missing center, unknown ids, and incorrect roles", () => {
    const missingCenter = validateWorldLayoutDefinition({
      schemaVersion: 1,
      id: "missing-center",
      name: "Missing Center",
      regions: [{ id: "north", role: "playable", mapId: "north-map" }],
    });
    const unknownRegion = validateWorldLayoutDefinition({
      schemaVersion: 1,
      id: "unknown-region",
      name: "Unknown Region",
      regions: [{ id: "outer-space", role: "scenery", mapId: "space-map" }],
    });

    expect(missingCenter.ok).toBe(false);
    if (!missingCenter.ok) {
      expect(missingCenter.errors).toContain("World region north must have role scenery.");
      expect(missingCenter.errors).toContain("World layout must include the center region.");
    }
    expect(unknownRegion.ok).toBe(false);
  });
});
