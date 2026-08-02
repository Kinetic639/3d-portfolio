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
  | "pavilion"
  | "wall"
  | "gate"
  | "platform"
  | "round-platform"
  | "steps"
  | "bridge"
  | "fence"
  | "path-detail"
  | "bench"
  | "post"
  | "board"
  | "container"
  | "tree"
  | "bush"
  | "rock"
  | "desk"
  | "chair"
  | "screen"
  | "paper-stack"
  | "landmark"
  | "navigation-anchor";

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
    case "gate":
      return [
        part("left-post", "box", { x: -0.75, y: 0.9, z: 0 }, { x: 0.25, y: 1.8, z: 0.25 }, "structure-dark"),
        part("right-post", "box", { x: 0.75, y: 0.9, z: 0 }, { x: 0.25, y: 1.8, z: 0.25 }, "structure-dark"),
        part("lintel", "box", { x: 0, y: 1.75, z: 0 }, { x: 1.8, y: 0.25, z: 0.25 }, "structure-light"),
      ];
    case "platform":
      return [part("platform", "platform", { x: 0, y: 0.08, z: 0 }, { x: 2, y: 0.16, z: 2 }, "path-proxy")];
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
    case "container":
      return [part("container", "box", { x: 0, y: 0.45, z: 0 }, { x: 0.8, y: 0.9, z: 0.8 }, "metal-proxy")];
    case "tree":
      return [
        part("trunk", "cylinder", { x: 0, y: 0.7, z: 0 }, { x: 0.22, y: 1.4, z: 0.22 }, "vegetation-trunk"),
        part("canopy", "sphere", { x: 0, y: 1.65, z: 0 }, { x: 1.1, y: 0.9, z: 1.1 }, "vegetation-canopy"),
      ];
    case "bush":
      return [
        part("bush-a", "sphere", { x: -0.22, y: 0.38, z: 0 }, { x: 0.75, y: 0.55, z: 0.75 }, "vegetation-canopy"),
        part("bush-b", "sphere", { x: 0.28, y: 0.32, z: 0.08 }, { x: 0.65, y: 0.48, z: 0.65 }, "foliage-light"),
      ];
    case "rock":
      return [part("rock", "sphere", { x: 0, y: 0.25, z: 0 }, { x: 0.85, y: 0.45, z: 0.65 }, "terrain-neutral")];
    case "desk":
      return [
        part("top", "box", { x: 0, y: 0.75, z: 0 }, { x: 1.7, y: 0.14, z: 0.8 }, "wood-proxy"),
        part("leg-a", "box", { x: -0.72, y: 0.36, z: -0.3 }, { x: 0.1, y: 0.72, z: 0.1 }, "metal-proxy"),
        part("leg-b", "box", { x: 0.72, y: 0.36, z: -0.3 }, { x: 0.1, y: 0.72, z: 0.1 }, "metal-proxy"),
        part("leg-c", "box", { x: -0.72, y: 0.36, z: 0.3 }, { x: 0.1, y: 0.72, z: 0.1 }, "metal-proxy"),
        part("leg-d", "box", { x: 0.72, y: 0.36, z: 0.3 }, { x: 0.1, y: 0.72, z: 0.1 }, "metal-proxy"),
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
    case "landmark":
      return [
        part("base", "cylinder", { x: 0, y: 0.12, z: 0 }, { x: 1.2, y: 0.24, z: 1.2 }, "structure-dark"),
        part("body", "box", { x: 0, y: 0.8, z: 0 }, { x: 0.75, y: 1.25, z: 0.75 }, "accent-blue"),
        part("cap", "sphere", { x: 0, y: 1.55, z: 0 }, { x: 0.8, y: 0.35, z: 0.8 }, "accent-orange"),
      ];
    case "navigation-anchor":
      return [
        part("base", "cylinder", { x: 0, y: 0.04, z: 0 }, { x: 0.55, y: 0.08, z: 0.55 }, "accent-blue"),
        part("marker", "sphere", { x: 0, y: 0.38, z: 0 }, { x: 0.35, y: 0.35, z: 0.35 }, "selection-validation"),
      ];
  }
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
  if (archetype === "building") return { width: 3, depth: 2.4, height: 2.3 };
  if (archetype === "pavilion") return { width: 3, depth: 2.6, height: 2 };
  if (archetype === "wall") return { width: 3, depth: 0.35, height: 1.4 };
  if (archetype === "gate") return { width: 2, depth: 0.5, height: 2 };
  if (archetype === "bridge") return { width: 3.2, depth: 1.4, height: 0.8 };
  if (archetype === "tree") return { width: 0.45, depth: 0.45, height: 2.1 };
  if (archetype === "bush") return { width: 0.9, depth: 0.8, height: 0.8 };
  if (archetype === "rock") return { width: 0.8, depth: 0.7, height: 0.5 };
  if (archetype === "desk") return { width: 1.8, depth: 0.9, height: 0.9 };
  if (archetype === "chair") return { width: 0.7, depth: 0.7, height: 1.2 };
  if (archetype === "screen") return { width: 0.9, depth: 0.25, height: 1.1 };
  if (archetype === "path-detail") return { width: 1.4, depth: 0.4, height: 0.05 };
  if (archetype === "navigation-anchor") return { width: 0.45, depth: 0.45, height: 0.45 };
  return { width: 1, depth: 1, height: 1 };
}

function inferCollisionMode(archetype: PrefabArchetype): CollisionMode {
  if (archetype === "platform" || archetype === "round-platform" || archetype === "bridge" || archetype === "steps") return "walkable";
  if (archetype === "path-detail" || archetype === "navigation-anchor") return "none";
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
  ...["Section Sign", "Noticeboard", "Bulletin Board", "Information Pedestal"].map((name) => ({ name, category: "street-furniture" as const, archetype: "board" as const })),
  ...["Mailbox", "Waste Bin", "Planter", "Bicycle Rack Proxy", "Simple Barrier", "Crate", "Barrel"].map((name) => ({ name, category: "street-furniture" as const, archetype: name.includes("Planter") || name.includes("Crate") ? "container" as const : name === "Barrel" ? "round-platform" as const : "container" as const, variants: name === "Planter" || name === "Crate" ? [{ id: "small", label: "Small", size: "small" as const, scale: { x: 0.75, y: 0.75, z: 0.75 } }, { id: "large", label: "Large", size: "large" as const, scale: { x: 1.25, y: 1.25, z: 1.25 } }] : undefined })),

  ...["Deciduous Tree", "Conifer", "Orchard Tree", "Skill Tree Placeholder"].map((name) => ({ name, category: "nature" as const, archetype: "tree" as const, variants: sizeVariants })),
  { name: "Narrow Tree", category: "nature", archetype: "tree", variants: [{ id: "small", label: "Small", size: "small", scale: { x: 0.65, y: 1, z: 0.65 } }, { id: "tall", label: "Tall", size: "tall", scale: { x: 0.7, y: 1.45, z: 0.7 } }] },
  ...["Young Tree", "Tree Stump", "Fallen Log", "Bush", "Hedge", "Rock", "Boulder Cluster", "Grass Clump", "Flower Patch Marker"].map((name) => ({ name, category: "nature" as const, archetype: name.includes("Rock") || name.includes("Boulder") ? "rock" as const : name.includes("Tree") || name.includes("Log") ? "tree" as const : "bush" as const, variants: name === "Bush" || name === "Hedge" || name === "Rock" ? sizeVariants : name === "Fallen Log" ? [{ id: "short", label: "Short", size: "short" as const, scale: { x: 0.7, y: 0.4, z: 0.45 } }, { id: "long", label: "Long", size: "long" as const, scale: { x: 1.6, y: 0.4, z: 0.45 } }] : undefined })),

  ...["Desk", "Worktable", "About Desk"].map((name) => ({ name, category: name === "About Desk" ? "portfolio" as const : "office" as const, archetype: "desk" as const, variants: name === "Desk" ? [{ id: "small", label: "Small", size: "small" as const, scale: { x: 0.75, y: 0.9, z: 0.8 } }, { id: "standard", label: "Standard", size: "standard" as const, scale: UNIT_SCALE }] : undefined })),
  ...["Chair Proxy", "Office Chair Proxy"].map((name) => ({ name, category: "office" as const, archetype: "chair" as const })),
  ...["Monitor", "Laptop", "Project Display Monitor"].map((name) => ({ name, category: name.includes("Project") ? "portfolio" as const : "office" as const, archetype: "screen" as const })),
  ...["Keyboard Slab", "Folder", "Folder Stack", "Document Stack", "Sketchbook", "Rolled Plan", "CV Flyer", "Envelope", "Project Folder", "Featured Project Folder"].map((name) => ({ name, category: name.includes("Project") || name.includes("CV") || name === "Envelope" ? "portfolio" as const : "office" as const, archetype: "paper-stack" as const, variants: name === "Folder" || name === "CV Flyer" ? [{ id: "closed", label: "Closed", size: "small" as const, scale: UNIT_SCALE }, { id: "open", label: "Open", size: "wide" as const, scale: { x: 1.35, y: 0.7, z: 1 } }] : undefined })),
  ...["Pinboard", "Filing Cabinet", "Storage Cabinet", "Shelf", "Desk Lamp", "Coffee Cup Proxy", "Headphones Proxy", "Presentation Pedestal", "Project Blueprint Board"].map((name) => ({ name, category: name.includes("Project") ? "portfolio" as const : "office" as const, archetype: name.includes("Board") || name === "Pinboard" ? "board" as const : name.includes("Lamp") ? "post" as const : "container" as const, variants: name === "Shelf" ? [{ id: "small", label: "Small", size: "small" as const, scale: { x: 0.7, y: 0.8, z: 0.55 } }, { id: "large", label: "Large", size: "large" as const, scale: { x: 1.35, y: 1.3, z: 0.75 } }] : undefined })),

  ...["Experience Milestone", "Experience Date Post", "Experience Noticeboard", "Skills Category Tree", "Skill Fruit Placeholder", "About Noticeboard", "Contact Mailbox", "Contact Noticeboard", "Contact Form Pedestal", "Central Portfolio Sign", "Section Landmark", "Future Portal Placeholder"].map((name) => ({ name, category: "portfolio" as const, archetype: name.includes("Tree") ? "tree" as const : name.includes("Mailbox") || name.includes("Pedestal") ? "container" as const : name.includes("Sign") || name.includes("Noticeboard") ? "board" as const : "landmark" as const, collisionMode: name.includes("Fruit") ? "none" as const : undefined, futureAssetSlot: name === "Future Portal Placeholder" ? "future/portal" : undefined })),

  ...["Walk Node", "Route Junction", "Wait Point", "Look-at Point", "Character Spawn", "Bird Perch", "Ambient Animation Anchor", "Flyer Start Point", "Flyer End Point", "Camera Interest Point"].map((name) => ({ name, category: "navigation" as const, archetype: "navigation-anchor" as const, collisionMode: "none" as const, tags: ["navigation", "editor-helper"] })),
];

export const BUILT_IN_PREFABS: PrefabDefinition[] = createPrefabLibrary();
export const PREFAB_BY_ID = new Map(BUILT_IN_PREFABS.map((prefab) => [prefab.id, prefab]));

export function getPrefabDefinition(prefabId: string) {
  return PREFAB_BY_ID.get(prefabId) ?? null;
}

export function listPrefabCategories() {
  return [...new Set(BUILT_IN_PREFABS.map((prefab) => prefab.category))];
}
