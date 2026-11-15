import fs from "node:fs";
import path from "node:path";
import {
  migrateMapDefinition,
  serializeMapDefinition,
  validateMapDefinition,
  type MapDefinition,
  type MapValidationOptions,
} from "./map-definition";

/**
 * File-backed map storage. Node only: used by server components, the dev-only
 * editor endpoints and CLI scripts. Maps live in `maps/<id>/map.json`; the
 * default map is recorded in `maps/index.json`. Both are committed.
 */
export type MapIndex = {
  defaultMapId: string;
};

export type MapSummary = {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
};

const MAP_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function getMapsRoot(root = process.cwd()) {
  return path.join(root, "maps");
}

export function isValidMapId(id: unknown): id is string {
  return typeof id === "string" && MAP_ID_PATTERN.test(id);
}

function mapFile(id: string, root?: string) {
  if (!isValidMapId(id)) {
    // Ids become directory names; anything else could escape the maps folder.
    throw new Error(`Invalid map id: ${String(id)}.`);
  }
  return path.join(getMapsRoot(root), id, "map.json");
}

export function readMapIndex(root?: string): MapIndex {
  const file = path.join(getMapsRoot(root), "index.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<MapIndex>;
  if (!isValidMapId(parsed.defaultMapId)) {
    throw new Error("maps/index.json must name a defaultMapId.");
  }
  return { defaultMapId: parsed.defaultMapId };
}

export function listMapIds(root?: string): string[] {
  const mapsRoot = getMapsRoot(root);
  if (!fs.existsSync(mapsRoot)) return [];
  return fs.readdirSync(mapsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isValidMapId(entry.name) && fs.existsSync(path.join(mapsRoot, entry.name, "map.json")))
    .map((entry) => entry.name)
    .sort();
}

export function mapExists(id: string, root?: string) {
  return isValidMapId(id) && fs.existsSync(mapFile(id, root));
}

/** Reads a map and upgrades it to the current schema in memory. Does not validate. */
export function readMap(id: string, root?: string): MapDefinition {
  return migrateMapDefinition(JSON.parse(fs.readFileSync(mapFile(id, root), "utf8")));
}

export function listMaps(root?: string): MapSummary[] {
  const { defaultMapId } = readMapIndex(root);
  return listMapIds(root).map((id) => {
    const map = readMap(id, root);
    return { id, name: map.name, description: map.description, isDefault: id === defaultMapId };
  });
}

/** Validates and writes a map. The directory name always matches the map id. */
export function writeMap(map: MapDefinition, options: MapValidationOptions & { root?: string } = {}): MapDefinition {
  const validation = validateMapDefinition(map, options);
  if (!validation.ok) {
    throw new Error(`Map ${String(map.id)} is invalid:\n${validation.errors.join("\n")}`);
  }
  const saved: MapDefinition = {
    ...validation.map,
    metadata: { ...validation.map.metadata, updatedAt: new Date().toISOString() },
  };
  const file = mapFile(saved.id, options.root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializeMapDefinition(saved));
  return saved;
}

export function deleteMap(id: string, root?: string) {
  if (readMapIndex(root).defaultMapId === id) {
    throw new Error(`Map ${id} is the default map and cannot be deleted. Choose another default first.`);
  }
  fs.rmSync(path.dirname(mapFile(id, root)), { recursive: true, force: true });
}

export function setDefaultMapId(id: string, root?: string) {
  if (!mapExists(id, root)) {
    throw new Error(`Cannot make ${id} the default map: it does not exist.`);
  }
  const index: MapIndex = { defaultMapId: id };
  fs.writeFileSync(path.join(getMapsRoot(root), "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

/** Copies a map under a new id and name. */
export function duplicateMap(sourceId: string, id: string, name: string, root?: string): MapDefinition {
  if (mapExists(id, root)) {
    throw new Error(`A map with id ${id} already exists.`);
  }
  const source = readMap(sourceId, root);
  const now = new Date().toISOString();
  return writeMap({ ...source, id, name, metadata: { ...source.metadata, createdAt: now } }, { root });
}

/**
 * Changes a map's name and, optionally, its id. Changing the id moves the
 * map's directory (baked output included) and follows the default-map index.
 */
export function renameMap(id: string, next: { id?: string; name?: string }, root?: string): MapDefinition {
  const map = readMap(id, root);
  const nextId = next.id ?? id;
  if (nextId !== id) {
    if (!isValidMapId(nextId)) throw new Error(`Invalid map id: ${String(nextId)}.`);
    if (mapExists(nextId, root)) throw new Error(`A map with id ${nextId} already exists.`);
    fs.renameSync(path.dirname(mapFile(id, root)), path.dirname(mapFile(nextId, root)));
    if (readMapIndex(root).defaultMapId === id) {
      fs.writeFileSync(path.join(getMapsRoot(root), "index.json"), `${JSON.stringify({ defaultMapId: nextId }, null, 2)}\n`);
    }
  }
  return writeMap({ ...map, id: nextId, name: next.name ?? map.name }, { root });
}
