export const BLOCK_IDS = {
  Air: 0,
  Ground: 1,
  Path: 2,
  ZoneGround: 3,
  Boundary: 4,
  Special: 5,
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
    displayName: "Ground",
    renderable: true,
    solid: true,
    developmentColor: "#637f73",
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
} satisfies Record<BlockId, BlockDefinition>;

export function getBlockDefinition(blockId: number) {
  return BLOCK_REGISTRY[blockId as BlockId] ?? BLOCK_REGISTRY[BLOCK_IDS.Air];
}

export function isRenderableBlock(blockId: number) {
  return getBlockDefinition(blockId).renderable;
}
