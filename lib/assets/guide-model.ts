import fs from "node:fs";
import path from "node:path";
import { ASSET_PUBLIC_PATH, type AssetManifest } from "./asset-types";

/** The guide's model id in assets/models (docs/characters.md). */
export const GUIDE_MODEL_ID = "guide";

/**
 * The guide's optimised model, from the asset pipeline's manifest (server
 * only, read at build time). Null when the pipeline has not produced it.
 */
export function guideModelUrl(root = process.cwd()): string | null {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "public", ASSET_PUBLIC_PATH, "manifest.json"), "utf8")) as AssetManifest;
    const entry = manifest.assets.find((asset) => asset.id === GUIDE_MODEL_ID);
    return entry ? `${ASSET_PUBLIC_PATH}/${entry.file}` : null;
  } catch {
    return null;
  }
}
