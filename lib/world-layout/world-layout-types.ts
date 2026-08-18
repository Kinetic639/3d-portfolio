export const WORLD_REGION_IDS = [
  "north-west",
  "north",
  "north-east",
  "west",
  "center",
  "east",
  "south-west",
  "south",
  "south-east",
] as const;

export type WorldRegionId = (typeof WORLD_REGION_IDS)[number];
export type WorldRegionRole = "playable" | "scenery";
export type WorldRegionGridOffset = Readonly<{
  x: -1 | 0 | 1;
  z: -1 | 0 | 1;
}>;

export type WorldRegionSlot = Readonly<{
  id: WorldRegionId;
  role: WorldRegionRole;
  offset: WorldRegionGridOffset;
}>;

export type WorldRegionReference = Readonly<{
  id: WorldRegionId;
  role: WorldRegionRole;
  mapId: string;
}>;

export type WorldLayoutDefinition = Readonly<{
  schemaVersion: 1;
  id: string;
  name: string;
  regions: readonly WorldRegionReference[];
}>;

export type WorldRegionHydrationState<TRegion> =
  | Readonly<{ status: "unloaded" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; region: TRegion }>
  | Readonly<{ status: "error"; error: string }>;

export type WorldLayoutRuntimeState<TRegion> = Readonly<{
  definition: WorldLayoutDefinition;
  regions: Readonly<Partial<Record<WorldRegionId, WorldRegionHydrationState<TRegion>>>>;
}>;

export type WorldLayoutValidationResult =
  | Readonly<{ ok: true; layout: WorldLayoutDefinition }>
  | Readonly<{ ok: false; errors: readonly string[] }>;
