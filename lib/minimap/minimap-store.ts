import fs from "node:fs";
import path from "node:path";
import type { MinimapData } from "./minimap";

/** Where `pnpm assets` writes the minimaps (minimap-image.ts). */
export const MINIMAP_OUTPUT = path.join("public", "assets", "minimap");

/** Reads a map's minimap data, or null when it has not been drawn. Server only; no image code is loaded. */
export function readMinimapData(mapId: string, root = process.cwd()): MinimapData | null {
  const file = path.join(root, MINIMAP_OUTPUT, `${mapId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as MinimapData;
}

/** Every drawn minimap, by map id. */
export function readAllMinimaps(root = process.cwd()): Record<string, MinimapData> {
  const directory = path.join(root, MINIMAP_OUTPUT);
  if (!fs.existsSync(directory)) return {};
  const maps: Record<string, MinimapData> = {};
  for (const file of fs.readdirSync(directory)) {
    if (!file.endsWith(".json")) continue;
    const data = readMinimapData(file.slice(0, -5), root);
    if (data) maps[data.mapId] = data;
  }
  return maps;
}
