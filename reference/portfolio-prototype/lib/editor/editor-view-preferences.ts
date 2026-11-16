import type { EditorLayerId, EditorLayerState } from "@/components/experience/MapEditorToolbar";

// Persists the toggles/colors/sliders that live in the editor's top-menu
// View and Settings dropdowns (MapEditorToolbar's ViewMenuSettings /
// SettingsMenuSettings) so they carry over the next time the editor is
// opened instead of resetting to defaults every session. Dock sizes/
// workspace/zoom distance already persist separately via
// editor-layout-store.ts — this covers everything else in those two menus.
export const EDITOR_VIEW_PREFERENCES_STORAGE_KEY = "portfolio-editor-view-preferences.v1";

export type EditorViewPreferences = {
  version: 1;
  zoneNeutralTerrain: boolean;
  zoneNeutralTerrainColor: string;
  zoneGridLinesVisible: boolean;
  zoneGridLineColor: string;
  mapBackgroundColor: string;
  // Layer visibility/lock (the "Hide objects" toggle, and the Layers panel
  // reachable from the same View menu's underlying layer list) keyed by
  // layer id, so any layer's state survives a reload, not just the two the
  // View menu exposes a dedicated checkbox for.
  layerVisibility: Partial<Record<EditorLayerId, boolean>>;
  layerLocked: Partial<Record<EditorLayerId, boolean>>;
};

export const DEFAULT_EDITOR_VIEW_PREFERENCES: EditorViewPreferences = {
  version: 1,
  zoneNeutralTerrain: false,
  zoneNeutralTerrainColor: "#f7f7f2",
  zoneGridLinesVisible: true,
  zoneGridLineColor: "#9a9f98",
  mapBackgroundColor: "#edf1ed",
  layerVisibility: {},
  layerLocked: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function loadEditorViewPreferences(storage: Storage): EditorViewPreferences {
  try {
    const raw = storage.getItem(EDITOR_VIEW_PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_EDITOR_VIEW_PREFERENCES;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1) return DEFAULT_EDITOR_VIEW_PREFERENCES;
    return {
      ...DEFAULT_EDITOR_VIEW_PREFERENCES,
      ...parsed,
      layerVisibility: isRecord(parsed.layerVisibility) ? parsed.layerVisibility as Partial<Record<EditorLayerId, boolean>> : {},
      layerLocked: isRecord(parsed.layerLocked) ? parsed.layerLocked as Partial<Record<EditorLayerId, boolean>> : {},
    };
  } catch {
    return DEFAULT_EDITOR_VIEW_PREFERENCES;
  }
}

export function saveEditorViewPreferences(storage: Storage, prefs: EditorViewPreferences) {
  try {
    storage.setItem(EDITOR_VIEW_PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage can throw (quota exceeded, private browsing) — persistence is best-effort.
  }
}

export function applyPersistedLayerStates(defaults: EditorLayerState[], prefs: EditorViewPreferences): EditorLayerState[] {
  return defaults.map((layer) => ({
    ...layer,
    visible: prefs.layerVisibility[layer.id] ?? layer.visible,
    locked: prefs.layerLocked[layer.id] ?? layer.locked,
  }));
}

export function collectLayerPreferences(layers: EditorLayerState[]): Pick<EditorViewPreferences, "layerVisibility" | "layerLocked"> {
  const layerVisibility: Partial<Record<EditorLayerId, boolean>> = {};
  const layerLocked: Partial<Record<EditorLayerId, boolean>> = {};
  for (const layer of layers) {
    layerVisibility[layer.id] = layer.visible;
    layerLocked[layer.id] = layer.locked;
  }
  return { layerVisibility, layerLocked };
}
