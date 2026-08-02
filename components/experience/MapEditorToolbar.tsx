"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Box,
  Brush,
  CheckCircle2,
  Copy,
  Download,
  Eraser,
  Eye,
  FilePlus2,
  FolderOpen,
  HelpCircle,
  Layers,
  MapPin,
  Minus,
  MousePointer2,
  Navigation,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  RotateCcw,
  Route,
  Save,
  Search,
  Square,
  Trash2,
  Undo2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { createEditorCommands, findEditorCommands, type EditorCommand, type EditorIconName } from "@/lib/editor/editor-commands";
import {
  createDefaultEditorLayout,
  loadEditorLayout,
  resetEditorLayout,
  resizeEditorPanel,
  saveEditorLayout,
  type BottomDockTab,
  type EditorWorkspace,
} from "@/lib/editor/editor-layout-store";
import type { EditorMessage, EditorTool } from "@/lib/editor/map-editor";
import { MAP_PRESETS, type MapPresetId } from "@/lib/editor/map-presets";
import type { BrushShape, TerrainBrushSettings } from "@/lib/editor/terrain-brushes";
import type { MapRegistryEntry } from "@/lib/maps/map-registry";
import type { CollisionMode, PlacedMapEntity, PrimitiveType } from "@/lib/maps/map-entities";
import type { NavigationNodeType } from "@/lib/maps/map-navigation";
import { RENDERABLE_BLOCK_DEFINITIONS, getBlockDefinition, type BlockId } from "@/lib/world/block-registry";
import type { GridCoordinate, WorldPosition } from "@/lib/world/world-config";

export type TerrainRenderMode = "instanced" | "surface";

type EditorIconKey =
  | EditorIconName
  | EditorTool
  | "warning"
  | "performance"
  | "restore-left"
  | "restore-right"
  | "restore-bottom"
  | "collapse-left"
  | "collapse-right"
  | "collapse-bottom"
  | "close";

export type EditorLayerId =
  | "terrain"
  | "paths"
  | "zones"
  | "entities"
  | "markers"
  | "navigation"
  | "spawnPoints"
  | "cameraPresets"
  | "developmentHelpers";

export type EditorLayerState = {
  id: EditorLayerId;
  label: string;
  visible: boolean;
  locked: boolean;
};

export type EditorInspectorState = {
  available: boolean;
  mapId: string;
  mapName: string;
  mapDescription: string;
  availableMaps: MapRegistryEntry[];
  tool: EditorTool;
  paintBlockId: BlockId;
  presetId: MapPresetId;
  renderMode: TerrainRenderMode;
  zoneId: number;
  hovered: GridCoordinate | null;
  selected: GridCoordinate | null;
  selectedBlockId: BlockId | null;
  selectedZoneId: number;
  selectedWorldPosition: WorldPosition | null;
  selectedChunk: { chunkX: number; chunkZ: number } | null;
  selectedLocal: { localX: number; localZ: number } | null;
  dirtyChunks: number;
  lastRebuiltChunks: string[];
  blockEditCount: number;
  zoneAssignmentCount: number;
  entityAnchorCount: number;
  undoDepth: number;
  redoDepth: number;
  hasUnsavedChanges: boolean;
  autosaveStatus: string;
  message: EditorMessage | null;
  selectedMarkerId: string | null;
  selectedEntity: PlacedMapEntity | null;
  entityCount: number;
  selectedEntityIds: string[];
  primitiveType: PrimitiveType;
  collisionMode: CollisionMode;
  entityColor: string;
  entityName: string;
  brushSettings: TerrainBrushSettings;
  brushAffectedCellCount: number;
  layerStates: EditorLayerState[];
  cleanPreview: boolean;
  navigationNodeType: NavigationNodeType;
  navigationNodeCount: number;
  navigationEdgeCount: number;
  routeCount: number;
  validationSummary: string[];
  fps?: number | null;
  frameMs?: number | null;
};

export type MapEditorToolbarProps = EditorInspectorState & {
  onLayoutChange?: (layout: EditorViewportLayoutState) => void;
  onToolChange: (tool: EditorTool) => void;
  onPaintBlockChange: (blockId: BlockId) => void;
  onPresetChange: (presetId: MapPresetId) => void;
  onMapChange: (mapId: string) => void;
  onNewMap: () => void;
  onDuplicateMap: () => void;
  onSaveDraft: () => void;
  onRenameMap: () => void;
  onRenderModeChange: (mode: TerrainRenderMode) => void;
  onZoneChange: (zoneId: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onResetUnsaved: () => void;
  onResetFlat: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClearDraft: () => void;
  onClose: () => void;
  onRemoveMarker: () => void;
  onBrushShapeChange: (shape: BrushShape) => void;
  onBrushSizeChange: (size: number) => void;
  onPathWidthChange: (width: number) => void;
  onFlattenHeightChange: (height: number) => void;
  onPrimitiveTypeChange: (type: PrimitiveType) => void;
  onCollisionModeChange: (mode: CollisionMode) => void;
  onEntityColorChange: (color: string) => void;
  onEntityNameChange: (name: string) => void;
  onPlaceEntity: () => void;
  onDuplicateEntity: () => void;
  onDeleteEntity: () => void;
  onGroupEntity: () => void;
  onUngroupEntity: () => void;
  onToggleEntityLocked: () => void;
  onToggleEntityHidden: () => void;
  onNavigationNodeTypeChange: (type: NavigationNodeType) => void;
  onPlaceNavigationNode: () => void;
  onConnectNavigationNodes: () => void;
  onCreateRoute: () => void;
  onLayerVisibilityChange: (id: EditorLayerId, visible: boolean) => void;
  onLayerLockChange: (id: EditorLayerId, locked: boolean) => void;
  onCleanPreviewChange: (enabled: boolean) => void;
};

export type EditorViewportLayoutState = {
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  outlinerHeight: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  bottomCollapsed: boolean;
  cleanPreview: boolean;
  maximizedViewport: boolean;
};

const WORKSPACES: Array<{ id: EditorWorkspace; label: string }> = [
  { id: "map", label: "Map" },
  { id: "terrain", label: "Terrain" },
  { id: "objects", label: "Objects" },
  { id: "zones", label: "Zones" },
  { id: "navigation", label: "Navigation" },
  { id: "review", label: "Review" },
];

const WORKSPACE_TOOLS: Record<EditorWorkspace, EditorTool[]> = {
  map: ["select", "marker"],
  terrain: ["select", "paint", "add", "erase", "raise", "lower", "flatten", "fill", "clear", "path"],
  objects: ["select", "entity"],
  zones: ["select", "zone", "removeZone"],
  navigation: ["select", "navigation"],
  review: ["select"],
};

const TOOL_LABELS: Record<EditorTool, string> = {
  select: "Select",
  paint: "Paint",
  add: "Add Block",
  erase: "Erase",
  raise: "Raise",
  lower: "Lower",
  flatten: "Flatten",
  fill: "Fill",
  clear: "Clear",
  path: "Path",
  removePath: "Remove Path",
  zone: "Paint Zone",
  removeZone: "Clear Zone",
  marker: "Marker",
  entity: "Place",
  navigation: "Nav Node",
};

const PRIMITIVES: PrimitiveType[] = ["box", "cylinder", "sphere", "plane", "platform", "sign"];
const COLLISION_MODES: CollisionMode[] = ["none", "blocking", "walkable", "trigger"];
const NODE_TYPES: NavigationNodeType[] = ["walk", "route-junction", "wait-point", "look-at", "character-spawn", "bird-perch"];
const MENU_GROUPS = ["file", "edit", "view", "map", "help"] as const;
const MAP_PRESET_OPTIONS = MAP_PRESETS;
const COLLAPSED_SIDE_DOCK_WIDTH = 32;
const COLLAPSED_BOTTOM_DOCK_HEIGHT = 30;

export default function MapEditorToolbar(props: MapEditorToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [layout, setLayout] = useState(() => (
    typeof window === "undefined" ? createDefaultEditorLayout() : loadEditorLayout(window.localStorage)
  ));
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [commandQuery, setCommandQuery] = useState("");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  useEffect(() => {
    saveEditorLayout(window.localStorage, layout);
  }, [layout]);

  useEffect(() => {
    props.onLayoutChange?.({
      leftWidth: layout.dimensions.leftWidth,
      rightWidth: layout.dimensions.rightWidth,
      bottomHeight: layout.dimensions.bottomHeight,
      outlinerHeight: layout.dimensions.outlinerHeight,
      leftCollapsed: layout.collapsed.left,
      rightCollapsed: layout.collapsed.right,
      bottomCollapsed: layout.collapsed.bottom,
      cleanPreview: layout.cleanPreview,
      maximizedViewport: layout.maximizedViewport,
    });
  }, [layout, props.onLayoutChange]);

  useEffect(() => {
    props.onCleanPreviewChange(layout.cleanPreview);
  }, [layout.cleanPreview, props.onCleanPreviewChange]);

  useEffect(() => {
    if (!layout.commandSearchOpen) return;
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [layout.commandSearchOpen]);

  const patchLayout = (patch: Partial<typeof layout>) => setLayout((current) => ({ ...current, ...patch }));
  const setWorkspace = (workspace: string) => {
    const nextWorkspace = workspace as EditorWorkspace;
    setLayout((current) => ({
      ...current,
      activeWorkspace: nextWorkspace,
      activeBottomTab: workspaceDefaultTab(nextWorkspace),
    }));
  };
  const toggleCleanPreview = () => setLayout((current) => ({ ...current, cleanPreview: !current.cleanPreview }));
  const resetLayout = () => setLayout(resetEditorLayout());
  const deselect = () => props.onToolChange("select");
  const validateMap = () => patchLayout({ activeBottomTab: "validation" });

  const commands = useMemo(() => createEditorCommands({
    hasUndo: props.undoDepth > 0,
    hasRedo: props.redoDepth > 0,
    hasSelection: Boolean(props.selected || props.selectedMarkerId || props.selectedEntityIds.length),
    hasEntitySelection: props.selectedEntityIds.length > 0,
    canGroup: props.selectedEntityIds.length > 1,
    canUngroup: Boolean(props.selectedEntity?.groupId),
    canPlaceNavigationEdge: props.navigationNodeCount > 1,
    actions: {
      newMap: props.onNewMap,
      loadMap: () => patchLayout({ activeBottomTab: "library" }),
      saveDraft: props.onSaveDraft,
      duplicateMap: props.onDuplicateMap,
      renameMap: props.onRenameMap,
      importMap: () => document.getElementById("map-editor-import-input")?.click(),
      exportMap: props.onExport,
      revertMap: props.onResetUnsaved,
      resetFlat: props.onResetFlat,
      undo: props.onUndo,
      redo: props.onRedo,
      duplicate: props.onDuplicateEntity,
      deleteSelection: props.selectedMarkerId ? props.onRemoveMarker : props.onDeleteEntity,
      group: props.onGroupEntity,
      ungroup: props.onUngroupEntity,
      deselect,
      setTool: (tool) => props.onToolChange(tool as EditorTool),
      setWorkspace,
      toggleCleanPreview,
      resetLayout,
      openCommandSearch: () => patchLayout({ commandSearchOpen: true }),
      openShortcuts: () => patchLayout({ shortcutsOpen: true }),
      validateMap,
      placeEntity: props.onPlaceEntity,
      placeNavigationNode: props.onPlaceNavigationNode,
      connectNavigationNodes: props.onConnectNavigationNodes,
      createRoute: props.onCreateRoute,
    },
  }), [layout, props]);

  const visibleCommands = findEditorCommands(commands, commandQuery);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        patchLayout({ commandSearchOpen: true });
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        props.onSaveDraft();
      }
      if (event.shiftKey && event.code === "Space") {
        event.preventDefault();
        patchLayout({ maximizedViewport: !layout.maximizedViewport });
      }
      if (event.key.toLowerCase() === "g") {
        const layer = props.layerStates.find((item) => item.id === "developmentHelpers");
        if (layer) props.onLayerVisibilityChange("developmentHelpers", !layer.visible);
      }
      if (event.key === "Escape") {
        if (layout.commandSearchOpen) patchLayout({ commandSearchOpen: false });
        else if (layout.shortcutsOpen) patchLayout({ shortcutsOpen: false });
        else setOpenMenu(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [layout, props]);

  if (!props.available) return null;

  if (layout.cleanPreview) {
    return (
      <div className="editor-clean-restore">
        <ActionButton icon="layout" onClick={toggleCleanPreview}>Restore Editor</ActionButton>
      </div>
    );
  }

  const shellLeftWidth = layout.maximizedViewport ? 0 : layout.collapsed.left ? COLLAPSED_SIDE_DOCK_WIDTH : layout.dimensions.leftWidth;
  const shellRightWidth = layout.maximizedViewport ? 0 : layout.collapsed.right ? COLLAPSED_SIDE_DOCK_WIDTH : layout.dimensions.rightWidth;
  const shellBottomHeight = layout.maximizedViewport ? 0 : layout.collapsed.bottom ? COLLAPSED_BOTTOM_DOCK_HEIGHT : layout.dimensions.bottomHeight;

  return (
    <div
      className={`editor-shell ${layout.maximizedViewport ? "editor-shell--maximized" : ""}`}
      aria-label="Development map editor"
      style={{
        "--editor-left-width": `${shellLeftWidth}px`,
        "--editor-right-width": `${shellRightWidth}px`,
        "--editor-bottom-height": `${shellBottomHeight}px`,
        "--editor-outliner-height": `${layout.dimensions.outlinerHeight}px`,
      } as React.CSSProperties}
      onPointerDown={() => setOpenMenu(null)}
    >
      <MenuBar commands={commands} openMenu={openMenu} setOpenMenu={setOpenMenu} onCloseEditor={props.onClose} />
      <MainToolbar props={props} commands={commands} layout={layout} setWorkspace={setWorkspace} toggleCleanPreview={toggleCleanPreview} />
      <ToolRail workspace={layout.activeWorkspace} activeTool={props.tool} onToolChange={props.onToolChange} />
      {!layout.maximizedViewport ? (
        <aside className={`editor-left-dock ${layout.collapsed.left ? "editor-dock--collapsed" : ""}`} aria-label="Contextual palette" onPointerDown={(event) => event.stopPropagation()}>
          <DockHeader title="Palette" side="left" collapsed={layout.collapsed.left} onToggle={() => setLayout((current) => ({ ...current, collapsed: { ...current.collapsed, left: !current.collapsed.left } }))} />
          {!layout.collapsed.left ? <Palette props={props} workspace={layout.activeWorkspace} fileInputRef={fileInputRef} setBottomTab={(tab) => patchLayout({ activeBottomTab: tab })} /> : null}
          {!layout.collapsed.left ? <ResizeHandle axis="x" side="left" onResize={(value) => setLayout((current) => resizeEditorPanel(current, "leftWidth", value, getViewport()))} onReset={() => setLayout((current) => resizeEditorPanel(current, "leftWidth", 244, getViewport()))} /> : null}
        </aside>
      ) : null}
      {!layout.maximizedViewport ? (
        <aside className={`editor-right-dock ${layout.collapsed.right ? "editor-dock--collapsed" : ""}`} aria-label="Scene outliner and inspector" onPointerDown={(event) => event.stopPropagation()}>
          <DockHeader title="Inspector" side="right" collapsed={layout.collapsed.right} onToggle={() => setLayout((current) => ({ ...current, collapsed: { ...current.collapsed, right: !current.collapsed.right } }))} />
          {!layout.collapsed.right ? <Outliner props={props} query={layout.outlinerQuery} onQueryChange={(outlinerQuery) => patchLayout({ outlinerQuery })} /> : null}
          {!layout.collapsed.right ? <ResizeHandle axis="y" side="outliner" onResize={(value) => setLayout((current) => resizeEditorPanel(current, "outlinerHeight", value, getViewport()))} onReset={() => setLayout((current) => resizeEditorPanel(current, "outlinerHeight", 260, getViewport()))} /> : null}
          {!layout.collapsed.right ? <Inspector props={props} workspace={layout.activeWorkspace} /> : null}
          {!layout.collapsed.right ? <ResizeHandle axis="x" side="right" onResize={(value) => setLayout((current) => resizeEditorPanel(current, "rightWidth", value, getViewport()))} onReset={() => setLayout((current) => resizeEditorPanel(current, "rightWidth", 332, getViewport()))} /> : null}
        </aside>
      ) : null}
      {!layout.maximizedViewport ? (
        <section className={`editor-bottom-dock ${layout.collapsed.bottom ? "editor-dock--collapsed" : ""}`} aria-label="Editor bottom dock" onPointerDown={(event) => event.stopPropagation()}>
          <DockHeader title="Timeline" side="bottom" collapsed={layout.collapsed.bottom} onToggle={() => setLayout((current) => ({ ...current, collapsed: { ...current.collapsed, bottom: !current.collapsed.bottom } }))} />
          {!layout.collapsed.bottom ? <ResizeHandle axis="y" side="bottom" onResize={(value) => setLayout((current) => resizeEditorPanel(current, "bottomHeight", value, getViewport()))} onReset={() => setLayout((current) => resizeEditorPanel(current, "bottomHeight", 204, getViewport()))} /> : null}
          {!layout.collapsed.bottom ? <BottomDock props={props} activeTab={layout.activeBottomTab} onTabChange={(activeBottomTab) => patchLayout({ activeBottomTab })} fileInputRef={fileInputRef} /> : null}
        </section>
      ) : null}
      <StatusBar props={props} workspace={layout.activeWorkspace} />
      <input id="map-editor-import-input" ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) props.onImport(file);
      }} />
      {layout.commandSearchOpen ? (
        <CommandSearch
          commands={visibleCommands}
          query={commandQuery}
          index={selectedCommandIndex}
          inputRef={searchInputRef}
          onQueryChange={(query) => {
            setCommandQuery(query);
            setSelectedCommandIndex(0);
          }}
          onIndexChange={setSelectedCommandIndex}
          onClose={() => patchLayout({ commandSearchOpen: false })}
        />
      ) : null}
      {layout.shortcutsOpen ? <ShortcutsDialog commands={commands} onClose={() => patchLayout({ shortcutsOpen: false })} /> : null}
    </div>
  );
}

function MenuBar({ commands, openMenu, setOpenMenu, onCloseEditor }: { commands: EditorCommand[]; openMenu: string | null; setOpenMenu: (menu: string | null) => void; onCloseEditor: () => void }) {
  return (
    <header className="editor-menu-bar" role="menubar" aria-label="Editor menu bar" onPointerDown={(event) => event.stopPropagation()}>
      <strong>Map Editor</strong>
      {MENU_GROUPS.map((group) => (
        <div key={group} className="editor-menu">
          <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={openMenu === group} onClick={() => setOpenMenu(openMenu === group ? null : group)}>
            {title(group)}
          </button>
          {openMenu === group ? (
            <div className="editor-menu-popover" role="menu">
              {commands.filter((command) => command.category === group).map((command) => <CommandMenuItem key={command.id} command={command} />)}
            </div>
          ) : null}
        </div>
      ))}
      <button className="editor-window-button" type="button" onClick={onCloseEditor}><EditorIcon name="close" /><span>Close</span></button>
    </header>
  );
}

function MainToolbar({ props, commands, layout, setWorkspace, toggleCleanPreview }: { props: MapEditorToolbarProps; commands: EditorCommand[]; layout: ReturnType<typeof createDefaultEditorLayout>; setWorkspace: (workspace: string) => void; toggleCleanPreview: () => void }) {
  return (
    <div className="editor-main-toolbar" onPointerDown={(event) => event.stopPropagation()}>
      <div className="editor-map-chip">
        <strong>{props.mapName}{props.hasUnsavedChanges ? " *" : ""}</strong>
        <span>{props.mapId} · {props.renderMode}</span>
      </div>
      <IconButton command={commands.find((command) => command.id === "edit.undo")} />
      <IconButton command={commands.find((command) => command.id === "edit.redo")} />
      <div className="editor-workspaces" role="tablist" aria-label="Editor workspaces">
        {WORKSPACES.map((workspace) => (
          <button key={workspace.id} type="button" role="tab" aria-selected={layout.activeWorkspace === workspace.id} className={layout.activeWorkspace === workspace.id ? "active" : ""} onClick={() => setWorkspace(workspace.id)}>
            {workspace.label}
          </button>
        ))}
      </div>
      <IconButton command={commands.find((command) => command.id === "file.save-draft")} />
      <ActionButton icon="preview" className={layout.cleanPreview ? "active" : ""} title="Clean Preview (Shift+Space)" onClick={toggleCleanPreview}>Preview</ActionButton>
      <button type="button" onClick={() => commands.find((command) => command.id === "map.validate")?.execute()}>
        <EditorIcon name={props.validationSummary.length ? "warning" : "validate"} />
        {props.validationSummary.length ? `${props.validationSummary.length} issues` : "Valid"}
      </button>
    </div>
  );
}

function ToolRail({ workspace, activeTool, onToolChange }: { workspace: EditorWorkspace; activeTool: EditorTool; onToolChange: (tool: EditorTool) => void }) {
  return (
    <nav className="editor-tool-rail" aria-label={`${workspace} tools`} onPointerDown={(event) => event.stopPropagation()}>
      {WORKSPACE_TOOLS[workspace].map((tool) => (
        <button key={tool} type="button" className={activeTool === tool ? "active" : ""} title={TOOL_LABELS[tool]} aria-label={TOOL_LABELS[tool]} onClick={() => onToolChange(tool)}>
          <EditorIcon name={toolIcon(tool)} />
          <span>{TOOL_LABELS[tool]}</span>
        </button>
      ))}
    </nav>
  );
}

function Palette({ props, workspace, fileInputRef, setBottomTab }: { props: MapEditorToolbarProps; workspace: EditorWorkspace; fileInputRef: React.RefObject<HTMLInputElement | null>; setBottomTab: (tab: BottomDockTab) => void }) {
  if (workspace === "objects") {
    return (
      <Panel title="Primitive Palette">
        <div className="editor-thumb-grid">
          {PRIMITIVES.map((primitive) => <button key={primitive} type="button" className={props.primitiveType === primitive ? "active" : ""} onClick={() => props.onPrimitiveTypeChange(primitive)}>{primitive}</button>)}
        </div>
        <label>Name<input value={props.entityName} onChange={(event) => props.onEntityNameChange(event.target.value)} /></label>
        <label>Colour<input type="color" value={props.entityColor} onChange={(event) => props.onEntityColorChange(event.target.value)} /></label>
        <label>Collision<select value={props.collisionMode} onChange={(event) => props.onCollisionModeChange(event.target.value as CollisionMode)}>{COLLISION_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
        <ActionButton icon="object" onClick={props.onPlaceEntity}>Place Entity</ActionButton>
      </Panel>
    );
  }

  if (workspace === "navigation") {
    return (
      <Panel title="Navigation">
        <label>Node type<select value={props.navigationNodeType} onChange={(event) => props.onNavigationNodeTypeChange(event.target.value as NavigationNodeType)}>{NODE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <ActionButton icon="navigation" onClick={props.onPlaceNavigationNode}>Place Node</ActionButton>
        <ActionButton icon="path" disabled={props.navigationNodeCount < 2} onClick={props.onConnectNavigationNodes}>Connect Latest</ActionButton>
        <ActionButton icon="navigation" disabled={props.navigationNodeCount < 2} onClick={props.onCreateRoute}>Create Route</ActionButton>
      </Panel>
    );
  }

  if (workspace === "map") {
    return (
      <Panel title="Map Library">
        <label>Load map<select value={props.mapId} onChange={(event) => props.onMapChange(event.target.value)}>{props.availableMaps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}</select></label>
        <ActionButton icon="new" onClick={props.onNewMap}>New Map</ActionButton>
        <ActionButton icon="duplicate" onClick={props.onDuplicateMap}>Duplicate Map</ActionButton>
        <ActionButton icon="save" onClick={props.onSaveDraft}>Save Draft</ActionButton>
        <ActionButton icon="import" onClick={() => fileInputRef.current?.click()}>Import</ActionButton>
        <ActionButton icon="export" onClick={props.onExport}>Export</ActionButton>
        <ActionButton icon="open" onClick={() => setBottomTab("library")}>Open Library</ActionButton>
      </Panel>
    );
  }

  if (workspace === "zones") {
    return (
      <Panel title="Zones">
        <label>Current zone<select value={props.zoneId} onChange={(event) => props.onZoneChange(Number(event.target.value))}>{[0, 1, 2, 3, 4, 5].map((zoneId) => <option key={zoneId} value={zoneId}>{zoneId === 0 ? "Clear zone" : `Zone ${zoneId}`}</option>)}</select></label>
        <LayerList props={props} ids={["zones"]} />
      </Panel>
    );
  }

  if (workspace === "review") {
    return (
      <Panel title="Review">
        <label>Renderer<select value={props.renderMode} onChange={(event) => props.onRenderModeChange(event.target.value as TerrainRenderMode)}><option value="surface">Exposed-face meshes</option><option value="instanced">Full cube instances</option></select></label>
        <ActionButton icon="validate" onClick={() => setBottomTab("validation")}>Validation</ActionButton>
        <ActionButton icon="performance" onClick={() => setBottomTab("performance")}>Performance</ActionButton>
        <LayerList props={props} ids={["developmentHelpers", "navigation", "markers"]} />
      </Panel>
    );
  }

  return (
    <Panel title="Terrain Palette">
      <label>Preset<select value={props.presetId} onChange={(event) => props.onPresetChange(event.target.value as MapPresetId)}>{MAP_PRESET_OPTIONS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
      <label>Block<select value={props.paintBlockId} onChange={(event) => props.onPaintBlockChange(Number(event.target.value) as BlockId)}>{RENDERABLE_BLOCK_DEFINITIONS.map((block) => <option key={block.id} value={block.id}>{block.displayName}</option>)}</select></label>
      <label>Brush<select value={props.brushSettings.shape} onChange={(event) => props.onBrushShapeChange(event.target.value as BrushShape)}><option value="single">Single</option><option value="square">Square</option><option value="circle">Circle</option></select></label>
      <div className="editor-field-row">
        <label>Size<input type="number" min={1} max={9} value={props.brushSettings.size} onChange={(event) => props.onBrushSizeChange(Number(event.target.value))} /></label>
        <label>Path<input type="number" min={1} max={9} value={props.brushSettings.pathWidth} onChange={(event) => props.onPathWidthChange(Number(event.target.value))} /></label>
      </div>
      <label>Flatten Y<input type="number" min={0} max={11} value={props.brushSettings.flattenHeight} onChange={(event) => props.onFlattenHeightChange(Number(event.target.value))} /></label>
      <span className="editor-muted">{props.brushAffectedCellCount} affected cells</span>
    </Panel>
  );
}

function Outliner({ props, query, onQueryChange }: { props: MapEditorToolbarProps; query: string; onQueryChange: (query: string) => void }) {
  const normalized = query.toLowerCase();
  const entities = props.selectedEntity ? [props.selectedEntity] : [];
  return (
    <Panel title="Scene Outliner" className="editor-outliner">
      <input aria-label="Search outliner" placeholder="Search scene" value={query} onChange={(event) => onQueryChange(event.target.value)} />
      <TreeRow label="Current Map" value={props.mapName} selected={false} />
      <TreeRow label="Terrain" value={`${props.blockEditCount} edits`} selected={Boolean(props.selected)} />
      <TreeRow label="Zones" value={`${props.zoneAssignmentCount} cells`} selected={false} />
      <TreeRow label="Markers" value={`${props.entityAnchorCount}`} selected={Boolean(props.selectedMarkerId)} />
      <TreeRow label="Entities" value={`${props.entityCount}`} selected={props.selectedEntityIds.length > 0} />
      {(normalized ? entities.filter((entity) => entity.name.toLowerCase().includes(normalized) || entity.id.includes(normalized)) : entities).map((entity) => (
        <TreeRow key={entity.id} label={entity.name} value={entity.id} selected />
      ))}
      <TreeRow label="Navigation" value={`${props.navigationNodeCount} nodes`} selected={false} />
      <TreeRow label="Routes" value={`${props.routeCount}`} selected={false} />
      <TreeRow label="Spawn Points" value="configured" selected={false} />
      <TreeRow label="Camera Presets" value="configured" selected={false} />
    </Panel>
  );
}

function Inspector({ props, workspace }: { props: MapEditorToolbarProps; workspace: EditorWorkspace }) {
  if (props.selectedEntity) {
    const entity = props.selectedEntity;
    return (
      <Panel title="Inspector">
        <Section title="Identity"><KeyValue label="ID" value={entity.id} mono /><KeyValue label="Name" value={entity.name} /><KeyValue label="Type" value={entity.entityType} /><KeyValue label="Tags" value={entity.tags.join(", ") || "-"} /></Section>
        <Section title="Transform"><KeyValue label="Position" value={formatVector(entity.transform.position)} mono /><KeyValue label="Rotation" value={formatVector(entity.transform.rotation)} mono /><KeyValue label="Scale" value={formatVector(entity.transform.scale)} mono /></Section>
        <Section title="Appearance"><KeyValue label="Primitive" value={entity.primitiveType} /><KeyValue label="Colour" value={entity.appearance.color} mono /><KeyValue label="Asset" value={entity.assetReference ?? "-"} /></Section>
        <Section title="Placement"><KeyValue label="Footprint" value={`${entity.footprint.width} x ${entity.footprint.depth} x ${entity.footprint.height}`} mono /><KeyValue label="Collision" value={entity.collisionMode} /><KeyValue label="Group" value={entity.groupId ?? "-"} /></Section>
      </Panel>
    );
  }

  if (props.selected) {
    return (
      <Panel title="Inspector">
        <Section title="Terrain Selection">
          <KeyValue label="Coordinates" value={formatCoordinate(props.selected)} mono />
          <KeyValue label="Block" value={props.selectedBlockId === null ? "-" : getBlockDefinition(props.selectedBlockId).displayName} />
          <KeyValue label="Height" value={String(props.selected.y)} mono />
          <KeyValue label="Zone" value={String(props.selectedZoneId)} mono />
          <KeyValue label="Chunk" value={props.selectedChunk ? `${props.selectedChunk.chunkX},${props.selectedChunk.chunkZ}` : "-"} mono />
          <KeyValue label="Dirty chunks" value={String(props.dirtyChunks)} mono />
        </Section>
      </Panel>
    );
  }

  return (
    <Panel title="Inspector">
      <Section title="Map Summary">
        <KeyValue label="Workspace" value={workspace} />
        <KeyValue label="Map" value={props.mapName} />
        <KeyValue label="Dimensions" value="64 x 64 x 12" mono />
        <KeyValue label="Blocks" value={`${props.blockEditCount} edits`} mono />
        <KeyValue label="Entities" value={String(props.entityCount)} mono />
        <KeyValue label="Markers" value={String(props.entityAnchorCount)} mono />
        <KeyValue label="Navigation" value={`${props.navigationNodeCount} / ${props.navigationEdgeCount} / ${props.routeCount}`} mono />
      </Section>
      <p className="editor-muted">Select terrain, an entity, marker, zone, navigation item or camera preset to edit contextual properties.</p>
    </Panel>
  );
}

function BottomDock({ props, activeTab, onTabChange, fileInputRef }: { props: MapEditorToolbarProps; activeTab: BottomDockTab; onTabChange: (tab: BottomDockTab) => void; fileInputRef: React.RefObject<HTMLInputElement | null> }) {
  const tabs: BottomDockTab[] = ["library", "validation", "history", "performance"];
  return (
    <>
      <div className="editor-tabs" role="tablist" aria-label="Bottom dock tabs">
        {tabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => onTabChange(tab)}><EditorIcon name={bottomTabIcon(tab)} /><span>{title(tab)}</span></button>)}
      </div>
      <div className="editor-bottom-content">
        {activeTab === "library" ? <LibraryTab props={props} fileInputRef={fileInputRef} /> : null}
        {activeTab === "validation" ? <ValidationTab props={props} /> : null}
        {activeTab === "history" ? <HistoryTab props={props} /> : null}
        {activeTab === "performance" ? <PerformanceTab props={props} /> : null}
      </div>
    </>
  );
}

function LibraryTab({ props, fileInputRef }: { props: MapEditorToolbarProps; fileInputRef: React.RefObject<HTMLInputElement | null> }) {
  return (
    <div className="editor-table">
      {props.availableMaps.map((map) => <button key={map.id} type="button" className={props.mapId === map.id ? "active" : ""} onClick={() => props.onMapChange(map.id)}><span>{map.name}</span><code>{map.id}</code><span>{map.kind}</span></button>)}
      <div className="editor-inline-actions">
        <ActionButton icon="new" onClick={props.onNewMap}>New</ActionButton>
        <ActionButton icon="duplicate" onClick={props.onDuplicateMap}>Duplicate</ActionButton>
        <ActionButton icon="save" onClick={props.onSaveDraft}>Save Draft</ActionButton>
        <ActionButton icon="import" onClick={() => fileInputRef.current?.click()}>Import</ActionButton>
        <ActionButton icon="export" onClick={props.onExport}>Export</ActionButton>
        <ActionButton icon="delete" onClick={props.onClearDraft}>Clear Draft</ActionButton>
      </div>
    </div>
  );
}

function ValidationTab({ props }: { props: MapEditorToolbarProps }) {
  const messages = props.validationSummary.length ? props.validationSummary : ["No validation issues reported by the current editor pass."];
  return <ul className="editor-validation-list">{messages.map((message) => <li key={message}>{message}</li>)}</ul>;
}

function HistoryTab({ props }: { props: MapEditorToolbarProps }) {
  return (
    <div className="editor-history">
      <ActionButton icon="undo" onClick={props.onUndo} disabled={props.undoDepth === 0}>Undo ({props.undoDepth})</ActionButton>
      <ActionButton icon="redo" onClick={props.onRedo} disabled={props.redoDepth === 0}>Redo ({props.redoDepth})</ActionButton>
      <span className="editor-muted">Command names are summarized until the authoring command stack exposes labels.</span>
    </div>
  );
}

function PerformanceTab({ props }: { props: MapEditorToolbarProps }) {
  return (
    <dl className="editor-metrics-grid">
      <KeyValue label="Renderer" value={props.renderMode} />
      <KeyValue label="Dirty chunks" value={String(props.dirtyChunks)} mono />
      <KeyValue label="Last rebuilt" value={props.lastRebuiltChunks.join(", ") || "-"} mono />
      <KeyValue label="Block edits" value={String(props.blockEditCount)} mono />
      <KeyValue label="Zones" value={String(props.zoneAssignmentCount)} mono />
      <KeyValue label="Entities" value={String(props.entityCount)} mono />
    </dl>
  );
}

function CommandSearch({ commands, query, index, inputRef, onQueryChange, onIndexChange, onClose }: { commands: EditorCommand[]; query: string; index: number; inputRef: React.RefObject<HTMLInputElement | null>; onQueryChange: (query: string) => void; onIndexChange: (index: number) => void; onClose: () => void }) {
  return (
    <div className="editor-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="editor-command-search" role="dialog" aria-modal="true" aria-label="Command search" onMouseDown={(event) => event.stopPropagation()}>
        <input ref={inputRef} value={query} placeholder="Search commands" onChange={(event) => onQueryChange(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
          if (event.key === "ArrowDown") onIndexChange(Math.min(commands.length - 1, index + 1));
          if (event.key === "ArrowUp") onIndexChange(Math.max(0, index - 1));
          if (event.key === "Enter") {
            const command = commands[index];
            if (command?.isEnabled()) {
              command.execute();
              onClose();
            }
          }
        }} />
        <div role="listbox">
          {commands.slice(0, 12).map((command, commandIndex) => <button key={command.id} type="button" role="option" aria-selected={commandIndex === index} className={commandIndex === index ? "active" : ""} disabled={!command.isEnabled()} onClick={() => { command.execute(); onClose(); }}><EditorIcon name={command.icon ?? "help"} /><span>{command.label}</span><small>{command.shortcut ?? command.category}</small></button>)}
        </div>
      </div>
    </div>
  );
}

function ShortcutsDialog({ commands, onClose }: { commands: EditorCommand[]; onClose: () => void }) {
  return (
    <div className="editor-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="editor-dialog" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onMouseDown={(event) => event.stopPropagation()}>
        <header><strong>Keyboard Shortcuts</strong><ActionButton icon="close" onClick={onClose}>Close</ActionButton></header>
        <dl>{commands.filter((command) => command.shortcut).map((command) => <div key={command.id}><dt>{command.label}</dt><dd>{command.shortcut}</dd></div>)}</dl>
      </div>
    </div>
  );
}

function StatusBar({ props, workspace }: { props: MapEditorToolbarProps; workspace: EditorWorkspace }) {
  return <footer className="editor-status-bar"><span>{workspace}</span><span>{TOOL_LABELS[props.tool]}</span><span>{formatCoordinate(props.hovered)}</span><span>{props.selectedEntityIds.length || (props.selected ? 1 : 0)} selected</span><span>Zone {props.zoneId}</span><span>{formatPerformance(props.fps, props.frameMs)}</span><span>{props.autosaveStatus}</span></footer>;
}

function ResizeHandle({ axis, side, onResize, onReset }: { axis: "x" | "y"; side: string; onResize: (value: number) => void; onReset: () => void }) {
  return <div role="separator" aria-orientation={axis === "x" ? "vertical" : "horizontal"} className={`editor-resize-handle editor-resize-handle--${side}`} onDoubleClick={onReset} onPointerDown={(event) => {
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = target.parentElement?.getBoundingClientRect();
    const onMove = (moveEvent: PointerEvent) => {
      if (!startRect) return;
      if (side === "right") onResize(startRect.width - (moveEvent.clientX - startX));
      else if (side === "bottom") onResize(startRect.height - (moveEvent.clientY - startY));
      else if (side === "outliner") onResize(startRect.height + (moveEvent.clientY - startY));
      else onResize(startRect.width + (moveEvent.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }} />;
}

function LayerList({ props, ids }: { props: MapEditorToolbarProps; ids: EditorLayerId[] }) {
  return <div className="editor-layer-list">{props.layerStates.filter((layer) => ids.includes(layer.id)).map((layer) => <div key={layer.id}><span>{layer.label}</span><label><input type="checkbox" checked={layer.visible} onChange={(event) => props.onLayerVisibilityChange(layer.id, event.target.checked)} /> show</label><label><input type="checkbox" checked={layer.locked} onChange={(event) => props.onLayerLockChange(layer.id, event.target.checked)} /> lock</label></div>)}</div>;
}

function Panel({ title: panelTitle, className = "", children }: { title: string; className?: string; children: React.ReactNode }) {
  return <section className={`editor-panel ${className}`}><header><strong>{panelTitle}</strong></header>{children}</section>;
}

function Section({ title: sectionTitle, children }: { title: string; children: React.ReactNode }) {
  return <details open className="editor-inspector-section"><summary>{sectionTitle}</summary>{children}</details>;
}

function KeyValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="editor-kv"><dt>{label}</dt><dd className={mono ? "mono" : ""}>{value}</dd></div>;
}

function TreeRow({ label, value, selected }: { label: string; value: string; selected: boolean }) {
  return <button type="button" className={selected ? "selected" : ""}><span>{label}</span><code>{value}</code></button>;
}

function IconButton({ command }: { command?: EditorCommand }) {
  if (!command) return null;
  return <button type="button" aria-label={command.label} title={`${command.label}${command.shortcut ? ` (${command.shortcut})` : ""}`} disabled={!command.isEnabled()} onClick={command.execute}><EditorIcon name={command.icon ?? "help"} /></button>;
}

function ActionButton({ icon, children, type = "button", ...buttonProps }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: EditorIconKey; children: React.ReactNode }) {
  return <button {...buttonProps} type={type}><EditorIcon name={icon} /><span>{children}</span></button>;
}

function CommandMenuItem({ command }: { command: EditorCommand }) {
  return <button type="button" role="menuitem" disabled={!command.isEnabled()} onClick={command.execute}><EditorIcon name={command.icon ?? "help"} /><span>{command.label}</span><kbd>{command.shortcut ?? ""}</kbd></button>;
}

function DockHeader({ title: headerTitle, side, collapsed, onToggle }: { title: string; side: "left" | "right" | "bottom"; collapsed: boolean; onToggle: () => void }) {
  return (
    <div className="editor-dock-header">
      <span>{headerTitle}</span>
      <button type="button" aria-label={`${collapsed ? "Expand" : "Collapse"} ${side} pane`} title={`${collapsed ? "Expand" : "Collapse"} ${side} pane`} onClick={onToggle}>
        <EditorIcon name={`${collapsed ? "restore" : "collapse"}-${side}` as EditorIconKey} />
      </button>
    </div>
  );
}

const EDITOR_ICONS: Record<EditorIconKey, LucideIcon> = {
  add: Plus,
  clear: Trash2,
  close: X,
  delete: Trash2,
  duplicate: Copy,
  entity: Box,
  erase: Eraser,
  export: Download,
  fill: Layers,
  flatten: Layers,
  help: HelpCircle,
  import: Upload,
  layout: PanelLeftOpen,
  lower: Minus,
  marker: MapPin,
  navigation: Navigation,
  new: FilePlus2,
  object: Box,
  open: FolderOpen,
  paint: Brush,
  path: Route,
  performance: RotateCcw,
  preview: Eye,
  raise: Plus,
  redo: Redo2,
  removePath: Trash2,
  removeZone: Trash2,
  "collapse-bottom": PanelBottomClose,
  "collapse-left": PanelLeftClose,
  "collapse-right": PanelRightClose,
  "restore-bottom": PanelBottomOpen,
  "restore-left": PanelLeftOpen,
  "restore-right": PanelRightOpen,
  save: Save,
  search: Search,
  select: MousePointer2,
  undo: Undo2,
  validate: CheckCircle2,
  warning: AlertTriangle,
  zone: Square,
};

function EditorIcon({ name }: { name: EditorIconKey }) {
  const Icon = EDITOR_ICONS[name] ?? HelpCircle;
  return <Icon aria-hidden="true" size={16} strokeWidth={1.8} />;
}

function toolIcon(tool: EditorTool): EditorIconKey {
  if (tool === "entity") return "object";
  if (tool === "navigation") return "navigation";
  if (tool === "zone" || tool === "removeZone") return "zone";
  if (tool === "erase" || tool === "clear" || tool === "removePath") return tool;
  return tool;
}

function bottomTabIcon(tab: BottomDockTab): EditorIconKey {
  if (tab === "library") return "open";
  if (tab === "validation") return "validate";
  if (tab === "performance") return "performance";
  return "undo";
}

function workspaceDefaultTab(workspace: EditorWorkspace): BottomDockTab {
  if (workspace === "map") return "library";
  if (workspace === "review") return "validation";
  if (workspace === "navigation") return "validation";
  return "history";
}

function getViewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function formatCoordinate(coordinate: GridCoordinate | null) {
  return coordinate ? `${coordinate.x},${coordinate.y},${coordinate.z}` : "-";
}

function formatPerformance(fps: number | null | undefined, frameMs: number | null | undefined) {
  if (fps == null || frameMs == null) return "FPS - / -ms";
  return `FPS ${fps} / ${frameMs.toFixed(1)}ms`;
}

function formatVector(vector: { x: number; y: number; z: number }) {
  return `${vector.x.toFixed(2)}, ${vector.y.toFixed(2)}, ${vector.z.toFixed(2)}`;
}

function title(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
