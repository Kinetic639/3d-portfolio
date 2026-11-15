import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { EditorSession } from "@/lib/editor/editor-session";
import type { EditorViewport, ToolSettings } from "@/lib/editor/editor-viewport";
import { DEFAULT_ROTATION, DEFAULT_SHAPE_ID } from "@/lib/voxel-shapes/shape-ids";
import { BLOCK_IDS } from "@/lib/world/block-registry";

/**
 * UI state of the editor. The map itself lives in the `EditorSession`; this
 * store only mirrors the few facts panels need to re-render on (history
 * state, and counters that tick when map fields or entities change). Terrain
 * edits change none of them, so painting never re-renders React.
 */
export type EditorUiState = {
  settings: ToolSettings;
  selection: string[];
  preview: boolean;
  zonesVisible: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  dirty: boolean;
  metaRevision: number;
  entitiesRevision: number;
  /** Inspector tab. It follows what the user is doing: selecting shows objects, the zone tool shows zones. */
  inspectorTab: "object" | "zones" | "map";
  notice: { kind: "info" | "error"; text: string } | null;
  validation: string[] | null;
};

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  tool: "select",
  blockId: BLOCK_IDS.Ground,
  shapeId: DEFAULT_SHAPE_ID,
  rotation: DEFAULT_ROTATION,
  brushShape: "square",
  brushSize: 1,
  zoneId: 1,
  zoneMode: "paint",
  prefabId: null,
  variantId: null,
};

export function createEditorStore() {
  return createStore<EditorUiState>(() => ({
    settings: DEFAULT_TOOL_SETTINGS,
    selection: [],
    preview: false,
    zonesVisible: true,
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
    dirty: false,
    metaRevision: 0,
    entitiesRevision: 0,
    inspectorTab: "object",
    notice: null,
    validation: null,
  }));
}

export type EditorContextValue = {
  mapId: string;
  session: EditorSession;
  viewport: EditorViewport;
  store: StoreApi<EditorUiState>;
};

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor() {
  const value = useContext(EditorContext);
  if (!value) throw new Error("Editor panels must be rendered inside the editor.");
  return value;
}

export function useEditorState<T>(selector: (state: EditorUiState) => T) {
  return useStore(useEditor().store, selector);
}

/** Changes tool settings in the store and in the viewport together. */
export function updateSettings(editor: EditorContextValue, patch: Partial<ToolSettings>) {
  const settings = { ...editor.store.getState().settings, ...patch };
  editor.store.setState(patch.tool === "zone" ? { settings, inspectorTab: "zones" } : { settings });
  editor.viewport.setSettings(settings);
}

export function setSelection(editor: EditorContextValue, ids: string[]) {
  editor.store.setState(ids.length > 0 ? { selection: ids, inspectorTab: "object" } : { selection: ids });
  editor.viewport.setSelection(ids);
}
