export type ReferenceAssetId = "rock" | "treePineFluffyBig" | "crow";
export type ReferenceAssetCategory = "environment" | "vegetation" | "actor";
export type ReferenceAssetType = "static" | "vegetation" | "skinnedActor";
export type SceneLabInstanceMode = "individual" | "instanced" | "actor";
export type Vector3Tuple = [number, number, number];

export type ReferenceAssetDefinition = {
  id: ReferenceAssetId;
  label: string;
  category: ReferenceAssetCategory;
  assetType: ReferenceAssetType;
  source: {
    model: string;
    textures?: readonly string[];
  };
  defaults: {
    scale: Vector3Tuple;
    rotation: Vector3Tuple;
    groundOffset: number;
  };
  capabilities: {
    selectable: boolean;
    transformable: boolean;
    scalable: boolean;
    animated: boolean;
    instancing: boolean;
    weatherReactive: boolean;
  };
};

export const REFERENCE_ASSET_REGISTRY: Record<ReferenceAssetId, ReferenceAssetDefinition> = {
  rock: {
    id: "rock",
    label: "RockLandSmall001",
    category: "environment",
    assetType: "static",
    source: { model: "/models/rocks-land/RockLandSmall001.glb" },
    defaults: {
      scale: [1, 1, 1],
      rotation: [0, 0, 0],
      groundOffset: 0.43108,
    },
    capabilities: {
      selectable: true,
      transformable: true,
      scalable: true,
      animated: false,
      instancing: true,
      weatherReactive: false,
    },
  },
  treePineFluffyBig: {
    id: "treePineFluffyBig",
    label: "TreePineFluffyBig",
    category: "vegetation",
    assetType: "vegetation",
    source: {
      model: "/models/enviroment/trees/TreePineFluffyBig.glb",
      textures: [
        "/models/enviroment/trees/T_TreePineFluffy_D_001.png",
        "/models/enviroment/trees/T_TreePineFluffy_D_002.png",
        "/models/enviroment/trees/T_TreePineFluffy_M_001.png",
      ],
    },
    defaults: {
      scale: [0.48, 0.48, 0.48],
      rotation: [0, 0, 0],
      groundOffset: 0.00218,
    },
    capabilities: {
      selectable: true,
      transformable: true,
      scalable: true,
      animated: false,
      instancing: true,
      weatherReactive: true,
    },
  },
  crow: {
    id: "crow",
    label: "Crow",
    category: "actor",
    assetType: "skinnedActor",
    source: { model: "/models/characters/crow.glb" },
    defaults: {
      scale: [1, 1, 1],
      rotation: [0, 0, 0],
      groundOffset: 0,
    },
    capabilities: {
      selectable: true,
      transformable: true,
      scalable: true,
      animated: true,
      instancing: false,
      weatherReactive: false,
    },
  },
};

export const REFERENCE_ASSET_IDS = Object.keys(REFERENCE_ASSET_REGISTRY) as ReferenceAssetId[];

export function getReferenceAsset(assetId: ReferenceAssetId) {
  return REFERENCE_ASSET_REGISTRY[assetId];
}

export function getDefaultInstanceMode(assetId: ReferenceAssetId): SceneLabInstanceMode {
  const asset = getReferenceAsset(assetId);
  return asset.assetType === "skinnedActor" ? "actor" : "individual";
}
