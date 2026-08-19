import { describe, expect, it } from "vitest";
import { createBlankMapDefinition } from "@/lib/maps/map-definition";
import { createCompleteWorldLayout } from "./world-layout-loader";
import { WORLD_REGION_IDS } from "./world-layout-types";
import { createWorldLayoutPackage, parseWorldLayoutPackage } from "./world-layout-package";

describe("world layout package", () => {
  it("round-trips one file containing all nine region maps", () => {
    const layout = createCompleteWorldLayout();
    const mapsByRegion = Object.fromEntries(layout.regions.map((region) => [
      region.id,
      createBlankMapDefinition({ id: region.mapId, name: region.id, flatBaseLayer: true }),
    ])) as Parameters<typeof createWorldLayoutPackage>[1];

    const parsed = parseWorldLayoutPackage(JSON.parse(JSON.stringify(createWorldLayoutPackage(layout, mapsByRegion))));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.package.layout.regions).toHaveLength(WORLD_REGION_IDS.length);
      expect(Object.keys(parsed.package.maps)).toHaveLength(WORLD_REGION_IDS.length);
    }
  });
});
