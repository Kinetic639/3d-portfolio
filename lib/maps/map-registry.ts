import { createPortfolioPhase4MapDefinition, createTinyExampleMapDefinition } from "./bundled-maps";
import {
  cloneMapDefinition,
  createLoadedMapState,
  validateMapDefinition,
  type LoadedMapState,
  type MapDefinition,
  type MapKind,
  type MapRuntimeMode,
} from "./map-definition";

export const DEFAULT_AUTHORED_MAP_ID = "portfolio-phase4";
export const MAP_DRAFT_STORAGE_PREFIX = "portfolio-map-definition-draft.v1:";

export type MapRegistryEntry = {
  id: string;
  name: string;
  description?: string;
  kind: MapKind;
  runtimeMode: MapRuntimeMode;
  source: string;
  defaultSpawnId?: string;
  enabled: boolean;
  developmentOnly?: boolean;
};

type BundledMapSource = {
  entry: MapRegistryEntry;
  load: () => MapDefinition;
};

const BUNDLED_MAPS: BundledMapSource[] = [
  createBundledEntry(createPortfolioPhase4MapDefinition, "bundled:portfolio-phase4", false),
  createBundledEntry(createTinyExampleMapDefinition, "bundled:tiny-example", true),
];

export function listMapRegistryEntries(options: { includeDevelopment?: boolean } = {}) {
  return BUNDLED_MAPS
    .map((source) => source.entry)
    .filter((entry) => entry.enabled && (options.includeDevelopment || !entry.developmentOnly))
    .map((entry) => ({ ...entry }));
}

export async function resolveMapDefinition(mapId: string, options: { includeDevelopment?: boolean } = {}): Promise<MapDefinition> {
  const source = BUNDLED_MAPS.find((candidate) => candidate.entry.id === mapId);
  if (!source || !source.entry.enabled || (source.entry.developmentOnly && !options.includeDevelopment)) {
    throw new Error(`Unknown map id: ${mapId}.`);
  }

  const definition = source.load();
  const validation = validateMapDefinition(definition);
  if (!validation.ok) {
    throw new Error(`Map ${mapId} is invalid:\n${validation.errors.join("\n")}`);
  }

  return validation.map;
}

export async function loadMapState(mapId: string, options: { includeDevelopment?: boolean } = {}): Promise<LoadedMapState> {
  return createLoadedMapState(await resolveMapDefinition(mapId, options));
}

export function loadMapStateSync(mapId: string, options: { includeDevelopment?: boolean } = {}): LoadedMapState {
  const source = BUNDLED_MAPS.find((candidate) => candidate.entry.id === mapId);
  if (!source || !source.entry.enabled || (source.entry.developmentOnly && !options.includeDevelopment)) {
    throw new Error(`Unknown map id: ${mapId}.`);
  }

  const validation = validateMapDefinition(source.load());
  if (!validation.ok) {
    throw new Error(`Map ${mapId} is invalid:\n${validation.errors.join("\n")}`);
  }

  return createLoadedMapState(validation.map);
}

export function validateMapRegistry() {
  const errors: string[] = [];
  const ids = new Set<string>();
  const sources = new Set<string>();

  for (const source of BUNDLED_MAPS) {
    if (ids.has(source.entry.id)) {
      errors.push(`Duplicate map id: ${source.entry.id}.`);
    }
    if (sources.has(source.entry.source)) {
      errors.push(`Duplicate map source: ${source.entry.source}.`);
    }
    if (!source.entry.source) {
      errors.push(`Map ${source.entry.id} is missing a source.`);
    }

    ids.add(source.entry.id);
    sources.add(source.entry.source);

    const validation = validateMapDefinition(source.load());
    if (!validation.ok) {
      errors.push(...validation.errors.map((error) => `${source.entry.id}: ${error}`));
    }
  }

  return errors.length > 0 ? { ok: false as const, errors } : { ok: true as const };
}

export function saveMapDraft(storage: Storage, map: MapDefinition) {
  const nextMap = cloneMapDefinition(map);
  nextMap.metadata.updatedAt = new Date().toISOString();
  storage.setItem(getMapDraftStorageKey(nextMap.id), JSON.stringify(nextMap));
  return nextMap;
}

export function loadMapDraft(storage: Storage, mapId: string) {
  const raw = storage.getItem(getMapDraftStorageKey(mapId));
  if (!raw) {
    return null;
  }

  const parsed = validateMapDefinition(JSON.parse(raw));
  if (!parsed.ok) {
    throw new Error(parsed.errors.join("\n"));
  }

  return parsed.map;
}

export function deleteMapDraft(storage: Storage, mapId: string) {
  storage.removeItem(getMapDraftStorageKey(mapId));
}

export function getMapDraftStorageKey(mapId: string) {
  return `${MAP_DRAFT_STORAGE_PREFIX}${mapId}`;
}

function createBundledEntry(load: () => MapDefinition, source: string, developmentOnly: boolean): BundledMapSource {
  const definition = load();
  return {
    entry: {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      kind: definition.kind,
      runtimeMode: definition.runtimeMode,
      source,
      defaultSpawnId: definition.defaultSpawnId,
      enabled: true,
      developmentOnly,
    },
    load: () => cloneMapDefinition(load()),
  };
}
