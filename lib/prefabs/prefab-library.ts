import type { CollisionMode, EntityFootprint, PrimitiveType } from "@/lib/maps/map-entities";
import type { PrefabCategory, PrefabDefinition, PrefabMaterialRole, PrefabPartDefinition, PrefabSize, PrefabVariantDefinition } from "./prefab-types";

const ZERO_ROTATION = { x: 0, y: 0, z: 0 };
const UNIT_SCALE = { x: 1, y: 1, z: 1 };

type CatalogSeed = {
  name: string;
  category: PrefabCategory;
  archetype: PrefabArchetype;
  collisionMode?: CollisionMode;
  footprint?: EntityFootprint;
  tags?: string[];
  variants?: Array<{ id: string; label: string; size: PrefabSize; scale: { x: number; y: number; z: number }; footprint?: EntityFootprint }>;
  futureAssetSlot?: string;
};

type PrefabArchetype =
  | "building"
  | "workshop-compound"
  | "studio-compound"
  | "communication-station"
  | "pavilion"
  | "wall"
  | "wall-window"
  | "wall-door"
  | "gate"
  | "platform"
  | "path-section"
  | "round-platform"
  | "steps"
  | "bridge"
  | "fence"
  | "garden-bed"
  | "path-detail"
  | "bench"
  | "post"
  | "board"
  | "orientation-monument"
  | "zone-board"
  | "container"
  | "mailbox-bank"
  | "tree"
  | "tree-wide"
  | "tree-columnar"
  | "fallen-log"
  | "tree-stump"
  | "bush"
  | "shrub-low"
  | "rock"
  | "rock-stack"
  | "crate-stack"
  | "bike-rack"
  | "barrier"
  | "desk"
  | "workbench-rich"
  | "monitor-desk"
  | "chair"
  | "screen"
  | "paper-stack"
  | "display-rack"
  | "landmark"
  | "timeline-arch"
  | "milestone-station"
  | "skill-garden-landmark"
  | "person-scale-marker"
  | "navigation-anchor"
  // Converted from voxel terrain shapes (see docs/world-registry-refactor-audit.md
  // section "Shapes that must become placeable objects"). Each preserves the
  // original shape's approximate bounds as a box/cylinder-primitive
  // composition, at the same fidelity level as the existing archetypes.
  | "voxel-wall"
  | "voxel-beam"
  | "voxel-pillar-base"
  | "voxel-pillar-middle"
  | "voxel-pillar-cap"
  | "voxel-roof-flat"
  | "voxel-roof-shallow"
  | "voxel-roof-steep"
  | "voxel-roof-outer-corner"
  | "voxel-roof-inner-corner"
  | "voxel-roof-hollow"
  | "voxel-roof-gable"
  | "voxel-fence-line"
  | "voxel-fence-post"
  | "voxel-fence-corner"
  | "voxel-fence-t"
  | "voxel-fence-cross"
  | "voxel-fence-gate"
  | "voxel-pipe-short"
  | "voxel-pipe-long"
  | "voxel-pipe-corner"
  | "voxel-pipe"
  | "voxel-wooden-wall-full"
  | "voxel-wooden-wall-end"
  | "voxel-wooden-wall-corner"
  | "voxel-wooden-wall-t"
  | "voxel-wooden-wall-cross"
  | "voxel-wooden-wall-gate"
  | "voxel-solid-wooden-wall-full"
  | "voxel-solid-wooden-wall-end"
  | "voxel-solid-wooden-wall-corner"
  | "voxel-solid-wooden-wall-t"
  | "voxel-solid-wooden-wall-cross"
  | "voxel-solid-wooden-wall-gate"
  | "voxel-retaining-wall-low"
  | "voxel-rubble-small"
  | "voxel-rubble-medium"
  | "voxel-stalactite-small"
  | "voxel-stalactite-large"
  | "voxel-crystal-small"
  | "voxel-crystal-medium"
  | "voxel-crystal-large"
  | "voxel-ice-chunks"
  | "voxel-ice-chunks-medium"
  | "voxel-icicles"
  | "voxel-icicles-large";

export const BUILT_IN_PREFAB_VERSION = 1;

function createPrefabLibrary(): PrefabDefinition[] {
  const ids = new Set<string>();
  return CATALOG_SEEDS.map((seed) => {
    const prefab = createPrefabDefinition(seed);
    if (!ids.has(prefab.id)) {
      ids.add(prefab.id);
      return prefab;
    }

    const categoryId = stableId(`${seed.category} ${seed.name}`);
    if (!ids.has(categoryId)) {
      ids.add(categoryId);
      return { ...prefab, id: categoryId };
    }

    let index = 2;
    let nextId = `${categoryId}-${index}`;
    while (ids.has(nextId)) {
      index += 1;
      nextId = `${categoryId}-${index}`;
    }
    ids.add(nextId);
    return { ...prefab, id: nextId };
  });
}

function createPrefabDefinition(seed: CatalogSeed): PrefabDefinition {
  const parts = createArchetypeParts(seed.archetype);
  const footprint = seed.footprint ?? inferFootprint(seed.archetype);
  const variants = seed.variants ?? [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE, footprint }];

  return {
    id: stableId(seed.name),
    version: BUILT_IN_PREFAB_VERSION,
    name: seed.name,
    description: `${seed.name} gray-box prefab composed from shared primitive parts.`,
    category: seed.category,
    parts,
    variants: variants.map((variant): PrefabVariantDefinition => ({
      id: variant.id,
      label: variant.label,
      size: variant.size,
      scale: { ...variant.scale },
      footprintOverride: variant.footprint,
    })),
    defaultVariantId: variants[0].id,
    footprint,
    collisionMode: seed.collisionMode ?? inferCollisionMode(seed.archetype),
    placement: {
      anchor: "bottom",
      snapToGrid: true,
      surfaceAttached: true,
      allowedRotations: [0, 90, 180, 270],
    },
    tags: seed.tags ?? [seed.category, seed.archetype],
    futureAssetSlot: seed.futureAssetSlot,
  };
}

function createArchetypeParts(archetype: PrefabArchetype): PrefabPartDefinition[] {
  switch (archetype) {
    case "building":
      return [
        part("mass", "box", { x: 0, y: 1, z: 0 }, { x: 2.8, y: 2, z: 2 }, "structure-light"),
        part("roof", "platform", { x: 0, y: 2.08, z: 0 }, { x: 3, y: 0.18, z: 2.2 }, "structure-dark"),
        part("door", "box", { x: 0, y: 0.5, z: -1.03 }, { x: 0.55, y: 1, z: 0.08 }, "accent-blue"),
      ];
    case "workshop-compound":
      return [
        part("foundation", "platform", { x: 0, y: 0.11, z: 0 }, { x: 6.8, y: 0.22, z: 5.4 }, "path-proxy"),
        part("main-volume", "box", { x: -0.8, y: 1.35, z: 0.15 }, { x: 4.2, y: 2.7, z: 3.5 }, "wood-proxy"),
        part("side-volume", "box", { x: 2.05, y: 1, z: 0.6 }, { x: 1.65, y: 2, z: 2.4 }, "structure-light"),
        part("tall-bay", "box", { x: -2.45, y: 1.75, z: -0.25 }, { x: 1.3, y: 3.5, z: 2.8 }, "structure-light"),
        part("roof-main", "platform", { x: -0.8, y: 2.85, z: 0.15 }, { x: 4.55, y: 0.24, z: 3.85 }, "structure-dark"),
        part("roof-side", "platform", { x: 2.05, y: 2.1, z: 0.6 }, { x: 1.9, y: 0.22, z: 2.7 }, "structure-dark"),
        part("porch-canopy", "platform", { x: -0.25, y: 2.25, z: -2.55 }, { x: 2.8, y: 0.16, z: 1 }, "structure-dark"),
        part("door", "box", { x: -0.45, y: 0.95, z: -1.66 }, { x: 0.8, y: 1.9, z: 0.12 }, "accent-blue"),
        part("window-a", "box", { x: -2, y: 1.65, z: -1.66 }, { x: 0.65, y: 0.55, z: 0.1 }, "paper"),
        part("window-b", "box", { x: 1.05, y: 1.45, z: -1.66 }, { x: 0.65, y: 0.5, z: 0.1 }, "paper"),
        part("beam-a", "box", { x: -1.55, y: 1.05, z: -2.55 }, { x: 0.14, y: 2.1, z: 0.14 }, "metal-proxy"),
        part("beam-b", "box", { x: 1.1, y: 1.05, z: -2.55 }, { x: 0.14, y: 2.1, z: 0.14 }, "metal-proxy"),
      ];
    case "studio-compound":
      return [
        part("terrace", "platform", { x: 0, y: 0.11, z: 0 }, { x: 5.6, y: 0.22, z: 4.4 }, "path-proxy"),
        part("studio-main", "box", { x: -0.55, y: 1.15, z: 0.25 }, { x: 3.4, y: 2.3, z: 2.7 }, "structure-light"),
        part("quiet-nook", "box", { x: 1.75, y: 0.9, z: 0.75 }, { x: 1.55, y: 1.8, z: 1.9 }, "wood-proxy"),
        part("flat-roof", "platform", { x: -0.55, y: 2.42, z: 0.25 }, { x: 3.7, y: 0.2, z: 3 }, "structure-dark"),
        part("nook-roof", "platform", { x: 1.75, y: 1.94, z: 0.75 }, { x: 1.8, y: 0.18, z: 2.15 }, "structure-dark"),
        part("entry", "box", { x: -0.75, y: 0.85, z: -1.15 }, { x: 0.75, y: 1.7, z: 0.12 }, "accent-yellow"),
        part("window-long", "box", { x: 0.65, y: 1.45, z: -1.15 }, { x: 1.15, y: 0.5, z: 0.1 }, "paper"),
        part("porch-slab", "platform", { x: -0.65, y: 0.22, z: -2.15 }, { x: 2.6, y: 0.18, z: 1.1 }, "wood-proxy"),
        part("porch-post-a", "box", { x: -1.75, y: 1, z: -2.15 }, { x: 0.14, y: 2, z: 0.14 }, "wood-proxy"),
        part("porch-post-b", "box", { x: 0.35, y: 1, z: -2.15 }, { x: 0.14, y: 2, z: 0.14 }, "wood-proxy"),
      ];
    case "communication-station":
      return [
        part("forecourt", "platform", { x: 0, y: 0.1, z: 0 }, { x: 4.8, y: 0.2, z: 4 }, "path-proxy"),
        part("counter-building", "box", { x: -0.8, y: 1.05, z: 0.2 }, { x: 2.8, y: 2.1, z: 2.4 }, "structure-light"),
        part("mail-annex", "box", { x: 1.45, y: 0.8, z: 0.65 }, { x: 1.3, y: 1.6, z: 1.5 }, "wood-proxy"),
        part("roof", "platform", { x: -0.45, y: 2.25, z: 0.15 }, { x: 4.2, y: 0.22, z: 2.8 }, "structure-dark"),
        part("service-window", "box", { x: -1, y: 1.2, z: -1.04 }, { x: 1.1, y: 0.65, z: 0.1 }, "paper"),
        part("door", "box", { x: 0.65, y: 0.8, z: -1.04 }, { x: 0.65, y: 1.6, z: 0.1 }, "accent-yellow"),
        part("mast", "cylinder", { x: 2.35, y: 2.2, z: 1.35 }, { x: 0.14, y: 4.4, z: 0.14 }, "metal-proxy"),
        part("signal-a", "box", { x: 2.35, y: 3.8, z: 1.35 }, { x: 1.25, y: 0.08, z: 0.08 }, "accent-blue"),
        part("signal-b", "box", { x: 2.35, y: 3.25, z: 1.35 }, { x: 0.95, y: 0.08, z: 0.08 }, "accent-blue"),
      ];
    case "pavilion":
      return [
        part("deck", "platform", { x: 0, y: 0.08, z: 0 }, { x: 2.6, y: 0.16, z: 2.2 }, "wood-proxy"),
        part("roof", "platform", { x: 0, y: 1.75, z: 0 }, { x: 2.9, y: 0.18, z: 2.5 }, "structure-dark"),
        part("post-a", "cylinder", { x: -1, y: 0.85, z: -0.8 }, { x: 0.16, y: 1.6, z: 0.16 }, "wood-proxy"),
        part("post-b", "cylinder", { x: 1, y: 0.85, z: -0.8 }, { x: 0.16, y: 1.6, z: 0.16 }, "wood-proxy"),
        part("post-c", "cylinder", { x: -1, y: 0.85, z: 0.8 }, { x: 0.16, y: 1.6, z: 0.16 }, "wood-proxy"),
        part("post-d", "cylinder", { x: 1, y: 0.85, z: 0.8 }, { x: 0.16, y: 1.6, z: 0.16 }, "wood-proxy"),
      ];
    case "wall":
      return [part("wall", "box", { x: 0, y: 0.7, z: 0 }, { x: 3, y: 1.4, z: 0.22 }, "structure-light")];
    case "wall-window":
      return [
        part("wall-left", "box", { x: -1.05, y: 0.8, z: 0 }, { x: 0.9, y: 1.6, z: 0.22 }, "structure-light"),
        part("wall-right", "box", { x: 1.05, y: 0.8, z: 0 }, { x: 0.9, y: 1.6, z: 0.22 }, "structure-light"),
        part("sill", "box", { x: 0, y: 0.45, z: 0 }, { x: 1, y: 0.16, z: 0.24 }, "structure-dark"),
        part("lintel", "box", { x: 0, y: 1.35, z: 0 }, { x: 1, y: 0.16, z: 0.24 }, "structure-dark"),
        part("window", "box", { x: 0, y: 0.9, z: -0.02 }, { x: 0.78, y: 0.7, z: 0.08 }, "paper"),
      ];
    case "wall-door":
      return [
        part("wall-left", "box", { x: -1.05, y: 0.85, z: 0 }, { x: 0.85, y: 1.7, z: 0.22 }, "structure-light"),
        part("wall-right", "box", { x: 1.05, y: 0.85, z: 0 }, { x: 0.85, y: 1.7, z: 0.22 }, "structure-light"),
        part("lintel", "box", { x: 0, y: 1.75, z: 0 }, { x: 1.05, y: 0.2, z: 0.24 }, "structure-dark"),
        part("door", "box", { x: 0, y: 0.82, z: -0.02 }, { x: 0.78, y: 1.64, z: 0.08 }, "accent-blue"),
      ];
    case "gate":
      return [
        part("left-post", "box", { x: -0.75, y: 0.9, z: 0 }, { x: 0.25, y: 1.8, z: 0.25 }, "structure-dark"),
        part("right-post", "box", { x: 0.75, y: 0.9, z: 0 }, { x: 0.25, y: 1.8, z: 0.25 }, "structure-dark"),
        part("lintel", "box", { x: 0, y: 1.75, z: 0 }, { x: 1.8, y: 0.25, z: 0.25 }, "structure-light"),
      ];
    case "platform":
      return [part("platform", "platform", { x: 0, y: 0.08, z: 0 }, { x: 2, y: 0.16, z: 2 }, "path-proxy")];
    case "path-section":
      return [
        part("surface", "platform", { x: 0, y: 0.06, z: 0 }, { x: 3, y: 0.12, z: 1.2 }, "path-proxy"),
        part("left-curb", "box", { x: 0, y: 0.16, z: -0.68 }, { x: 3, y: 0.18, z: 0.12 }, "structure-dark"),
        part("right-curb", "box", { x: 0, y: 0.16, z: 0.68 }, { x: 3, y: 0.18, z: 0.12 }, "structure-dark"),
      ];
    case "round-platform":
      return [part("round", "cylinder", { x: 0, y: 0.08, z: 0 }, { x: 2.5, y: 0.16, z: 2.5 }, "path-proxy")];
    case "steps":
      return [
        part("step-a", "box", { x: 0, y: 0.08, z: -0.45 }, { x: 1.6, y: 0.16, z: 0.45 }, "structure-light"),
        part("step-b", "box", { x: 0, y: 0.24, z: 0 }, { x: 1.6, y: 0.32, z: 0.45 }, "structure-light"),
        part("step-c", "box", { x: 0, y: 0.4, z: 0.45 }, { x: 1.6, y: 0.48, z: 0.45 }, "structure-light"),
      ];
    case "bridge":
      return [
        part("deck", "platform", { x: 0, y: 0.18, z: 0 }, { x: 3.2, y: 0.22, z: 1.1 }, "wood-proxy"),
        part("rail-a", "box", { x: 0, y: 0.62, z: -0.62 }, { x: 3.2, y: 0.16, z: 0.12 }, "metal-proxy"),
        part("rail-b", "box", { x: 0, y: 0.62, z: 0.62 }, { x: 3.2, y: 0.16, z: 0.12 }, "metal-proxy"),
      ];
    case "fence":
      return [
        part("rail", "box", { x: 0, y: 0.65, z: 0 }, { x: 2.3, y: 0.12, z: 0.12 }, "wood-proxy"),
        part("post-a", "box", { x: -1.05, y: 0.45, z: 0 }, { x: 0.16, y: 0.9, z: 0.16 }, "wood-proxy"),
        part("post-b", "box", { x: 1.05, y: 0.45, z: 0 }, { x: 0.16, y: 0.9, z: 0.16 }, "wood-proxy"),
      ];
    case "garden-bed":
      return [
        part("soil", "platform", { x: 0, y: 0.08, z: 0 }, { x: 2.4, y: 0.16, z: 1.4 }, "terrain-neutral"),
        part("edge-n", "box", { x: 0, y: 0.22, z: -0.78 }, { x: 2.5, y: 0.28, z: 0.16 }, "wood-proxy"),
        part("edge-s", "box", { x: 0, y: 0.22, z: 0.78 }, { x: 2.5, y: 0.28, z: 0.16 }, "wood-proxy"),
        part("edge-w", "box", { x: -1.28, y: 0.22, z: 0 }, { x: 0.16, y: 0.28, z: 1.4 }, "wood-proxy"),
        part("edge-e", "box", { x: 1.28, y: 0.22, z: 0 }, { x: 0.16, y: 0.28, z: 1.4 }, "wood-proxy"),
      ];
    case "path-detail":
      return [part("detail", "plane", { x: 0, y: 0.025, z: 0 }, { x: 1.4, y: 1, z: 0.4 }, "path-proxy")];
    case "bench":
      return [
        part("seat", "box", { x: 0, y: 0.45, z: 0 }, { x: 1.4, y: 0.16, z: 0.45 }, "wood-proxy"),
        part("back", "box", { x: 0, y: 0.78, z: 0.24 }, { x: 1.4, y: 0.48, z: 0.12 }, "wood-proxy"),
        part("leg-a", "box", { x: -0.5, y: 0.22, z: 0 }, { x: 0.12, y: 0.45, z: 0.12 }, "metal-proxy"),
        part("leg-b", "box", { x: 0.5, y: 0.22, z: 0 }, { x: 0.12, y: 0.45, z: 0.12 }, "metal-proxy"),
      ];
    case "post":
      return [
        part("post", "cylinder", { x: 0, y: 0.8, z: 0 }, { x: 0.16, y: 1.6, z: 0.16 }, "metal-proxy"),
        part("cap", "sphere", { x: 0, y: 1.65, z: 0 }, { x: 0.34, y: 0.34, z: 0.34 }, "accent-yellow"),
      ];
    case "board":
      return [
        part("post-a", "box", { x: -0.45, y: 0.65, z: 0 }, { x: 0.12, y: 1.3, z: 0.12 }, "wood-proxy"),
        part("post-b", "box", { x: 0.45, y: 0.65, z: 0 }, { x: 0.12, y: 1.3, z: 0.12 }, "wood-proxy"),
        part("board", "box", { x: 0, y: 1.15, z: 0 }, { x: 1.2, y: 0.7, z: 0.12 }, "sign-board"),
      ];
    case "orientation-monument":
      return [
        part("stepped-base-large", "cylinder", { x: 0, y: 0.12, z: 0 }, { x: 2.4, y: 0.24, z: 2.4 }, "structure-dark"),
        part("stepped-base-small", "cylinder", { x: 0, y: 0.34, z: 0 }, { x: 1.75, y: 0.2, z: 1.75 }, "path-proxy"),
        part("obelisk", "box", { x: 0, y: 1.55, z: 0 }, { x: 0.78, y: 2.4, z: 0.78 }, "structure-light"),
        part("cap", "sphere", { x: 0, y: 2.92, z: 0 }, { x: 0.75, y: 0.38, z: 0.75 }, "accent-blue"),
        part("pointer-n", "box", { x: 0, y: 1.45, z: -0.95 }, { x: 0.25, y: 0.18, z: 1.1 }, "accent-yellow"),
        part("pointer-e", "box", { x: 0.95, y: 1.25, z: 0 }, { x: 1.1, y: 0.18, z: 0.25 }, "accent-yellow"),
      ];
    case "zone-board":
      return [
        part("base", "box", { x: 0, y: 0.1, z: 0 }, { x: 1.7, y: 0.2, z: 0.45 }, "structure-dark"),
        part("post-a", "box", { x: -0.62, y: 0.8, z: 0 }, { x: 0.14, y: 1.6, z: 0.14 }, "wood-proxy"),
        part("post-b", "box", { x: 0.62, y: 0.8, z: 0 }, { x: 0.14, y: 1.6, z: 0.14 }, "wood-proxy"),
        part("panel", "box", { x: 0, y: 1.35, z: 0 }, { x: 1.8, y: 0.9, z: 0.14 }, "sign-board"),
        part("header", "box", { x: 0, y: 1.88, z: -0.02 }, { x: 1.55, y: 0.14, z: 0.1 }, "accent-yellow"),
      ];
    case "container":
      return [part("container", "box", { x: 0, y: 0.45, z: 0 }, { x: 0.8, y: 0.9, z: 0.8 }, "metal-proxy")];
    case "crate-stack":
      return [
        part("crate-a", "box", { x: -0.13, y: 0.32, z: 0.08 }, { x: 0.64, y: 0.64, z: 0.64 }, "wood-proxy"),
        part("crate-b", "box", { x: 0.19, y: 0.32, z: -0.14 }, { x: 0.6, y: 0.6, z: 0.6 }, "wood-proxy"),
        part("crate-c", "box", { x: 0.02, y: 0.86, z: -0.02 }, { x: 0.52, y: 0.52, z: 0.52 }, "wood-proxy"),
      ];
    case "bike-rack":
      return [
        part("rail", "box", { x: 0, y: 0.34, z: 0 }, { x: 1.2, y: 0.06, z: 0.06 }, "metal-proxy"),
        part("hoop-a", "box", { x: -0.4, y: 0.34, z: 0 }, { x: 0.06, y: 0.68, z: 0.06 }, "metal-proxy"),
        part("hoop-b", "box", { x: 0, y: 0.34, z: 0 }, { x: 0.06, y: 0.68, z: 0.06 }, "metal-proxy"),
        part("hoop-c", "box", { x: 0.4, y: 0.34, z: 0 }, { x: 0.06, y: 0.68, z: 0.06 }, "metal-proxy"),
      ];
    case "barrier":
      return [
        part("panel", "box", { x: 0, y: 0.42, z: 0 }, { x: 1.1, y: 0.5, z: 0.06 }, "accent-orange"),
        part("leg-a", "box", { x: -0.42, y: 0.14, z: 0 }, { x: 0.1, y: 0.28, z: 0.32 }, "structure-dark"),
        part("leg-b", "box", { x: 0.42, y: 0.14, z: 0 }, { x: 0.1, y: 0.28, z: 0.32 }, "structure-dark"),
      ];
    case "mailbox-bank":
      return [
        part("rail", "box", { x: 0, y: 0.75, z: 0 }, { x: 2.4, y: 0.12, z: 0.16 }, "metal-proxy"),
        part("box-a", "box", { x: -0.8, y: 1.05, z: 0 }, { x: 0.55, y: 0.48, z: 0.42 }, "accent-yellow"),
        part("box-b", "box", { x: 0, y: 1.05, z: 0 }, { x: 0.55, y: 0.48, z: 0.42 }, "accent-blue"),
        part("box-c", "box", { x: 0.8, y: 1.05, z: 0 }, { x: 0.55, y: 0.48, z: 0.42 }, "accent-green"),
        part("post-a", "box", { x: -1.05, y: 0.45, z: 0 }, { x: 0.12, y: 0.9, z: 0.12 }, "metal-proxy"),
        part("post-b", "box", { x: 1.05, y: 0.45, z: 0 }, { x: 0.12, y: 0.9, z: 0.12 }, "metal-proxy"),
      ];
    case "tree":
      return [
        part("trunk", "cylinder", { x: 0, y: 0.7, z: 0 }, { x: 0.22, y: 1.4, z: 0.22 }, "vegetation-trunk"),
        part("canopy", "sphere", { x: 0, y: 1.65, z: 0 }, { x: 1.1, y: 0.9, z: 1.1 }, "vegetation-canopy"),
      ];
    case "tree-wide":
      return [
        part("trunk", "cylinder", { x: 0, y: 0.75, z: 0 }, { x: 0.28, y: 1.5, z: 0.28 }, "vegetation-trunk"),
        part("canopy-low", "sphere", { x: -0.35, y: 1.55, z: 0.1 }, { x: 1.3, y: 0.75, z: 1.1 }, "vegetation-canopy"),
        part("canopy-high", "sphere", { x: 0.35, y: 2.05, z: -0.1 }, { x: 1.1, y: 0.85, z: 1.25 }, "foliage-light"),
      ];
    case "tree-columnar":
      return [
        part("trunk", "cylinder", { x: 0, y: 0.95, z: 0 }, { x: 0.18, y: 1.9, z: 0.18 }, "vegetation-trunk"),
        part("canopy-a", "sphere", { x: 0, y: 1.8, z: 0 }, { x: 0.75, y: 1.2, z: 0.75 }, "vegetation-canopy"),
        part("canopy-b", "sphere", { x: 0, y: 2.5, z: 0 }, { x: 0.55, y: 0.9, z: 0.55 }, "foliage-light"),
      ];
    case "fallen-log":
      return [
        {
          id: "log",
          primitive: "cylinder",
          materialRole: "vegetation-trunk",
          selectable: true,
          transform: {
            position: { x: 0, y: 0.17, z: 0 },
            rotation: { x: 0, y: 0, z: Math.PI / 2 },
            scale: { x: 0.34, y: 1.5, z: 0.34 },
          },
        },
        {
          id: "stub",
          primitive: "cylinder",
          materialRole: "vegetation-trunk",
          selectable: true,
          transform: {
            position: { x: -0.6, y: 0.2, z: 0.14 },
            rotation: { x: 0, y: 0.5, z: Math.PI / 2.4 },
            scale: { x: 0.14, y: 0.4, z: 0.14 },
          },
        },
      ];
    case "tree-stump":
      return [
        part("stump", "cylinder", { x: 0, y: 0.18, z: 0 }, { x: 0.5, y: 0.36, z: 0.5 }, "vegetation-trunk"),
        part("cut-top", "cylinder", { x: 0, y: 0.37, z: 0 }, { x: 0.46, y: 0.04, z: 0.46 }, "terrain-neutral"),
      ];
    case "bush":
      return [
        part("bush-a", "sphere", { x: -0.22, y: 0.38, z: 0 }, { x: 0.75, y: 0.55, z: 0.75 }, "vegetation-canopy"),
        part("bush-b", "sphere", { x: 0.28, y: 0.32, z: 0.08 }, { x: 0.65, y: 0.48, z: 0.65 }, "foliage-light"),
      ];
    case "shrub-low":
      return [
        part("leaf-a", "sphere", { x: -0.35, y: 0.28, z: 0.05 }, { x: 0.7, y: 0.42, z: 0.55 }, "vegetation-canopy"),
        part("leaf-b", "sphere", { x: 0.25, y: 0.24, z: -0.05 }, { x: 0.6, y: 0.36, z: 0.52 }, "foliage-light"),
        part("leaf-c", "sphere", { x: 0.05, y: 0.32, z: 0.32 }, { x: 0.55, y: 0.38, z: 0.5 }, "vegetation-canopy"),
      ];
    case "rock":
      return [part("rock", "sphere", { x: 0, y: 0.25, z: 0 }, { x: 0.85, y: 0.45, z: 0.65 }, "terrain-neutral")];
    case "rock-stack":
      return [
        part("rock-a", "sphere", { x: -0.28, y: 0.24, z: 0 }, { x: 0.75, y: 0.45, z: 0.62 }, "terrain-neutral"),
        part("rock-b", "sphere", { x: 0.32, y: 0.28, z: 0.18 }, { x: 0.62, y: 0.5, z: 0.55 }, "structure-dark"),
        part("rock-c", "sphere", { x: 0.05, y: 0.55, z: -0.18 }, { x: 0.5, y: 0.42, z: 0.46 }, "terrain-neutral"),
      ];
    case "desk":
      return [
        part("top", "box", { x: 0, y: 0.75, z: 0 }, { x: 1.7, y: 0.14, z: 0.8 }, "wood-proxy"),
        part("leg-a", "box", { x: -0.72, y: 0.36, z: -0.3 }, { x: 0.1, y: 0.72, z: 0.1 }, "metal-proxy"),
        part("leg-b", "box", { x: 0.72, y: 0.36, z: -0.3 }, { x: 0.1, y: 0.72, z: 0.1 }, "metal-proxy"),
        part("leg-c", "box", { x: -0.72, y: 0.36, z: 0.3 }, { x: 0.1, y: 0.72, z: 0.1 }, "metal-proxy"),
        part("leg-d", "box", { x: 0.72, y: 0.36, z: 0.3 }, { x: 0.1, y: 0.72, z: 0.1 }, "metal-proxy"),
      ];
    case "workbench-rich":
      return [
        part("top", "box", { x: 0, y: 0.78, z: 0 }, { x: 2.4, y: 0.16, z: 1 }, "wood-proxy"),
        part("lower-shelf", "box", { x: 0, y: 0.32, z: 0 }, { x: 2.2, y: 0.12, z: 0.82 }, "structure-dark"),
        part("vice", "box", { x: -0.9, y: 0.98, z: -0.32 }, { x: 0.42, y: 0.22, z: 0.34 }, "metal-proxy"),
        part("plans", "box", { x: 0.55, y: 0.9, z: 0.15 }, { x: 0.85, y: 0.05, z: 0.55 }, "paper"),
        part("leg-a", "box", { x: -1, y: 0.38, z: -0.38 }, { x: 0.12, y: 0.76, z: 0.12 }, "metal-proxy"),
        part("leg-b", "box", { x: 1, y: 0.38, z: -0.38 }, { x: 0.12, y: 0.76, z: 0.12 }, "metal-proxy"),
        part("leg-c", "box", { x: -1, y: 0.38, z: 0.38 }, { x: 0.12, y: 0.76, z: 0.12 }, "metal-proxy"),
        part("leg-d", "box", { x: 1, y: 0.38, z: 0.38 }, { x: 0.12, y: 0.76, z: 0.12 }, "metal-proxy"),
      ];
    case "monitor-desk":
      return [
        ...createArchetypeParts("desk"),
        part("screen", "box", { x: 0, y: 1.2, z: -0.18 }, { x: 0.92, y: 0.55, z: 0.08 }, "structure-dark"),
        part("screen-accent", "box", { x: 0, y: 1.22, z: -0.235 }, { x: 0.72, y: 0.38, z: 0.025 }, "accent-blue"),
      ];
    case "chair":
      return [
        part("seat", "box", { x: 0, y: 0.45, z: 0 }, { x: 0.65, y: 0.12, z: 0.65 }, "structure-light"),
        part("back", "box", { x: 0, y: 0.85, z: 0.28 }, { x: 0.65, y: 0.7, z: 0.1 }, "structure-light"),
      ];
    case "screen":
      return [
        part("screen", "box", { x: 0, y: 0.75, z: 0 }, { x: 0.9, y: 0.55, z: 0.08 }, "structure-dark"),
        part("stand", "box", { x: 0, y: 0.32, z: 0 }, { x: 0.12, y: 0.45, z: 0.12 }, "metal-proxy"),
      ];
    case "paper-stack":
      return [
        part("sheet-a", "box", { x: 0, y: 0.03, z: 0 }, { x: 0.7, y: 0.04, z: 0.5 }, "paper"),
        part("sheet-b", "box", { x: 0.04, y: 0.08, z: -0.03 }, { x: 0.7, y: 0.04, z: 0.5 }, "paper"),
        part("sheet-c", "box", { x: -0.03, y: 0.13, z: 0.02 }, { x: 0.7, y: 0.04, z: 0.5 }, "paper"),
      ];
    case "display-rack":
      return [
        part("base", "platform", { x: 0, y: 0.08, z: 0 }, { x: 2.4, y: 0.16, z: 1.1 }, "structure-dark"),
        part("back", "box", { x: 0, y: 1, z: 0.42 }, { x: 2.4, y: 1.8, z: 0.12 }, "sign-board"),
        part("shelf-a", "box", { x: 0, y: 0.55, z: 0.18 }, { x: 2.1, y: 0.1, z: 0.45 }, "wood-proxy"),
        part("shelf-b", "box", { x: 0, y: 1.05, z: 0.18 }, { x: 2.1, y: 0.1, z: 0.45 }, "wood-proxy"),
        part("display-a", "box", { x: -0.72, y: 0.78, z: -0.02 }, { x: 0.48, y: 0.38, z: 0.08 }, "paper"),
        part("display-b", "box", { x: 0, y: 1.28, z: -0.02 }, { x: 0.48, y: 0.38, z: 0.08 }, "paper"),
        part("display-c", "box", { x: 0.72, y: 0.78, z: -0.02 }, { x: 0.48, y: 0.38, z: 0.08 }, "paper"),
      ];
    case "landmark":
      return [
        part("base", "cylinder", { x: 0, y: 0.12, z: 0 }, { x: 1.2, y: 0.24, z: 1.2 }, "structure-dark"),
        part("body", "box", { x: 0, y: 0.8, z: 0 }, { x: 0.75, y: 1.25, z: 0.75 }, "accent-blue"),
        part("cap", "sphere", { x: 0, y: 1.55, z: 0 }, { x: 0.8, y: 0.35, z: 0.8 }, "accent-orange"),
      ];
    case "timeline-arch":
      return [
        part("left-pillar", "box", { x: -1.1, y: 1.15, z: 0 }, { x: 0.28, y: 2.3, z: 0.28 }, "structure-dark"),
        part("right-pillar", "box", { x: 1.1, y: 1.15, z: 0 }, { x: 0.28, y: 2.3, z: 0.28 }, "structure-dark"),
        part("lintel", "box", { x: 0, y: 2.25, z: 0 }, { x: 2.5, y: 0.3, z: 0.32 }, "accent-blue"),
        part("date-plate", "box", { x: 0, y: 1.45, z: -0.16 }, { x: 1.35, y: 0.55, z: 0.08 }, "paper"),
      ];
    case "milestone-station":
      return [
        part("landing", "cylinder", { x: 0, y: 0.09, z: 0 }, { x: 1.45, y: 0.18, z: 1.45 }, "path-proxy"),
        part("marker", "box", { x: -0.48, y: 0.9, z: 0 }, { x: 0.24, y: 1.8, z: 0.24 }, "structure-dark"),
        part("plaque", "box", { x: 0.28, y: 0.88, z: -0.18 }, { x: 0.95, y: 0.58, z: 0.1 }, "paper"),
        part("cap", "sphere", { x: -0.48, y: 1.92, z: 0 }, { x: 0.38, y: 0.28, z: 0.38 }, "accent-blue"),
      ];
    case "skill-garden-landmark":
      return [
        part("raised-bed", "cylinder", { x: 0, y: 0.16, z: 0 }, { x: 2.6, y: 0.32, z: 2.6 }, "wood-proxy"),
        part("trunk", "cylinder", { x: 0, y: 1.1, z: 0 }, { x: 0.34, y: 2.2, z: 0.34 }, "vegetation-trunk"),
        part("branch-x", "box", { x: 0, y: 2.05, z: 0 }, { x: 2.5, y: 0.12, z: 0.12 }, "wood-proxy"),
        part("branch-z", "box", { x: 0, y: 2.35, z: 0 }, { x: 0.12, y: 0.12, z: 2.3 }, "wood-proxy"),
        part("canopy-a", "sphere", { x: -1.15, y: 2.2, z: 0 }, { x: 0.75, y: 0.65, z: 0.75 }, "accent-green"),
        part("canopy-b", "sphere", { x: 1.15, y: 2.2, z: 0 }, { x: 0.75, y: 0.65, z: 0.75 }, "accent-blue"),
        part("canopy-c", "sphere", { x: 0, y: 2.55, z: -1.05 }, { x: 0.75, y: 0.65, z: 0.75 }, "accent-yellow"),
        part("canopy-d", "sphere", { x: 0, y: 2.55, z: 1.05 }, { x: 0.75, y: 0.65, z: 0.75 }, "foliage-light"),
      ];
    case "person-scale-marker":
      return [
        part("base", "platform", { x: 0, y: 0.06, z: 0 }, { x: 0.7, y: 0.12, z: 0.7 }, "selection-validation"),
        part("body", "box", { x: 0, y: 0.92, z: 0 }, { x: 0.36, y: 1.45, z: 0.22 }, "selection-validation"),
        part("head", "sphere", { x: 0, y: 1.72, z: 0 }, { x: 0.28, y: 0.28, z: 0.28 }, "selection-validation"),
      ];
    case "navigation-anchor":
      return [
        part("base", "cylinder", { x: 0, y: 0.04, z: 0 }, { x: 0.55, y: 0.08, z: 0.55 }, "accent-blue"),
        part("marker", "sphere", { x: 0, y: 0.38, z: 0 }, { x: 0.35, y: 0.35, z: 0.35 }, "selection-validation"),
      ];

    // --- Converted from voxel terrain shapes. Bounds mirror the original
    // ShapeDefinition bounds in lib/voxel-shapes/shape-registry.ts as closely
    // as the box/cylinder/sphere primitive set allows. ---
    case "voxel-wall":
      return [boxPartFromBounds("wall", "structure-light", { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.08, maxZ: 0.08 })];
    case "voxel-beam":
      return [boxPartFromBounds("beam", "metal-proxy", { minX: -0.5, maxX: 0.5, minY: -0.12, maxY: 0.12, minZ: -0.12, maxZ: 0.12 })];
    case "voxel-pillar-base":
      return [
        boxPartFromBounds("shaft", "structure-dark", PILLAR_SHAFT_BOUNDS),
        boxPartFromBounds("base", "structure-dark", { minX: -0.34, maxX: 0.34, minY: -0.5, maxY: -0.26, minZ: -0.34, maxZ: 0.34 }),
      ];
    case "voxel-pillar-middle":
      return [
        boxPartFromBounds("shaft", "structure-dark", PILLAR_SHAFT_BOUNDS),
        boxPartFromBounds("base", "structure-dark", { minX: -0.34, maxX: 0.34, minY: -0.5, maxY: -0.26, minZ: -0.34, maxZ: 0.34 }),
        boxPartFromBounds("cap", "structure-dark", { minX: -0.34, maxX: 0.34, minY: 0.26, maxY: 0.5, minZ: -0.34, maxZ: 0.34 }),
      ];
    case "voxel-pillar-cap":
      return [
        boxPartFromBounds("shaft", "structure-dark", PILLAR_SHAFT_BOUNDS),
        boxPartFromBounds("cap", "structure-dark", { minX: -0.34, maxX: 0.34, minY: 0.26, maxY: 0.5, minZ: -0.34, maxZ: 0.34 }),
      ];
    case "voxel-roof-flat":
      return [boxPartFromBounds("roof", "structure-dark", { minX: -0.5, maxX: 0.5, minY: 0.2, maxY: 0.5, minZ: -0.5, maxZ: 0.5 })];
    case "voxel-roof-shallow":
      return [boxPartFromBounds("roof", "structure-dark", { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.12, minZ: -0.5, maxZ: 0.5 })];
    case "voxel-roof-steep":
      return [boxPartFromBounds("roof", "structure-dark", FULL_VOXEL_BOUNDS)];
    case "voxel-roof-outer-corner":
      return [boxPartFromBounds("roof", "structure-dark", FULL_VOXEL_BOUNDS)];
    case "voxel-roof-inner-corner":
      return [boxPartFromBounds("roof", "structure-dark", FULL_VOXEL_BOUNDS)];
    case "voxel-roof-hollow":
      return [boxPartFromBounds("roof", "structure-dark", FULL_VOXEL_BOUNDS)];
    case "voxel-roof-gable":
      return [boxPartFromBounds("roof", "structure-dark", FULL_VOXEL_BOUNDS)];
    case "voxel-fence-post":
      return [boxPartFromBounds("post", "wood-proxy", FENCE_POST_BOUNDS)];
    case "voxel-fence-line":
      return [boxPartFromBounds("post", "wood-proxy", FENCE_POST_BOUNDS), ...fenceRailX("rail", -0.5, 0.5)];
    case "voxel-fence-corner":
      return [
        boxPartFromBounds("post", "wood-proxy", FENCE_POST_BOUNDS),
        ...fenceRailX("rail-x", -0.02, 0.5),
        ...fenceRailZ("rail-z", -0.02, 0.5),
      ];
    case "voxel-fence-t":
      return [
        boxPartFromBounds("post", "wood-proxy", FENCE_POST_BOUNDS),
        ...fenceRailX("rail-x", -0.5, 0.5),
        ...fenceRailZ("rail-z", -0.02, 0.5),
      ];
    case "voxel-fence-cross":
      return [
        boxPartFromBounds("post", "wood-proxy", FENCE_POST_BOUNDS),
        ...fenceRailX("rail-x", -0.5, 0.5),
        ...fenceRailZ("rail-z", -0.5, 0.5),
      ];
    case "voxel-fence-gate":
      return [
        boxPartFromBounds("post-a", "wood-proxy", { minX: -0.42, maxX: -0.3, minY: -0.5, maxY: 0.34, minZ: -0.045, maxZ: 0.045 }),
        boxPartFromBounds("post-b", "wood-proxy", { minX: 0.3, maxX: 0.42, minY: -0.5, maxY: 0.34, minZ: -0.045, maxZ: 0.045 }),
        boxPartFromBounds("rail-low", "wood-proxy", { minX: -0.42, maxX: 0.42, minY: -0.1, maxY: 0.02, minZ: -0.045, maxZ: 0.045 }),
        boxPartFromBounds("rail-high", "wood-proxy", { minX: -0.42, maxX: 0.42, minY: 0.18, maxY: 0.3, minZ: -0.045, maxZ: 0.045 }),
      ];
    case "voxel-pipe-short":
      return [axisCylinderPart("pipe", "metal-proxy", { x: 0, y: 0, z: 0 }, 0.56, 0.36)];
    case "voxel-pipe-long":
      return [axisCylinderPart("pipe", "metal-proxy", { x: 0, y: 0, z: 0 }, 1, 0.36)];
    case "voxel-pipe":
      return [axisCylinderPart("pipe", "metal-proxy", { x: 0, y: 0, z: 0 }, 1, 0.44)];
    case "voxel-pipe-corner":
      return [
        axisCylinderPart("segment-x", "metal-proxy", { x: -0.16, y: 0, z: 0.18 }, 0.68, 0.36),
        {
          id: "segment-z",
          primitive: "cylinder",
          materialRole: "metal-proxy",
          selectable: true,
          transform: { position: { x: 0.18, y: 0, z: 0.16 }, rotation: { x: Math.PI / 2, y: 0, z: 0 }, scale: { x: 0.36, y: 0.68, z: 0.36 } },
        },
      ];
    case "voxel-wooden-wall-full":
      return [boxPartFromBounds("wall", "wood-proxy", { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.12, maxZ: 0.12 })];
    case "voxel-wooden-wall-end":
      return [boxPartFromBounds("wall", "wood-proxy", { minX: -0.13, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.13, maxZ: 0.13 })];
    case "voxel-wooden-wall-corner":
      return [boxPartFromBounds("wall", "wood-proxy", FULL_VOXEL_BOUNDS)];
    case "voxel-wooden-wall-t":
      return [boxPartFromBounds("wall", "wood-proxy", FULL_VOXEL_BOUNDS)];
    case "voxel-wooden-wall-cross":
      return [boxPartFromBounds("wall", "wood-proxy", FULL_VOXEL_BOUNDS)];
    case "voxel-wooden-wall-gate":
      return [boxPartFromBounds("wall", "wood-proxy", { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.13, maxZ: 0.13 })];
    case "voxel-solid-wooden-wall-full":
      return [boxPartFromBounds("wall", "structure-dark", { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.12, maxZ: 0.12 })];
    case "voxel-solid-wooden-wall-end":
      return [boxPartFromBounds("wall", "structure-dark", { minX: -0.18, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.18, maxZ: 0.18 })];
    case "voxel-solid-wooden-wall-corner":
      return [boxPartFromBounds("wall", "structure-dark", FULL_VOXEL_BOUNDS)];
    case "voxel-solid-wooden-wall-t":
      return [boxPartFromBounds("wall", "structure-dark", FULL_VOXEL_BOUNDS)];
    case "voxel-solid-wooden-wall-cross":
      return [boxPartFromBounds("wall", "structure-dark", FULL_VOXEL_BOUNDS)];
    case "voxel-solid-wooden-wall-gate":
      return [boxPartFromBounds("wall", "structure-dark", { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.12, maxZ: 0.12 })];
    case "voxel-retaining-wall-low":
      return [boxPartFromBounds("wall", "structure-dark", { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.06, minZ: -0.12, maxZ: 0.12 })];
    case "voxel-rubble-small":
      return [boxPartFromBounds("rubble", "terrain-neutral", { minX: -0.28, maxX: 0.28, minY: -0.5, maxY: -0.08, minZ: -0.28, maxZ: 0.28 })];
    case "voxel-rubble-medium":
      return [boxPartFromBounds("rubble", "terrain-neutral", { minX: -0.42, maxX: 0.42, minY: -0.5, maxY: 0.22, minZ: -0.42, maxZ: 0.42 })];
    case "voxel-stalactite-small":
      return [boxPartFromBounds("spike", "terrain-neutral", { minX: -0.16, maxX: 0.16, minY: -0.32, maxY: 0.5, minZ: -0.16, maxZ: 0.16 })];
    case "voxel-stalactite-large":
      return [boxPartFromBounds("spike", "terrain-neutral", { minX: -0.28, maxX: 0.28, minY: -0.5, maxY: 0.5, minZ: -0.28, maxZ: 0.28 })];
    case "voxel-crystal-small":
      return [boxPartFromBounds("crystal", "accent-blue", { minX: -0.16, maxX: 0.16, minY: -0.5, maxY: 0.5, minZ: -0.16, maxZ: 0.16 })];
    case "voxel-crystal-medium":
      return [boxPartFromBounds("crystal", "accent-blue", { minX: -0.24, maxX: 0.24, minY: -0.5, maxY: 0.5, minZ: -0.24, maxZ: 0.24 })];
    case "voxel-crystal-large":
      return [boxPartFromBounds("crystal", "accent-blue", { minX: -0.32, maxX: 0.32, minY: -0.5, maxY: 0.5, minZ: -0.32, maxZ: 0.32 })];
    case "voxel-ice-chunks":
      return [boxPartFromBounds("ice", "accent-blue", { minX: -0.38, maxX: 0.36, minY: -0.5, maxY: 0.02, minZ: -0.34, maxZ: 0.42 })];
    case "voxel-ice-chunks-medium":
      return [boxPartFromBounds("ice", "accent-blue", { minX: -0.42, maxX: 0.42, minY: -0.5, maxY: 0.25, minZ: -0.42, maxZ: 0.42 })];
    case "voxel-icicles":
      return [boxPartFromBounds("icicle", "accent-blue", { minX: -0.18, maxX: 0.18, minY: -0.36, maxY: 0.5, minZ: -0.18, maxZ: 0.18 })];
    case "voxel-icicles-large":
      return [boxPartFromBounds("icicle", "accent-blue", { minX: -0.3, maxX: 0.3, minY: -0.5, maxY: 0.5, minZ: -0.3, maxZ: 0.3 })];
  }
}

type VoxelBounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

const FULL_VOXEL_BOUNDS: VoxelBounds = { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5, minZ: -0.5, maxZ: 0.5 };
const PILLAR_SHAFT_BOUNDS: VoxelBounds = { minX: -0.18, maxX: 0.18, minY: -0.5, maxY: 0.5, minZ: -0.18, maxZ: 0.18 };
const FENCE_POST_BOUNDS: VoxelBounds = { minX: -0.08, maxX: 0.08, minY: -0.5, maxY: 0.42, minZ: -0.08, maxZ: 0.08 };

// Shared generation helper: converts an axis-aligned bounding box (matching
// the original ShapeDefinition.bounds() in shape-registry.ts) into a single
// box-primitive prefab part. Used by every converted structural/roof/
// wooden-wall/natural-object archetype so their geometry stays declared as
// data (bounds) rather than repeated per-archetype boilerplate.
function boxPartFromBounds(id: string, materialRole: PrefabMaterialRole, bounds: VoxelBounds): PrefabPartDefinition {
  return {
    id,
    primitive: "box",
    materialRole,
    selectable: true,
    transform: {
      position: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
      rotation: ZERO_ROTATION,
      scale: { x: bounds.maxX - bounds.minX, y: bounds.maxY - bounds.minY, z: bounds.maxZ - bounds.minZ },
    },
  };
}

// A cylinder part whose long axis defaults to X (matching the default/state-0
// case of shape-registry.ts's axisBounds), achieved by rotating the
// primitive's native Y-axis length onto X.
function axisCylinderPart(id: string, materialRole: PrefabMaterialRole, position: { x: number; y: number; z: number }, length: number, diameter: number): PrefabPartDefinition {
  return {
    id,
    primitive: "cylinder",
    materialRole,
    selectable: true,
    transform: {
      position,
      rotation: { x: 0, y: 0, z: Math.PI / 2 },
      scale: { x: diameter, y: length, z: diameter },
    },
  };
}

function fenceRailX(idPrefix: string, minX: number, maxX: number): PrefabPartDefinition[] {
  return [
    boxPartFromBounds(`${idPrefix}-low`, "wood-proxy", { minX, maxX, minY: -0.16, maxY: -0.04, minZ: -0.045, maxZ: 0.045 }),
    boxPartFromBounds(`${idPrefix}-high`, "wood-proxy", { minX, maxX, minY: 0.18, maxY: 0.3, minZ: -0.045, maxZ: 0.045 }),
  ];
}

function fenceRailZ(idPrefix: string, minZ: number, maxZ: number): PrefabPartDefinition[] {
  return [
    boxPartFromBounds(`${idPrefix}-low`, "wood-proxy", { minX: -0.045, maxX: 0.045, minY: -0.16, maxY: -0.04, minZ, maxZ }),
    boxPartFromBounds(`${idPrefix}-high`, "wood-proxy", { minX: -0.045, maxX: 0.045, minY: 0.18, maxY: 0.3, minZ, maxZ }),
  ];
}

function part(id: string, primitive: PrimitiveType, position: { x: number; y: number; z: number }, scale: { x: number; y: number; z: number }, materialRole: PrefabMaterialRole): PrefabPartDefinition {
  return {
    id,
    primitive,
    materialRole,
    selectable: true,
    transform: {
      position,
      rotation: ZERO_ROTATION,
      scale,
    },
  };
}

function inferFootprint(archetype: PrefabArchetype): EntityFootprint {
  if (archetype === "workshop-compound") return { width: 7, depth: 5.6, height: 3.2 };
  if (archetype === "studio-compound") return { width: 5.8, depth: 4.6, height: 2.7 };
  if (archetype === "communication-station") return { width: 5, depth: 4.2, height: 4.5 };
  if (archetype === "building") return { width: 3, depth: 2.4, height: 2.3 };
  if (archetype === "pavilion") return { width: 3, depth: 2.6, height: 2 };
  if (archetype === "wall" || archetype === "wall-window" || archetype === "wall-door") return { width: 3, depth: 0.35, height: 1.9 };
  if (archetype === "gate") return { width: 2, depth: 0.5, height: 2 };
  if (archetype === "path-section") return { width: 3, depth: 1.5, height: 0.25 };
  if (archetype === "bridge") return { width: 3.2, depth: 1.4, height: 0.8 };
  if (archetype === "garden-bed") return { width: 2.6, depth: 1.7, height: 0.4 };
  if (archetype === "orientation-monument") return { width: 2.6, depth: 2.6, height: 3.2 };
  if (archetype === "zone-board") return { width: 1.9, depth: 0.6, height: 2.1 };
  if (archetype === "mailbox-bank") return { width: 2.6, depth: 0.7, height: 1.35 };
  if (archetype === "tree") return { width: 0.45, depth: 0.45, height: 2.1 };
  if (archetype === "tree-wide") return { width: 1, depth: 1, height: 2.7 };
  if (archetype === "tree-columnar") return { width: 0.7, depth: 0.7, height: 3 };
  if (archetype === "bush") return { width: 0.9, depth: 0.8, height: 0.8 };
  if (archetype === "shrub-low") return { width: 1.1, depth: 0.9, height: 0.55 };
  if (archetype === "rock") return { width: 0.8, depth: 0.7, height: 0.5 };
  if (archetype === "rock-stack") return { width: 1.25, depth: 1, height: 0.8 };
  if (archetype === "desk") return { width: 1.8, depth: 0.9, height: 0.9 };
  if (archetype === "workbench-rich") return { width: 2.5, depth: 1.1, height: 1.1 };
  if (archetype === "monitor-desk") return { width: 1.8, depth: 1, height: 1.5 };
  if (archetype === "chair") return { width: 0.7, depth: 0.7, height: 1.2 };
  if (archetype === "screen") return { width: 0.9, depth: 0.25, height: 1.1 };
  if (archetype === "display-rack") return { width: 2.5, depth: 1.2, height: 1.9 };
  if (archetype === "path-detail") return { width: 1.4, depth: 0.4, height: 0.05 };
  if (archetype === "timeline-arch") return { width: 2.7, depth: 0.55, height: 2.5 };
  if (archetype === "milestone-station") return { width: 1.6, depth: 1.6, height: 2.1 };
  if (archetype === "skill-garden-landmark") return { width: 2.8, depth: 2.8, height: 3.2 };
  if (archetype === "person-scale-marker") return { width: 0.8, depth: 0.8, height: 1.9 };
  if (archetype === "navigation-anchor") return { width: 0.45, depth: 0.45, height: 0.45 };
  if (archetype === "fallen-log") return { width: 1.5, depth: 0.4, height: 0.5 };
  if (archetype === "tree-stump") return { width: 0.55, depth: 0.55, height: 0.42 };
  if (archetype === "crate-stack") return { width: 0.75, depth: 0.75, height: 1.15 };
  if (archetype === "bike-rack") return { width: 1.3, depth: 0.35, height: 0.75 };
  if (archetype === "barrier") return { width: 1.15, depth: 0.4, height: 0.75 };
  if (archetype === "voxel-wall" || archetype === "voxel-wooden-wall-full" || archetype === "voxel-wooden-wall-gate" || archetype === "voxel-solid-wooden-wall-full" || archetype === "voxel-solid-wooden-wall-gate") return { width: 1, depth: 1, height: 0.24 };
  if (archetype === "voxel-beam") return { width: 1, depth: 0.24, height: 0.24 };
  if (archetype === "voxel-pillar-base" || archetype === "voxel-pillar-middle" || archetype === "voxel-pillar-cap") return { width: 0.68, depth: 0.68, height: 1 };
  if (archetype === "voxel-roof-flat") return { width: 1, depth: 1, height: 0.3 };
  if (archetype === "voxel-fence-post") return { width: 0.16, depth: 0.16, height: 0.92 };
  if (archetype === "voxel-fence-line" || archetype === "voxel-fence-corner" || archetype === "voxel-fence-t" || archetype === "voxel-fence-cross") return { width: 1, depth: 1, height: 0.8 };
  if (archetype === "voxel-fence-gate") return { width: 0.84, depth: 0.09, height: 0.84 };
  if (archetype === "voxel-pipe-short") return { width: 0.56, depth: 0.36, height: 0.36 };
  if (archetype === "voxel-pipe-long" || archetype === "voxel-pipe") return { width: 1, depth: 0.44, height: 0.44 };
  if (archetype === "voxel-pipe-corner") return { width: 0.68, depth: 0.68, height: 0.36 };
  if (archetype === "voxel-wooden-wall-end") return { width: 0.63, depth: 0.26, height: 1 };
  if (archetype === "voxel-solid-wooden-wall-end") return { width: 0.68, depth: 0.36, height: 1 };
  if (archetype === "voxel-retaining-wall-low") return { width: 1, depth: 0.24, height: 0.56 };
  if (archetype === "voxel-rubble-small") return { width: 0.56, depth: 0.56, height: 0.42 };
  if (archetype === "voxel-rubble-medium") return { width: 0.84, depth: 0.84, height: 0.72 };
  if (archetype === "voxel-stalactite-small") return { width: 0.32, depth: 0.32, height: 0.82 };
  if (archetype === "voxel-stalactite-large") return { width: 0.56, depth: 0.56, height: 1 };
  if (archetype === "voxel-crystal-small") return { width: 0.32, depth: 0.32, height: 1 };
  if (archetype === "voxel-crystal-medium") return { width: 0.48, depth: 0.48, height: 1 };
  if (archetype === "voxel-crystal-large") return { width: 0.64, depth: 0.64, height: 1 };
  if (archetype === "voxel-ice-chunks") return { width: 0.74, depth: 0.76, height: 0.52 };
  if (archetype === "voxel-ice-chunks-medium") return { width: 0.84, depth: 0.84, height: 0.75 };
  if (archetype === "voxel-icicles") return { width: 0.36, depth: 0.36, height: 0.86 };
  if (archetype === "voxel-icicles-large") return { width: 0.6, depth: 0.6, height: 1 };
  return { width: 1, depth: 1, height: 1 };
}

function inferCollisionMode(archetype: PrefabArchetype): CollisionMode {
  if (archetype === "platform" || archetype === "round-platform" || archetype === "bridge" || archetype === "steps" || archetype === "path-section") return "walkable";
  if (archetype === "path-detail" || archetype === "navigation-anchor") return "none";
  // Preserves the original ShapeDefinition.blocksMovement values for
  // converted natural/cave-formation shapes (small variants were
  // non-blocking decorative geometry; medium/large blocked movement).
  if (archetype === "voxel-rubble-small" || archetype === "voxel-stalactite-small" || archetype === "voxel-crystal-small" || archetype === "voxel-crystal-medium" || archetype === "voxel-ice-chunks" || archetype === "voxel-icicles") return "none";
  return "blocking";
}

function stableId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const sizeVariants = [
  { id: "small", label: "Small", size: "small" as const, scale: { x: 0.75, y: 0.75, z: 0.75 } },
  { id: "medium", label: "Medium", size: "medium" as const, scale: UNIT_SCALE },
  { id: "large", label: "Large", size: "large" as const, scale: { x: 1.35, y: 1.25, z: 1.35 } },
];

const shortMediumLong = [
  { id: "short", label: "Short", size: "short" as const, scale: { x: 0.65, y: 1, z: 1 } },
  { id: "medium", label: "Medium", size: "medium" as const, scale: UNIT_SCALE },
  { id: "long", label: "Long", size: "long" as const, scale: { x: 1.65, y: 1, z: 1 } },
];

const CATALOG_SEEDS: CatalogSeed[] = [
  { name: "Portfolio V2 Scale Reference", category: "navigation", archetype: "person-scale-marker", collisionMode: "none", tags: ["portfolio-v2", "editor-helper", "scale-reference"] },
  { name: "Portfolio V2 Foundation Square", category: "architecture", archetype: "platform", variants: sizeVariants, tags: ["portfolio-v2", "architecture", "foundation"] },
  { name: "Portfolio V2 Foundation Rectangle", category: "architecture", archetype: "platform", variants: [{ id: "standard", label: "Standard", size: "standard", scale: { x: 1.6, y: 1, z: 0.9 }, footprint: { width: 3.2, depth: 1.8, height: 0.25 } }, { id: "large", label: "Large", size: "large", scale: { x: 2.5, y: 1, z: 1.35 }, footprint: { width: 5, depth: 2.7, height: 0.25 } }], tags: ["portfolio-v2", "architecture", "foundation"] },
  { name: "Portfolio V2 Raised Foundation", category: "architecture", archetype: "platform", variants: [{ id: "standard", label: "Standard", size: "standard", scale: { x: 1.8, y: 1.8, z: 1.2 }, footprint: { width: 3.6, depth: 2.4, height: 0.45 } }], tags: ["portfolio-v2", "architecture", "foundation"] },
  { name: "Portfolio V2 Wall Solid", category: "architecture", archetype: "wall", variants: shortMediumLong, tags: ["portfolio-v2", "architecture", "wall"] },
  { name: "Portfolio V2 Wall Window", category: "architecture", archetype: "wall-window", variants: shortMediumLong, tags: ["portfolio-v2", "architecture", "wall"] },
  { name: "Portfolio V2 Wall Doorway", category: "architecture", archetype: "wall-door", variants: shortMediumLong, tags: ["portfolio-v2", "architecture", "wall"] },
  { name: "Portfolio V2 Wall Corner", category: "architecture", archetype: "gate", tags: ["portfolio-v2", "architecture", "wall"] },
  { name: "Portfolio V2 Roof Flat", category: "architecture", archetype: "platform", variants: shortMediumLong, tags: ["portfolio-v2", "architecture", "roof"] },
  { name: "Portfolio V2 Roof Stepped", category: "architecture", archetype: "workshop-compound", variants: [{ id: "cap", label: "Cap", size: "small", scale: { x: 0.5, y: 0.22, z: 0.42 }, footprint: { width: 3.5, depth: 2.4, height: 0.75 } }], tags: ["portfolio-v2", "architecture", "roof"] },
  { name: "Portfolio V2 Porch", category: "architecture", archetype: "pavilion", variants: sizeVariants.slice(0, 2), tags: ["portfolio-v2", "architecture", "porch"] },
  { name: "Portfolio V2 Canopy", category: "architecture", archetype: "pavilion", variants: [{ id: "standard", label: "Standard", size: "standard", scale: { x: 1, y: 0.65, z: 0.65 } }], tags: ["portfolio-v2", "architecture", "canopy"] },
  { name: "Portfolio V2 Exterior Stair", category: "infrastructure", archetype: "steps", variants: sizeVariants, tags: ["portfolio-v2", "infrastructure", "stair"] },
  { name: "Portfolio V2 Ramp", category: "infrastructure", archetype: "platform", variants: shortMediumLong, tags: ["portfolio-v2", "infrastructure", "ramp"] },
  { name: "Portfolio V2 Handrail", category: "infrastructure", archetype: "fence", variants: shortMediumLong, tags: ["portfolio-v2", "infrastructure", "rail"] },
  { name: "Portfolio V2 Main Path Straight", category: "roads-and-paths", archetype: "path-section", variants: shortMediumLong, tags: ["portfolio-v2", "path"] },
  { name: "Portfolio V2 Main Path Corner", category: "roads-and-paths", archetype: "path-section", variants: shortMediumLong, tags: ["portfolio-v2", "path"] },
  { name: "Portfolio V2 Path Junction", category: "roads-and-paths", archetype: "round-platform", variants: sizeVariants, tags: ["portfolio-v2", "path"] },
  { name: "Portfolio V2 Secondary Path", category: "roads-and-paths", archetype: "path-section", variants: shortMediumLong, tags: ["portfolio-v2", "path"] },
  { name: "Portfolio V2 Stepping Stone", category: "roads-and-paths", archetype: "path-detail", variants: sizeVariants, tags: ["portfolio-v2", "path"] },
  { name: "Portfolio V2 Curb", category: "infrastructure", archetype: "wall", variants: shortMediumLong, tags: ["portfolio-v2", "infrastructure", "curb"] },
  { name: "Portfolio V2 Retaining Wall", category: "infrastructure", archetype: "wall", variants: shortMediumLong, tags: ["portfolio-v2", "infrastructure", "retaining"] },
  { name: "Portfolio V2 Fence Straight", category: "infrastructure", archetype: "fence", variants: shortMediumLong, tags: ["portfolio-v2", "infrastructure", "fence"] },
  { name: "Portfolio V2 Fence Gate", category: "infrastructure", archetype: "gate", tags: ["portfolio-v2", "infrastructure", "fence"] },
  { name: "Portfolio V2 Bridge Section", category: "infrastructure", archetype: "bridge", variants: shortMediumLong, tags: ["portfolio-v2", "infrastructure", "bridge"] },
  { name: "Portfolio V2 Bollard", category: "street-furniture", archetype: "post", tags: ["portfolio-v2", "infrastructure"] },
  { name: "Portfolio V2 Path Lamp", category: "street-furniture", archetype: "post", variants: [{ id: "short", label: "Short", size: "short", scale: { x: 0.8, y: 0.75, z: 0.8 } }], tags: ["portfolio-v2", "lighting"] },
  { name: "Portfolio V2 Building Lamp", category: "street-furniture", archetype: "post", variants: [{ id: "wall", label: "Wall", size: "small", scale: { x: 0.55, y: 0.45, z: 0.55 } }], tags: ["portfolio-v2", "lighting"] },
  { name: "Portfolio V2 Bench", category: "street-furniture", archetype: "bench", variants: sizeVariants.slice(0, 2), tags: ["portfolio-v2", "seating"] },
  { name: "Portfolio V2 Planter", category: "street-furniture", archetype: "container", variants: sizeVariants, tags: ["portfolio-v2", "vegetation"] },
  { name: "Portfolio V2 Raised Garden Bed", category: "nature", archetype: "garden-bed", variants: shortMediumLong, tags: ["portfolio-v2", "vegetation"] },
  { name: "Portfolio V2 Utility Cabinet", category: "infrastructure", archetype: "container", variants: sizeVariants, tags: ["portfolio-v2", "infrastructure"] },
  { name: "Portfolio V2 Drainage Cover", category: "infrastructure", archetype: "path-detail", tags: ["portfolio-v2", "infrastructure"] },
  { name: "Portfolio V2 Direction Sign", category: "signage", archetype: "zone-board", tags: ["portfolio-v2", "signage"] },
  { name: "Portfolio V2 Zone Entrance Sign", category: "signage", archetype: "zone-board", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "wide", label: "Wide", size: "wide", scale: { x: 1.25, y: 1, z: 1 } }], tags: ["portfolio-v2", "signage"] },
  { name: "Portfolio V2 Noticeboard", category: "signage", archetype: "board", tags: ["portfolio-v2", "signage"] },
  { name: "Portfolio V2 Map Board", category: "signage", archetype: "zone-board", variants: [{ id: "wide", label: "Wide", size: "wide", scale: { x: 1.45, y: 1.05, z: 1 } }], tags: ["portfolio-v2", "signage"] },
  { name: "Portfolio V2 Orientation Monument", category: "portfolio", archetype: "orientation-monument", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "tall", label: "Tall", size: "tall", scale: { x: 1.15, y: 1.2, z: 1.15 } }], tags: ["portfolio-v2", "arrival", "landmark"] },
  { name: "Portfolio V2 Loader Origin Surround", category: "portfolio", archetype: "round-platform", variants: [{ id: "standard", label: "Standard", size: "standard", scale: { x: 1.1, y: 0.8, z: 1.1 } }], tags: ["portfolio-v2", "arrival"] },
  { name: "Portfolio V2 Intro Board", category: "portfolio", archetype: "zone-board", variants: [{ id: "wide", label: "Wide", size: "wide", scale: { x: 1.6, y: 1.1, z: 1 } }], tags: ["portfolio-v2", "arrival", "interactive"] },
  { name: "Portfolio V2 Info Pedestal", category: "portfolio", archetype: "container", tags: ["portfolio-v2", "interactive"] },
  { name: "Portfolio V2 Plaza Seating", category: "street-furniture", archetype: "bench", variants: sizeVariants, tags: ["portfolio-v2", "arrival", "seating"] },
  { name: "Portfolio V2 Plaza Planter", category: "street-furniture", archetype: "garden-bed", variants: sizeVariants, tags: ["portfolio-v2", "arrival", "vegetation"] },
  { name: "Portfolio V2 Arrival Marker", category: "portfolio", archetype: "navigation-anchor", collisionMode: "trigger", tags: ["portfolio-v2", "arrival", "interactive"] },
  { name: "Portfolio V2 Developer Workshop", category: "architecture", archetype: "workshop-compound", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "large", label: "Large", size: "large", scale: { x: 1.18, y: 1.08, z: 1.12 }, footprint: { width: 8.3, depth: 6.3, height: 3.5 } }], tags: ["portfolio-v2", "projects", "structure"], futureAssetSlot: "future/v2/projects-workshop" },
  { name: "Portfolio V2 Workshop Annex", category: "architecture", archetype: "studio-compound", variants: sizeVariants.slice(0, 2), tags: ["portfolio-v2", "projects", "structure"] },
  { name: "Portfolio V2 Covered Workspace", category: "architecture", archetype: "pavilion", variants: sizeVariants, tags: ["portfolio-v2", "projects", "structure"] },
  { name: "Portfolio V2 Project Exhibition Canopy", category: "portfolio", archetype: "pavilion", variants: sizeVariants, tags: ["portfolio-v2", "projects", "display"] },
  { name: "Portfolio V2 Project Display Table", category: "portfolio", archetype: "workbench-rich", variants: sizeVariants, tags: ["portfolio-v2", "projects", "display"] },
  { name: "Portfolio V2 Workbench", category: "portfolio", archetype: "workbench-rich", variants: shortMediumLong, tags: ["portfolio-v2", "projects"] },
  { name: "Portfolio V2 Project Board", category: "portfolio", archetype: "display-rack", variants: sizeVariants, tags: ["portfolio-v2", "projects", "interactive"] },
  { name: "Portfolio V2 Featured Project Pedestal", category: "portfolio", archetype: "landmark", variants: sizeVariants, tags: ["portfolio-v2", "projects", "interactive"] },
  { name: "Portfolio V2 Folder", category: "portfolio", archetype: "paper-stack", collisionMode: "none", variants: sizeVariants, tags: ["portfolio-v2", "projects", "document"] },
  { name: "Portfolio V2 Document Stack", category: "portfolio", archetype: "paper-stack", collisionMode: "none", variants: shortMediumLong, tags: ["portfolio-v2", "projects", "document"] },
  { name: "Portfolio V2 Storage Shelf", category: "office", archetype: "display-rack", variants: sizeVariants, tags: ["portfolio-v2", "projects", "storage"] },
  { name: "Portfolio V2 Tool Cabinet", category: "office", archetype: "container", variants: sizeVariants, tags: ["portfolio-v2", "projects", "storage"] },
  { name: "Portfolio V2 Crate Stack", category: "street-furniture", archetype: "crate-stack", variants: sizeVariants, tags: ["portfolio-v2", "projects", "storage"] },
  { name: "Portfolio V2 Cable Utility Box", category: "infrastructure", archetype: "container", variants: sizeVariants, tags: ["portfolio-v2", "projects", "utility"] },
  { name: "Portfolio V2 Workshop Entrance Sign", category: "signage", archetype: "zone-board", tags: ["portfolio-v2", "projects", "signage"] },
  { name: "Portfolio V2 Timeline Entrance Arch", category: "portfolio", archetype: "timeline-arch", variants: sizeVariants, tags: ["portfolio-v2", "experience", "landmark"] },
  { name: "Portfolio V2 Milestone Marker A", category: "portfolio", archetype: "milestone-station", variants: sizeVariants, tags: ["portfolio-v2", "experience", "interactive"] },
  { name: "Portfolio V2 Milestone Marker B", category: "portfolio", archetype: "milestone-station", variants: sizeVariants, tags: ["portfolio-v2", "experience", "interactive"] },
  { name: "Portfolio V2 Milestone Marker C", category: "portfolio", archetype: "milestone-station", variants: sizeVariants, tags: ["portfolio-v2", "experience", "interactive"] },
  { name: "Portfolio V2 Information Plaque", category: "portfolio", archetype: "board", tags: ["portfolio-v2", "interactive"] },
  { name: "Portfolio V2 Timeline Railing", category: "infrastructure", archetype: "fence", variants: shortMediumLong, tags: ["portfolio-v2", "experience", "rail"] },
  { name: "Portfolio V2 Career Path Marker", category: "portfolio", archetype: "navigation-anchor", collisionMode: "trigger", tags: ["portfolio-v2", "experience", "interactive"] },
  { name: "Portfolio V2 Education Branch Marker", category: "portfolio", archetype: "zone-board", tags: ["portfolio-v2", "experience", "interactive"] },
  { name: "Portfolio V2 Lookout Platform", category: "infrastructure", archetype: "round-platform", variants: sizeVariants, tags: ["portfolio-v2", "experience"] },
  { name: "Portfolio V2 Current Position Landmark", category: "portfolio", archetype: "orientation-monument", variants: sizeVariants, tags: ["portfolio-v2", "experience", "landmark"] },
  { name: "Portfolio V2 Reflection Seat", category: "street-furniture", archetype: "bench", tags: ["portfolio-v2", "experience"] },
  { name: "Portfolio V2 Personal Studio", category: "architecture", archetype: "studio-compound", variants: sizeVariants, tags: ["portfolio-v2", "about", "structure"], futureAssetSlot: "future/v2/about-studio" },
  { name: "Portfolio V2 Studio Annex", category: "architecture", archetype: "building", variants: sizeVariants, tags: ["portfolio-v2", "about", "structure"] },
  { name: "Portfolio V2 Exterior Workspace", category: "portfolio", archetype: "monitor-desk", variants: sizeVariants, tags: ["portfolio-v2", "about", "interactive"] },
  { name: "Portfolio V2 Chair", category: "office", archetype: "chair", variants: sizeVariants, tags: ["portfolio-v2", "about"] },
  { name: "Portfolio V2 Bookshelf", category: "office", archetype: "display-rack", variants: sizeVariants, tags: ["portfolio-v2", "about"] },
  { name: "Portfolio V2 Profile Pedestal", category: "portfolio", archetype: "landmark", tags: ["portfolio-v2", "about", "interactive"] },
  { name: "Portfolio V2 CV Stand", category: "portfolio", archetype: "board", tags: ["portfolio-v2", "about", "interactive"] },
  { name: "Portfolio V2 About Entrance Sign", category: "signage", archetype: "zone-board", tags: ["portfolio-v2", "about", "signage"] },
  { name: "Portfolio V2 Skill Tree", category: "portfolio", archetype: "skill-garden-landmark", variants: sizeVariants, tags: ["portfolio-v2", "skills", "landmark"] },
  { name: "Portfolio V2 Skill Stand A", category: "portfolio", archetype: "display-rack", variants: sizeVariants, tags: ["portfolio-v2", "skills", "interactive"] },
  { name: "Portfolio V2 Skill Stand B", category: "portfolio", archetype: "display-rack", variants: sizeVariants, tags: ["portfolio-v2", "skills", "interactive"] },
  { name: "Portfolio V2 Skill Stand C", category: "portfolio", archetype: "display-rack", variants: sizeVariants, tags: ["portfolio-v2", "skills", "interactive"] },
  { name: "Portfolio V2 Frontend Marker", category: "portfolio", archetype: "zone-board", tags: ["portfolio-v2", "skills", "interactive"] },
  { name: "Portfolio V2 Backend Marker", category: "portfolio", archetype: "zone-board", tags: ["portfolio-v2", "skills", "interactive"] },
  { name: "Portfolio V2 Tooling Marker", category: "portfolio", archetype: "zone-board", tags: ["portfolio-v2", "skills", "interactive"] },
  { name: "Portfolio V2 Design UX Marker", category: "portfolio", archetype: "zone-board", tags: ["portfolio-v2", "skills", "interactive"] },
  { name: "Portfolio V2 Technology Garden Bed", category: "nature", archetype: "garden-bed", variants: sizeVariants, tags: ["portfolio-v2", "skills", "vegetation"] },
  { name: "Portfolio V2 Modular Skill Branch", category: "portfolio", archetype: "fence", variants: shortMediumLong, tags: ["portfolio-v2", "skills"] },
  { name: "Portfolio V2 Skill Token", category: "portfolio", archetype: "navigation-anchor", collisionMode: "trigger", tags: ["portfolio-v2", "skills", "interactive"] },
  { name: "Portfolio V2 Maintenance Shelter", category: "architecture", archetype: "pavilion", tags: ["portfolio-v2", "skills", "structure"] },
  { name: "Portfolio V2 Skills Entrance Sign", category: "signage", archetype: "zone-board", tags: ["portfolio-v2", "skills", "signage"] },
  { name: "Portfolio V2 Communication Building", category: "architecture", archetype: "communication-station", variants: sizeVariants, tags: ["portfolio-v2", "contact", "structure"], futureAssetSlot: "future/v2/contact-building" },
  { name: "Portfolio V2 Contact Kiosk", category: "architecture", archetype: "building", variants: sizeVariants, tags: ["portfolio-v2", "contact", "structure"] },
  { name: "Portfolio V2 Mailbox", category: "portfolio", archetype: "container", variants: sizeVariants, tags: ["portfolio-v2", "contact", "interactive"] },
  { name: "Portfolio V2 Mailbox Cluster", category: "portfolio", archetype: "mailbox-bank", variants: sizeVariants, tags: ["portfolio-v2", "contact", "interactive"] },
  { name: "Portfolio V2 Contact Noticeboard", category: "portfolio", archetype: "zone-board", tags: ["portfolio-v2", "contact", "interactive"] },
  { name: "Portfolio V2 Writing Counter", category: "portfolio", archetype: "workbench-rich", tags: ["portfolio-v2", "contact"] },
  { name: "Portfolio V2 Communication Mast", category: "portfolio", archetype: "post", variants: [{ id: "tall", label: "Tall", size: "tall", scale: { x: 1.2, y: 2.1, z: 1.2 } }], tags: ["portfolio-v2", "contact", "landmark"] },
  { name: "Portfolio V2 Radio Cabinet", category: "infrastructure", archetype: "container", variants: sizeVariants, tags: ["portfolio-v2", "contact"] },
  { name: "Portfolio V2 Social Link Marker", category: "portfolio", archetype: "navigation-anchor", collisionMode: "trigger", tags: ["portfolio-v2", "contact", "interactive"] },
  { name: "Portfolio V2 Contact Form Marker", category: "portfolio", archetype: "landmark", collisionMode: "trigger", tags: ["portfolio-v2", "contact", "interactive"] },
  { name: "Portfolio V2 CV Download Marker", category: "portfolio", archetype: "board", collisionMode: "trigger", tags: ["portfolio-v2", "contact", "interactive"] },
  { name: "Portfolio V2 Flyer", category: "portfolio", archetype: "paper-stack", collisionMode: "none", variants: sizeVariants, tags: ["portfolio-v2", "contact", "flyer"] },
  { name: "Portfolio V2 Flyer Pile", category: "portfolio", archetype: "paper-stack", collisionMode: "none", variants: shortMediumLong, tags: ["portfolio-v2", "contact", "flyer"] },
  { name: "Portfolio V2 Wall Poster", category: "portfolio", archetype: "board", tags: ["portfolio-v2", "contact", "flyer"] },
  { name: "Portfolio V2 Contact Entrance Sign", category: "signage", archetype: "zone-board", tags: ["portfolio-v2", "contact", "signage"] },
  { name: "Portfolio V2 Broad Canopy Tree", category: "nature", archetype: "tree-wide", variants: sizeVariants, tags: ["portfolio-v2", "nature", "vegetation"] },
  { name: "Portfolio V2 Tall Narrow Tree", category: "nature", archetype: "tree-columnar", variants: sizeVariants, tags: ["portfolio-v2", "nature", "vegetation"] },
  { name: "Portfolio V2 Ornamental Tree", category: "nature", archetype: "tree", variants: sizeVariants, tags: ["portfolio-v2", "nature", "vegetation"] },
  { name: "Portfolio V2 Large Shrub", category: "nature", archetype: "bush", variants: sizeVariants, tags: ["portfolio-v2", "nature", "vegetation"] },
  { name: "Portfolio V2 Low Shrub", category: "nature", archetype: "shrub-low", variants: sizeVariants, tags: ["portfolio-v2", "nature", "vegetation"] },
  { name: "Portfolio V2 Grass Cluster", category: "nature", archetype: "shrub-low", collisionMode: "none", variants: sizeVariants, tags: ["portfolio-v2", "nature", "vegetation"] },
  { name: "Portfolio V2 Flower Cluster", category: "nature", archetype: "shrub-low", collisionMode: "none", variants: sizeVariants, tags: ["portfolio-v2", "nature", "vegetation"] },
  { name: "Portfolio V2 Large Rock", category: "nature", archetype: "rock-stack", variants: sizeVariants, tags: ["portfolio-v2", "nature", "rock"] },
  { name: "Portfolio V2 Medium Rock", category: "nature", archetype: "rock", variants: sizeVariants, tags: ["portfolio-v2", "nature", "rock"] },
  { name: "Portfolio V2 Small Rock Cluster", category: "nature", archetype: "rock-stack", variants: sizeVariants, tags: ["portfolio-v2", "nature", "rock"] },
  { name: "Portfolio V2 Fallen Log", category: "nature", archetype: "fallen-log", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE, footprint: { width: 1.5, depth: 0.4, height: 0.5 } }], tags: ["portfolio-v2", "nature"] },
  { name: "Portfolio V2 Timber Stack", category: "nature", archetype: "container", variants: sizeVariants, tags: ["portfolio-v2", "nature"] },
  { name: "Portfolio V2 Ground Debris", category: "decoration", archetype: "rock-stack", collisionMode: "none", variants: sizeVariants, tags: ["portfolio-v2", "decoration"] },
  { name: "Portfolio V2 Crate", category: "street-furniture", archetype: "container", variants: sizeVariants, tags: ["portfolio-v2", "decoration"] },
  { name: "Portfolio V2 Barrel Container", category: "street-furniture", archetype: "round-platform", collisionMode: "blocking", variants: sizeVariants, tags: ["portfolio-v2", "decoration"] },
  { name: "Scale Reference Mannequin", category: "navigation", archetype: "person-scale-marker", collisionMode: "none", tags: ["navigation", "editor-helper", "scale-reference"] },
  { name: "Central Orientation Monument", category: "portfolio", archetype: "orientation-monument", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "tall", label: "Tall", size: "tall", scale: { x: 1.1, y: 1.18, z: 1.1 }, footprint: { width: 2.9, depth: 2.9, height: 3.8 } }] },
  { name: "Portfolio Workshop Compound", category: "architecture", archetype: "workshop-compound", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "large", label: "Large", size: "large", scale: { x: 1.15, y: 1.05, z: 1.1 }, footprint: { width: 8, depth: 6.2, height: 3.5 } }], futureAssetSlot: "future/modular-workshop" },
  { name: "Personal Studio Compound", category: "architecture", archetype: "studio-compound", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "wide", label: "Wide", size: "wide", scale: { x: 1.2, y: 1, z: 1.05 }, footprint: { width: 7, depth: 5, height: 2.8 } }], futureAssetSlot: "future/personal-studio" },
  { name: "Communication Station", category: "architecture", archetype: "communication-station", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "compact", label: "Compact", size: "small", scale: { x: 0.85, y: 0.9, z: 0.85 }, footprint: { width: 4.3, depth: 3.6, height: 4.1 } }], futureAssetSlot: "future/contact-station" },
  { name: "Wall With Window", category: "architecture", archetype: "wall-window", variants: shortMediumLong },
  { name: "Wall With Doorway", category: "architecture", archetype: "wall-door", variants: shortMediumLong },
  { name: "Main Path Section", category: "roads-and-paths", archetype: "path-section", variants: shortMediumLong },
  { name: "Secondary Path Section", category: "roads-and-paths", archetype: "path-section", variants: [{ id: "short", label: "Short", size: "short", scale: { x: 0.75, y: 1, z: 0.72 }, footprint: { width: 2.2, depth: 1.1, height: 0.25 } }, { id: "long", label: "Long", size: "long", scale: { x: 1.4, y: 1, z: 0.72 }, footprint: { width: 4.2, depth: 1.1, height: 0.25 } }] },
  { name: "Zone Identity Board", category: "signage", archetype: "zone-board", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "wide", label: "Wide", size: "wide", scale: { x: 1.35, y: 1, z: 1 }, footprint: { width: 2.5, depth: 0.65, height: 2.1 } }] },
  { name: "Project Display Rack", category: "portfolio", archetype: "display-rack", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "wide", label: "Wide", size: "wide", scale: { x: 1.25, y: 1, z: 1 }, footprint: { width: 3.2, depth: 1.2, height: 1.9 } }] },
  { name: "Skill Display Stand", category: "portfolio", archetype: "display-rack", variants: [{ id: "standard", label: "Standard", size: "standard", scale: { x: 0.75, y: 0.9, z: 0.85 }, footprint: { width: 1.9, depth: 1, height: 1.75 } }, { id: "wide", label: "Wide", size: "wide", scale: UNIT_SCALE }] },
  { name: "Timeline Arch", category: "portfolio", archetype: "timeline-arch", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "wide", label: "Wide", size: "wide", scale: { x: 1.25, y: 1, z: 1 }, footprint: { width: 3.4, depth: 0.6, height: 2.5 } }] },
  { name: "Milestone Station", category: "portfolio", archetype: "milestone-station", variants: sizeVariants },
  { name: "Skill Branch Landmark", category: "portfolio", archetype: "skill-garden-landmark", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "large", label: "Large", size: "large", scale: { x: 1.18, y: 1.12, z: 1.18 }, footprint: { width: 3.3, depth: 3.3, height: 3.6 } }] },
  { name: "Mailbox Bank", category: "portfolio", archetype: "mailbox-bank", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "long", label: "Long", size: "long", scale: { x: 1.35, y: 1, z: 1 }, footprint: { width: 3.6, depth: 0.7, height: 1.35 } }] },
  { name: "Raised Garden Bed", category: "nature", archetype: "garden-bed", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "long", label: "Long", size: "long", scale: { x: 1.55, y: 1, z: 1 }, footprint: { width: 4, depth: 1.7, height: 0.4 } }] },
  { name: "Wide Canopy Tree", category: "nature", archetype: "tree-wide", variants: sizeVariants },
  { name: "Columnar Tree", category: "nature", archetype: "tree-columnar", variants: sizeVariants },
  { name: "Low Shrub Cluster", category: "nature", archetype: "shrub-low", variants: sizeVariants },
  { name: "Stacked Rock Cluster", category: "nature", archetype: "rock-stack", variants: sizeVariants },
  { name: "Development Workbench", category: "portfolio", archetype: "workbench-rich", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "wide", label: "Wide", size: "wide", scale: { x: 1.25, y: 1, z: 1 }, footprint: { width: 3.1, depth: 1.1, height: 1.1 } }] },
  { name: "Desk With Monitor", category: "portfolio", archetype: "monitor-desk", variants: [{ id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }, { id: "compact", label: "Compact", size: "small", scale: { x: 0.82, y: 0.9, z: 0.85 }, footprint: { width: 1.5, depth: 0.9, height: 1.4 } }] },
  ...["Building Mass", "Workshop Shell"].map((name) => ({ name, category: "architecture" as const, archetype: "building" as const, variants: sizeVariants })),
  ...["Open Pavilion"].map((name) => ({ name, category: "architecture" as const, archetype: "pavilion" as const, variants: sizeVariants.slice(0, 2) })),
  ...["Shed", "Kiosk", "Open Shelter", "Door Frame", "Window Frame", "Flat Roof", "Simple Sloped Roof", "Archway", "Entrance Gate"].map((name) => ({ name, category: "architecture" as const, archetype: (name.includes("Gate") || name.includes("Frame") || name === "Archway") ? "gate" as const : "building" as const })),
  { name: "Porch", category: "architecture", archetype: "pavilion", variants: [{ id: "small", label: "Small", size: "small", scale: { x: 0.65, y: 0.7, z: 0.55 } }, { id: "wide", label: "Wide", size: "wide", scale: { x: 1.25, y: 0.75, z: 0.6 } }] },
  { name: "Awning", category: "architecture", archetype: "pavilion", variants: [{ id: "small", label: "Small", size: "small", scale: { x: 0.6, y: 0.45, z: 0.35 } }, { id: "wide", label: "Wide", size: "wide", scale: { x: 1.2, y: 0.45, z: 0.35 } }] },
  { name: "Wall Segment", category: "architecture", archetype: "wall", variants: shortMediumLong },
  { name: "Wall Corner", category: "architecture", archetype: "gate" },

  { name: "Square Platform", category: "infrastructure", archetype: "platform", variants: sizeVariants },
  { name: "Rectangular Platform", category: "infrastructure", archetype: "platform", variants: [{ id: "small", label: "Small", size: "small", scale: { x: 0.8, y: 1, z: 0.55 } }, { id: "medium", label: "Medium", size: "medium", scale: { x: 1.35, y: 1, z: 0.75 } }, { id: "large", label: "Large", size: "large", scale: { x: 2, y: 1, z: 1 } }] },
  { name: "Circular Platform", category: "infrastructure", archetype: "round-platform", variants: sizeVariants.slice(0, 2) },
  ...["Central Roundabout Base", "Bollard", "Boundary Post"].map((name) => ({ name, category: "infrastructure" as const, archetype: name.includes("Roundabout") ? "round-platform" as const : "post" as const })),
  { name: "Retaining Wall", category: "infrastructure", archetype: "wall", variants: shortMediumLong },
  { name: "Steps", category: "infrastructure", archetype: "steps", variants: [{ id: "one-level", label: "One Level", size: "low", scale: { x: 1, y: 0.45, z: 0.65 } }, { id: "two-levels", label: "Two Levels", size: "medium", scale: { x: 1, y: 0.7, z: 0.85 } }, { id: "three-levels", label: "Three Levels", size: "large", scale: UNIT_SCALE }] },
  { name: "Ramp", category: "infrastructure", archetype: "platform", variants: [{ id: "short", label: "Short", size: "short", scale: { x: 0.9, y: 0.35, z: 0.55 } }, { id: "long", label: "Long", size: "long", scale: { x: 1.8, y: 0.35, z: 0.55 } }] },
  { name: "Bridge", category: "infrastructure", archetype: "bridge", variants: [{ id: "short", label: "Short", size: "short", scale: { x: 0.8, y: 1, z: 1 } }, { id: "medium", label: "Medium", size: "medium", scale: UNIT_SCALE }] },
  { name: "Simple Footbridge", category: "infrastructure", archetype: "bridge" },
  { name: "Fence", category: "infrastructure", archetype: "fence", variants: shortMediumLong },
  { name: "Fence Corner", category: "infrastructure", archetype: "gate" },
  { name: "Fence Gate", category: "infrastructure", archetype: "gate" },

  ...["Path Border", "Path Corner Border", "Path Entrance", "Pedestrian Crossing Marker", "Roadside Marker", "Junction Marker", "Circular Plaza Insert", "Drain or Ground Detail Plane", "Elevated Walkway"].map((name) => ({ name, category: "roads-and-paths" as const, archetype: name.includes("Walkway") ? "bridge" as const : name.includes("Circular") ? "round-platform" as const : "path-detail" as const, variants: name === "Path Border" || name === "Elevated Walkway" ? shortMediumLong : undefined })),

  { name: "Bench", category: "street-furniture", archetype: "bench", variants: [{ id: "small", label: "Small", size: "small", scale: { x: 0.8, y: 0.9, z: 0.9 } }, { id: "standard", label: "Standard", size: "standard", scale: UNIT_SCALE }] },
  ...["Lamp Post", "Utility Pole", "Directional Signpost", "Central Multi-Direction Sign", "Bollard"].map((name) => ({ name, category: "street-furniture" as const, archetype: "post" as const, variants: name === "Lamp Post" ? [{ id: "short", label: "Short", size: "short" as const, scale: { x: 1, y: 0.8, z: 1 } }, { id: "tall", label: "Tall", size: "tall" as const, scale: { x: 1, y: 1.35, z: 1 } }] : undefined })),
  ...["Section Sign", "Noticeboard", "Bulletin Board", "Information Pedestal"].map((name) => ({ name, category: name === "Information Pedestal" ? "street-furniture" as const : "signage" as const, archetype: "board" as const })),
  ...["Mailbox", "Waste Bin", "Planter", "Bicycle Rack Proxy", "Simple Barrier", "Crate", "Barrel"].map((name) => ({
    name,
    category: "street-furniture" as const,
    archetype:
      name === "Bicycle Rack Proxy" ? "bike-rack" as const :
      name === "Simple Barrier" ? "barrier" as const :
      name.includes("Planter") || name.includes("Crate") ? "container" as const :
      name === "Barrel" ? "round-platform" as const :
      "container" as const,
    collisionMode: name === "Barrel" ? "blocking" as const : undefined,
    variants: name === "Planter" || name === "Crate" ? [{ id: "small", label: "Small", size: "small" as const, scale: { x: 0.75, y: 0.75, z: 0.75 } }, { id: "large", label: "Large", size: "large" as const, scale: { x: 1.25, y: 1.25, z: 1.25 } }] : undefined,
  })),

  ...["Deciduous Tree", "Conifer", "Orchard Tree", "Skill Tree Placeholder"].map((name) => ({ name, category: "nature" as const, archetype: "tree" as const, variants: sizeVariants })),
  { name: "Narrow Tree", category: "nature", archetype: "tree", variants: [{ id: "small", label: "Small", size: "small", scale: { x: 0.65, y: 1, z: 0.65 } }, { id: "tall", label: "Tall", size: "tall", scale: { x: 0.7, y: 1.45, z: 0.7 } }] },
  ...["Young Tree", "Tree Stump", "Fallen Log", "Bush", "Hedge", "Rock", "Boulder Cluster", "Grass Clump", "Flower Patch Marker"].map((name) => ({
    name,
    category: "nature" as const,
    archetype:
      name === "Tree Stump" ? "tree-stump" as const :
      name === "Fallen Log" ? "fallen-log" as const :
      name === "Boulder Cluster" ? "rock-stack" as const :
      name.includes("Rock") ? "rock" as const :
      name.includes("Tree") ? "tree" as const :
      "bush" as const,
    collisionMode: name === "Grass Clump" || name === "Flower Patch Marker" ? "none" as const : undefined,
    variants:
      name === "Bush" || name === "Hedge" || name === "Rock" ? sizeVariants :
      name === "Fallen Log" ? [{ id: "short", label: "Short", size: "short" as const, scale: { x: 0.7, y: 1, z: 1 } }, { id: "long", label: "Long", size: "long" as const, scale: { x: 1.5, y: 1, z: 1 } }] :
      undefined,
  })),

  ...["Desk", "Worktable", "About Desk"].map((name) => ({ name, category: name === "About Desk" ? "portfolio" as const : "office" as const, archetype: "desk" as const, variants: name === "Desk" ? [{ id: "small", label: "Small", size: "small" as const, scale: { x: 0.75, y: 0.9, z: 0.8 } }, { id: "standard", label: "Standard", size: "standard" as const, scale: UNIT_SCALE }] : undefined })),
  ...["Chair Proxy", "Office Chair Proxy"].map((name) => ({ name, category: "office" as const, archetype: "chair" as const })),
  ...["Monitor", "Laptop", "Project Display Monitor"].map((name) => ({ name, category: name.includes("Project") ? "portfolio" as const : "office" as const, archetype: "screen" as const })),
  ...["Keyboard Slab", "Folder", "Folder Stack", "Document Stack", "Sketchbook", "Rolled Plan", "CV Flyer", "Envelope", "Project Folder", "Featured Project Folder"].map((name) => ({
    name,
    category: name.includes("Project") || name.includes("CV") || name === "Envelope" ? "portfolio" as const : "office" as const,
    archetype: "paper-stack" as const,
    collisionMode: "none" as const,
    variants: name === "Folder" || name === "CV Flyer" ? [{ id: "closed", label: "Closed", size: "small" as const, scale: UNIT_SCALE }, { id: "open", label: "Open", size: "wide" as const, scale: { x: 1.35, y: 0.7, z: 1 } }] : undefined,
  })),
  ...["Pinboard", "Filing Cabinet", "Storage Cabinet", "Shelf", "Desk Lamp", "Coffee Cup Proxy", "Headphones Proxy", "Presentation Pedestal", "Project Blueprint Board"].map((name) => ({
    name,
    category: name.includes("Project") ? "portfolio" as const : "office" as const,
    archetype: name.includes("Board") || name === "Pinboard" ? "board" as const : name.includes("Lamp") ? "post" as const : "container" as const,
    collisionMode: name === "Coffee Cup Proxy" || name === "Headphones Proxy" ? "none" as const : undefined,
    variants: name === "Shelf" ? [{ id: "small", label: "Small", size: "small" as const, scale: { x: 0.7, y: 0.8, z: 0.55 } }, { id: "large", label: "Large", size: "large" as const, scale: { x: 1.35, y: 1.3, z: 0.75 } }] : undefined,
  })),

  ...["Experience Milestone", "Experience Date Post", "Experience Noticeboard", "Skills Category Tree", "Skill Fruit Placeholder", "About Noticeboard", "Contact Mailbox", "Contact Noticeboard", "Contact Form Pedestal", "Central Portfolio Sign", "Section Landmark", "Future Portal Placeholder"].map((name) => ({ name, category: "portfolio" as const, archetype: name.includes("Tree") ? "tree" as const : name.includes("Mailbox") || name.includes("Pedestal") ? "container" as const : name.includes("Sign") || name.includes("Noticeboard") ? "board" as const : "landmark" as const, collisionMode: name.includes("Fruit") ? "none" as const : undefined, futureAssetSlot: name === "Future Portal Placeholder" ? "future/portal" : undefined })),

  ...["Walk Node", "Route Junction", "Wait Point", "Look-at Point", "Character Spawn", "Bird Perch", "Ambient Animation Anchor", "Flyer Start Point", "Flyer End Point", "Camera Interest Point"].map((name) => ({ name, category: "navigation" as const, archetype: "navigation-anchor" as const, collisionMode: "none" as const, tags: ["navigation", "editor-helper"] })),

  // Placeable objects converted out of the terrain shape palette. See
  // docs/world-registry-refactor-audit.md, "Shapes that must become
  // placeable objects". These are independently selectable/movable/
  // removable entities that sit on top of terrain rather than replacing it.
  { name: "Voxel Wall Panel", category: "architecture", archetype: "voxel-wall", tags: ["architecture", "converted-terrain-shape"] },
  { name: "Structural Beam", category: "architecture", archetype: "voxel-beam", tags: ["architecture", "converted-terrain-shape"] },
  { name: "Pillar Base", category: "architecture", archetype: "voxel-pillar-base", tags: ["architecture", "converted-terrain-shape"] },
  { name: "Pillar (Complete)", category: "architecture", archetype: "voxel-pillar-middle", tags: ["architecture", "converted-terrain-shape"] },
  { name: "Pillar Cap", category: "architecture", archetype: "voxel-pillar-cap", tags: ["architecture", "converted-terrain-shape"] },

  { name: "Flat Roof Panel", category: "roofs", archetype: "voxel-roof-flat", tags: ["roofs", "converted-terrain-shape"] },
  { name: "Shallow Roof Panel", category: "roofs", archetype: "voxel-roof-shallow", tags: ["roofs", "converted-terrain-shape"] },
  { name: "Steep Roof Panel", category: "roofs", archetype: "voxel-roof-steep", tags: ["roofs", "converted-terrain-shape"] },
  { name: "Roof Corner (Outer)", category: "roofs", archetype: "voxel-roof-outer-corner", tags: ["roofs", "converted-terrain-shape"] },
  { name: "Roof Corner (Inner)", category: "roofs", archetype: "voxel-roof-inner-corner", tags: ["roofs", "converted-terrain-shape"] },
  { name: "Hollow Roof Panel", category: "roofs", archetype: "voxel-roof-hollow", tags: ["roofs", "converted-terrain-shape"] },
  { name: "Gable Roof Panel", category: "roofs", archetype: "voxel-roof-gable", tags: ["roofs", "converted-terrain-shape"] },

  { name: "Modular Fence Post", category: "fences", archetype: "voxel-fence-post", tags: ["fences", "converted-terrain-shape"] },
  { name: "Modular Fence Line", category: "fences", archetype: "voxel-fence-line", tags: ["fences", "converted-terrain-shape"] },
  { name: "Modular Fence Corner", category: "fences", archetype: "voxel-fence-corner", tags: ["fences", "converted-terrain-shape"] },
  { name: "Modular Fence T-Junction", category: "fences", archetype: "voxel-fence-t", tags: ["fences", "converted-terrain-shape"] },
  { name: "Modular Fence Cross Junction", category: "fences", archetype: "voxel-fence-cross", tags: ["fences", "converted-terrain-shape"] },
  { name: "Modular Fence Gate", category: "fences", archetype: "voxel-fence-gate", tags: ["fences", "converted-terrain-shape"] },

  { name: "Pipe Segment (Short)", category: "pipes-utilities", archetype: "voxel-pipe-short", tags: ["pipes-utilities", "converted-terrain-shape"] },
  { name: "Pipe Segment (Long)", category: "pipes-utilities", archetype: "voxel-pipe-long", tags: ["pipes-utilities", "converted-terrain-shape"] },
  { name: "Pipe Segment (Wide)", category: "pipes-utilities", archetype: "voxel-pipe", tags: ["pipes-utilities", "converted-terrain-shape"] },
  { name: "Pipe Corner (Modular)", category: "pipes-utilities", archetype: "voxel-pipe-corner", tags: ["pipes-utilities", "converted-terrain-shape"] },

  { name: "Wooden Wall Panel", category: "wooden-walls", archetype: "voxel-wooden-wall-full", tags: ["wooden-walls", "converted-terrain-shape"] },
  { name: "Wooden Wall End Post", category: "wooden-walls", archetype: "voxel-wooden-wall-end", tags: ["wooden-walls", "converted-terrain-shape"] },
  { name: "Wooden Wall Corner", category: "wooden-walls", archetype: "voxel-wooden-wall-corner", tags: ["wooden-walls", "converted-terrain-shape"] },
  { name: "Wooden Wall T-Junction", category: "wooden-walls", archetype: "voxel-wooden-wall-t", tags: ["wooden-walls", "converted-terrain-shape"] },
  { name: "Wooden Wall Cross Junction", category: "wooden-walls", archetype: "voxel-wooden-wall-cross", tags: ["wooden-walls", "converted-terrain-shape"] },
  { name: "Wooden Wall Gate", category: "wooden-walls", archetype: "voxel-wooden-wall-gate", tags: ["wooden-walls", "converted-terrain-shape"] },
  { name: "Solid Wooden Wall Panel", category: "wooden-walls", archetype: "voxel-solid-wooden-wall-full", tags: ["wooden-walls", "converted-terrain-shape"] },
  { name: "Solid Wooden Wall End Post", category: "wooden-walls", archetype: "voxel-solid-wooden-wall-end", tags: ["wooden-walls", "converted-terrain-shape"] },
  { name: "Solid Wooden Wall Corner", category: "wooden-walls", archetype: "voxel-solid-wooden-wall-corner", tags: ["wooden-walls", "converted-terrain-shape"] },
  { name: "Solid Wooden Wall T-Junction", category: "wooden-walls", archetype: "voxel-solid-wooden-wall-t", tags: ["wooden-walls", "converted-terrain-shape"] },
  { name: "Solid Wooden Wall Cross Junction", category: "wooden-walls", archetype: "voxel-solid-wooden-wall-cross", tags: ["wooden-walls", "converted-terrain-shape"] },
  { name: "Solid Wooden Wall Gate", category: "wooden-walls", archetype: "voxel-solid-wooden-wall-gate", tags: ["wooden-walls", "converted-terrain-shape"] },

  { name: "Low Retaining Wall Panel", category: "retaining-structures", archetype: "voxel-retaining-wall-low", tags: ["retaining-structures", "converted-terrain-shape"] },

  { name: "Small Rubble Pile", category: "rocks-rubble", archetype: "voxel-rubble-small", tags: ["rocks-rubble", "converted-terrain-shape"] },
  { name: "Medium Rubble Pile", category: "rocks-rubble", archetype: "voxel-rubble-medium", tags: ["rocks-rubble", "converted-terrain-shape"] },

  { name: "Small Stalactite", category: "crystals-caves", archetype: "voxel-stalactite-small", tags: ["crystals-caves", "converted-terrain-shape"] },
  { name: "Large Stalactite", category: "crystals-caves", archetype: "voxel-stalactite-large", tags: ["crystals-caves", "converted-terrain-shape"] },
  { name: "Small Crystal Formation", category: "crystals-caves", archetype: "voxel-crystal-small", tags: ["crystals-caves", "converted-terrain-shape"] },
  { name: "Medium Crystal Formation", category: "crystals-caves", archetype: "voxel-crystal-medium", tags: ["crystals-caves", "converted-terrain-shape"] },
  { name: "Large Crystal Formation", category: "crystals-caves", archetype: "voxel-crystal-large", tags: ["crystals-caves", "converted-terrain-shape"] },

  { name: "Ice Chunks", category: "ice-formations", archetype: "voxel-ice-chunks", tags: ["ice-formations", "converted-terrain-shape"] },
  { name: "Ice Chunks (Medium)", category: "ice-formations", archetype: "voxel-ice-chunks-medium", tags: ["ice-formations", "converted-terrain-shape"] },
  { name: "Icicles", category: "ice-formations", archetype: "voxel-icicles", tags: ["ice-formations", "converted-terrain-shape"] },
  { name: "Large Icicles", category: "ice-formations", archetype: "voxel-icicles-large", tags: ["ice-formations", "converted-terrain-shape"] },
];

export const BUILT_IN_PREFABS: PrefabDefinition[] = createPrefabLibrary();
export const PREFAB_BY_ID = new Map(BUILT_IN_PREFABS.map((prefab) => [prefab.id, prefab]));

export function getPrefabDefinition(prefabId: string) {
  return PREFAB_BY_ID.get(prefabId) ?? null;
}

export function listPrefabCategories() {
  return [...new Set(BUILT_IN_PREFABS.map((prefab) => prefab.category))];
}
