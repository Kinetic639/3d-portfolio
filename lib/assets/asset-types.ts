import { validateActorSettings, type ModelActorSettings, type ModelStyleSettings, type ModelWindSettings } from "@/lib/maps/map-definition";
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
  "architecture", "infrastructure", "roads-and-paths", "street-furniture", "nature", "office", "portfolio", "signage", "navigation", "decoration", "creatures",
];

/** Vertex attributes every model keeps; anything else is dropped unless asset.json lists it in `attributes`. */
export const BASE_VERTEX_ATTRIBUTES = ["POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"];
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
  /**
   * Vertex attributes to keep besides BASE_VERTEX_ATTRIBUTES, e.g. "COLOR_1"
   * when a shader reads it (tree wind weights). Exported models often carry
   * many unused UV and colour sets; they are dropped by default.
   */
  attributes?: string[];
  /**
   * How transparent materials are drawn. "cutout": alpha-tested (opaque, no
   * sorting, casts correct shadows), right for leaves and feathers.
   * "opaque": alpha ignored. Omitted: as the model says.
   */
  alpha?: "cutout" | "opaque";
  /** Alpha threshold for "cutout". Default 0.5. */
  alphaCutoff?: number;
  /** Clips to keep, by name. Omitted: every clip. Long baked clips are the bulk of a rigged model's size. */
  animations?: string[];
  /** Node whose translation is removed from every clip, so the model moves only where the game moves it. */
  rootMotionNode?: string;
  /** Largest texture side, in pixels; larger textures are scaled down. Default 2048. */
  maxTextureSize?: number;
  /** Present when the model sways in the wind: its default response, which a map can override per model. */
  wind?: ModelWindSettings;
  /**
   * How the model is drawn by default (a map can override it per model).
   * `outline: true` also makes the pipeline compute the model's outline normals.
   */
  style?: ModelStyleSettings;
  /** Present when the model is a creature that can be sent places (needs walk/run/fly clips): its default motion. */
  actor?: ModelActorSettings;
};

export type AssetManifestEntry = Required<Pick<AssetMetadata, "name" | "category" | "scale" | "rotationY" | "anchor" | "collision">> &
  Pick<AssetMetadata, "description" | "animation" | "wind" | "style" | "actor"> & {
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
    /** Vertex attributes in the optimised model (union over its meshes). */
    attributes: string[];
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
  if (input.attributes !== undefined && !(Array.isArray(input.attributes) && input.attributes.every((item) => typeof item === "string" && /^[A-Z_]+[0-9]*$/.test(item)))) {
    errors.push('attributes must be glTF attribute names, e.g. ["COLOR_1"].');
  }
  if (input.alpha !== undefined && input.alpha !== "cutout" && input.alpha !== "opaque") errors.push('alpha must be "cutout" or "opaque".');
  if (input.alphaCutoff !== undefined && !(typeof input.alphaCutoff === "number" && input.alphaCutoff > 0 && input.alphaCutoff < 1)) errors.push("alphaCutoff must be between 0 and 1.");
  if (input.maxTextureSize !== undefined && !(Number.isInteger(input.maxTextureSize) && (input.maxTextureSize as number) >= 16)) errors.push("maxTextureSize must be a whole number of pixels, at least 16.");
  if (input.wind !== undefined) {
    const wind = input.wind;
    if (!isRecord(wind)) errors.push("wind must be an object.");
    else {
      for (const key of ["sway", "branches", "leaves", "stiffness"]) {
        if (wind[key] !== undefined && !(typeof wind[key] === "number" && (wind[key] as number) >= 0 && (wind[key] as number) <= 5)) errors.push(`wind.${key} must be a number from 0 to 5.`);
      }
      if (wind.weightSource !== undefined && !(typeof wind.weightSource === "string" && /^(height|(color_1|uv|uv1|uv2)-[rgbaxy])$/.test(wind.weightSource))) {
        errors.push('wind.weightSource must be "height" or like "color_1-r", "uv-y".');
      }
    }
  }
  if (input.style !== undefined) {
    const style = input.style;
    if (!isRecord(style)) errors.push("style must be an object.");
    else {
      if (style.shading !== undefined && style.shading !== "toon" && style.shading !== "standard") errors.push('style.shading must be "toon" or "standard".');
      for (const key of ["outline", "contactShadow", "castShadow"]) {
        if (style[key] !== undefined && typeof style[key] !== "boolean") errors.push(`style.${key} must be true or false.`);
      }
      if (style.outlineScale !== undefined && !(typeof style.outlineScale === "number" && style.outlineScale >= 0 && style.outlineScale <= 5)) errors.push("style.outlineScale must be a number from 0 to 5.");
    }
  }
  if (input.actor !== undefined) errors.push(...validateActorSettings("actor", input.actor));
  if (input.rootMotionNode !== undefined && typeof input.rootMotionNode !== "string") errors.push("rootMotionNode must be a node name.");
  for (const key of ["replacesPrefabs", "tags", "animations"] as const) {
    if (input[key] !== undefined && !(Array.isArray(input[key]) && input[key].every((item) => typeof item === "string"))) errors.push(`${key} must be an array of strings.`);
  }
  return errors;
}

export const isAssetId = isId;
