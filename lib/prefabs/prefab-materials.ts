import type { PrefabMaterialRole } from "./prefab-types";

export const PREFAB_MATERIAL_COLORS: Record<PrefabMaterialRole, string> = {
  "terrain-neutral": "#8b9089",
  "structure-dark": "#47504c",
  "structure-light": "#b7bcb4",
  "wood-proxy": "#8a6f4d",
  "metal-proxy": "#737b80",
  "path-proxy": "#6f726d",
  "vegetation-trunk": "#6f553a",
  "vegetation-canopy": "#3f6f4c",
  "foliage-light": "#68a267",
  paper: "#d9d2bd",
  "sign-board": "#2f5f7d",
  "accent-orange": "#d7823b",
  "accent-blue": "#3f78a8",
  "accent-green": "#4b8f68",
  "accent-yellow": "#c9a646",
  "selection-validation": "#f5b642",
};

export const PREFAB_MATERIAL_ROLES = Object.keys(PREFAB_MATERIAL_COLORS) as PrefabMaterialRole[];

export function isPrefabMaterialRole(value: string): value is PrefabMaterialRole {
  return PREFAB_MATERIAL_ROLES.includes(value as PrefabMaterialRole);
}

export function resolvePrefabMaterialColor(role: PrefabMaterialRole, override?: string) {
  return override ?? PREFAB_MATERIAL_COLORS[role];
}
