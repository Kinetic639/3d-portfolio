"use client";

import { Compass, LockKeyhole, RotateCcw, UnlockKeyhole } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { listLibraryItems } from "@/lib/assets/library";
import { EditorSession } from "@/lib/editor/editor-session";
import { brushOperation, type EditorLayerId, type EditorTool } from "@/lib/editor/editor-tools";
import { EditorViewport, type CompassDirection, type ToolSettings } from "@/lib/editor/editor-viewport";
import { applyPersistedLayerStates, collectLayerPreferences, loadEditorViewPreferences, saveEditorViewPreferences } from "@/lib/editor/editor-view-preferences";
import { addNavigationEdge, addNavigationNode, addNavigationRoute } from "@/lib/editor/navigation-authoring";
import { createTerrainMutations, DEFAULT_TERRAIN_BRUSH } from "@/lib/editor/terrain-brushes";
import { Thumbnailer } from "@/lib/editor/thumbnailer";
import { getModelLibrary } from "@/lib/engine/model-library";
import { getTerrainAtlas } from "@/lib/engine/terrain-material";
import { buildWorldForMap } from "@/lib/engine/terrain-meshes";
import { migrateMapDefinition, type MapDefinition } from "@/lib/maps/map-definition";
import { BUILT_IN_PREFABS } from "@/lib/prefabs/prefab-library";
import { getDefaultShapeState } from "@/lib/voxel-shapes/shape-registry";
import type { CellRotation } from "@/lib/voxel-shapes/shape-ids";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import {
  addZone,
  api,
  bakeSavedMap,
  deleteSelection,
  duplicateSelection,
  MINIGAME_OPTIONS,
  parseContentKey,
  refreshBakeStatus,
  saveMap,
  setTerrainView,
  updateZone,
  validateSession,
} from "./editor-actions";
import {
  createEditorStore,
  createHoverStore,
  DEFAULT_LAYERS,
  EditorContext,
  setSelection,
  updateSettings,
  useEditor,
  useEditorState,
  viewSettings,
  type EditorContextValue,
} from "./editor-store";
import MapEditorToolbar, { type EditorViewportLayoutState, type MapEditorToolbarProps } from "./MapEditorToolbar";

/**
 * The map editor. Development only: this component is reachable solely from
 * `app/editor/page.dev.tsx`, which is not a route in a production build.
 *
 * The interface is the original editor's (MapEditorToolbar and its styles);
 * underneath it are the new editor session (one diff-based undo history,
 * saving to map files) and viewport (on-demand rendering, rebuilds in
 * proportion to the edit, no React work while the pointer moves).
 */
export default function EditorApp({ mapId, notice }: { mapId: string; notice?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const needleRef = useRef<HTMLSpanElement>(null);
  const headingRef = useRef<HTMLElement>(null);
  const [editor, setEditor] = useState<EditorContextValue | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<EditorViewportLayoutState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    let viewport: EditorViewport | null = null;
    let thumbnails: Thumbnailer | null = null;

    const load = async () => {
      const definition = migrateMapDefinition(await api<unknown>(`/api/editor/maps/${mapId}`, { signal: controller.signal }));
      const [{ world, terrain }, models] = await Promise.all([
        buildWorldForMap(definition, { signal: controller.signal, onProgress: setProgress, editorView: true }),
        getModelLibrary().then(async (library) => {
          await library.ensureLoaded(library.idsFor(definition.entities));
          return library;
        }),
        getTerrainAtlas().ready,
      ]);
      if (controller.signal.aborted) {
        terrain.dispose();
        return;
      }
      const session = new EditorSession(definition, world);
      const preferences = loadEditorViewPreferences(window.localStorage);
      const store = createEditorStore(preferences, applyPersistedLayerStates(DEFAULT_LAYERS, preferences));
      const hover = createHoverStore();
      const firstZone = session.getMeta().zones[0];
      if (firstZone) store.setState({ settings: { ...store.getState().settings, zoneId: firstZone.numericId, zoneColor: firstZone.color } });

      viewport = new EditorViewport(canvas, session, terrain, models, store.getState().settings, viewSettings(store.getState()), {
        onSelectionChange: (ids) => store.setState({ selection: ids }),
        onCellSelect: (cell) => store.setState({ selectedCell: cell }),
        onHover: (info) => hover.setState({ hovered: info?.cell ?? null, affected: info?.affected ?? 0 }),
        onMessage: (message) => store.setState({ message }),
        // Zone counts are refreshed once per stroke, not per step.
        onEditEnd: () => store.setState({ metaRevision: store.getState().metaRevision + 1 }),
        // The compass follows the camera every frame it moves: written to the DOM, never through React.
        onHeading: (radians) => {
          if (needleRef.current) needleRef.current.style.transform = `rotate(${radians}rad)`;
          if (headingRef.current) headingRef.current.textContent = compassLabel(radians);
        },
      });
      session.subscribe((change) => {
        const state = store.getState();
        // The baked view shows a bake of an earlier state; an edit sends the view back to the voxels.
        if (state.terrainView !== "voxels" && (change.terrainChunks.length > 0 || change.zoneChunks.length > 0 || change.meta || change.entitiesStructural)) {
          viewport?.setBakedView(null);
          store.setState({ terrainView: "voxels" });
        }
        // Only real changes reach React: the steps of a brush stroke change none of these after the first.
        const entitiesChanged = change.entitiesStructural || change.entitiesUpdated.length > 0;
        const saveStatus = session.isDirty ? "unsaved changes" : "saved";
        if (
          state.canUndo !== session.canUndo || state.canRedo !== session.canRedo || state.dirty !== session.isDirty ||
          state.saveStatus !== saveStatus || change.meta || entitiesChanged
        ) {
          store.setState({
            canUndo: session.canUndo,
            canRedo: session.canRedo,
            dirty: session.isDirty,
            saveStatus,
            metaRevision: state.metaRevision + (change.meta ? 1 : 0),
            entitiesRevision: state.entitiesRevision + (entitiesChanged ? 1 : 0),
          });
        }
      });
      thumbnails = new Thumbnailer(models);
      const value: EditorContextValue = { mapId, session, viewport, models, thumbnails, store, hover };
      store.setState({ blockEdits: definition.blocks.edits.length });
      if (notice) store.setState({ message: { type: "error", text: notice } });
      void refreshBakeStatus(value);
      validateSession(value);
      (window as unknown as { __editor?: EditorContextValue }).__editor = value;
      setEditor(value);
    };

    load().catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    });

    return () => {
      controller.abort();
      viewport?.dispose();
      thumbnails?.dispose();
      setEditor(null);
    };
  }, [mapId, notice]);

  const shellClass = [
    "experience-shell",
    "experience-shell--editor",
    layout?.cleanPreview ? "experience-shell--clean-preview" : "",
    layout?.maximizedViewport ? "experience-shell--viewport-maximized" : "",
  ].filter(Boolean).join(" ");

  return (
    <section
      className={shellClass}
      data-editor={editor ? "ready" : error ? "error" : "loading"}
      aria-label="Map editor"
      style={{
        height: "100vh",
        "--editor-left-width": `${layout ? (layout.leftCollapsed ? 32 : layout.leftWidth) : 244}px`,
        "--editor-right-width": `${layout ? (layout.rightCollapsed ? 32 : layout.rightWidth) : 332}px`,
        "--editor-bottom-height": `${layout ? (layout.bottomCollapsed ? 30 : layout.bottomHeight) : 204}px`,
      } as React.CSSProperties}
    >
      <div className="map-canvas-layer">
        <canvas ref={canvasRef} tabIndex={0} aria-label="Map viewport" />
      </div>
      {editor ? (
        <EditorContext.Provider value={editor}>
          <ViewportOverlay needleRef={needleRef} headingRef={headingRef} />
          <ConnectedToolbar onLayoutChange={setLayout} />
        </EditorContext.Provider>
      ) : (
        <div className="experience-overlay" role="status" style={{ color: "#d7d7d7", alignItems: "center", justifyContent: "center" }}>
          {error ? `Could not open ${mapId}: ${error}` : `Opening ${mapId}… ${Math.round(progress * 100)}%`}
        </div>
      )}
    </section>
  );
}

const COMPASS_DIRECTIONS: Array<{ id: CompassDirection; label: string; shortLabel: string }> = [
  { id: "north", label: "North", shortLabel: "N" },
  { id: "northeast", label: "North East", shortLabel: "NE" },
  { id: "east", label: "East", shortLabel: "E" },
  { id: "southeast", label: "South East", shortLabel: "SE" },
  { id: "south", label: "South", shortLabel: "S" },
  { id: "southwest", label: "South West", shortLabel: "SW" },
  { id: "west", label: "West", shortLabel: "W" },
  { id: "northwest", label: "North West", shortLabel: "NW" },
];

function compassLabel(radians: number) {
  const index = Math.round(radians / (Math.PI / 4)) % 8;
  return COMPASS_DIRECTIONS[index].shortLabel;
}

/** The original's viewport overlay: compass with direction snapping, angle lock and view reset. */
function ViewportOverlay({ needleRef, headingRef }: { needleRef: React.RefObject<HTMLSpanElement | null>; headingRef: React.RefObject<HTMLElement | null> }) {
  const { viewport, store } = useEditor();
  const angleLocked = useEditorState((state) => state.angleLocked);
  const cleanPreview = useEditorState((state) => state.cleanPreview);
  if (cleanPreview) return null;
  return (
    <div className="experience-overlay">
      <header className="overlay-header">
        <div className="overlay-actions">
          <div className="viewport-compass" aria-label="Camera compass">
            <div className="viewport-compass__face" aria-hidden="true">
              <Compass size={14} />
              <span ref={needleRef} className="viewport-compass__needle" />
              <strong ref={headingRef}>N</strong>
            </div>
            <div className="viewport-compass__buttons" aria-label="Snap camera direction">
              {COMPASS_DIRECTIONS.map((item) => (
                <button key={item.id} data-direction={item.id} type="button" onClick={() => viewport.snapCompass(item.id)} title={`Face ${item.label}`} aria-label={`Face ${item.label}`}>
                  {item.shortLabel}
                </button>
              ))}
            </div>
          </div>
          <button
            className="overlay-icon-button"
            type="button"
            onClick={() => {
              const next = !store.getState().angleLocked;
              store.setState({ angleLocked: next });
              viewport.setAngleLocked(next);
            }}
            aria-label={angleLocked ? "Unlock camera angle" : "Lock camera angle"}
            title={angleLocked ? "Unlock camera angle" : "Lock camera angle"}
          >
            {angleLocked ? <UnlockKeyhole aria-hidden="true" size={16} /> : <LockKeyhole aria-hidden="true" size={16} />}
          </button>
          <button className="overlay-icon-button" type="button" onClick={() => viewport.frameAll()} aria-label="Reset view" title="Reset view">
            <RotateCcw aria-hidden="true" size={16} />
          </button>
        </div>
      </header>
    </div>
  );
}

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

/** Builds the toolbar's props from the session, the store and the viewport. */
function ConnectedToolbar({ onLayoutChange }: { onLayoutChange: (layout: EditorViewportLayoutState) => void }) {
  const editor = useEditor();
  const { session, viewport, store, hover, mapId, models, thumbnails } = editor;
  const state = useEditorState((current) => current);
  const { settings } = state;
  const meta = session.getMeta();
  const [availableMaps, setAvailableMaps] = useState<Array<{ id: string; name: string }>>([{ id: mapId, name: meta.name }]);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    api<{ maps: Array<{ id: string; name: string }> }>("/api/editor/maps")
      .then((result) => setAvailableMaps(result.maps.map((map) => ({ id: map.id, name: map.name }))))
      .catch(() => undefined);
  }, []);

  // Model thumbnails are rendered in the browser, one per frame, and cached.
  const libraryModels = useMemo(() => listLibraryItems(models.manifest).filter((item) => item.kind === "model"), [models]);
  useEffect(() => {
    let cancelled = false;
    for (const item of libraryModels) {
      void thumbnails.render(item).then((url) => {
        if (!cancelled) setThumbnailUrls((current) => (current[item.id] === url ? current : { ...current, [item.id]: url }));
      }).catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [libraryModels, thumbnails]);

  // View preferences and layers persist between sessions, as in the original.
  useEffect(() => {
    saveEditorViewPreferences(window.localStorage, { ...state.preferences, ...collectLayerPreferences(state.layers) });
    viewport.setView(viewSettings(state));
  }, [state.preferences, state.layers, state.minZoomDistance, viewport, state]);

  const update = useCallback((patch: Partial<ToolSettings>) => updateSettings(editor, patch), [editor]);
  const setBrush = useCallback((patch: Partial<ToolSettings["brush"]>) => {
    const current = store.getState();
    const brush = { ...current.settings.brush, ...patch };
    store.setState({ brushes: { ...current.brushes, [current.settings.tool]: brush } });
    updateSettings(editor, { brush });
  }, [editor, store]);
  const setTool = useCallback((tool: EditorTool) => {
    const current = store.getState();
    // Each brush tool remembers its own brush.
    const brush = current.brushes[tool] ?? (brushOperation(tool) || tool === "zone" ? { ...DEFAULT_TERRAIN_BRUSH } : current.settings.brush);
    updateSettings(editor, { tool, brush });
  }, [editor, store]);
  const setPreferences = (patch: Partial<typeof state.preferences>) => store.setState({ preferences: { ...store.getState().preferences, ...patch } });
  const setLayer = (id: EditorLayerId, patch: { visible?: boolean; locked?: boolean }) => store.setState({ layers: store.getState().layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)) });
  const message = (text: string, type: "info" | "error" = "info") => store.setState({ message: { type, text } });

  const selectedEntity = state.selection.length === 1 ? session.getEntity(state.selection[0]) ?? null : null;
  const cell = state.selectedCell;
  const world = session.world;
  const zoneAssignmentCount = useMemo(() => {
    void state.metaRevision;
    let count = 0;
    for (const zone of world.zones) if (zone > 0) count += 1;
    return count;
    // Recounted when zones change: zone strokes bump the history, which re-renders this component.
  }, [world, state.metaRevision, state.canUndo, state.canRedo]); // eslint-disable-line react-hooks/exhaustive-deps

  const placeNavigationNode = () => {
    if (!cell) {
      message("Select a terrain cell first, then place the node there.", "error");
      return;
    }
    const definition = session.toDefinition();
    const index = definition.navigation.nodes.length + 1;
    const position = world.gridToWorld(cell.x, cell.y, cell.z);
    const next = addNavigationNode(definition, {
      id: `nav-${index}-${Date.now().toString(36)}`, type: state.navigationNodeType, label: `Node ${index}`,
      position: { x: position.x, y: position.y + 0.5, z: position.z }, tags: [], locked: false,
    });
    session.updateMeta("Place navigation node", { navigation: next.navigation });
  };
  const connectLatest = () => {
    const definition = session.toDefinition();
    const nodes = definition.navigation.nodes;
    if (nodes.length < 2) return;
    const [from, to] = nodes.slice(-2);
    const next = addNavigationEdge(definition, { id: `edge-${from.id}-${to.id}`, fromNodeId: from.id, toNodeId: to.id, bidirectional: true, cost: 1, locked: false });
    session.updateMeta("Connect navigation nodes", { navigation: next.navigation });
  };
  const createRoute = () => {
    const definition = session.toDefinition();
    const nodeIds = definition.navigation.nodes.map((node) => node.id);
    if (nodeIds.length < 2) return;
    const next = addNavigationRoute(definition, { id: `route-${definition.navigation.routes.length + 1}`, name: `Route ${definition.navigation.routes.length + 1}`, nodeIds, tags: [] });
    session.updateMeta("Create route", { navigation: next.navigation });
  };

  const createMap = async (action: "create" | "duplicate") => {
    const name = window.prompt(action === "create" ? "Name of the new map" : "Name of the copy", action === "create" ? "New map" : `${meta.name} copy`);
    if (!name) return;
    const id = slug(name);
    try {
      await api("/api/editor/maps", { method: "POST", body: JSON.stringify(action === "create" ? { action, id, name } : { action, sourceId: mapId, id, name }) });
      if (!session.isDirty || window.confirm("Leave this map? Unsaved changes will be lost.")) window.location.href = `/editor?map=${id}`;
    } catch (reason) {
      message(reason instanceof Error ? reason.message : String(reason), "error");
    }
  };
  const openMap = (id: string) => {
    if (id === mapId) return;
    if (!session.isDirty || window.confirm("Leave this map? Unsaved changes will be lost.")) window.location.href = `/editor?map=${id}`;
  };
  const importMap = async (file: File) => {
    try {
      const imported = migrateMapDefinition(JSON.parse(await file.text()));
      if (!window.confirm(`Replace ${meta.name} with ${imported.name} from ${file.name}? The current map file is overwritten.`)) return;
      const definition: MapDefinition = { ...imported, id: mapId };
      await api(`/api/editor/maps/${mapId}`, { method: "PUT", body: JSON.stringify(definition) });
      window.location.reload();
    } catch (reason) {
      message(`Import failed: ${reason instanceof Error ? reason.message : String(reason)}`, "error");
    }
  };
  const resetFlat = () => {
    if (!window.confirm("Flatten the whole map to the ground layer? This is one undo step.")) return;
    const { width, depth } = world.config;
    const mutations = [];
    for (let z = 0; z < depth; z += 1) {
      for (let x = 0; x < width; x += 1) {
        mutations.push(...createTerrainMutations({ world, operation: "flatten", center: { x, y: 0, z }, blockId: BLOCK_IDS.Ground, zoneId: 0 }));
      }
    }
    session.applyTerrain("Reset flat terrain", mutations);
  };

  const props: MapEditorToolbarProps = {
    available: true,
    mapId,
    mapName: meta.name,
    mapDescription: meta.description ?? "",
    availableMaps,
    tool: settings.tool,
    paintBlockId: settings.blockId,
    applyMaterialToAddedBlocks: settings.applyMaterialToAddedBlocks,
    renderMode: state.terrainView === "voxels" ? "voxels" : "baked",
    bakeStatus: state.terrainView === "baking" ? "baking preview…" : state.dirty && state.bake === "fresh" ? "out of date" : state.bake === "fresh" ? "up to date" : state.bake === "stale" ? "out of date" : state.bake === "missing" ? "not baked" : "-",
    zoneId: settings.zoneId,
    zoneEditMode: settings.zoneEditMode,
    zoneSelectionMode: settings.zoneSelectionMode,
    zoneFocusDirection: meta.zones.find((zone) => zone.numericId === settings.zoneId)?.focusDirection ?? "south",
    zoneDefinitions: meta.zones,
    zoneNeutralTerrain: state.preferences.zoneNeutralTerrain,
    zoneNeutralTerrainColor: state.preferences.zoneNeutralTerrainColor,
    zoneGridLinesVisible: state.preferences.zoneGridLinesVisible,
    zoneGridLineColor: state.preferences.zoneGridLineColor,
    mapBackgroundColor: state.preferences.mapBackgroundColor,
    hoverStore: hover,
    selected: cell,
    selectedBlockId: cell ? world.getBlock(cell.x, cell.y, cell.z) : null,
    selectedShapeId: cell ? world.getShape(cell.x, cell.y, cell.z) : null,
    selectedRotation: cell ? world.getRotation(cell.x, cell.y, cell.z) : null,
    selectedState: cell ? world.getState(cell.x, cell.y, cell.z) : null,
    selectedZoneId: cell ? world.getColumnZone(cell.x, cell.z) : 0,
    selectedWorldPosition: cell ? world.gridToWorld(cell.x, cell.y, cell.z) : null,
    selectedChunk: cell ? { chunkX: Math.floor(cell.x / world.config.chunkSize), chunkZ: Math.floor(cell.z / world.config.chunkSize) } : null,
    selectedLocal: cell ? { localX: cell.x % world.config.chunkSize, localZ: cell.z % world.config.chunkSize } : null,
    dirtyChunks: 0,
    lastRebuiltChunks: [],
    blockEditCount: state.blockEdits,
    zoneAssignmentCount,
    entityAnchorCount: meta.markers.length,
    undoDepth: state.canUndo ? 1 : 0,
    redoDepth: state.canRedo ? 1 : 0,
    hasUnsavedChanges: state.dirty,
    autosaveStatus: state.saveStatus,
    message: state.message,
    selectedMarkerId: null,
    selectedEntity,
    entityCount: session.getEntities().length,
    selectedEntityIds: state.selection,
    primitiveType: settings.primitiveType,
    activePrefabId: settings.prefabId ?? "",
    activePrefabVariantId: settings.variantId ?? "",
    models: libraryModels.map((item) => ({ id: item.id, name: item.name, category: item.category, thumbnail: thumbnailUrls[item.id] ?? null, variants: item.variants })),
    activeModelId: settings.modelId ?? "",
    prefabSearch: state.prefabSearch,
    entityTransformMode: state.entityTransformMode,
    collisionMode: settings.collisionMode,
    entityColor: settings.entityColor,
    entityName: settings.entityName,
    brushSettings: settings.brush,
    activeShapeId: settings.shapeId,
    activeShapeCategory: state.activeShapeCategory,
    activeRotation: settings.rotation,
    activeShapeState: settings.shapeState,
    layerStates: state.layers,
    cleanPreview: state.cleanPreview,
    navigationNodeType: state.navigationNodeType,
    navigationNodeCount: meta.navigation.nodes.length,
    navigationEdgeCount: meta.navigation.edges.length,
    routeCount: meta.navigation.routes.length,
    validationSummary: state.validation,
    dimensions: `${world.config.width} x ${world.config.depth} x ${world.config.height}`,
    frameStats: viewportFrameStats(viewport),
    panSpeed: state.panSpeed,
    rotateSpeed: state.rotateSpeed,
    contentOptions: PORTFOLIO_CONTENT.items.map((item) => ({ key: `${item.kind}:${item.id}`, label: `${item.kind} · ${item.title}` })),
    minigameOptions: MINIGAME_OPTIONS,

    onLayoutChange,
    onToolChange: setTool,
    onPaintBlockChange: (blockId) => update({ blockId }),
    onApplyMaterialToAddedBlocksChange: (apply) => update({ applyMaterialToAddedBlocks: apply }),
    onShapeCategoryChange: (category) => store.setState({ activeShapeCategory: category }),
    onShapeChange: (shapeId) => update({ shapeId, shapeState: getDefaultShapeState(shapeId) }),
    onCellRotationChange: (rotation: CellRotation) => update({ rotation }),
    onShapeStateChange: (shapeState) => update({ shapeState }),
    onEyedropperCell: () => {
      if (!cell) return;
      update({ blockId: world.getBlock(cell.x, cell.y, cell.z), shapeId: world.getShape(cell.x, cell.y, cell.z), rotation: world.getRotation(cell.x, cell.y, cell.z), shapeState: world.getState(cell.x, cell.y, cell.z) });
    },
    onMapChange: openMap,
    onNewMap: () => void createMap("create"),
    onDuplicateMap: () => void createMap("duplicate"),
    onSaveDraft: () => {
      store.setState({ saveStatus: "saving…" });
      void saveMap(editor).then((ok) => store.setState({ saveStatus: ok ? "saved" : "save failed" }));
    },
    onRenameMap: () => {
      const name = window.prompt("Map name", meta.name);
      if (name && name.trim()) session.updateMeta("Rename map", { name: name.trim() });
    },
    onBake: () => void bakeSavedMap(editor),
    onRenderModeChange: (mode) => setTerrainView(editor, mode),
    onZoneChange: (zoneId) => update({ zoneId, zoneColor: meta.zones.find((zone) => zone.numericId === zoneId)?.color ?? "" }),
    onZoneEditModeChange: (zoneEditMode) => update({ zoneEditMode }),
    onZoneSelectionModeChange: (zoneSelectionMode) => update({ zoneSelectionMode }),
    onZoneFocusDirectionChange: () => undefined,
    onZoneDefinitionChange: (numericId, patch) => {
      updateZone(editor, numericId, patch);
      if (numericId === settings.zoneId && patch.color) update({ zoneColor: patch.color });
    },
    onCreateZone: () => {
      const zone = addZone(editor);
      if (zone) update({ zoneId: zone.numericId, zoneColor: zone.color });
    },
    onZoneNeutralTerrainChange: (enabled) => setPreferences({ zoneNeutralTerrain: enabled }),
    onZoneNeutralTerrainColorChange: (color) => setPreferences({ zoneNeutralTerrainColor: color }),
    onZoneGridLinesVisibleChange: (visible) => setPreferences({ zoneGridLinesVisible: visible }),
    onZoneGridLineColorChange: (color) => setPreferences({ zoneGridLineColor: color }),
    onMapBackgroundColorChange: (color) => setPreferences({ mapBackgroundColor: color }),
    onFocusActiveZone: () => {
      const columns = [];
      for (let index = 0; index < world.zones.length; index += 1) {
        if (world.zones[index] !== settings.zoneId) continue;
        const column = world.getZoneCoordinates(index);
        if (column) columns.push({ x: column.x, y: 0, z: column.z });
      }
      if (columns.length === 0) message("The current zone has no painted columns yet.", "error");
      else viewport.focusColumns(columns, meta.zones.find((zone) => zone.numericId === settings.zoneId)?.focusDirection ?? "south");
    },
    onClearActiveZone: () => {
      const zone = meta.zones.find((candidate) => candidate.numericId === settings.zoneId);
      if (!zone || !window.confirm(`Remove ${zone.label} and clear its columns?`)) return;
      void import("./editor-actions").then(({ deleteZone }) => deleteZone(editor, zone.numericId));
      update({ zoneId: 0, zoneColor: "" });
    },
    onUndo: () => session.undo(),
    onRedo: () => session.redo(),
    onResetUnsaved: () => {
      if (window.confirm("Discard unsaved changes and reload the saved map?")) window.location.reload();
    },
    onResetFlat: resetFlat,
    onExport: () => download(`${mapId}.json`, `${JSON.stringify(session.toDefinition(), null, 2)}\n`),
    onImport: (file) => void importMap(file),
    onClearDraft: () => {
      if (window.confirm("Discard unsaved changes and reload the saved map?")) window.location.reload();
    },
    onClose: () => {
      if (!session.isDirty || window.confirm("Close the editor? Unsaved changes will be lost.")) window.location.href = mapId === "portfolio-main" ? "/" : `/map/${mapId}`;
    },
    onRemoveMarker: () => undefined,
    onBrushShapeChange: (shape) => setBrush({ shape }),
    onBrushSizeChange: (size) => setBrush({ size: Math.max(1, Math.min(9, Math.round(size) || 1)) }),
    onPathWidthChange: (pathWidth) => setBrush({ pathWidth }),
    onFlattenHeightChange: (flattenHeight) => setBrush({ flattenHeight }),
    onPrimitiveTypeChange: (primitiveType) => update({ primitiveType, prefabId: null, modelId: null, variantId: null }),
    onActivePrefabChange: (prefabId) => {
      const prefab = BUILT_IN_PREFABS.find((candidate) => candidate.id === prefabId);
      update({ prefabId: prefabId || null, modelId: null, variantId: prefab?.defaultVariantId ?? null, tool: prefabId ? "entity" : settings.tool });
    },
    onActivePrefabVariantChange: (variantId) => update({ variantId }),
    onActiveModelChange: (modelId) => {
      const item = libraryModels.find((candidate) => candidate.id === modelId);
      update({ modelId, prefabId: null, variantId: item?.defaultVariantId ?? null, tool: "entity" });
      void models.ensureLoaded([modelId]).then(() => viewport.refreshEntities());
    },
    onPrefabSearchChange: (prefabSearch) => store.setState({ prefabSearch }),
    onEntityTransformModeChange: (mode) => {
      store.setState({ entityTransformMode: mode });
      viewport.setTransformMode(mode);
      if (settings.tool !== "select") setTool("select");
    },
    onCollisionModeChange: (collisionMode) => update({ collisionMode }),
    onEntityColorChange: (entityColor) => update({ entityColor }),
    onEntityNameChange: (entityName) => update({ entityName }),
    onPlaceEntity: () => setTool("entity"),
    onPreviewEntityPopAnimation: () => viewport.playPop(),
    onDuplicateEntity: () => duplicateSelection(editor),
    onDeleteEntity: () => deleteSelection(editor),
    onGroupEntity: () => {
      const groupId = `group-${Date.now().toString(36)}`;
      session.updateEntities("Group", state.selection, (entity) => ({ ...entity, groupId }));
    },
    onUngroupEntity: () => {
      const groupId = selectedEntity?.groupId;
      if (!groupId) return;
      const ids = session.getEntities().filter((entity) => entity.groupId === groupId).map((entity) => entity.id);
      session.updateEntities("Ungroup", ids, (entity) => ({ ...entity, groupId: undefined }));
    },
    onToggleEntityLocked: () => session.updateEntities("Lock", state.selection, (entity) => ({ ...entity, locked: !entity.locked })),
    onToggleEntityHidden: () => session.updateEntities("Hide", state.selection, (entity) => ({ ...entity, appearance: { ...entity.appearance, visibleAtRuntime: !entity.appearance.visibleAtRuntime } })),
    onNavigationNodeTypeChange: (navigationNodeType) => store.setState({ navigationNodeType }),
    onPlaceNavigationNode: placeNavigationNode,
    onConnectNavigationNodes: connectLatest,
    onCreateRoute: createRoute,
    onLayerVisibilityChange: (id, visible) => setLayer(id, { visible }),
    onLayerLockChange: (id, locked) => setLayer(id, { locked }),
    onCleanPreviewChange: (cleanPreview) => {
      if (store.getState().cleanPreview === cleanPreview) return;
      store.setState({ cleanPreview });
      viewport.setCleanPreview(cleanPreview);
    },
    onEntityContentChange: (key) => {
      const reference = parseContentKey(key);
      session.updateEntities(reference ? "Assign content" : "Clear content", state.selection, (entity) => {
        if (reference) entity.contentReference = { ...reference };
        else delete entity.contentReference;
        return entity;
      });
    },
    onZoneContentChange: (numericId, key) => updateZone(editor, numericId, { contentReference: parseContentKey(key) ?? undefined }),
    onZoneKindChange: (numericId, kind, gameId) => updateZone(editor, numericId, kind === "minigame" ? { kind, minigame: { gameId: gameId ?? MINIGAME_OPTIONS[0].id } } : { kind: undefined, minigame: undefined }),
    onPanSpeedChange: (panSpeed) => store.setState({ panSpeed }),
    onRotateSpeedChange: (rotateSpeed) => store.setState({ rotateSpeed }),
  };

  // Shortcuts the toolbar does not own: history, selection, deletion.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) session.redo();
        else session.undo();
      } else if (command && event.code === "KeyY") {
        event.preventDefault();
        session.redo();
      } else if (command && event.code === "KeyD") {
        event.preventDefault();
        duplicateSelection(editor);
      } else if (!command && (event.code === "Delete" || event.code === "Backspace")) {
        deleteSelection(editor);
      } else if (!command && event.code === "Escape") {
        setSelection(editor, []);
        store.setState({ selectedCell: null });
        viewport.setSelectedCell(null);
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (session.isDirty) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [editor, session, store, viewport]);

  // The rig's pan speed follows the Settings menu.
  useEffect(() => {
    viewport.setPanSpeed(state.panSpeed, state.rotateSpeed);
  }, [viewport, state.panSpeed, state.rotateSpeed]);

  return <MapEditorToolbar {...props} />;
}

const frameStatsCache = new WeakMap<EditorViewport, () => { fps: number | null; frameMs: number | null }>();

/** Frames per second over the last poll, while the viewport is drawing; nothing while it is idle. */
function viewportFrameStats(viewport: EditorViewport) {
  let read = frameStatsCache.get(viewport);
  if (!read) {
    let lastFrames = viewport.stats.frames;
    let lastAt = performance.now();
    read = () => {
      const now = performance.now();
      const frames = viewport.stats.frames - lastFrames;
      // The view draws only when something changes; a rate means something only while it is drawing steadily.
      const fps = frames >= 5 ? Math.round((frames * 1000) / (now - lastAt)) : null;
      lastFrames = viewport.stats.frames;
      lastAt = now;
      return { fps, frameMs: fps === null ? null : Number(viewport.stats.lastFrameMs.toFixed(1)) };
    };
    frameStatsCache.set(viewport, read);
  }
  return read;
}
