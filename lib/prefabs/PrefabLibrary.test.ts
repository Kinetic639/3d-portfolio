import { describe, expect, it } from "vitest";
import { createPlacedEntity } from "@/lib/maps/map-entities";
import { validateMapDefinition, createBlankMapDefinition, cloneMapDefinition } from "@/lib/maps/map-definition";
import { BUILT_IN_PREFABS, BUILT_IN_PREFAB_VERSION, getPrefabDefinition } from "./prefab-library";
import { PREFAB_MATERIAL_ROLES } from "./prefab-materials";
import { resolvePrefabInstance } from "./prefab-resolver";

describe("prefab library", () => {
  it("defines stable, versioned, reusable prefab definitions", () => {
    expect(BUILT_IN_PREFABS.length).toBeGreaterThanOrEqual(100);

    const ids = new Set<string>();
    for (const prefab of BUILT_IN_PREFABS) {
      expect(prefab.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(ids.has(prefab.id)).toBe(false);
      ids.add(prefab.id);
      expect(prefab.version).toBe(BUILT_IN_PREFAB_VERSION);
      expect(prefab.parts.length).toBeGreaterThan(0);
      expect(prefab.variants.some((variant) => variant.id === prefab.defaultVariantId)).toBe(true);
      expect(prefab.footprint.width).toBeGreaterThan(0);
      expect(prefab.footprint.depth).toBeGreaterThan(0);
      expect(prefab.footprint.height).toBeGreaterThan(0);

      const partIds = new Set<string>();
      for (const part of prefab.parts) {
        expect(partIds.has(part.id)).toBe(false);
        partIds.add(part.id);
        expect(PREFAB_MATERIAL_ROLES).toContain(part.materialRole);
      }
    }
  });

  it("resolves prefab parts into transformed renderable primitives", () => {
    const prefab = getPrefabDefinition("building-mass");
    expect(prefab).not.toBeNull();
    const entity = createPlacedEntity({
      id: "building-instance",
      entityType: "prefab",
      primitiveType: "box",
      prefabId: "building-mass",
      prefabVersion: prefab?.version,
      variantId: "large",
      transform: {
        position: { x: 4, y: 0.5, z: -3 },
        rotation: { x: 0, y: Math.PI / 2, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      footprint: prefab?.footprint ?? { width: 1, depth: 1, height: 1 },
      collisionMode: prefab?.collisionMode ?? "blocking",
    });

    const resolved = resolvePrefabInstance(entity);
    expect(resolved.ok).toBe(true);
    expect(resolved.parts.length).toBe(prefab?.parts.length);
    expect(resolved.parts.every((part) => part.entityId === entity.id)).toBe(true);
    expect(resolved.parts.some((part) => part.transform.position.x !== 4 || part.transform.position.z !== -3)).toBe(true);
  });

  it("returns an explicit placeholder for missing prefab definitions", () => {
    const entity = createPlacedEntity({
      id: "missing",
      entityType: "prefab",
      primitiveType: "box",
      prefabId: "missing-prefab",
      prefabVersion: 1,
      variantId: "standard",
    });

    const resolved = resolvePrefabInstance(entity);
    expect(resolved.ok).toBe(false);
    expect(resolved.parts).toHaveLength(1);
    expect(resolved.parts[0].materialRole).toBe("selection-validation");
  });

  it("persists prefab instances through map validation and cloning", () => {
    const prefab = getPrefabDefinition("bench");
    expect(prefab).not.toBeNull();
    const map = createBlankMapDefinition({ id: "prefab-roundtrip", name: "Prefab Roundtrip", flatBaseLayer: true });
    map.entities = [createPlacedEntity({
      id: "bench-one",
      name: "Bench One",
      entityType: "prefab",
      primitiveType: "box",
      prefabId: "bench",
      prefabVersion: prefab?.version,
      variantId: prefab?.defaultVariantId,
      transform: { position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      footprint: prefab?.footprint ?? { width: 1, depth: 1, height: 1 },
      collisionMode: prefab?.collisionMode ?? "blocking",
      appearanceOverrides: { colors: { "wood-proxy": "#ffcc88" } },
    })];

    const validation = validateMapDefinition(map);
    expect(validation.ok).toBe(true);
    const clone = cloneMapDefinition(validation.ok ? validation.map : map);
    expect(clone.entities[0].entityType).toBe("prefab");
    expect(clone.entities[0].prefabId).toBe("bench");
    expect(clone.entities[0].appearanceOverrides?.colors?.["wood-proxy"]).toBe("#ffcc88");
  });
});
