import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { readMap } from "@/lib/maps/map-store";
import { BAKE_FORMAT_VERSION } from "./baked-format";
import { bakeMap } from "./bake-map";
import { bakeDirectory, mapSourceHash, shortHash, type BakeRecord } from "./bake-records";

export * from "./bake-records";

/** Bakes the saved map and writes the result next to it. */
export async function bakeMapToDisk(mapId: string, options: { root?: string } = {}): Promise<BakeRecord> {
  const { root } = options;
  const { file, header } = await bakeMap(readMap(mapId, root));
  const directory = bakeDirectory(mapId, root);
  fs.mkdirSync(directory, { recursive: true });
  // Stored compressed: hosts do not compress binary responses, and the cell lists shrink to a fraction.
  const compressed = gzipSync(file, { level: 9 });
  fs.writeFileSync(path.join(directory, "world.bin"), compressed);
  const record: BakeRecord = {
    format: BAKE_FORMAT_VERSION,
    sourceHash: mapSourceHash(mapId, root),
    hash: shortHash(compressed),
    fileBytes: compressed.byteLength,
    bakedAt: new Date().toISOString(),
    stats: header.stats,
  };
  fs.writeFileSync(path.join(directory, "bake.json"), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}
