export const BLOCK_IDS = {
  Air: 0,
  Ground: 1,
  Path: 2,
  ZoneGround: 3,
  Boundary: 4,
  Special: 5,
  LoaderOrigin: 7,
  Dirt: 8,
  PathDirt: 9,
  Stone: 10,
  MossyStone: 11,
  WoodPlanks: 12,
  Sand: 13,
  Riverbed: 14,
} as const;

export type BlockId = (typeof BLOCK_IDS)[keyof typeof BLOCK_IDS];

export type BlockDefinition = {
  id: BlockId;
  key: string;
  displayName: string;
  renderable: boolean;
  solid: boolean;
  developmentColor: string;
};

export const BLOCK_REGISTRY = {
  [BLOCK_IDS.Air]: {
    id: BLOCK_IDS.Air,
    key: "air",
    displayName: "Air",
    renderable: false,
    solid: false,
    developmentColor: "#000000",
  },
  [BLOCK_IDS.Ground]: {
    id: BLOCK_IDS.Ground,
    key: "ground",
    displayName: "Grass",
    renderable: true,
    solid: true,
    developmentColor: "#8a8a8a",
  },
  [BLOCK_IDS.Path]: {
    id: BLOCK_IDS.Path,
    key: "path",
    displayName: "Path",
    renderable: true,
    solid: true,
    developmentColor: "#817d68",
  },
  [BLOCK_IDS.ZoneGround]: {
    id: BLOCK_IDS.ZoneGround,
    key: "zone-ground",
    displayName: "Zone Ground",
    renderable: true,
    solid: true,
    developmentColor: "#6f8492",
  },
  [BLOCK_IDS.Boundary]: {
    id: BLOCK_IDS.Boundary,
    key: "boundary",
    displayName: "Boundary",
    renderable: true,
    solid: true,
    developmentColor: "#4c5d54",
  },
  [BLOCK_IDS.Special]: {
    id: BLOCK_IDS.Special,
    key: "special",
    displayName: "Special / Interactive",
    renderable: true,
    solid: true,
    developmentColor: "#86735c",
  },
  [BLOCK_IDS.LoaderOrigin]: {
    id: BLOCK_IDS.LoaderOrigin,
    key: "loader-origin",
    displayName: "Loader Origin",
    renderable: true,
    solid: true,
    developmentColor: "#d8b45a",
  },
  [BLOCK_IDS.Dirt]: {
    id: BLOCK_IDS.Dirt,
    key: "dirt",
    displayName: "Dirt",
    renderable: true,
    solid: true,
    developmentColor: "#765138",
  },
  [BLOCK_IDS.PathDirt]: {
    id: BLOCK_IDS.PathDirt,
    key: "path-dirt",
    displayName: "Path Dirt",
    renderable: true,
    solid: true,
    developmentColor: "#8a6846",
  },
  [BLOCK_IDS.Stone]: {
    id: BLOCK_IDS.Stone,
    key: "stone",
    displayName: "Stone",
    renderable: true,
    solid: true,
    developmentColor: "#777b79",
  },
  [BLOCK_IDS.MossyStone]: {
    id: BLOCK_IDS.MossyStone,
    key: "mossy-stone",
    displayName: "Mossy Stone",
    renderable: true,
    solid: true,
    developmentColor: "#65705b",
  },
  [BLOCK_IDS.WoodPlanks]: {
    id: BLOCK_IDS.WoodPlanks,
    key: "wood-planks",
    displayName: "Wood Planks",
    renderable: true,
    solid: true,
    developmentColor: "#886444",
  },
  [BLOCK_IDS.Sand]: {
    id: BLOCK_IDS.Sand,
    key: "sand",
    displayName: "Sand",
    renderable: true,
    solid: true,
    developmentColor: "#c6a86a",
  },
  [BLOCK_IDS.Riverbed]: {
    id: BLOCK_IDS.Riverbed,
    key: "riverbed",
    displayName: "Riverbed",
    renderable: true,
    solid: true,
    developmentColor: "#62675f",
  },
} satisfies Record<BlockId, BlockDefinition>;

export const BLOCK_DEFINITIONS = Object.values(BLOCK_REGISTRY);

export const RENDERABLE_BLOCK_DEFINITIONS = BLOCK_DEFINITIONS.filter((block) => block.renderable);

export function isKnownBlockId(blockId: number): blockId is BlockId {
  return Number.isInteger(blockId) && blockId in BLOCK_REGISTRY;
}

export function getBlockDefinition(blockId: number) {
  return BLOCK_REGISTRY[blockId as BlockId] ?? BLOCK_REGISTRY[BLOCK_IDS.Air];
}

export function isRenderableBlock(blockId: number) {
  return getBlockDefinition(blockId).renderable;
}
