/**
 * Upgrades a map file from any older schema (v1-v4) to the current one and
 * stores it under maps/<id>/map.json.
 *
 *   pnpm migrate:map <input.json> [--id new-id] [--name "New name"] [--backdrop 64]
 *
 * --backdrop N adds N cells of flat backdrop scenery on every side and keeps
 * the original extent as the playable area.
 */
import fs from "node:fs";
import { expandMapWithBackdrop, migrateMapDefinition } from "@/lib/maps/map-definition";
import { writeMap } from "@/lib/maps/map-store";

const args = process.argv.slice(2);
const input = args.find((arg) => !arg.startsWith("--"));
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

if (!input) {
  console.error('Usage: pnpm migrate:map <input.json> [--id new-id] [--name "New name"] [--backdrop 64]');
  process.exit(1);
}

let map = migrateMapDefinition(JSON.parse(fs.readFileSync(input, "utf8")));
const id = option("id");
const name = option("name");
if (id) map = { ...map, id };
if (name) map = { ...map, name };

const backdrop = Number(option("backdrop") ?? 0);
if (backdrop > 0) {
  map = expandMapWithBackdrop(map, { west: backdrop, east: backdrop, north: backdrop, south: backdrop });
}

const saved = writeMap(map);
console.log(
  `Wrote maps/${saved.id}/map.json (schema v${saved.schemaVersion}, ${saved.dimensions.width} x ${saved.dimensions.depth}, ` +
  `${saved.blocks.edits.length} block edits, ${saved.entities.length} entities).`,
);
