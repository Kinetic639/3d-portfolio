import { BUILT_IN_PREFABS } from "@/lib/prefabs/prefab-library";
import type { AssetManifest } from "./asset-types";

/**
 * Everything the editor's object tool can place, in one list: models from
 * the asset pipeline and the procedural prefabs. Prefabs are placeholders;
 * a model can take one over through `replacesPrefabs` in its asset.json.
 */
export type LibraryItem = {
  /** "model:<id>" or "prefab:<id>". */
  key: string;
  kind: "model" | "prefab";
  id: string;
  name: string;
  category: string;
  variants: Array<{ id: string; label: string }>;
  defaultVariantId: string | null;
  /** Changes whenever the item would look different, for caching thumbnails. */
  revision: string;
  /** Models only. */
  bytes?: number;
  triangles?: number;
  animated?: boolean;
  /** Prefabs only: the model drawn in its place, if any. */
  replacedBy?: string;
};

export function listLibraryItems(manifest: AssetManifest): LibraryItem[] {
  const replacements = new Map<string, string>();
  for (const asset of manifest.assets) for (const prefabId of asset.replacesPrefabs) replacements.set(prefabId, asset.id);

  const models: LibraryItem[] = manifest.assets.map((asset) => ({
    key: `model:${asset.id}`,
    kind: "model",
    id: asset.id,
    name: asset.name,
    category: asset.category,
    variants: asset.variants.map(({ id, label }) => ({ id, label })),
    defaultVariantId: asset.variants[0]?.id ?? null,
    revision: asset.hash,
    bytes: asset.bytes,
    triangles: asset.triangles,
    animated: Boolean(asset.animation),
  }));
  const prefabs: LibraryItem[] = BUILT_IN_PREFABS.map((prefab) => ({
    key: `prefab:${prefab.id}`,
    kind: "prefab",
    id: prefab.id,
    name: prefab.name,
    category: prefab.category,
    variants: prefab.variants.map(({ id, label }) => ({ id, label })),
    defaultVariantId: prefab.defaultVariantId,
    revision: `${prefab.version}:${replacements.get(prefab.id) ?? ""}`,
    replacedBy: replacements.get(prefab.id),
  }));
  return [...models, ...prefabs];
}
