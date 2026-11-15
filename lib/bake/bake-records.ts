import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getMapsRoot, isValidMapId, listMapIds } from "@/lib/maps/map-store";
import { BAKE_FORMAT_VERSION, type BakeStats } from "./baked-format";

/**
 * Baked worlds on disk (Node only). A bake lives next to its map and is
 * committed with it:
 *
 *   maps/<id>/baked/world.bin   what visitors download (the baked world file, gzip-compressed)
 *   maps/<id>/baked/bake.json   which map content it was baked from, and its size
 *
 * A bake is *fresh* while the map file still has the content it was baked
 * from. The site uses a bake only when it is fresh; otherwise it falls back
 * to the voxel map.
 */
export type BakeRecord = {
  format: number;
  /** Hash of the map file the bake was made from. */
  sourceHash: string;
  /** Hash of world.bin; part of its URL, so it can be cached forever. */
  hash: string;
  /** Size of world.bin as downloaded (gzip). `stats.bytes` is the size after decompression. */
  fileBytes: number;
  bakedAt: string;
  stats: BakeStats;
};

export type BakeStatus = { state: "missing" } | { state: "stale" | "fresh"; record: BakeRecord };

export const shortHash = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex").slice(0, 16);

export function bakeDirectory(mapId: string, root?: string) {
  if (!isValidMapId(mapId)) throw new Error(`Invalid map id: ${String(mapId)}.`);
  return path.join(getMapsRoot(root), mapId, "baked");
}

/** The updatedAt stamp changes on every save; it must not make an unchanged map look different. */
export function mapSourceHash(mapId: string, root?: string) {
  const file = path.join(getMapsRoot(root), mapId, "map.json");
  return shortHash(fs.readFileSync(file, "utf8").replace(/"updatedAt":\s*"[^"]*"/, ""));
}

export function getBakeStatus(mapId: string, root?: string): BakeStatus {
  const directory = bakeDirectory(mapId, root);
  const recordFile = path.join(directory, "bake.json");
  if (!fs.existsSync(recordFile) || !fs.existsSync(path.join(directory, "world.bin"))) return { state: "missing" };
  const record = JSON.parse(fs.readFileSync(recordFile, "utf8")) as BakeRecord;
  const fresh = record.format === BAKE_FORMAT_VERSION && record.sourceHash === mapSourceHash(mapId, root);
  return { state: fresh ? "fresh" : "stale", record };
}

export function readBakedFile(mapId: string, root?: string) {
  return fs.readFileSync(path.join(bakeDirectory(mapId, root), "world.bin"));
}

/** Hash of every map's fresh bake, keyed by map id. Maps without one are absent. */
export function listFreshBakes(root?: string): Record<string, string> {
  const bakes: Record<string, string> = {};
  for (const mapId of listMapIds(root)) {
    const status = getBakeStatus(mapId, root);
    if (status.state === "fresh") bakes[mapId] = status.record.hash;
  }
  return bakes;
}
