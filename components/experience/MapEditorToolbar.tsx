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
  Move3D,
  Navigation,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  Rotate3D,
  RotateCcw,
  Route,
  Save,
  Search,
  Shapes,
  SquareDashedMousePointer,
  Trash2,
  Undo2,
  Upload,
  X,
  Replace,
  type LucideIcon,
} from "lucide-react";
import { createEditorCommands, findEditorCommands, type EditorCommand, type EditorIconName } from "@/lib/editor/editor-commands";
import {
  createDefaultEditorLayout,
  loadEditorLayout,
  resetEditorLayout,
  resizeEditorPanel,
  saveEditorLayout,
  serializeEditorLayout,
  type BottomDockTab,
  type EditorWorkspace,
} from "@/lib/editor/editor-layout-store";
import { incrementEditorPerfCounter } from "@/lib/editor/editor-performance-counters";
import type { EditorMessage, EditorTool } from "@/lib/editor/map-editor";
import { MAP_PRESETS, type MapPresetId } from "@/lib/editor/map-presets";
import type { BrushShape, TerrainBrushSettings } from "@/lib/editor/terrain-brushes";
import type { ZoneEditMode, ZoneSelectionMode } from "@/lib/editor/zone-tools";
import type { MapRegistryEntry } from "@/lib/maps/map-registry";
import type { MapZoneDefinition, MapZoneFocusDirection } from "@/lib/maps/map-definition";
import type { CollisionMode, PlacedMapEntity, PrimitiveType } from "@/lib/maps/map-entities";
import type { NavigationNodeType } from "@/lib/maps/map-navigation";
import { BUILT_IN_PREFABS, listPrefabCategories } from "@/lib/prefabs/prefab-library";
import type { PrefabCategory } from "@/lib/prefabs/prefab-types";
import { RENDERABLE_BLOCK_DEFINITIONS, getBlockDefinition, type BlockId } from "@/lib/world/block-registry";
import type { GridCoordinate, WorldPosition } from "@/lib/world/world-config";
import { getShapeDefinition, SHAPE_DEFINITIONS, type ShapeCategory } from "@/lib/voxel-shapes/shape-registry";
import { SHAPE_IDS, type CellRotation, type ShapeId } from "@/lib/voxel-shapes/shape-ids";

export type TerrainRenderMode = "instanced" | "surface";
export type EntityTransformMode = "translate" | "rotate";
export type ZoneFocusDirection = MapZoneFocusDirection;

type EditorIconKey =
  | EditorIconName
  | EditorTool
  | "warning"
  | "performance"
  | "move"
  | "rotate"
  | "restore-left"
  | "restore-right"
  | "restore-bottom"
  | "collapse-left"
  | "collapse-right"
  | "collapse-bottom"
  | "zone-area-fill"
  | "zone-paint"
  | "zone-replace"
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
  zoneEditMode: ZoneEditMode;
  zoneSelectionMode: ZoneSelectionMode;
  zoneFocusDirection: ZoneFocusDirection;
  zoneDefinitions: MapZoneDefinition[];
  zoneNeutralTerrain: boolean;
  zoneNeutralTerrainColor: string;
  zoneGridLinesVisible: boolean;
  zoneGridLineColor: string;
  mapBackgroundColor: string;
  hovered: GridCoordinate | null;
  selected: GridCoordinate | null;
  selectedBlockId: BlockId | null;
  selectedShapeId: ShapeId | null;
  selectedRotation: CellRotation | null;
  selectedState: number | null;
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
  activePrefabId: string;
  activePrefabVariantId: string;
  prefabSearch: string;
  entityTransformMode: EntityTransformMode;
  collisionMode: CollisionMode;
  entityColor: string;
  entityName: string;
  brushSettings: TerrainBrushSettings;
  activeShapeId: ShapeId;
  activeShapeCategory: ShapeCategory;
  activeRotation: CellRotation;
  activeShapeState: number;
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
  onShapeCategoryChange: (category: ShapeCategory) => void;
  onShapeChange: (shapeId: ShapeId) => void;
  onCellRotationChange: (rotation: CellRotation) => void;
  onShapeStateChange: (state: number) => void;
  onEyedropperCell: () => void;
  onPresetChange: (presetId: MapPresetId) => void;
  onMapChange: (mapId: string) => void;
  onNewMap: () => void;
  onDuplicateMap: () => void;
  onSaveDraft: () => void;
  onRenameMap: () => void;
  onRenderModeChange: (mode: TerrainRenderMode) => void;
  onZoneChange: (zoneId: number) => void;
  onZoneEditModeChange: (mode: ZoneEditMode) => void;
  onZoneSelectionModeChange: (mode: ZoneSelectionMode) => void;
  onZoneFocusDirectionChange: (direction: ZoneFocusDirection) => void;
  onZoneDefinitionChange: (numericId: number, patch: Partial<Pick<MapZoneDefinition, "label" | "shortLabel" | "description" | "color" | "visibleInLegend" | "overlayVisible" | "locked" | "focusDirection">>) => void;
  onCreateZone: () => void;
  onZoneNeutralTerrainChange: (enabled: boolean) => void;
  onZoneNeutralTerrainColorChange: (color: string) => void;
  onZoneGridLinesVisibleChange: (visible: boolean) => void;
  onZoneGridLineColorChange: (color: string) => void;
  onMapBackgroundColorChange: (color: string) => void;
  onFocusActiveZone: () => void;
  onClearActiveZone: () => void;
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
  onActivePrefabChange: (prefabId: string) => void;
  onActivePrefabVariantChange: (variantId: string) => void;
  onPrefabSearchChange: (query: string) => void;
  onEntityTransformModeChange: (mode: EntityTransformMode) => void;
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
  zones: ["select"],
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
  zone: "Zone Area",
  removeZone: "Clear Zone",
  marker: "Marker",
  entity: "Place",
  navigation: "Nav Node",
};

const PRIMITIVES: PrimitiveType[] = ["box", "cylinder", "sphere", "plane", "platform", "sign"];
const COLLISION_MODES: CollisionMode[] = ["none", "blocking", "walkable", "trigger"];
const NODE_TYPES: NavigationNodeType[] = ["walk", "route-junction", "wait-point", "look-at", "character-spawn", "bird-perch"];
const SHAPE_CATEGORIES: ShapeCategory[] = ["terrain", "transition", "structure", "roof", "utility", "fluid"];
const MENU_GROUPS = ["file", "edit", "view", "map", "help"] as const;
const MAP_PRESET_OPTIONS = MAP_PRESETS;
const COLLAPSED_SIDE_DOCK_WIDTH = 32;
const COLLAPSED_BOTTOM_DOCK_HEIGHT = 30;

export default function MapEditorToolbar(props: MapEditorToolbarProps) {
  incrementEditorPerfCounter("editorToolbarRenders");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastSavedLayoutRef = useRef<string | null>(null);
  const [layout, setLayout] = useState(() => (
    typeof window === "undefined" ? createDefaultEditorLayout() : loadEditorLayout(window.localStorage)
  ));
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [commandQuery, setCommandQuery] = useState("");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  useEffect(() => {
    const serialized = serializeEditorLayout(layout);
    if (serialized === lastSavedLayoutRef.current) {
      return;
    }
    lastSavedLayoutRef.current = serialized;
    incrementEditorPerfCounter("layoutPersistenceWrites");
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
    props.onToolChange("select");
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
      loadMap: () => patchLayout({ activeBottomTab: "overview" }),
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
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        props.onCellRotationChange((((props.activeRotation + (event.shiftKey ? 3 : 1)) % 4) as CellRotation));
      }
      if (event.key.toLowerCase() === "f" && props.activeShapeId === SHAPE_IDS.SLAB) {
        event.preventDefault();
        props.onShapeStateChange(props.activeShapeState === 1 ? 0 : 1);
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
      <MenuBar commands={commands} openMenu={openMenu} setOpenMenu={setOpenMenu} props={props} onCloseEditor={props.onClose} />
      <MainToolbar props={props} commands={commands} layout={layout} setWorkspace={setWorkspace} toggleCleanPreview={toggleCleanPreview} />
      <ToolRail workspace={layout.activeWorkspace} activeTool={props.tool} props={props} onToolChange={props.onToolChange} />
      {!layout.maximizedViewport ? (
        <aside className={`editor-left-dock ${layout.collapsed.left ? "editor-dock--collapsed" : ""}`} aria-label="Contextual palette" onPointerDown={(event) => event.stopPropagation()}>
          <DockHeader title="Tool Settings" side="left" collapsed={layout.collapsed.left} onToggle={() => setLayout((current) => ({ ...current, collapsed: { ...current.collapsed, left: !current.collapsed.left } }))} />
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
          <DockHeader title="Reports" side="bottom" collapsed={layout.collapsed.bottom} onToggle={() => setLayout((current) => ({ ...current, collapsed: { ...current.collapsed, bottom: !current.collapsed.bottom } }))} />
          {!layout.collapsed.bottom ? <ResizeHandle axis="y" side="bottom" onResize={(value) => setLayout((current) => resizeEditorPanel(current, "bottomHeight", value, getViewport()))} onReset={() => setLayout((current) => resizeEditorPanel(current, "bottomHeight", 204, getViewport()))} /> : null}
          {!layout.collapsed.bottom ? <BottomDock props={props} workspace={layout.activeWorkspace} activeTab={layout.activeBottomTab} onTabChange={(activeBottomTab) => patchLayout({ activeBottomTab })} /> : null}
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

function MenuBar({ commands, openMenu, setOpenMenu, props, onCloseEditor }: { commands: EditorCommand[]; openMenu: string | null; setOpenMenu: (menu: string | null) => void; props: MapEditorToolbarProps; onCloseEditor: () => void }) {
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
              {group === "view" ? <ViewMenuSettings props={props} /> : null}
            </div>
          ) : null}
        </div>
      ))}
      <button className="editor-window-button" type="button" onClick={onCloseEditor}><EditorIcon name="close" /><span>Close</span></button>
    </header>
  );
}

function ViewMenuSettings({ props }: { props: MapEditorToolbarProps }) {
  const objectsVisible = isLayerVisibleInToolbar(props, "entities") || isLayerVisibleInToolbar(props, "markers");
  return (
    <div className="editor-menu-settings" role="group" aria-label="View settings">
      <label>
        <span>Hide terrain material</span>
        <input type="checkbox" checked={props.zoneNeutralTerrain} onChange={(event) => props.onZoneNeutralTerrainChange(event.target.checked)} />
      </label>
      <label>
        <span>Hide objects</span>
        <input type="checkbox" checked={!objectsVisible} onChange={(event) => {
          const visible = !event.target.checked;
          props.onLayerVisibilityChange("entities", visible);
          props.onLayerVisibilityChange("markers", visible);
        }} />
      </label>
      <label>
        <span>Grid block color</span>
        <input type="color" value={props.zoneNeutralTerrainColor} onChange={(event) => props.onZoneNeutralTerrainColorChange(event.target.value)} />
      </label>
      <label>
        <span>Show grid lines</span>
        <input type="checkbox" checked={props.zoneGridLinesVisible} onChange={(event) => props.onZoneGridLinesVisibleChange(event.target.checked)} />
      </label>
      <label>
        <span>Grid line color</span>
        <input type="color" value={props.zoneGridLineColor} onChange={(event) => props.onZoneGridLineColorChange(event.target.value)} />
      </label>
      <label>
        <span>Map background color</span>
        <input type="color" value={props.mapBackgroundColor} onChange={(event) => props.onMapBackgroundColorChange(event.target.value)} />
      </label>
    </div>
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

function ToolRail({ workspace, activeTool, props, onToolChange }: { workspace: EditorWorkspace; activeTool: EditorTool; props: MapEditorToolbarProps; onToolChange: (tool: EditorTool) => void }) {
  return (
    <nav className="editor-tool-rail" aria-label={`${workspace} tools`} onPointerDown={(event) => event.stopPropagation()}>
      {WORKSPACE_TOOLS[workspace].map((tool) => (
        <button key={tool} type="button" className={activeTool === tool ? "active" : ""} title={TOOL_LABELS[tool]} aria-label={TOOL_LABELS[tool]} onClick={() => onToolChange(tool)}>
          <EditorIcon name={toolIcon(tool)} />
          <span>{TOOL_LABELS[tool]}</span>
        </button>
      ))}
      {workspace === "zones" ? <ZoneRailTools props={props} /> : null}
    </nav>
  );
}

function ZoneRailTools({ props }: { props: MapEditorToolbarProps }) {
  const zoneToolActive = props.tool === "zone";
  return (
    <>
      <div className="editor-tool-rail-divider" aria-hidden="true" />
      <div className="editor-tool-rail-group" aria-label="Zone operation">
        <button type="button" title="New Zone" aria-label="New Zone" onClick={props.onCreateZone}>
          <EditorIcon name="add" />
          <span>New Zone</span>
        </button>
        {(["paint", "replace", "erase"] as ZoneEditMode[]).map((mode) => (
          <button key={mode} type="button" className={zoneToolActive && props.zoneEditMode === mode && props.zoneSelectionMode === "brush" ? "active" : ""} title={zoneEditLabel(mode)} aria-label={`Zone ${zoneEditLabel(mode)}`} onClick={() => { props.onToolChange("zone"); props.onZoneEditModeChange(mode); props.onZoneSelectionModeChange("brush"); }}>
            <EditorIcon name={zoneEditIcon(mode)} />
            <span>{zoneEditLabel(mode)}</span>
          </button>
        ))}
      </div>
      <div className="editor-tool-rail-divider" aria-hidden="true" />
      <div className="editor-tool-rail-group" aria-label="Zone area mode">
        <button type="button" className={zoneToolActive && props.zoneSelectionMode === "rectangle" ? "active" : ""} title="Area Fill" aria-label="Zone Area Fill" onClick={() => { props.onToolChange("zone"); props.onZoneSelectionModeChange("rectangle"); }}>
          <EditorIcon name="zone-area-fill" />
          <span>Area Fill</span>
        </button>
      </div>
      <div className="editor-tool-rail-divider" aria-hidden="true" />
      <div className="editor-tool-rail-group" aria-label="Zone focus">
        <button type="button" title="Focus Zone" aria-label="Focus Zone" onClick={props.onFocusActiveZone}>
          <EditorIcon name="search" />
          <span>Focus Zone</span>
        </button>
        <button type="button" title="Remove Selected Zone" aria-label="Remove Selected Zone" onClick={props.onClearActiveZone}>
          <EditorIcon name="delete" />
          <span>Remove Zone</span>
        </button>
      </div>
    </>
  );
}

function Palette({ props, workspace, fileInputRef, setBottomTab }: { props: MapEditorToolbarProps; workspace: EditorWorkspace; fileInputRef: React.RefObject<HTMLInputElement | null>; setBottomTab: (tab: BottomDockTab) => void }) {
  const activePrefab = BUILT_IN_PREFABS.find((prefab) => prefab.id === props.activePrefabId) ?? null;
  const categories = useMemo(() => listPrefabCategories(), []);
  const [activeCategory, setActiveCategory] = useState<PrefabCategory>(activePrefab?.category ?? "architecture");

  if (workspace === "objects") {
    const selectPrimitive = (primitive: PrimitiveType) => {
      props.onActivePrefabChange("");
      props.onPrimitiveTypeChange(primitive);
      props.onToolChange("entity");
    };

    const prefabs = BUILT_IN_PREFABS.filter((prefab) => {
      const query = props.prefabSearch.trim().toLowerCase();
      return prefab.category === activeCategory &&
        (!query || prefab.name.toLowerCase().includes(query) || prefab.tags.some((tag) => tag.includes(query)));
    });

    return (
      <Panel title="Primitive Palette">
        <Section title="Prefab Library">
          <input aria-label="Search prefabs" placeholder="Search prefabs" value={props.prefabSearch} onChange={(event) => props.onPrefabSearchChange(event.target.value)} />
          <div className="editor-category-row">
            {categories.map((category) => <button key={category} type="button" className={activeCategory === category ? "active" : ""} onClick={() => setActiveCategory(category)}>{category.replace(/-/g, " ")}</button>)}
          </div>
          <div className="editor-thumb-grid editor-thumb-grid--prefabs">
            {prefabs.slice(0, 24).map((prefab) => (
              <button key={prefab.id} type="button" className={props.activePrefabId === prefab.id ? "active" : ""} title={`${prefab.name}: ${prefab.description}`} onClick={() => props.onActivePrefabChange(prefab.id)}>
                <span className="editor-prefab-icon">{prefab.name.slice(0, 2).toUpperCase()}</span>
                <span>{prefab.name}</span>
              </button>
            ))}
          </div>
          {activePrefab ? (
            <label>Variant<select value={props.activePrefabVariantId || activePrefab.defaultVariantId} onChange={(event) => props.onActivePrefabVariantChange(event.target.value)}>{activePrefab.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}</select></label>
          ) : null}
          {activePrefab ? <span className="editor-muted">{activePrefab.category} · {activePrefab.collisionMode} · {activePrefab.footprint.width}x{activePrefab.footprint.depth}</span> : null}
        </Section>
        <Section title="Primitive Fallback">
          <div className="editor-thumb-grid">
            {PRIMITIVES.map((primitive) => <button key={primitive} type="button" className={props.primitiveType === primitive && !props.activePrefabId ? "active" : ""} onClick={() => selectPrimitive(primitive)}>{primitive}</button>)}
          </div>
        </Section>
        <label>Name<input value={props.entityName} onChange={(event) => props.onEntityNameChange(event.target.value)} /></label>
        <label>Colour<input type="color" value={props.entityColor} onChange={(event) => props.onEntityColorChange(event.target.value)} /></label>
        <label>Collision<select value={props.collisionMode} onChange={(event) => props.onCollisionModeChange(event.target.value as CollisionMode)}>{COLLISION_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
        <ActionButton icon="object" className={props.tool === "entity" ? "active" : ""} onClick={() => props.onToolChange("entity")}>Place Entity</ActionButton>
        <div className="editor-segmented" role="group" aria-label="Object transform mode">
          <button type="button" className={props.tool === "entity" && props.entityTransformMode === "translate" ? "active" : ""} onClick={() => props.onEntityTransformModeChange("translate")}><EditorIcon name="move" /><span>Move</span></button>
          <button type="button" className={props.tool === "entity" && props.entityTransformMode === "rotate" ? "active" : ""} onClick={() => props.onEntityTransformModeChange("rotate")}><EditorIcon name="rotate" /><span>Rotate</span></button>
        </div>
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
        <ActionButton icon="delete" onClick={props.onClearDraft}>Clear Draft</ActionButton>
      </Panel>
    );
  }

  if (workspace === "zones") {
    const activeZone = props.zoneDefinitions.find((zone) => zone.numericId === props.zoneId) ?? null;
    return (
      <Panel title="Zones">
        <span className="editor-muted">{props.zoneSelectionMode === "rectangle" ? `${zoneEditLabel(props.zoneEditMode)} · Area Fill` : zoneEditLabel(props.zoneEditMode)}</span>
        <ActionButton icon="add" onClick={props.onCreateZone}>New Zone</ActionButton>
        <label>Current zone<select value={props.zoneId} onChange={(event) => props.onZoneChange(Number(event.target.value))}><option value={0}>None</option>{props.zoneDefinitions.slice(0, 10).map((zone) => <option key={zone.numericId} value={zone.numericId}>{zone.label}</option>)}</select></label>
        {activeZone ? (
          <Section title="Zone Metadata">
            <label>Name<input value={activeZone.label} onChange={(event) => props.onZoneDefinitionChange(activeZone.numericId, { label: event.target.value })} /></label>
            <label>Short label<input value={activeZone.shortLabel ?? ""} onChange={(event) => props.onZoneDefinitionChange(activeZone.numericId, { shortLabel: event.target.value })} /></label>
            <label>Colour<input type="color" value={activeZone.color} onChange={(event) => props.onZoneDefinitionChange(activeZone.numericId, { color: event.target.value })} /></label>
            <label>Description<textarea value={activeZone.description ?? ""} onChange={(event) => props.onZoneDefinitionChange(activeZone.numericId, { description: event.target.value })} /></label>
            <label><input type="checkbox" checked={activeZone.visibleInLegend} onChange={(event) => props.onZoneDefinitionChange(activeZone.numericId, { visibleInLegend: event.target.checked })} /> Legend visible</label>
            <label><input type="checkbox" checked={activeZone.overlayVisible} onChange={(event) => props.onZoneDefinitionChange(activeZone.numericId, { overlayVisible: event.target.checked })} /> Overlay visible</label>
            <label><input type="checkbox" checked={activeZone.locked} onChange={(event) => props.onZoneDefinitionChange(activeZone.numericId, { locked: event.target.checked })} /> Locked</label>
          </Section>
        ) : null}
        {props.zoneSelectionMode === "brush" ? (
          <>
            <label>Footprint<select value={props.brushSettings.shape} onChange={(event) => props.onBrushShapeChange(event.target.value as BrushShape)}><option value="single">Single</option><option value="square">Square</option><option value="circle">Circle</option></select></label>
            <label>Size<input type="number" min={1} max={9} value={props.brushSettings.size} onChange={(event) => props.onBrushSizeChange(Number(event.target.value))} /></label>
          </>
        ) : null}
        <label>Focus direction<select value={activeZone?.focusDirection ?? props.zoneFocusDirection} disabled={!activeZone} onChange={(event) => activeZone ? props.onZoneDefinitionChange(activeZone.numericId, { focusDirection: event.target.value as ZoneFocusDirection }) : props.onZoneFocusDirectionChange(event.target.value as ZoneFocusDirection)}>{ZONE_FOCUS_DIRECTIONS.map((direction) => <option key={direction.id} value={direction.id}>{direction.label}</option>)}</select></label>
        <span className="editor-muted">{props.brushAffectedCellCount} zone columns · {props.zoneAssignmentCount} assigned</span>
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

  const showsBlockPicker = ["paint", "add", "raise", "fill"].includes(props.tool);
  const showsShapePicker = ["add", "raise", "fill"].includes(props.tool);
  const showsBrushShape = ["paint", "erase", "raise", "lower", "flatten", "fill", "clear"].includes(props.tool);
  const showsBrushSize = showsBrushShape;
  const showsPathWidth = props.tool === "path" || props.tool === "removePath";
  const showsFlattenHeight = props.tool === "flatten";

  return (
    <Panel title="Terrain Palette">
      <label>Preset<select value={props.presetId} onChange={(event) => props.onPresetChange(event.target.value as MapPresetId)}>{MAP_PRESET_OPTIONS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
      {props.tool === "select" ? <SelectionSummary props={props} /> : null}
      {showsBlockPicker ? <label>Block<select value={props.paintBlockId} onChange={(event) => props.onPaintBlockChange(Number(event.target.value) as BlockId)}>{RENDERABLE_BLOCK_DEFINITIONS.map((block) => <option key={block.id} value={block.id}>{block.displayName}</option>)}</select></label> : null}
      {showsShapePicker ? <ShapeControls props={props} /> : null}
      {showsBrushShape ? <label>Brush<select value={props.brushSettings.shape} onChange={(event) => props.onBrushShapeChange(event.target.value as BrushShape)}><option value="single">Single</option><option value="square">Square</option><option value="circle">Circle</option></select></label> : null}
      {(showsBrushSize || showsPathWidth) ? (
        <div className="editor-field-row">
          {showsBrushSize ? <label>Size<input type="number" min={1} max={9} value={props.brushSettings.size} onChange={(event) => props.onBrushSizeChange(Number(event.target.value))} /></label> : null}
          {showsPathWidth ? <label>Path<input type="number" min={1} max={9} value={props.brushSettings.pathWidth} onChange={(event) => props.onPathWidthChange(Number(event.target.value))} /></label> : null}
        </div>
      ) : null}
      {showsFlattenHeight ? <label>Flatten Y<input type="number" min={0} max={11} value={props.brushSettings.flattenHeight} onChange={(event) => props.onFlattenHeightChange(Number(event.target.value))} /></label> : null}
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

function ShapeControls({ props }: { props: MapEditorToolbarProps }) {
  const shapes = SHAPE_DEFINITIONS.filter((shape) => shape.category === props.activeShapeCategory);
  const activeShape = getShapeDefinition(props.activeShapeId);
  const visibleShape = shapes.some((shape) => shape.id === props.activeShapeId) ? props.activeShapeId : shapes[0]?.id ?? SHAPE_IDS.CUBE;
  const shapeForState = getShapeDefinition(visibleShape);

  return (
    <Section title="Shape">
      <label>Category<select value={props.activeShapeCategory} onChange={(event) => props.onShapeCategoryChange(event.target.value as ShapeCategory)}>{SHAPE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
      <label>Shape<select value={visibleShape} onChange={(event) => props.onShapeChange(Number(event.target.value) as ShapeId)}>{shapes.map((shape) => <option key={shape.id} value={shape.id}>{shape.name}</option>)}</select></label>
      <label>Rotation<select value={props.activeRotation} onChange={(event) => props.onCellRotationChange(Number(event.target.value) as CellRotation)}><option value={0}>North</option><option value={1}>East</option><option value={2}>South</option><option value={3}>West</option></select></label>
      {visibleShape === SHAPE_IDS.SLAB ? (
        <label>Slab<select value={props.activeShapeState} onChange={(event) => props.onShapeStateChange(Number(event.target.value))}><option value={0}>Lower</option><option value={1}>Upper</option><option value={2}>Middle</option></select></label>
      ) : null}
      {visibleShape === SHAPE_IDS.WATER ? (
        <label>Water level<input type="range" min={0} max={15} value={props.activeShapeState} onChange={(event) => props.onShapeStateChange(Number(event.target.value))} /></label>
      ) : null}
      {(visibleShape !== SHAPE_IDS.SLAB && visibleShape !== SHAPE_IDS.WATER) ? (
        <label>State<input type="number" min={0} max={255} value={props.activeShapeState} onChange={(event) => props.onShapeStateChange(Number(event.target.value))} /></label>
      ) : null}
      <dl className="editor-mini-summary">
        <KeyValue label="Active" value={activeShape.name} />
        <KeyValue label="Layer" value={shapeForState.renderLayer} />
        <KeyValue label="Walkable" value={shapeForState.walkable ? "yes" : "no"} />
        <KeyValue label="Support" value={shapeForState.supportsPrefabs ? "yes" : "no"} />
      </dl>
      <ActionButton icon="select" disabled={!props.selected} onClick={props.onEyedropperCell}>Eyedropper</ActionButton>
    </Section>
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
    <Panel title={workspace === "map" ? "Map Inspector" : "Inspector"}>
      <Section title="Map Summary">
        <KeyValue label="Workspace" value={workspace} />
        <KeyValue label="Map" value={props.mapName} />
        <KeyValue label="Description" value={props.mapDescription || "-"} />
        <KeyValue label="Renderer" value={props.renderMode} />
        <KeyValue label="Autosave" value={props.autosaveStatus} />
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

function BottomDock({ props, workspace, activeTab, onTabChange }: { props: MapEditorToolbarProps; workspace: EditorWorkspace; activeTab: BottomDockTab; onTabChange: (tab: BottomDockTab) => void }) {
  const tabs = bottomTabsForWorkspace(workspace);
  const resolvedTab = tabs.includes(activeTab) ? activeTab : tabs[0];
  return (
    <>
      <div className="editor-tabs" role="tablist" aria-label="Bottom dock tabs">
        {tabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={resolvedTab === tab} className={resolvedTab === tab ? "active" : ""} onClick={() => onTabChange(tab)}><EditorIcon name={bottomTabIcon(tab)} /><span>{title(tab)}</span></button>)}
      </div>
      <div className="editor-bottom-content">
        {resolvedTab === "overview" ? <WorkspaceOverviewTab props={props} workspace={workspace} /> : null}
        {resolvedTab === "validation" ? <ValidationTab props={props} /> : null}
        {resolvedTab === "history" ? <HistoryTab props={props} /> : null}
        {resolvedTab === "performance" ? <PerformanceTab props={props} /> : null}
      </div>
    </>
  );
}

function WorkspaceOverviewTab({ props, workspace }: { props: MapEditorToolbarProps; workspace: EditorWorkspace }) {
  if (workspace === "map") {
    return (
      <dl className="editor-metrics-grid">
        <KeyValue label="Map" value={props.mapName} />
        <KeyValue label="ID" value={props.mapId} mono />
        <KeyValue label="Available" value={String(props.availableMaps.length)} mono />
        <KeyValue label="Unsaved" value={props.hasUnsavedChanges ? "yes" : "no"} />
        <KeyValue label="Description" value={props.mapDescription || "-"} />
        <KeyValue label="Autosave" value={props.autosaveStatus} />
      </dl>
    );
  }

  if (workspace === "terrain") {
    return (
      <dl className="editor-metrics-grid">
        <KeyValue label="Tool" value={TOOL_LABELS[props.tool]} />
        <KeyValue label="Block" value={getBlockDefinition(props.paintBlockId).displayName} />
        <KeyValue label="Shape" value={getShapeDefinition(props.activeShapeId).name} />
        <KeyValue label="Brush cells" value={String(props.brushAffectedCellCount)} mono />
        <KeyValue label="Selected" value={formatCoordinate(props.selected)} mono />
        <KeyValue label="Dirty chunks" value={String(props.dirtyChunks)} mono />
        <KeyValue label="Last rebuilt" value={props.lastRebuiltChunks.join(", ") || "-"} mono />
      </dl>
    );
  }

  if (workspace === "objects") {
    return (
      <dl className="editor-metrics-grid">
        <KeyValue label="Entities" value={String(props.entityCount)} mono />
        <KeyValue label="Selected" value={String(props.selectedEntityIds.length)} mono />
        <KeyValue label="Primitive" value={props.primitiveType} />
        <KeyValue label="Prefab" value={props.activePrefabId || "-"} />
        <KeyValue label="Variant" value={props.activePrefabVariantId || "-"} />
        <KeyValue label="Transform" value={props.entityTransformMode} />
        <KeyValue label="Collision" value={props.collisionMode} />
        <KeyValue label="Draft name" value={props.entityName} />
        <KeyValue label="Draft colour" value={props.entityColor} mono />
      </dl>
    );
  }

  if (workspace === "navigation") {
    return (
      <dl className="editor-metrics-grid">
        <KeyValue label="Node type" value={props.navigationNodeType} />
        <KeyValue label="Nodes" value={String(props.navigationNodeCount)} mono />
        <KeyValue label="Edges" value={String(props.navigationEdgeCount)} mono />
        <KeyValue label="Routes" value={String(props.routeCount)} mono />
        <KeyValue label="Can connect" value={props.navigationNodeCount > 1 ? "yes" : "no"} />
        <KeyValue label="Layer" value={layerStateLabel(props, "navigation")} />
      </dl>
    );
  }

  if (workspace === "zones") {
    return (
      <dl className="editor-metrics-grid">
        <KeyValue label="Current zone" value={String(props.zoneId)} mono />
        <KeyValue label="Assignments" value={String(props.zoneAssignmentCount)} mono />
        <KeyValue label="Selected zone" value={String(props.selectedZoneId)} mono />
        <KeyValue label="Selected cell" value={formatCoordinate(props.selected)} mono />
        <KeyValue label="Layer" value={layerStateLabel(props, "zones")} />
        <KeyValue label="Tool" value={TOOL_LABELS[props.tool]} />
      </dl>
    );
  }

  return (
    <PerformanceTab props={props} />
  );
}

function ValidationTab({ props }: { props: MapEditorToolbarProps }) {
  const messages = props.validationSummary.length ? props.validationSummary : ["No validation issues reported by the current editor pass."];
  return <ul className="editor-validation-list">{messages.map((message) => <li key={message}>{message}</li>)}</ul>;
}

function HistoryTab({ props }: { props: MapEditorToolbarProps }) {
  return (
    <dl className="editor-metrics-grid">
      <KeyValue label="Undo depth" value={String(props.undoDepth)} mono />
      <KeyValue label="Redo depth" value={String(props.redoDepth)} mono />
      <KeyValue label="Unsaved" value={props.hasUnsavedChanges ? "yes" : "no"} />
      <KeyValue label="Autosave" value={props.autosaveStatus} />
      <KeyValue label="Last message" value={props.message?.text ?? "-"} />
      <KeyValue label="Message type" value={props.message?.type ?? "-"} />
    </dl>
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
  const metrics = useEditorStatusMetrics();

  return <footer className="editor-status-bar"><span>{workspace}</span><span>{TOOL_LABELS[props.tool]}</span><span>{formatCoordinate(props.hovered)}</span><span>{props.selectedEntityIds.length || (props.selected ? 1 : 0)} selected</span><span>Zone {props.zoneId}</span><span>{formatPerformance(metrics?.fps ?? null, metrics?.frameMs ?? null)}</span><span>{props.autosaveStatus}</span></footer>;
}

function useEditorStatusMetrics() {
  const [metrics, setMetrics] = useState<{ fps: number; frameMs: number } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextMetrics = window.__portfolioExperienceMetrics;
      if (!nextMetrics) {
        return;
      }

      setMetrics((current) => (
        current?.fps === nextMetrics.fps && current.frameMs === nextMetrics.frameMs
          ? current
          : { fps: nextMetrics.fps, frameMs: nextMetrics.frameMs }
      ));
    }, 250);

    return () => window.clearInterval(timer);
  }, []);

  return metrics;
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

function SelectionSummary({ props }: { props: MapEditorToolbarProps }) {
  return (
    <dl className="editor-mini-summary">
      <KeyValue label="Selected" value={formatCoordinate(props.selected)} mono />
      <KeyValue label="Hovered" value={formatCoordinate(props.hovered)} mono />
      <KeyValue label="Block" value={props.selectedBlockId === null ? "-" : getBlockDefinition(props.selectedBlockId).displayName} />
      <KeyValue label="Shape" value={props.selectedShapeId === null ? "-" : getShapeDefinition(props.selectedShapeId).name} />
      <KeyValue label="Rotation" value={props.selectedRotation === null ? "-" : String(props.selectedRotation)} mono />
      <KeyValue label="State" value={props.selectedState === null ? "-" : String(props.selectedState)} mono />
      <KeyValue label="Zone" value={String(props.selectedZoneId)} mono />
    </dl>
  );
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
  return <div className={`editor-tree-row ${selected ? "selected" : ""}`}><span>{label}</span><code>{value}</code></div>;
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
  move: Move3D,
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
  rotate: Rotate3D,
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
  zone: Shapes,
  "zone-area-fill": SquareDashedMousePointer,
  "zone-paint": Brush,
  "zone-replace": Replace,
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

const ZONE_FOCUS_DIRECTIONS: Array<{ id: ZoneFocusDirection; label: string }> = [
  { id: "north", label: "North" },
  { id: "northeast", label: "Northeast" },
  { id: "east", label: "East" },
  { id: "southeast", label: "Southeast" },
  { id: "south", label: "South" },
  { id: "southwest", label: "Southwest" },
  { id: "west", label: "West" },
  { id: "northwest", label: "Northwest" },
];

function bottomTabIcon(tab: BottomDockTab): EditorIconKey {
  if (tab === "overview") return "layout";
  if (tab === "validation") return "validate";
  if (tab === "performance") return "performance";
  return "undo";
}

function bottomTabsForWorkspace(workspace: EditorWorkspace): BottomDockTab[] {
  if (workspace === "review") return ["validation", "performance", "history"];
  if (workspace === "terrain") return ["overview", "history", "performance"];
  if (workspace === "map") return ["overview", "validation", "history"];
  if (workspace === "navigation") return ["overview", "validation"];
  if (workspace === "zones") return ["overview", "validation"];
  return ["overview", "validation", "history"];
}

function workspaceDefaultTab(workspace: EditorWorkspace): BottomDockTab {
  if (workspace === "review") return "validation";
  return "overview";
}

function layerStateLabel(props: MapEditorToolbarProps, id: EditorLayerId) {
  const layer = props.layerStates.find((item) => item.id === id);
  if (!layer) return "-";
  return `${layer.visible ? "shown" : "hidden"} / ${layer.locked ? "locked" : "editable"}`;
}

function isLayerVisibleInToolbar(props: MapEditorToolbarProps, id: EditorLayerId) {
  return props.layerStates.find((item) => item.id === id)?.visible ?? true;
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

function zoneEditLabel(mode: ZoneEditMode) {
  if (mode === "paint") return "Paint";
  if (mode === "replace") return "Replace";
  return "Erase";
}

function zoneEditIcon(mode: ZoneEditMode): EditorIconKey {
  if (mode === "paint") return "zone-paint";
  if (mode === "replace") return "zone-replace";
  return "erase";
}
