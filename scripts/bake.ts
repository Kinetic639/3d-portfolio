import { bakeMapToDisk, getBakeStatus } from "../lib/bake/bake-store";
import { listMapIds, mapExists, readMapIndex } from "../lib/maps/map-store";

/**
 * pnpm bake              bakes the default map
 * pnpm bake <id> [...]   bakes the named maps
 * pnpm bake --all        bakes every map
 * pnpm bake --check      bakes nothing; exits 1 if the chosen maps' bakes are missing or stale
 */
async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const named = args.filter((arg) => !arg.startsWith("--"));
  const ids = args.includes("--all") ? listMapIds() : named.length > 0 ? named : [readMapIndex().defaultMapId];
  let failed = false;

  for (const id of ids) {
    if (!mapExists(id)) {
      console.error(`${id}: no such map`);
      failed = true;
      continue;
    }
    if (check) {
      const status = getBakeStatus(id);
      console.log(`${id}: ${status.state}`);
      if (status.state !== "fresh") failed = true;
      continue;
    }
    const record = await bakeMapToDisk(id);
    const { stats } = record;
    console.log(
      `${id}: ${stats.faces.toLocaleString("en")} visible faces of ${stats.cells.toLocaleString("en")} cells in ${stats.tiles} tiles, ` +
      `${(record.fileBytes / 1024).toFixed(0)} KB (${(stats.bytes / 1024).toFixed(0)} KB uncompressed), ${stats.bakeMs} ms -> maps/${id}/baked/`,
    );
  }
  if (failed) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
