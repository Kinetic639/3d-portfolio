import { describe, expect, it } from "vitest";
import { createBlankMapDefinition } from "@/lib/maps/map-definition";
import { createPlacedEntity } from "@/lib/maps/map-entities";
import {
  addEntity,
  createEntityFromDraft,
  createPrefabEntityFromDraft,
  duplicateEntities,
  groupEntities,
  snapTransform,
  ungroupEntities,
  updateEntity,
  validateEntityPlacement,
} from "./entity-authoring";

describe("entity authoring", () => {
  it("creates stable IDs and preserves asset references during duplication", () => {
    const entity = createEntityFromDraft({
      name: "Contact Mailbox!",
      primitiveType: "box",
      color: "#ef4444",
      collisionMode: "blocking",
      assetReference: "future/contact-mailbox.glb",
      transform: {
        position: { x: 1, y: 1, z: 1 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    }, new Set());
    expect(entity.id).toBe("contact-mailbox");

    const map = addEntity(createBlankMapDefinition({ id: "entity-test", name: "Entity Test" }), entity);
    const duplicated = duplicateEntities(map, [entity.id]);
    expect(duplicated.entities).toHaveLength(2);
    expect(duplicated.entities[1].id).toBe("contact-mailbox-copy");
    expect(duplicated.entities[1].assetReference).toBe("future/contact-mailbox.glb");
    expect(duplicated.entities[1]).not.toBe(entity);
  });

  it("snaps transforms using editor precision settings", () => {
    expect(snapTransform({
      position: { x: 1.24, y: 0.26, z: -1.26 },
      rotation: { x: 0, y: 0.7, z: 0 },
      scale: { x: 1.26, y: 0.74, z: 2.24 },
    }, {
      positionStep: 0.5,
      rotationStep: Math.PI / 4,
      scaleStep: 0.5,
    })).toMatchObject({
      position: { x: 1, y: 0.5, z: -1.5 },
      scale: { x: 1.5, y: 0.5, z: 2 },
    });
  });

  it("detects invalid placement, duplicate IDs and overlapping entity bounds", () => {
    const map = addEntity(
      createBlankMapDefinition({ id: "validation-test", name: "Validation Test" }),
      createPlacedEntity({
        id: "building",
        transform: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 2, y: 2, z: 2 } },
        footprint: { width: 2, depth: 2, height: 2 },
        collisionMode: "blocking",
      }),
    );

    const duplicate = createPlacedEntity({
      id: "building",
      transform: { position: { x: 40, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    });
    expect(validateEntityPlacement(map, duplicate).severity).toBe("invalid");

    const overlap = createPlacedEntity({
      id: "tree",
      transform: { position: { x: 0.5, y: 1, z: 0.5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      collisionMode: "blocking",
    });
    expect(validateEntityPlacement(map, overlap).messages).toContain("Placement overlaps building.");
  });

  it("creates prefab entities and validates their collision footprint", () => {
    const base = createBlankMapDefinition({ id: "prefab-authoring", name: "Prefab Authoring", flatBaseLayer: true });
    const bench = createPrefabEntityFromDraft({
      name: "Bench",
      prefabId: "bench",
      variantId: "standard",
      transform: { position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    }, new Set());
    expect(bench.entityType).toBe("prefab");
    expect(bench.prefabVersion).toBe(1);

    const map = addEntity(base, bench);
    const overlap = createPrefabEntityFromDraft({
      name: "Bench",
      prefabId: "bench",
      variantId: "standard",
      transform: { position: { x: 0.2, y: 0.5, z: 0.2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    }, new Set(map.entities.map((entity) => entity.id)));
    expect(validateEntityPlacement(map, overlap).messages).toContain("Placement overlaps bench.");

    const helper = createPrefabEntityFromDraft({
      name: "Walk Node",
      prefabId: "walk-node",
      variantId: "standard",
      transform: { position: { x: 0.2, y: 0.5, z: 0.2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    }, new Set(map.entities.map((entity) => entity.id)));
    expect(validateEntityPlacement(map, helper).severity).toBe("valid");
  });

  it("updates properties and preserves world transforms when grouping and ungrouping", () => {
    const base = createBlankMapDefinition({ id: "group-test", name: "Group Test" });
    const trunk = createPlacedEntity({ id: "trunk", primitiveType: "cylinder", transform: { position: { x: 1, y: 1, z: 1 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 2, z: 1 } } });
    const canopy = createPlacedEntity({ id: "canopy", primitiveType: "sphere", transform: { position: { x: 1, y: 3, z: 1 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 2, y: 2, z: 2 } } });
    const map = groupEntities({ ...base, entities: [trunk, canopy] }, ["trunk", "canopy"], "tree", "Tree");
    const before = map.entities.map((entity) => entity.transform.position.y);
    const renamed = updateEntity(map, "trunk", (entity) => ({ ...entity, name: "Renamed trunk" }));
    const ungrouped = ungroupEntities(renamed, "tree");

    expect(renamed.entities.find((entity) => entity.id === "trunk")?.name).toBe("Renamed trunk");
    expect(ungrouped.entities.map((entity) => entity.transform.position.y)).toEqual(before);
    expect(ungrouped.entities.every((entity) => entity.groupId === undefined)).toBe(true);
  });
});
