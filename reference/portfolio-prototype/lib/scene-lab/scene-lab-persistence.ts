import {
  REFERENCE_ASSET_REGISTRY,
  type ReferenceAssetId,
  type SceneLabInstanceMode,
  type Vector3Tuple,
} from "./reference-asset-registry";
import type { SceneLabInstance } from "./scene-lab-controller";

export const SCENE_LAB_STORAGE_KEY = "portfolio:scene-lab:v1";
export const SCENE_LAB_PREFERENCES_KEY = "portfolio:scene-lab:preferences:v1";

export type SceneLabSave = {
  version: 1;
  savedAt: string;
  instances: SceneLabInstance[];
};

export type SceneLabPreferences = {
  persistScene: boolean;
  autoRestore: boolean;
};

export const DEFAULT_SCENE_LAB_PREFERENCES: SceneLabPreferences = {
  persistScene: true,
  autoRestore: true,
};

function isVector3(value: unknown): value is Vector3Tuple {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function isMode(value: unknown): value is SceneLabInstanceMode {
  return value === "individual" || value === "instanced" || value === "actor";
}

function parseInstance(value: unknown): SceneLabInstance | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SceneLabInstance>;
  if (typeof candidate.id !== "string") return null;
  if (typeof candidate.assetId !== "string" || !(candidate.assetId in REFERENCE_ASSET_REGISTRY)) return null;
  if (!isMode(candidate.mode) || !isVector3(candidate.position) || !isVector3(candidate.rotation) || !isVector3(candidate.scale)) return null;
  return {
    id: candidate.id,
    assetId: candidate.assetId as ReferenceAssetId,
    mode: candidate.assetId === "crow" ? "actor" : candidate.mode,
    position: [...candidate.position],
    rotation: [...candidate.rotation],
    scale: [...candidate.scale],
  };
}

export function parseSceneLabSave(json: string | null): SceneLabSave | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<SceneLabSave>;
    if (value.version !== 1 || !Array.isArray(value.instances)) return null;
    const instances = value.instances.map(parseInstance).filter((instance): instance is SceneLabInstance => Boolean(instance));
    return {
      version: 1,
      savedAt: typeof value.savedAt === "string" ? value.savedAt : new Date(0).toISOString(),
      instances,
    };
  } catch {
    return null;
  }
}

export function createSceneLabSave(instances: readonly SceneLabInstance[], now = new Date()): SceneLabSave {
  return {
    version: 1,
    savedAt: now.toISOString(),
    instances: instances.map((instance) => ({
      ...instance,
      position: [...instance.position],
      rotation: [...instance.rotation],
      scale: [...instance.scale],
    })),
  };
}

export function parseSceneLabPreferences(json: string | null): SceneLabPreferences {
  if (!json) return DEFAULT_SCENE_LAB_PREFERENCES;
  try {
    const value = JSON.parse(json) as Partial<SceneLabPreferences>;
    return {
      persistScene: value.persistScene ?? DEFAULT_SCENE_LAB_PREFERENCES.persistScene,
      autoRestore: value.autoRestore ?? DEFAULT_SCENE_LAB_PREFERENCES.autoRestore,
    };
  } catch {
    return DEFAULT_SCENE_LAB_PREFERENCES;
  }
}
