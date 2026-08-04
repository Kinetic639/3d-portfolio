import { describe, expect, it } from "vitest";
import { BUILT_IN_PREFABS } from "@/lib/prefabs/prefab-library";
import { resolvePrefabInstance } from "@/lib/prefabs/prefab-resolver";
import { createPlacedEntity } from "@/lib/maps/map-entities";
import { listMapRegistryEntries, loadMapStateSync, validateMapRegistry } from "./map-registry";

describe("map registry", () => {
  it("validates all bundled maps including prefab fixtures", () => {
    expect(validateMapRegistry()).toEqual({ ok: true });
  });

  it("exposes development prefab catalog and stress maps", () => {
    const entries = listMapRegistryEntries({ includeDevelopment: true });
    expect(entries.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "phase49-prefab-catalog",
      "phase49-prefab-density-test",
      "phase49-prefab-repetition-stress",
      "phase49-prefab-diversity-stress",
      "phase49-prefab-maximum-stress",
    ]));
  });

  it("loads the prefab catalog map with every built-in prefab represented", () => {
    const state = loadMapStateSync("phase49-prefab-catalog", { includeDevelopment: true });
    const prefabIds = new Set(state.definition.entities.map((entity) => entity.prefabId).filter(Boolean));
    for (const prefab of BUILT_IN_PREFABS) {
      expect(prefabIds.has(prefab.id)).toBe(true);
    }
  });

  it("loads the maximum stress map as placed prefab instances", () => {
    const state = loadMapStateSync("phase49-prefab-maximum-stress", { includeDevelopment: true });
    expect(state.definition.entities.length).toBeGreaterThanOrEqual(900);
    expect(state.definition.entities.every((entity) => entity.entityType === "prefab" && entity.prefabId)).toBe(true);
  });

  it("keeps the enter signpost as object 0 and resolves its tilted sign parts", () => {
    const prefab = BUILT_IN_PREFABS[0];
    expect(prefab).toMatchObject({
      id: "enter-signpost",
      name: "Enter Signpost",
      category: "portfolio",
      collisionMode: "trigger",
    });

    const entity = createPlacedEntity({
      id: "enter-signpost-test",
      entityType: "prefab",
      primitiveType: "box",
      prefabId: prefab.id,
      prefabVersion: prefab.version,
      variantId: prefab.defaultVariantId,
    });
    const resolved = resolvePrefabInstance(entity);
    expect(resolved.ok).toBe(true);
    expect(resolved.parts.map((part) => part.partId)).toEqual(expect.arrayContaining([
      "pole",
      "tilted-enter-board",
      "enter-highlight",
    ]));
    expect(resolved.parts.find((part) => part.partId === "tilted-enter-board")?.transform.rotation.z).toBeLessThan(0);
  });
});
