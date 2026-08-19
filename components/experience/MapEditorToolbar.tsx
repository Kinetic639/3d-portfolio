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
  Sparkles,
  SquareDashedMousePointer,
  Trash2,
  Undo2,
  Upload,
  X,
  Replace,
  Waves,
  Play,
  Pause,
  StepForward,
  type LucideIcon,
} from "lucide-react";
import { createEditorCommands, findEditorCommands, type EditorCommand, type EditorIconName } from "@/lib/editor/editor-commands";
import { useExperienceStore } from "@/lib/experience/experience-store";
import {
  createDefaultEditorLayout,
  EDITOR_MIN_ZOOM_DISTANCE_CEILING,
  EDITOR_MIN_ZOOM_DISTANCE_FLOOR,
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
import type { MapPresetId } from "@/lib/editor/map-presets";
import type { BrushShape, TerrainBrushSettings } from "@/lib/editor/terrain-brushes";
import type { ZoneEditMode, ZoneSelectionMode } from "@/lib/editor/zone-tools";
import type { MapRegistryEntry } from "@/lib/maps/map-registry";
import type { MapZoneDefinition, MapZoneFocusDirection } from "@/lib/maps/map-definition";
import type { CollisionMode, PlacedMapEntity, PrimitiveType } from "@/lib/maps/map-entities";
import type { NavigationNodeType } from "@/lib/maps/map-navigation";
import { BUILT_IN_PREFABS, listPrefabCategories } from "@/lib/prefabs/prefab-library";
import type { PrefabCategory, PrefabDefinition, PrefabVariantDefinition } from "@/lib/prefabs/prefab-types";
import { BLOCK_IDS, RENDERABLE_BLOCK_DEFINITIONS, getBlockDefinition, type BlockId } from "@/lib/world/block-registry";
import type { GridCoordinate, WorldPosition } from "@/lib/world/world-config";
import type { WorldRegionId } from "@/lib/world-layout/world-layout-types";
import { getShapeDefinition, getShapePitch, getShapeStateValue, setShapePitch, TERRAIN_PALETTE_SHAPE_DEFINITIONS, type ShapeCategory } from "@/lib/voxel-shapes/shape-registry";
import { SHAPE_IDS, type CellRotation, type ShapeId } from "@/lib/voxel-shapes/shape-ids";
import type { FluidCell } from "@/lib/fluids/fluid-types";

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
  | "sparkles"
  | "asset-preview"
  | "play"
  | "pause"
  | "step"
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
  | "developmentHelpers"
  | "liquid";

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
  applyMaterialToAddedBlocks: boolean;
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
  selectedFluid: FluidCell | null;
  fluidCellCount: number;
  fluidSourceCount: number;
  fallingFluidCount: number;
  pendingFluidUpdates: number;
  infiniteWaterSources: boolean;
  waterSimulationPlaying: boolean;
  waterBasinPreviewCellCount: number;
  waterBasinPreviewLeaks: boolean;
  selectedZoneId: number;
  selectedWorldPosition: WorldPosition | null;
  selectedChunk: { chunkX: number; chunkZ: number } | null;
  selectedLocal: { localX: number; localZ: number } | null;
  selectedRegionId?: WorldRegionId | null;
  regionVisibilityMode?: "show-all" | "focus" | "isolate";
  regionBoundariesVisible?: boolean;
  regionLoadSummary?: string;
  onRegionBoundariesVisibleChange?: (visible: boolean) => void;
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
  onApplyMaterialToAddedBlocksChange: (apply: boolean) => void;
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
  onPreviewEntityPopAnimation: () => void;
  onDuplicateEntity: () => void;
  onDeleteEntity: () => void;
  onGroupEntity: () => void;
  onUngroupEntity: () => void;
  onToggleEntityLocked: () => void;
  onToggleEntityHidden: () => void;
  onNavigationNodeTypeChange: (type: NavigationNodeType) => void;
  onPlaceNavigationNode: () => void;
  onConnectNavigationNodes: () => void;
  onInfiniteWaterSourcesChange: (enabled: boolean) => void;
  onWaterSimulationPlayingChange: (playing: boolean) => void;
  onWaterStep: () => void;
  onWaterSettle: () => void;
  onWaterReset: () => void;
  onWaterClearDerived: () => void;
  onWaterPreviewBasin: () => void;
  onWaterConfirmBasin: () => void;
  onWaterCancelBasin: () => void;
  onCreateRoute: () => void;
  onLayerVisibilityChange: (id: EditorLayerId, visible: boolean) => void;
  onLayerLockChange: (id: EditorLayerId, locked: boolean) => void;
  onCleanPreviewChange: (enabled: boolean) => void;
  onRegionVisibilityModeChange?: (mode: "show-all" | "focus" | "isolate") => void;
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
  editorMinZoomDistance: number;
};

const WORKSPACES: Array<{ id: EditorWorkspace; label: string }> = [
  { id: "map", label: "Map" },
  { id: "terrain", label: "Terrain" },
  { id: "liquid", label: "Liquid" },
  { id: "objects", label: "Objects" },
  { id: "zones", label: "Zones" },
  { id: "navigation", label: "Navigation" },
  { id: "review", label: "Review" },
];

const WORKSPACE_TOOLS: Record<EditorWorkspace, EditorTool[]> = {
  map: ["select", "marker"],
  terrain: ["select", "paint", "add", "erase", "raise", "lower", "flatten", "clear"],
  liquid: ["waterSource", "waterRemove", "waterInspect"],
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
  waterSource: "Water Source",
  waterRemove: "Remove Water",
  waterInspect: "Inspect Water",
};

const PRIMITIVES: PrimitiveType[] = ["box", "cylinder", "sphere", "plane", "platform", "sign"];
const COLLISION_MODES: CollisionMode[] = ["none", "blocking", "walkable", "trigger"];
const NODE_TYPES: NavigationNodeType[] = ["walk", "route-junction", "wait-point", "look-at", "character-spawn", "bird-perch"];
type ShapePickerCategory = ShapeCategory | "all";
const SHAPE_CATEGORIES: ShapePickerCategory[] = ["all", "terrain", "transition", "structure", "roof", "utility"];
const TERRAIN_MATERIAL_OPTIONS = [
  {
    id: BLOCK_IDS.Ground,
    displayName: getBlockDefinition(BLOCK_IDS.Ground).displayName,
    developmentColor: getBlockDefinition(BLOCK_IDS.Ground).developmentColor,
  },
  ...RENDERABLE_BLOCK_DEFINITIONS.filter((block) => block.id !== BLOCK_IDS.Ground),
];
const MENU_GROUPS = ["file", "edit", "view", "map", "settings", "help"] as const;
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
  const [assetPreviewOpen, setAssetPreviewOpen] = useState(false);

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
      editorMinZoomDistance: layout.editorMinZoomDistance,
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
        props.onShapeStateChange(setShapePitch(props.activeShapeState, getShapePitch(props.activeShapeState) + (event.shiftKey ? 3 : 1)));
      }
      if (event.key.toLowerCase() === "q") {
        event.preventDefault();
        props.onCellRotationChange((((props.activeRotation + 3) % 4) as CellRotation));
      }
      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        props.onCellRotationChange((((props.activeRotation + 1) % 4) as CellRotation));
      }
      if (event.key.toLowerCase() === "f" && props.activeShapeId === SHAPE_IDS.SLAB) {
        event.preventDefault();
        props.onShapeStateChange(setShapePitch(getShapeStateValue(props.activeShapeState) === 1 ? 0 : 1, getShapePitch(props.activeShapeState)));
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
      <MenuBar
        commands={commands}
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        props={props}
        editorMinZoomDistance={layout.editorMinZoomDistance}
        onEditorMinZoomDistanceChange={(distance) => setLayout((current) => ({
          ...current,
          editorMinZoomDistance: Math.max(EDITOR_MIN_ZOOM_DISTANCE_FLOOR, Math.min(EDITOR_MIN_ZOOM_DISTANCE_CEILING, Math.round(distance * 2) / 2 || EDITOR_MIN_ZOOM_DISTANCE_FLOOR)),
        }))}
        onCloseEditor={props.onClose}
      />
      <MainToolbar props={props} commands={commands} layout={layout} setWorkspace={setWorkspace} toggleCleanPreview={toggleCleanPreview} />
      <ToolRail
        workspace={layout.activeWorkspace}
        activeTool={props.tool}
        props={props}
        onToolChange={props.onToolChange}
        onOpenAssetPreview={() => setAssetPreviewOpen(true)}
      />
      {!layout.maximizedViewport ? (
        <aside className={`editor-left-dock ${layout.collapsed.left ? "editor-dock--collapsed" : ""}`} aria-label="Contextual palette" onPointerDown={(event) => event.stopPropagation()}>
          <DockHeader title={leftDockTitle(layout.activeWorkspace, props.tool)} side="left" collapsed={layout.collapsed.left} onToggle={() => setLayout((current) => ({ ...current, collapsed: { ...current.collapsed, left: !current.collapsed.left } }))} />
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
      {assetPreviewOpen ? (
        <AssetPreviewDialog
          props={props}
          workspace={layout.activeWorkspace}
          onClose={() => setAssetPreviewOpen(false)}
        />
      ) : null}
    </div>
  );
}

function MenuBar({
  commands,
  openMenu,
  setOpenMenu,
  props,
  editorMinZoomDistance,
  onEditorMinZoomDistanceChange,
  onCloseEditor,
}: {
  commands: EditorCommand[];
  openMenu: string | null;
  setOpenMenu: (menu: string | null) => void;
  props: MapEditorToolbarProps;
  editorMinZoomDistance: number;
  onEditorMinZoomDistanceChange: (distance: number) => void;
  onCloseEditor: () => void;
}) {
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
              {group === "view" ? (
                <ViewMenuSettings
                  props={props}
                  editorMinZoomDistance={editorMinZoomDistance}
                  onEditorMinZoomDistanceChange={onEditorMinZoomDistanceChange}
                />
              ) : null}
              {group === "settings" ? <SettingsMenuSettings /> : null}
            </div>
          ) : null}
        </div>
      ))}
      <button className="editor-window-button" type="button" onClick={onCloseEditor}><EditorIcon name="close" /><span>Close</span></button>
    </header>
  );
}

function ViewMenuSettings({
  props,
  editorMinZoomDistance,
  onEditorMinZoomDistanceChange,
}: {
  props: MapEditorToolbarProps;
  editorMinZoomDistance: number;
  onEditorMinZoomDistanceChange: (distance: number) => void;
}) {
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
      <label className="editor-menu-settings__range">
        <span>Closest zoom-in distance</span>
        <input
          type="range"
          min={EDITOR_MIN_ZOOM_DISTANCE_FLOOR}
          max={EDITOR_MIN_ZOOM_DISTANCE_CEILING}
          step={0.5}
          value={editorMinZoomDistance}
          onChange={(event) => onEditorMinZoomDistanceChange(Number(event.target.value))}
        />
        <input
          aria-label="Closest zoom-in distance"
          type="number"
          min={EDITOR_MIN_ZOOM_DISTANCE_FLOOR}
          max={EDITOR_MIN_ZOOM_DISTANCE_CEILING}
          step={0.5}
          value={editorMinZoomDistance}
          onChange={(event) => onEditorMinZoomDistanceChange(Number(event.target.value))}
        />
      </label>
    </div>
  );
}

function SettingsMenuSettings() {
  const panSpeed = useExperienceStore((state) => state.panSpeed);
  const rotateSpeed = useExperienceStore((state) => state.rotateSpeed);
  const setPanSpeed = useExperienceStore((state) => state.setPanSpeed);
  const setRotateSpeed = useExperienceStore((state) => state.setRotateSpeed);
  return (
    <div className="editor-menu-settings" role="group" aria-label="Mouse sensitivity settings">
      <label>
        <span>Pan sensitivity <strong>{panSpeed.toFixed(1)}x</strong></span>
        <input type="range" min={0.2} max={3} step={0.1} value={panSpeed} onChange={(event) => setPanSpeed(Number(event.target.value))} />
      </label>
      <label>
        <span>Rotate sensitivity <strong>{rotateSpeed.toFixed(1)}x</strong></span>
        <input type="range" min={0.2} max={3} step={0.1} value={rotateSpeed} onChange={(event) => setRotateSpeed(Number(event.target.value))} />
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
      <div className="editor-workspaces" role="group" aria-label="Region visibility">
        <button type="button" className={(props.regionVisibilityMode ?? "show-all") === "show-all" ? "active" : ""} onClick={() => props.onRegionVisibilityModeChange?.("show-all")}>All</button>
        <button type="button" disabled={!props.selectedRegionId} className={props.regionVisibilityMode === "focus" ? "active" : ""} onClick={() => props.onRegionVisibilityModeChange?.("focus")}>Focus</button>
        <button type="button" disabled={!props.selectedRegionId} className={props.regionVisibilityMode === "isolate" ? "active" : ""} onClick={() => props.onRegionVisibilityModeChange?.("isolate")}>Isolate</button>
        <button type="button" className={props.regionBoundariesVisible ? "active" : ""} onClick={() => props.onRegionBoundariesVisibleChange?.(!props.regionBoundariesVisible)}>Bounds</button>
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

function ToolRail({
  workspace,
  activeTool,
  props,
  onToolChange,
  onOpenAssetPreview,
}: {
  workspace: EditorWorkspace;
  activeTool: EditorTool;
  props: MapEditorToolbarProps;
  onToolChange: (tool: EditorTool) => void;
  onOpenAssetPreview: () => void;
}) {
  const canPreviewAssets = workspace === "terrain" || workspace === "objects";
  return (
    <nav className="editor-tool-rail" aria-label={`${workspace} tools`} onPointerDown={(event) => event.stopPropagation()}>
      {WORKSPACE_TOOLS[workspace].map((tool) => (
        <button key={tool} type="button" className={activeTool === tool ? "active" : ""} title={TOOL_LABELS[tool]} aria-label={TOOL_LABELS[tool]} onClick={() => onToolChange(tool)}>
          <EditorIcon name={toolIcon(tool)} />
          <span>{TOOL_LABELS[tool]}</span>
        </button>
      ))}
      {canPreviewAssets ? (
        <>
          <div className="editor-tool-rail-divider" aria-hidden="true" />
          <button type="button" title="Asset Preview" aria-label="Asset Preview" onClick={onOpenAssetPreview}>
            <EditorIcon name="asset-preview" />
            <span>Preview</span>
          </button>
        </>
      ) : null}
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

type PrefabPickerCategory = PrefabCategory | "all";

function Palette({ props, workspace, fileInputRef, setBottomTab }: { props: MapEditorToolbarProps; workspace: EditorWorkspace; fileInputRef: React.RefObject<HTMLInputElement | null>; setBottomTab: (tab: BottomDockTab) => void }) {
  const activePrefab = BUILT_IN_PREFABS.find((prefab) => prefab.id === props.activePrefabId) ?? null;
  const categories = useMemo(() => listPrefabCategories(), []);
  const prefabCategories = useMemo<PrefabPickerCategory[]>(() => ["all", ...categories], [categories]);
  const [activeCategory, setActiveCategory] = useState<PrefabPickerCategory>(activePrefab?.category ?? "all");
  const [prefabPreviewYaw, setPrefabPreviewYaw] = useState(0);
  const prefabPreviewDrag = useRef<{ x: number; yaw: number } | null>(null);

  if (workspace === "liquid") {
    return (
      <Panel title="Liquid">
        <Section title="Authoring">
          <ActionButton icon="waterSource" className={props.tool === "waterSource" ? "active" : ""} onClick={() => props.onToolChange("waterSource")}>Source</ActionButton>
          <ActionButton icon="waterRemove" className={props.tool === "waterRemove" ? "active" : ""} onClick={() => props.onToolChange("waterRemove")}>Remove</ActionButton>
          <ActionButton icon="waterInspect" className={props.tool === "waterInspect" ? "active" : ""} onClick={() => props.onToolChange("waterInspect")}>Inspect</ActionButton>
          <ActionButton icon="fill" disabled={!props.selected} onClick={props.onWaterPreviewBasin}>Preview Basin</ActionButton>
          <ActionButton icon="validate" disabled={props.waterBasinPreviewCellCount === 0 || props.waterBasinPreviewLeaks} onClick={props.onWaterConfirmBasin}>Confirm Fill</ActionButton>
          <ActionButton icon="clear" disabled={props.waterBasinPreviewCellCount === 0} onClick={props.onWaterCancelBasin}>Cancel Preview</ActionButton>
          {props.waterBasinPreviewCellCount > 0 ? (
            <span className="editor-muted">
              {props.waterBasinPreviewCellCount} cells{props.waterBasinPreviewLeaks ? " · spill outlet detected; basin fill blocked" : ""}
            </span>
          ) : null}
        </Section>
        <Section title="Simulation">
          <div className="editor-segmented-control" aria-label="Water simulation">
            <button type="button" className={props.waterSimulationPlaying ? "active" : ""} onClick={() => props.onWaterSimulationPlayingChange(!props.waterSimulationPlaying)}><EditorIcon name={props.waterSimulationPlaying ? "pause" : "play"} /><span>{props.waterSimulationPlaying ? "Pause" : "Play"}</span></button>
            <button type="button" onClick={props.onWaterStep}><EditorIcon name="step" /><span>Step</span></button>
          </div>
          <ActionButton icon="validate" onClick={props.onWaterSettle}>Settle</ActionButton>
          <ActionButton icon="undo" onClick={props.onWaterReset}>Reset</ActionButton>
          <ActionButton icon="clear" onClick={props.onWaterClearDerived}>Clear Flow</ActionButton>
          <label><input type="checkbox" checked={props.infiniteWaterSources} onChange={(event) => props.onInfiniteWaterSourcesChange(event.target.checked)} /> Infinite sources</label>
        </Section>
        <Section title="Status">
          <dl className="editor-mini-summary">
            <KeyValue label="Water" value={String(props.fluidCellCount)} mono />
            <KeyValue label="Sources" value={String(props.fluidSourceCount)} mono />
            <KeyValue label="Falling" value={String(props.fallingFluidCount)} mono />
            <KeyValue label="Pending" value={String(props.pendingFluidUpdates)} mono />
          </dl>
        </Section>
      </Panel>
    );
  }

  if (workspace === "objects") {
    const selectPrimitive = (primitive: PrimitiveType) => {
      props.onActivePrefabChange("");
      props.onPrimitiveTypeChange(primitive);
      props.onToolChange("entity");
    };

    const query = props.prefabSearch.trim().toLowerCase();
    const categoryPrefabs = activeCategory === "all" ? BUILT_IN_PREFABS : BUILT_IN_PREFABS.filter((prefab) => prefab.category === activeCategory);
    const prefabs = query
      ? categoryPrefabs.filter((prefab) => prefab.name.toLowerCase().includes(query) || prefab.tags.some((tag) => tag.includes(query)))
      : categoryPrefabs;

    return (
      <Panel title="Primitive Palette">
        <Section title="Prefab Library">
          <label>Category<select value={activeCategory} onChange={(event) => setActiveCategory(event.target.value as PrefabPickerCategory)}>{prefabCategories.map((category) => <option key={category} value={category}>{category === "all" ? "all" : category.replace(/-/g, " ")}</option>)}</select></label>
          <input aria-label="Search prefabs" placeholder="Search prefabs" value={props.prefabSearch} onChange={(event) => props.onPrefabSearchChange(event.target.value)} />
          <div className="editor-shape-list" role="listbox" aria-label="Prefab selector">
            {prefabs.map((prefab) => (
              <button key={prefab.id} type="button" role="option" aria-selected={props.activePrefabId === prefab.id} className={props.activePrefabId === prefab.id ? "active" : ""} title={prefab.description} onClick={() => props.onActivePrefabChange(prefab.id)}>
                <PrefabPreview prefab={prefab} variantId={prefab.id === props.activePrefabId ? props.activePrefabVariantId : undefined} viewYaw={prefabPreviewYaw} onViewYawChange={setPrefabPreviewYaw} dragRef={prefabPreviewDrag} compact />
                <span>{prefab.name}</span>
              </button>
            ))}
          </div>
          {activePrefab ? (
            <label>Variant<select value={props.activePrefabVariantId || activePrefab.defaultVariantId} onChange={(event) => props.onActivePrefabVariantChange(event.target.value)}>{activePrefab.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}</select></label>
          ) : null}
          {activePrefab ? (
            <>
              <PrefabPreview prefab={activePrefab} variantId={props.activePrefabVariantId || activePrefab.defaultVariantId} viewYaw={prefabPreviewYaw} onViewYawChange={setPrefabPreviewYaw} dragRef={prefabPreviewDrag} />
              <span className="editor-muted">{activePrefab.category} · {activePrefab.collisionMode} · {activePrefab.footprint.width}x{activePrefab.footprint.depth}</span>
            </>
          ) : null}
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
        <ActionButton icon="sparkles" disabled={!props.activePrefabId} onClick={props.onPreviewEntityPopAnimation}>Preview Pop</ActionButton>
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

  return (
    <TerrainPalette props={props} />
  );
}

function TerrainPalette({ props }: { props: MapEditorToolbarProps }) {
  if (props.tool === "paint") {
    return (
      <Panel title="Paint Terrain" className="editor-panel--terrain-palette">
        <MaterialControls props={props} />
        <TerrainBrushControls props={props} />
      </Panel>
    );
  }

  if (props.tool === "add") {
    return (
      <Panel title="Add Blocks" className="editor-panel--terrain-palette">
        <MaterialControls props={props} />
        <label><input type="checkbox" checked={props.applyMaterialToAddedBlocks} onChange={(event) => props.onApplyMaterialToAddedBlocksChange(event.target.checked)} /> Apply material</label>
        <ShapeControls props={props} />
        <TerrainPlacementSettings props={props} />
      </Panel>
    );
  }

  if (props.tool === "raise" || props.tool === "lower" || props.tool === "flatten") {
    return (
      <Panel title={`${TOOL_LABELS[props.tool]} Terrain`} className="editor-panel--terrain-palette">
        <TerrainBrushControls props={props} />
        {props.tool === "flatten" ? <span className="editor-muted">Flattens the brush area to the height of the clicked block.</span> : null}
      </Panel>
    );
  }

  if (props.tool === "erase" || props.tool === "clear") {
    return (
      <Panel title={`${TOOL_LABELS[props.tool]} Terrain`} className="editor-panel--terrain-palette">
        <span className="editor-muted">No terrain palette settings for this tool.</span>
      </Panel>
    );
  }

  return (
    <Panel title="Terrain" className="editor-panel--terrain-palette">
      <span className="editor-muted">Select a terrain tool to edit its settings.</span>
    </Panel>
  );
}

function MaterialControls({ props }: { props: MapEditorToolbarProps }) {
  return (
    <Section title="Material">
      <label>Current material<select value={props.paintBlockId} onChange={(event) => props.onPaintBlockChange(Number(event.target.value) as BlockId)}>{TERRAIN_MATERIAL_OPTIONS.map((material) => <option key={material.id} value={material.id}>{material.displayName}</option>)}</select></label>
    </Section>
  );
}

function TerrainSelectionDetails({ props }: { props: MapEditorToolbarProps }) {
  return (
    <Section title="Selected Terrain">
      <dl className="editor-mini-summary">
        <KeyValue label="Region" value={props.selectedRegionId ?? "-"} mono />
        <KeyValue label="Grid" value={formatCoordinate(props.selected)} mono />
        <KeyValue label="World" value={props.selectedWorldPosition ? formatVector(props.selectedWorldPosition) : "-"} mono />
        <KeyValue label="Hovered" value={formatCoordinate(props.hovered)} mono />
        <KeyValue label="Material" value={props.selectedBlockId === null ? "-" : getTerrainMaterialLabel(props.selectedBlockId)} />
        <KeyValue label="Shape" value={props.selectedShapeId === null ? "-" : getShapeDefinition(props.selectedShapeId).name} />
        <KeyValue label="Rotation" value={props.selectedRotation === null ? "-" : String(props.selectedRotation)} mono />
        <KeyValue label="State" value={props.selectedState === null ? "-" : String(props.selectedState)} mono />
        <KeyValue label="Zone" value={String(props.selectedZoneId)} mono />
        <KeyValue label="Chunk" value={props.selectedChunk ? `${props.selectedChunk.chunkX},${props.selectedChunk.chunkZ}` : "-"} mono />
        <KeyValue label="Local" value={props.selectedLocal ? `${props.selectedLocal.localX},${props.selectedLocal.localZ}` : "-"} mono />
      </dl>
    </Section>
  );
}

function TerrainBrushControls({ props }: { props: MapEditorToolbarProps }) {
  return (
    <Section title="Brush">
      <label>Shape<select value={props.brushSettings.shape} onChange={(event) => props.onBrushShapeChange(event.target.value as BrushShape)}><option value="single">Single</option><option value="square">Square</option><option value="circle">Circle</option></select></label>
      <label>Size<input type="number" min={1} max={9} value={props.brushSettings.size} onChange={(event) => props.onBrushSizeChange(Number(event.target.value))} /></label>
      <KeyValue label="Affected" value={String(props.brushAffectedCellCount)} mono />
    </Section>
  );
}

function TerrainPlacementSettings({ props }: { props: MapEditorToolbarProps }) {
  const visibleShape = props.activeShapeId;
  const shapeStateValue = getShapeStateValue(props.activeShapeState);
  const axisState = Math.max(0, Math.min(2, shapeStateValue));
  const pitch = getShapePitch(props.activeShapeState);
  const usesAxisState = isAxisOrientedShape(visibleShape);
  const rotateLeft = () => props.onCellRotationChange((((props.activeRotation + 3) % 4) as CellRotation));
  const rotateRight = () => props.onCellRotationChange((((props.activeRotation + 1) % 4) as CellRotation));
  const tiltUp = () => props.onShapeStateChange(setShapePitch(props.activeShapeState, pitch + 1));
  const tiltDown = () => props.onShapeStateChange(setShapePitch(props.activeShapeState, pitch + 3));

  return (
    <Section title="Placement">
      <div className="editor-orientation-pad" aria-label="Placement orientation">
        <button type="button" title="Tilt up (R)" onClick={tiltUp}><EditorIcon name="rotate" /><span>Tilt Up</span></button>
        <button type="button" title="Rotate left (Q)" onClick={rotateLeft}><EditorIcon name="undo" /><span>Left</span></button>
        <button type="button" title="Rotate right (E)" onClick={rotateRight}><EditorIcon name="redo" /><span>Right</span></button>
        <button type="button" title="Tilt down (Shift+R)" onClick={tiltDown}><EditorIcon name="rotate" /><span>Tilt Down</span></button>
      </div>
      <span className="editor-muted">Yaw {["N", "E", "S", "W"][props.activeRotation]} · Tilt {pitch * 90}°</span>
      {usesAxisState ? (
        <div className="editor-segmented-control" aria-label="Shape axis">
          {[0, 1, 2].map((axis) => (
            <button key={axis} type="button" className={axisState === axis ? "active" : ""} onClick={() => props.onShapeStateChange(setShapePitch(axis, pitch))}>{["X", "Y", "Z"][axis]}</button>
          ))}
        </div>
      ) : null}
      {visibleShape === SHAPE_IDS.SLAB ? (
        <div className="editor-segmented-control" aria-label="Slab position">
          {[
            { value: 0, label: "Lower" },
            { value: 2, label: "Middle" },
            { value: 1, label: "Upper" },
          ].map((item) => (
            <button key={item.value} type="button" className={shapeStateValue === item.value ? "active" : ""} onClick={() => props.onShapeStateChange(setShapePitch(item.value, pitch))}>{item.label}</button>
          ))}
        </div>
      ) : null}
      {(visibleShape !== SHAPE_IDS.SLAB && !usesAxisState) ? (
        <label>State<input type="number" min={0} max={15} value={shapeStateValue} onChange={(event) => props.onShapeStateChange(setShapePitch(Number(event.target.value), pitch))} /></label>
      ) : null}
      <ActionButton icon="select" disabled={!props.selected} onClick={props.onEyedropperCell}>Eyedropper</ActionButton>
    </Section>
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
      <TreeRow label="Liquid" value={`${props.fluidCellCount} cells`} selected={Boolean(props.selectedFluid?.type)} />
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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ShapePickerCategory>(props.activeShapeCategory);
  const [previewYaw, setPreviewYaw] = useState(0);
  const previewDrag = useRef<{ x: number; yaw: number } | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const shapes = category === "all" ? TERRAIN_PALETTE_SHAPE_DEFINITIONS : TERRAIN_PALETTE_SHAPE_DEFINITIONS.filter((shape) => shape.category === category);
  const visibleShapes = normalizedQuery
    ? shapes.filter((shape) => shape.name.toLowerCase().includes(normalizedQuery) || shape.key.includes(normalizedQuery))
    : shapes;
  const activeShape = getShapeDefinition(props.activeShapeId);
  const visibleShape = shapes.some((shape) => shape.id === props.activeShapeId) ? props.activeShapeId : shapes[0]?.id ?? SHAPE_IDS.CUBE;
  const shapeForState = getShapeDefinition(visibleShape);

  useEffect(() => {
    setCategory((current) => current === "all" ? current : props.activeShapeCategory);
  }, [props.activeShapeCategory]);

  return (
    <Section title="Block Shape">
      <label>Category<select value={category} onChange={(event) => {
        const nextCategory = event.target.value as ShapePickerCategory;
        setCategory(nextCategory);
        if (nextCategory !== "all") props.onShapeCategoryChange(nextCategory);
      }}>{SHAPE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <input aria-label="Search block shapes" placeholder="Search block shapes" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="editor-shape-list" role="listbox" aria-label="Shape selector">
        {visibleShapes.map((shape) => (
          <button key={shape.id} type="button" role="option" aria-selected={visibleShape === shape.id} className={visibleShape === shape.id ? "active" : ""} onClick={() => props.onShapeChange(shape.id)}>
            <ShapePreview shapeId={shape.id} rotation={props.activeRotation} state={shape.id === visibleShape ? props.activeShapeState : 0} viewYaw={previewYaw} onViewYawChange={setPreviewYaw} dragRef={previewDrag} compact />
            <span>{shape.name}</span>
            <code>{shape.id}</code>
          </button>
        ))}
        {visibleShapes.length === 0 ? <span className="editor-muted editor-empty-state">No matching block shapes.</span> : null}
      </div>
      <dl className="editor-mini-summary">
        <KeyValue label="Active" value={activeShape.name} />
        <KeyValue label="Layer" value={shapeForState.renderLayer} />
        <KeyValue label="Walkable" value={shapeForState.walkable ? "yes" : "no"} />
        <KeyValue label="Support" value={shapeForState.supportsPrefabs ? "yes" : "no"} />
      </dl>
    </Section>
  );
}

function isAxisOrientedShape(shapeId: ShapeId) {
  return shapeId === SHAPE_IDS.BEAM || shapeId === SHAPE_IDS.PIPE || shapeId === SHAPE_IDS.PIPE_LONG;
}

function ShapePreview({
  shapeId,
  rotation,
  state,
  viewYaw = 0,
  onViewYawChange,
  dragRef,
  compact = false,
}: {
  shapeId: ShapeId;
  rotation: CellRotation;
  state: number;
  viewYaw?: number;
  onViewYawChange?: (yaw: number) => void;
  dragRef?: React.MutableRefObject<{ x: number; yaw: number } | null>;
  compact?: boolean;
}) {
  const shape = getShapeDefinition(shapeId);
  const polygons = buildShapePreviewPolygons(shape.faces(rotation, state), viewYaw);
  const startPreviewDrag = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!dragRef || !onViewYawChange) return;
    event.stopPropagation();
    dragRef.current = { x: event.clientX, yaw: viewYaw };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const dragPreview = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!dragRef?.current || !onViewYawChange) return;
    event.stopPropagation();
    onViewYawChange(dragRef.current.yaw + (event.clientX - dragRef.current.x) * 0.018);
  };
  const endPreviewDrag = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!dragRef) return;
    event.stopPropagation();
    dragRef.current = null;
  };

  return (
    <span
      className={`editor-shape-preview ${compact ? "editor-shape-preview--compact" : ""}`}
      aria-label={`${shape.name} preview`}
      onPointerDown={startPreviewDrag}
      onPointerMove={dragPreview}
      onPointerUp={endPreviewDrag}
      onPointerCancel={endPreviewDrag}
    >
      <svg viewBox="0 0 120 92" role="img" aria-label={shape.name}>
        {polygons.map((polygon, index) => (
          <polygon key={`${polygon.points}-${index}`} points={polygon.points} fill={polygon.fill} />
        ))}
      </svg>
      {!compact ? <span>{shape.name}</span> : null}
    </span>
  );
}

type PreviewFace = { normal: [number, number, number]; corners: Array<[number, number, number]> };

// The projection below is an oblique isometric view from the (+X, +Y, +Z)
// octant: screenX tracks (rx - rz), screenY tracks (rx + rz) minus height.
// That implies a fixed camera direction of (1, 1, 1) in the *rotated* (view)
// frame, which is what both the culling test and the depth sort below need
// to use — everything is keyed off the same rx/y/rz per corner so a face's
// visibility and paint order rotate together with the view instead of
// silently staying pinned to the object's un-rotated axes.
function buildShapePreviewPolygons(faces: PreviewFace[], viewYaw = 0) {
  const cos = Math.cos(viewYaw);
  const sin = Math.sin(viewYaw);
  const projected = faces
    .map((face) => {
      const normalX = face.normal[0] * cos - face.normal[2] * sin;
      const normalY = face.normal[1];
      const normalZ = face.normal[0] * sin + face.normal[2] * cos;

      // Cull faces pointing away from the camera. Without this, every face
      // of every box gets drawn regardless of which side actually faces the
      // viewer, so a stray back face can land on top of (or peek out from
      // behind) the correct front faces once the view is rotated, or on any
      // non-convex/composite shape (prefabs built from several box parts)
      // where the faces don't fully self-occlude by sheer coincidence.
      const facing = normalX + normalY + normalZ;
      if (facing <= 0.0001) return null;

      let depth = 0;
      const points = face.corners.map(([x, y, z]) => {
        const rx = x * cos - z * sin;
        const rz = x * sin + z * cos;
        depth += rx + y + rz;
        const px = 60 + (rx - rz) * 34;
        const py = 54 - y * 32 + (rx + rz) * 14;
        return { x: px, y: py };
      });
      depth /= face.corners.length;

      const shade = Math.max(0.35, Math.min(0.95, 0.72 + normalY * 0.12 + normalX * 0.06 - normalZ * 0.06));
      return {
        depth,
        points: points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
        fill: `rgba(${Math.round(176 * shade)}, ${Math.round(184 * shade)}, ${Math.round(178 * shade)}, 0.96)`,
      };
    })
    .filter((polygon): polygon is NonNullable<typeof polygon> => polygon !== null);

  return projected.sort((a, b) => a.depth - b.depth);
}

const UNIT_BOX_FACES: PreviewFace[] = [
  { normal: [1, 0, 0], corners: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
  { normal: [-1, 0, 0], corners: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
  { normal: [0, 1, 0], corners: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
  { normal: [0, -1, 0], corners: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  { normal: [0, 0, 1], corners: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
  { normal: [0, 0, -1], corners: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
];

// Rotates a point by an XYZ Euler triple (radians), applied X then Y then Z —
// matching the rotation order prefab transforms are resolved with elsewhere
// (prefab-resolver.ts, via THREE.Euler's default 'XYZ' order).
function rotatePreviewPoint([x, y, z]: [number, number, number], rotation: { x: number; y: number; z: number }): [number, number, number] {
  if (rotation.x) {
    const c = Math.cos(rotation.x), s = Math.sin(rotation.x);
    [y, z] = [y * c - z * s, y * s + z * c];
  }
  if (rotation.y) {
    const c = Math.cos(rotation.y), s = Math.sin(rotation.y);
    [x, z] = [x * c + z * s, -x * s + z * c];
  }
  if (rotation.z) {
    const c = Math.cos(rotation.z), s = Math.sin(rotation.z);
    [x, y] = [x * c - y * s, x * s + y * c];
  }
  return [x, y, z];
}

function boxFacesFromPartTransform(transform: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } }): PreviewFace[] {
  return UNIT_BOX_FACES.map((face) => ({
    normal: rotatePreviewPoint(face.normal, transform.rotation),
    corners: face.corners.map(([x, y, z]) => {
      const [rx, ry, rz] = rotatePreviewPoint([x * transform.scale.x, y * transform.scale.y, z * transform.scale.z], transform.rotation);
      return [rx + transform.position.x, ry + transform.position.y, rz + transform.position.z] as [number, number, number];
    }),
  }));
}

// Approximates a resolved prefab (all parts, with the given variant's scale
// and part overrides applied — mirroring prefab-resolver.ts's
// scalePartTransform) as a composite of box faces, then normalizes it so its
// largest extent matches the ~unit scale ShapePreview's projection is tuned
// for. Every prefab primitive (box/cylinder/sphere/platform/plane/sign) is
// rendered as its bounding box for preview purposes, same fidelity as the
// prefab geometry itself (there is no wedge/round preview either).
function buildPrefabPreviewFaces(prefab: PrefabDefinition, variant: PrefabVariantDefinition): PreviewFace[] {
  const variantScale = variant.scale ?? { x: 1, y: 1, z: 1 };
  const faces = prefab.parts.flatMap((part) => {
    const override = variant.partOverrides?.[part.id];
    const base = override?.transform ?? part.transform;
    return boxFacesFromPartTransform({
      position: { x: base.position.x * variantScale.x, y: base.position.y * variantScale.y, z: base.position.z * variantScale.z },
      rotation: base.rotation,
      scale: { x: base.scale.x * variantScale.x, y: base.scale.y * variantScale.y, z: base.scale.z * variantScale.z },
    });
  });

  let maxExtent = 0;
  for (const face of faces) {
    for (const [x, y, z] of face.corners) maxExtent = Math.max(maxExtent, Math.abs(x), Math.abs(y), Math.abs(z));
  }
  const normalizeScale = maxExtent > 0 ? 0.5 / maxExtent : 1;
  return faces.map((face) => ({ normal: face.normal, corners: face.corners.map(([x, y, z]) => [x * normalizeScale, y * normalizeScale, z * normalizeScale] as [number, number, number]) }));
}

function PrefabPreview({
  prefab,
  variantId,
  viewYaw = 0,
  onViewYawChange,
  dragRef,
  compact = false,
}: {
  prefab: PrefabDefinition;
  variantId?: string;
  viewYaw?: number;
  onViewYawChange?: (yaw: number) => void;
  dragRef?: React.MutableRefObject<{ x: number; yaw: number } | null>;
  compact?: boolean;
}) {
  const variant = prefab.variants.find((candidate) => candidate.id === variantId) ?? prefab.variants.find((candidate) => candidate.id === prefab.defaultVariantId) ?? prefab.variants[0];
  const polygons = buildShapePreviewPolygons(buildPrefabPreviewFaces(prefab, variant), viewYaw);

  const startPreviewDrag = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!dragRef || !onViewYawChange) return;
    event.stopPropagation();
    dragRef.current = { x: event.clientX, yaw: viewYaw };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const dragPreview = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!dragRef?.current || !onViewYawChange) return;
    event.stopPropagation();
    onViewYawChange(dragRef.current.yaw + (event.clientX - dragRef.current.x) * 0.018);
  };
  const endPreviewDrag = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!dragRef) return;
    event.stopPropagation();
    dragRef.current = null;
  };

  return (
    <span
      className={`editor-shape-preview ${compact ? "editor-shape-preview--compact" : ""}`}
      aria-label={`${prefab.name} preview`}
      onPointerDown={startPreviewDrag}
      onPointerMove={dragPreview}
      onPointerUp={endPreviewDrag}
      onPointerCancel={endPreviewDrag}
    >
      <svg viewBox="0 0 120 92" role="img" aria-label={prefab.name}>
        {polygons.map((polygon, index) => <polygon key={`${polygon.points}-${index}`} points={polygon.points} fill={polygon.fill} />)}
      </svg>
      {!compact ? <span>{prefab.name}</span> : null}
    </span>
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

  if (workspace === "liquid") {
    const fluid = props.selectedFluid;
    return (
      <Panel title="Inspector">
        <Section title="Fluid Cell">
          <KeyValue label="Coordinates" value={formatCoordinate(props.selected)} mono />
          <KeyValue label="Type" value={fluid?.type ? "Water" : "None"} />
          <KeyValue label="Level" value={fluid?.type ? String(fluid.level) : "-"} mono />
          <KeyValue label="Source" value={fluid?.source ? "yes" : "no"} />
          <KeyValue label="Falling" value={fluid?.falling ? "yes" : "no"} />
          <KeyValue label="Chunk" value={props.selectedChunk ? `${props.selectedChunk.chunkX},${props.selectedChunk.chunkZ}` : "-"} mono />
        </Section>
      </Panel>
    );
  }

  if (props.selected && workspace !== "terrain") {
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

  if (props.selected && workspace === "terrain") {
    return (
      <Panel title="Inspector">
        <TerrainSelectionDetails props={props} />
      </Panel>
    );
  }

  if (workspace === "terrain") {
    return (
      <Panel title="Inspector">
        <Section title="Terrain Selection">
          <p className="editor-muted">Select or hover terrain to inspect coordinates, material, shape and chunk data.</p>
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
        <KeyValue label="Regions" value={props.regionLoadSummary ?? "1 / 1 loaded"} mono />
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
        <KeyValue label="Material" value={getTerrainMaterialLabel(props.paintBlockId)} />
        <KeyValue label="Shape" value={getShapeDefinition(props.activeShapeId).name} />
        <KeyValue label="Brush cells" value={String(props.brushAffectedCellCount)} mono />
        <KeyValue label="Selected" value={formatCoordinate(props.selected)} mono />
        <KeyValue label="Dirty chunks" value={String(props.dirtyChunks)} mono />
        <KeyValue label="Last rebuilt" value={props.lastRebuiltChunks.join(", ") || "-"} mono />
      </dl>
    );
  }

  if (workspace === "liquid") {
    return (
      <dl className="editor-metrics-grid">
        <KeyValue label="Tool" value={TOOL_LABELS[props.tool]} />
        <KeyValue label="Water cells" value={String(props.fluidCellCount)} mono />
        <KeyValue label="Sources" value={String(props.fluidSourceCount)} mono />
        <KeyValue label="Falling" value={String(props.fallingFluidCount)} mono />
        <KeyValue label="Pending" value={String(props.pendingFluidUpdates)} mono />
        <KeyValue label="Selected" value={formatCoordinate(props.selected)} mono />
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

function AssetPreviewDialog({
  props,
  workspace,
  onClose,
}: {
  props: MapEditorToolbarProps;
  workspace: EditorWorkspace;
  onClose: () => void;
}) {
  const [previewYaw, setPreviewYaw] = useState(0);
  const [animationRun, setAnimationRun] = useState(0);
  const dragRef = useRef<{ x: number; yaw: number } | null>(null);
  const activePrefab = BUILT_IN_PREFABS.find((prefab) => prefab.id === props.activePrefabId) ?? null;
  const shape = getShapeDefinition(props.activeShapeId);
  const isObjectPreview = workspace === "objects";
  const runPopAnimation = () => {
    setAnimationRun((count) => count + 1);
    props.onPreviewEntityPopAnimation();
  };

  return (
    <div className="editor-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="editor-dialog editor-asset-preview-dialog" role="dialog" aria-modal="true" aria-label="Asset preview" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <strong>{isObjectPreview ? "Object Preview" : "Block Preview"}</strong>
          <ActionButton icon="close" onClick={onClose}>Close</ActionButton>
        </header>
        <div className="editor-asset-preview-stage">
          {isObjectPreview ? (
            activePrefab ? (
              <div key={`prefab-${activePrefab.id}-${props.activePrefabVariantId}-${animationRun}`} className={animationRun > 0 ? "editor-asset-preview-pop" : ""}>
                <PrefabPreview
                  prefab={activePrefab}
                  variantId={props.activePrefabVariantId || activePrefab.defaultVariantId}
                  viewYaw={previewYaw}
                  onViewYawChange={setPreviewYaw}
                  dragRef={dragRef}
                />
              </div>
            ) : (
              <div className="editor-asset-preview-empty">
                <EditorIcon name="object" />
                <span>Select a prefab to preview object animations.</span>
              </div>
            )
          ) : (
            <div key={`shape-${props.activeShapeId}-${props.activeRotation}-${props.activeShapeState}-${animationRun}`} className={animationRun > 0 ? "editor-asset-preview-pop" : ""}>
              <ShapePreview
                shapeId={props.activeShapeId}
                rotation={props.activeRotation}
                state={props.activeShapeState}
                viewYaw={previewYaw}
                onViewYawChange={setPreviewYaw}
                dragRef={dragRef}
              />
            </div>
          )}
        </div>
        <dl className="editor-mini-summary">
          {isObjectPreview ? (
            <>
              <KeyValue label="Object" value={activePrefab?.name ?? "None"} />
              <KeyValue label="Category" value={activePrefab?.category ?? "-"} />
              <KeyValue label="Collision" value={activePrefab?.collisionMode ?? "-"} />
              <KeyValue label="Variant" value={props.activePrefabVariantId || activePrefab?.defaultVariantId || "-"} />
            </>
          ) : (
            <>
              <KeyValue label="Shape" value={shape.name} />
              <KeyValue label="Category" value={shape.category} />
              <KeyValue label="Yaw" value={["N", "E", "S", "W"][props.activeRotation]} />
              <KeyValue label="State" value={String(props.activeShapeState)} mono />
            </>
          )}
        </dl>
        <div className="editor-asset-preview-actions" aria-label="Preview actions">
          {isObjectPreview ? (
            <>
              <ActionButton icon="sparkles" disabled={!activePrefab} onClick={runPopAnimation}>Pop Up</ActionButton>
              <ActionButton icon="rotate" disabled={!activePrefab} onClick={() => setPreviewYaw((yaw) => yaw - Math.PI / 2)}>Turn Left</ActionButton>
              <ActionButton icon="rotate" disabled={!activePrefab} onClick={() => setPreviewYaw((yaw) => yaw + Math.PI / 2)}>Turn Right</ActionButton>
            </>
          ) : (
            <>
              <ActionButton icon="sparkles" onClick={() => setAnimationRun((count) => count + 1)}>Pop Test</ActionButton>
              <ActionButton icon="undo" onClick={() => props.onCellRotationChange((((props.activeRotation + 3) % 4) as CellRotation))}>Rotate Left</ActionButton>
              <ActionButton icon="redo" onClick={() => props.onCellRotationChange((((props.activeRotation + 1) % 4) as CellRotation))}>Rotate Right</ActionButton>
              <ActionButton icon="rotate" onClick={() => props.onShapeStateChange(setShapePitch(props.activeShapeState, getShapePitch(props.activeShapeState) + 1))}>Tilt Up</ActionButton>
              <ActionButton icon="rotate" onClick={() => props.onShapeStateChange(setShapePitch(props.activeShapeState, getShapePitch(props.activeShapeState) + 3))}>Tilt Down</ActionButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBar({ props, workspace }: { props: MapEditorToolbarProps; workspace: EditorWorkspace }) {
  const metrics = useEditorStatusMetrics();

  return <footer className="editor-status-bar"><span>{workspace}</span><span>{TOOL_LABELS[props.tool]}</span><span>{props.selectedRegionId ?? "no region"}</span><span>{formatCoordinate(props.hovered)}</span><span>{props.selectedEntityIds.length || (props.selected ? 1 : 0)} selected</span><span>Zone {props.zoneId}</span><span>{formatPerformance(metrics?.fps ?? null, metrics?.frameMs ?? null)}</span><span>{props.autosaveStatus}</span></footer>;
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
  sparkles: Sparkles,
  "asset-preview": Eye,
  waterSource: Waves,
  waterRemove: Eraser,
  waterInspect: Eye,
  play: Play,
  pause: Pause,
  step: StepForward,
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
  if (workspace === "liquid") return ["overview", "history", "performance"];
  if (workspace === "map") return ["overview", "validation", "history"];
  if (workspace === "navigation") return ["overview", "validation"];
  if (workspace === "zones") return ["overview", "validation"];
  return ["overview", "validation", "history"];
}

function leftDockTitle(workspace: EditorWorkspace, tool: EditorTool) {
  if (workspace === "terrain") {
    if (tool === "paint") return "Paint Terrain";
    if (tool === "add") return "Add Blocks";
    if (tool === "raise" || tool === "lower" || tool === "flatten" || tool === "erase" || tool === "clear") return `${TOOL_LABELS[tool]} Terrain`;
    return "Terrain";
  }
  if (workspace === "liquid") return "Liquid";
  if (workspace === "objects") return "Primitive Palette";
  if (workspace === "map") return "Map Library";
  if (workspace === "zones") return "Zones";
  if (workspace === "navigation") return "Navigation";
  if (workspace === "review") return "Review";
  return title(workspace);
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

function getTerrainMaterialLabel(blockId: BlockId) {
  return getBlockDefinition(blockId).displayName;
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
