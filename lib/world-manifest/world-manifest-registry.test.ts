import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORLD_MANIFEST_ID,
  listWorldManifestRegistryEntries,
  resolveWorldManifestSync,
  validateRegionMapReferences,
  validateWorldManifestRegistry,
} from "./world-manifest-registry";
import { createCenterOnlyWorldManifest } from "./world-manifest";

describe("world manifest registry", () => {
  it("validates bundled manifests and their map references", () => {
    expect(validateWorldManifestRegistry()).toEqual({ ok: true });
  });

  it("lists and resolves the center-only portfolio manifest", () => {
    expect(listWorldManifestRegistryEntries()).toEqual([{ id: DEFAULT_WORLD_MANIFEST_ID }]);
    expect(resolveWorldManifestSync(DEFAULT_WORLD_MANIFEST_ID).regions[0].mapId).toBe("portfolio-primary-flat");
  });

  it("rejects missing region map references", () => {
    const manifest = createCenterOnlyWorldManifest("missing-map");
    expect(() => validateRegionMapReferences(manifest)).toThrow(/unknown map missing-map/);
  });
});
