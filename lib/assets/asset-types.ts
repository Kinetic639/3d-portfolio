import type { CollisionMode } from "@/lib/maps/map-entities";
import type { PrefabCategory } from "@/lib/prefabs/prefab-types";

/**
 * Model assets.
 *
 * Source (committed):   assets/models/<id>/model.glb (or .gltf) + asset.json
 * Output (generated):   public/assets/models/<id>-<hash>.glb + manifest.json
 *
 * `pnpm assets` turns the first into the second. Maps refer to a model by its
 * id only, so replacing a source file changes every placed instance.
 */
export const ASSET_CATEGORIES: PrefabCategory[] = [
  "architecture", "infrastructure", "roads-and-paths", "street-furniture", "nature", "office", "portfolio", "signage", "navigation", "decoration",
];
const COLLISION_MODES: CollisionMode[] = ["none", "blocking", "walkable", "trigger"];

export type AssetVariant = {
  id: string;
  label: string;
  /** Multiplies the model's size. */
  scale?: number;
  /** Multiplies every material colour, "#rrggbb". */
  tint?: string;
};

/** The contents of asset.json. Only `name` and `category` are required. */
export type AssetMetadata = {
  name: string;
  category: PrefabCategory;
  description?: string;
  /** Scale from the model's units to world units (1 unit = 1 block). Default 1. */
  scale?: number;
  /** Degrees around the vertical axis so that the model's front faces north. Default 0. */
  rotationY?: number;
  /** Which point of the model sits at an instance's position. Default "bottom": the centre of its base. */
  anchor?: "bottom" | "center";
  collision?: CollisionMode;
  /** Name of an animation clip to loop. Animated models are drawn one by one, not instanced. */
  animation?: string;
  variants?: AssetVariant[];
  /** Ids of procedural prefabs this model stands in for: every placed instance of them is drawn with the model. */
  replacesPrefabs?: string[];
  tags?: string[];
};

export type AssetManifestEntry = Required<Pick<AssetMetadata, "name" | "category" | "scale" | "rotationY" | "anchor" | "collision">> &
  Pick<AssetMetadata, "description" | "animation"> & {
    id: string;
    variants: AssetVariant[];
    replacesPrefabs: string[];
    tags: string[];
    /** File name inside public/assets/models. Contains the content hash. */
    file: string;
    hash: string;
    sourceBytes: number;
    bytes: number;
    triangles: number;
    vertices: number;
    meshes: number;
    materials: number;
    textures: number;
    animations: string[];
    skinned: boolean;
    /** Bounds of the source model, in its own units. */
    bounds: { min: [number, number, number]; max: [number, number, number] };
  };

export type AssetManifest = {
  version: 1;
  assets: AssetManifestEntry[];
};

export const ASSET_PUBLIC_PATH = "/assets/models";
export const EMPTY_ASSET_MANIFEST: AssetManifest = { version: 1, assets: [] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

/** Problems in an asset.json, in words a person can act on. Empty when it is valid. */
export function validateAssetMetadata(input: unknown): string[] {
  if (!isRecord(input)) return ["asset.json must be an object."];
  const errors: string[] = [];
  if (typeof input.name !== "string" || input.name.trim() === "") errors.push("name is required.");
  if (!ASSET_CATEGORIES.includes(input.category as PrefabCategory)) errors.push(`category must be one of: ${ASSET_CATEGORIES.join(", ")}.`);
  if (input.scale !== undefined && !(typeof input.scale === "number" && input.scale > 0)) errors.push("scale must be a positive number.");
  if (input.rotationY !== undefined && typeof input.rotationY !== "number") errors.push("rotationY must be a number of degrees.");
  if (input.anchor !== undefined && input.anchor !== "bottom" && input.anchor !== "center") errors.push('anchor must be "bottom" or "center".');
  if (input.collision !== undefined && !COLLISION_MODES.includes(input.collision as CollisionMode)) errors.push(`collision must be one of: ${COLLISION_MODES.join(", ")}.`);
  if (input.animation !== undefined && typeof input.animation !== "string") errors.push("animation must be the name of a clip.");
  if (input.variants !== undefined) {
    if (!Array.isArray(input.variants)) errors.push("variants must be an array.");
    else {
      const ids = new Set<string>();
      for (const variant of input.variants) {
        if (!isRecord(variant) || !isId(variant.id) || typeof variant.label !== "string") {
          errors.push("every variant needs an id (lowercase, dashes) and a label.");
          continue;
        }
        if (ids.has(variant.id)) errors.push(`duplicate variant id: ${variant.id}.`);
        ids.add(variant.id);
        if (variant.scale !== undefined && !(typeof variant.scale === "number" && variant.scale > 0)) errors.push(`variant ${variant.id}: scale must be a positive number.`);
        if (variant.tint !== undefined && !(typeof variant.tint === "string" && /^#[0-9a-f]{6}$/i.test(variant.tint))) errors.push(`variant ${variant.id}: tint must look like #a1b2c3.`);
      }
    }
  }
  for (const key of ["replacesPrefabs", "tags"] as const) {
    if (input[key] !== undefined && !(Array.isArray(input[key]) && input[key].every((item) => typeof item === "string"))) errors.push(`${key} must be an array of strings.`);
  }
  return errors;
}

export const isAssetId = isId;
