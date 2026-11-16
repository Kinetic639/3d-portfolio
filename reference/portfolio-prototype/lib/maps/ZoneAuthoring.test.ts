import { describe, expect, it } from "vitest";
import { createBlankMapDefinition } from "./map-definition";
import { EDITOR_ZONE_COUNT, ensureEditableZones, resetEditableZone, updateEditableZone } from "./zone-authoring";

describe("zone authoring metadata", () => {
  it("creates ten editable zone slots for maps with no existing zones", () => {
    const map = ensureEditableZones(createBlankMapDefinition({ id: "zone-test", name: "Zone Test" }));

    expect(map.zones).toHaveLength(EDITOR_ZONE_COUNT);
    expect(map.zones.map((zone) => zone.numericId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(map.zones[0]).toMatchObject({
      id: "zone-1",
      label: "Zone 1",
      color: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      visibleInLegend: true,
      overlayVisible: true,
    });
  });

  it("preserves existing zone metadata and fills missing numeric slots", () => {
    const base = ensureEditableZones(createBlankMapDefinition({ id: "zone-test", name: "Zone Test" }));
    const updated = updateEditableZone(base, 3, {
      label: "Garden",
      shortLabel: "GDN",
      color: "#123456",
      description: "Quiet testing area",
      overlayVisible: false,
    });

    expect(updated.zones).toHaveLength(EDITOR_ZONE_COUNT);
    expect(updated.zones.find((zone) => zone.numericId === 3)).toMatchObject({
      label: "Garden",
      shortLabel: "GDN",
      color: "#123456",
      description: "Quiet testing area",
      overlayVisible: false,
    });
  });

  it("resets one editable zone back to its default slot metadata", () => {
    const base = ensureEditableZones(createBlankMapDefinition({ id: "zone-test", name: "Zone Test" }));
    const updated = updateEditableZone(base, 3, {
      label: "Garden",
      shortLabel: "GDN",
      color: "#123456",
      description: "Quiet testing area",
      visibleInLegend: false,
      overlayVisible: false,
      locked: true,
    });

    const reset = resetEditableZone(updated, 3);

    expect(reset.zones.find((zone) => zone.numericId === 3)).toMatchObject({
      id: "zone-3",
      label: "Zone 3",
      shortLabel: "Z3",
      description: "",
      visibleInLegend: true,
      overlayVisible: true,
      locked: false,
    });
    expect(reset.zones.find((zone) => zone.numericId === 3)?.color).not.toBe("#123456");
  });
});
