export type EditorWorkspace = "map" | "terrain" | "objects" | "zones" | "navigation" | "review";
export type BottomDockTab = "library" | "validation" | "history" | "performance";
export type EditorPanelId = "left" | "right" | "bottom" | "outliner" | "inspector";

export const EDITOR_LAYOUT_STORAGE_KEY = "portfolio-editor-layout.v1";

export type EditorLayoutState = {
  version: 1;
  activeWorkspace: EditorWorkspace;
  activeBottomTab: BottomDockTab;
  commandSearchOpen: boolean;
  shortcutsOpen: boolean;
  cleanPreview: boolean;
  maximizedViewport: boolean;
  dimensions: {
    leftWidth: number;
    rightWidth: number;
    bottomHeight: number;
    outlinerHeight: number;
  };
  collapsed: Record<EditorPanelId, boolean>;
  outlinerQuery: string;
  outlinerExpanded: Record<string, boolean>;
  compactMode: boolean;
};

export const DEFAULT_EDITOR_LAYOUT: EditorLayoutState = {
  version: 1,
  activeWorkspace: "terrain",
  activeBottomTab: "library",
  commandSearchOpen: false,
  shortcutsOpen: false,
  cleanPreview: false,
  maximizedViewport: false,
  dimensions: {
    leftWidth: 244,
    rightWidth: 332,
    bottomHeight: 204,
    outlinerHeight: 260,
  },
  collapsed: {
    left: false,
    right: false,
    bottom: false,
    outliner: false,
    inspector: false,
  },
  outlinerQuery: "",
  outlinerExpanded: {
    root: true,
    terrain: true,
    zones: true,
    entities: true,
    markers: true,
    navigation: true,
    spawns: true,
    cameras: true,
  },
  compactMode: false,
};

export function createDefaultEditorLayout(): EditorLayoutState {
  return cloneLayout(DEFAULT_EDITOR_LAYOUT);
}

export function clampEditorLayout(layout: EditorLayoutState, viewport: { width: number; height: number }): EditorLayoutState {
  const maxSideWidth = Math.max(220, Math.floor(viewport.width * 0.34));
  const maxBottomHeight = Math.max(160, Math.floor(viewport.height * 0.42));
  return {
    ...cloneLayout(layout),
    dimensions: {
      leftWidth: clamp(layout.dimensions.leftWidth, 180, maxSideWidth),
      rightWidth: clamp(layout.dimensions.rightWidth, 260, maxSideWidth),
      bottomHeight: clamp(layout.dimensions.bottomHeight, 120, maxBottomHeight),
      outlinerHeight: clamp(layout.dimensions.outlinerHeight, 120, Math.max(140, viewport.height - 260)),
    },
  };
}

export function serializeEditorLayout(layout: EditorLayoutState) {
  return JSON.stringify(layout);
}

export function parseEditorLayout(input: unknown): EditorLayoutState {
  if (!isRecord(input) || input.version !== 1) {
    return createDefaultEditorLayout();
  }

  return {
    ...createDefaultEditorLayout(),
    ...input,
    dimensions: {
      ...DEFAULT_EDITOR_LAYOUT.dimensions,
      ...(isRecord(input.dimensions) ? input.dimensions : {}),
    },
    collapsed: {
      ...DEFAULT_EDITOR_LAYOUT.collapsed,
      ...(isRecord(input.collapsed) ? input.collapsed : {}),
    },
    outlinerExpanded: {
      ...DEFAULT_EDITOR_LAYOUT.outlinerExpanded,
      ...booleanRecord(input.outlinerExpanded),
    },
  };
}

export function loadEditorLayout(storage: Pick<Storage, "getItem">): EditorLayoutState {
  try {
    const raw = storage.getItem(EDITOR_LAYOUT_STORAGE_KEY);
    return raw ? parseEditorLayout(JSON.parse(raw)) : createDefaultEditorLayout();
  } catch {
    return createDefaultEditorLayout();
  }
}

export function saveEditorLayout(storage: Pick<Storage, "setItem">, layout: EditorLayoutState) {
  storage.setItem(EDITOR_LAYOUT_STORAGE_KEY, serializeEditorLayout(layout));
}

export function resizeEditorPanel(
  layout: EditorLayoutState,
  panel: "leftWidth" | "rightWidth" | "bottomHeight" | "outlinerHeight",
  value: number,
  viewport: { width: number; height: number },
) {
  return clampEditorLayout({
    ...layout,
    dimensions: {
      ...layout.dimensions,
      [panel]: value,
    },
  }, viewport);
}

export function resetEditorLayout() {
  return createDefaultEditorLayout();
}

function cloneLayout(layout: EditorLayoutState): EditorLayoutState {
  return {
    ...layout,
    dimensions: { ...layout.dimensions },
    collapsed: { ...layout.collapsed },
    outlinerExpanded: { ...layout.outlinerExpanded },
  };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function booleanRecord(value: unknown) {
  if (!isRecord(value)) return {};
  const output: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "boolean") output[key] = entry;
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
