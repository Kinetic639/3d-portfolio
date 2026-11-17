import { DEFAULT_SCATTER } from "@/lib/editor/scatter";
import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { EditorSession } from "@/lib/editor/editor-session";
import type { EditorLayerId, EditorMessage, EditorTool } from "@/lib/editor/editor-tools";
import type { EditorViewport, ToolSettings, ViewSettings } from "@/lib/editor/editor-viewport";
import { DEFAULT_EDITOR_VIEW_PREFERENCES, type EditorLayerState, type EditorViewPreferences } from "@/lib/editor/editor-view-preferences";
import { DEFAULT_TERRAIN_BRUSH, type TerrainBrushSettings } from "@/lib/editor/terrain-brushes";
import type { Thumbnailer } from "@/lib/editor/thumbnailer";
import type { ModelLibrary } from "@/lib/engine/model-library";
import type { NavigationNodeType } from "@/lib/maps/map-navigation";
import { DEFAULT_ROTATION, DEFAULT_SHAPE_ID } from "@/lib/voxel-shapes/shape-ids";
import type { ShapeCategory } from "@/lib/voxel-shapes/shape-registry";
import type { GridCoordinate } from "@/lib/world/world-config";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import type { EditorHoverState } from "./MapEditorToolbar";

/**
 * UI state of the editor. The map itself lives in the `EditorSession`; this
 * store holds tool settings, layers and view preferences, and mirrors the few
 * facts panels re-render on (history state, counters that tick when map
 * fields or objects change). Terrain edits change none of them, so painting
 * never re-renders React. The hovered cell has its own small store, read only
 * by the readouts that show it.
 */
export type EditorUiState = {
  settings: ToolSettings;
  /** Each brush tool keeps its own brush, as in the original. */
  brushes: Partial<Record<EditorTool, TerrainBrushSettings>>;
  activeShapeCategory: ShapeCategory;
  selection: string[];
  selectedCell: GridCoordinate | null;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  metaRevision: number;
  entitiesRevision: number;
  message: EditorMessage | null;
  saveStatus: string;
  /** Whether maps/<id>/baked matches the saved map. "unknown" until the first check. */
  bake: "unknown" | "missing" | "stale" | "fresh";
  /** What the viewport shows as terrain. */
  terrainView: "voxels" | "baking" | "baked";
  validation: string[];
  /** Cells that differ from the base terrain in the saved map file (the map's "edits"), as of the last load or save. */
  blockEdits: number;
  layers: EditorLayerState[];
  preferences: EditorViewPreferences;
  cleanPreview: boolean;
  angleLocked: boolean;
  minZoomDistance: number;
  navigationNodeType: NavigationNodeType;
  prefabSearch: string;
  entityTransformMode: "translate" | "rotate";
  panSpeed: number;
  rotateSpeed: number;
};

export const DEFAULT_LAYERS: EditorLayerState[] = [
  { id: "terrain", label: "Terrain", visible: true, locked: false },
  { id: "zones", label: "Zones", visible: true, locked: false },
  { id: "entities", label: "Entities", visible: true, locked: false },
  { id: "markers", label: "Markers", visible: true, locked: false },
  { id: "navigation", label: "Navigation", visible: true, locked: false },
  { id: "spawnPoints", label: "Spawn points", visible: true, locked: false },
  { id: "cameraPresets", label: "Camera presets", visible: true, locked: false },
  { id: "developmentHelpers", label: "Development helpers", visible: true, locked: false },
];

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  tool: "select",
  blockId: BLOCK_IDS.Ground,
  applyMaterialToAddedBlocks: false,
  shapeId: DEFAULT_SHAPE_ID,
  rotation: DEFAULT_ROTATION,
  shapeState: 0,
  brush: { ...DEFAULT_TERRAIN_BRUSH },
  zoneId: 0,
  zoneColor: "",
  zoneEditMode: "paint",
  zoneSelectionMode: "brush",
  prefabId: null,
  modelId: null,
  variantId: null,
  primitiveType: "box",
  entityColor: "#9ca3af",
  entityName: "Placeholder",
  collisionMode: "blocking",
  scatter: { ...DEFAULT_SCATTER },
};

export function createEditorStore(preferences: EditorViewPreferences = DEFAULT_EDITOR_VIEW_PREFERENCES, layers = DEFAULT_LAYERS) {
  return createStore<EditorUiState>(() => ({
    settings: DEFAULT_TOOL_SETTINGS,
    brushes: {},
    activeShapeCategory: "terrain",
    selection: [],
    selectedCell: null,
    canUndo: false,
    canRedo: false,
    dirty: false,
    metaRevision: 0,
    entitiesRevision: 0,
    message: null,
    saveStatus: "saved",
    bake: "unknown",
    terrainView: "voxels",
    validation: [],
    blockEdits: 0,
    layers,
    preferences,
    cleanPreview: false,
    angleLocked: false,
    minZoomDistance: 22,
    navigationNodeType: "walk",
    prefabSearch: "",
    entityTransformMode: "translate",
    panSpeed: 1,
    rotateSpeed: 1,
  }));
}

export function createHoverStore() {
  return createStore<EditorHoverState>(() => ({ hovered: null, affected: 0 }));
}

/** The view settings the viewport needs, derived from layers and preferences. */
export function viewSettings(state: EditorUiState): ViewSettings {
  const hidden = new Set<EditorLayerId>();
  const locked = new Set<EditorLayerId>();
  for (const layer of state.layers) {
    if (!layer.visible) hidden.add(layer.id);
    if (layer.locked) locked.add(layer.id);
  }
  const { preferences } = state;
  return {
    gridLines: preferences.zoneGridLinesVisible,
    gridColor: preferences.zoneGridLineColor,
    neutral: preferences.zoneNeutralTerrain,
    neutralColor: preferences.zoneNeutralTerrainColor,
    background: preferences.mapBackgroundColor,
    hidden,
    locked,
    minDistance: state.minZoomDistance,
  };
}

export type EditorContextValue = {
  mapId: string;
  session: EditorSession;
  viewport: EditorViewport;
  models: ModelLibrary;
  thumbnails: Thumbnailer;
  store: StoreApi<EditorUiState>;
  hover: StoreApi<EditorHoverState>;
};

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor() {
  const value = useContext(EditorContext);
  if (!value) throw new Error("useEditor outside the editor.");
  return value;
}

export function useEditorState<T>(selector: (state: EditorUiState) => T) {
  return useStore(useEditor().store, selector);
}

/** Changes tool settings in the store and the viewport together. */
export function updateSettings(editor: EditorContextValue, patch: Partial<ToolSettings>) {
  const settings = { ...editor.store.getState().settings, ...patch };
  editor.store.setState({ settings });
  editor.viewport.setSettings(settings);
}

export function setSelection(editor: EditorContextValue, ids: string[]) {
  editor.store.setState({ selection: ids });
  editor.viewport.setSelection(ids);
}
