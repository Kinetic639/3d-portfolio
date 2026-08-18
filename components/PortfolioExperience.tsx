"use client";

import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { MapControls, Text, TransformControls } from "@react-three/drei";
import gsap from "gsap";
import { Compass, LockKeyhole, RotateCcw, UnlockKeyhole } from "lucide-react";
import dynamic from "next/dynamic";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import * as THREE from "three";
import {
  CHUNK_MAX_INSTANCE_COUNT,
  createTerrainDataFromWorld,
  toTerrainChunk,
  type TerrainChunk,
} from "@/lib/terrain/terrain";
import { buildSurfaceChunkMesh, type SurfaceChunkMeshData } from "@/lib/terrain/surface-mesher";
import { buildZoneOverlayChunkMeshes, buildZoneOverlayMeshes, type ZoneOverlayChunkMeshData } from "@/lib/terrain/zone-overlay";
import { BLOCK_IDS, getBlockDefinition, type BlockId } from "@/lib/world/block-registry";
import { parseMapDocument, serializeMapDocument } from "@/lib/world/map-document";
import { WORLD_CONFIG, type GridCoordinate } from "@/lib/world/world-config";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import { getTerrainSurfaceAt } from "@/lib/world/surface-query";
import { MapEditorSession, type EditorMessage, type EditorTool } from "@/lib/editor/map-editor";
import { createMapPresetWorld, type MapPresetId } from "@/lib/editor/map-presets";
import { incrementEditorPerfCounter } from "@/lib/editor/editor-performance-counters";
import { EDITOR_MIN_ZOOM_DISTANCE_FLOOR } from "@/lib/editor/editor-layout-store";
import {
  applyPersistedLayerStates,
  collectLayerPreferences,
  DEFAULT_EDITOR_VIEW_PREFERENCES,
  loadEditorViewPreferences,
  saveEditorViewPreferences,
  type EditorViewPreferences,
} from "@/lib/editor/editor-view-preferences";
import {
  addEntity,
  createPrefabEntityFromDraft,
  createEntityFromDraft,
  deleteEntities,
  duplicateEntities,
  groupEntities,
  ungroupEntities,
  updateEntity,
  validateEntityPlacement,
} from "@/lib/editor/entity-authoring";
import { BUILT_IN_PREFABS, getPrefabDefinition } from "@/lib/prefabs/prefab-library";
import { groundEntityOnTerrain } from "@/lib/prefabs/prefab-placement";
import { resolvePrefabInstance } from "@/lib/prefabs/prefab-resolver";
import type { ResolvedPrefabPart } from "@/lib/prefabs/prefab-types";
import {
  DEFAULT_TERRAIN_BRUSH,
  createTerrainMutations,
  getTerrainOperationFootprint,
  type BrushShape,
  type TerrainBrushOperation,
  type TerrainBrushSettings,
} from "@/lib/editor/terrain-brushes";
import {
  createZoneColumnChanges,
  getZoneBrushFootprint,
  getZoneRectangleFootprint,
  type ZoneEditMode,
  type ZoneSelectionMode,
} from "@/lib/editor/zone-tools";
import { addNavigationEdge, addNavigationNode, addNavigationRoute } from "@/lib/editor/navigation-authoring";
import type { CollisionMode, PlacedMapEntity, PrimitiveType } from "@/lib/maps/map-entities";
import type { NavigationNodeType } from "@/lib/maps/map-navigation";
import {
  createBlankMapDefinition,
  createLoadedMapState,
  createMapDefinitionFromWorld,
  duplicateMapDefinition,
  mapDefinitionToDocument,
  validateMapDefinition,
  type MapDefinition,
  type MapCameraPreset,
  type MapMarkerDefinition,
  type MapZoneFocusDirection,
  type MapZoneDefinition,
} from "@/lib/maps/map-definition";
import { ensureEditableZones, resetEditableZone, updateEditableZone } from "@/lib/maps/zone-authoring";
import {
  DEFAULT_AUTHORED_MAP_ID,
  deleteMapDraft,
  listMapRegistryEntries,
  loadMapDraft,
  loadMapStateSync,
  saveMapDraft,
} from "@/lib/maps/map-registry";
import type { EditorLayerId, EditorLayerState, EditorViewportLayoutState, EntityTransformMode, MapEditorToolbarProps } from "@/components/experience/MapEditorToolbar";
import { createBrowsingState, reduceBrowsingState, type BrowsingState } from "@/lib/portfolio/browsing-state";
import { getShapeDefinition, getShapePitch, setShapePitch, type ShapeCategory, type ShapeFace } from "@/lib/voxel-shapes/shape-registry";
import { DEFAULT_ROTATION, DEFAULT_STATE, SHAPE_IDS, type CellRotation, type ShapeId } from "@/lib/voxel-shapes/shape-ids";
import { PORTFOLIO_CONTENT, resolveContentReference } from "@/lib/portfolio/content";
import {
  type CompassDirection,
  type ExperiencePhase,
  isInteractivePhase,
  useExperienceStore,
} from "@/lib/experience/experience-store";

const MapEditorToolbar = dynamic(() => import("@/components/experience/MapEditorToolbar"), { ssr: false });
const DEFAULT_VIEWPORT_LAYOUT: EditorViewportLayoutState = {
  leftWidth: 244,
  rightWidth: 332,
  bottomHeight: 204,
  outlinerHeight: 260,
  leftCollapsed: false,
  rightCollapsed: false,
  bottomCollapsed: false,
  cleanPreview: false,
  maximizedViewport: false,
  editorMinZoomDistance: 22,
};
const COLLAPSED_SIDE_DOCK_WIDTH = 32;
const COLLAPSED_BOTTOM_DOCK_HEIGHT = 30;
const TOOL_COLORS: Record<EditorTool, string> = {
  select: "#38bdf8",
  paint: "#38bdf8",
  add: "#10b981",
  erase: "#ef4444",
  raise: "#10b981",
  lower: "#f97316",
  flatten: "#f59e0b",
  fill: "#14b8a6",
  clear: "#ef4444",
  path: "#817d68",
  removePath: "#64748b",
  zone: "#eab308",
  removeZone: "#facc15",
  marker: "#a855f7",
  entity: "#22c55e",
  navigation: "#60a5fa",
  waterSource: "#22d3ee",
  waterRemove: "#f97316",
  waterInspect: "#67e8f9",
};

const DEFAULT_EDITOR_LAYERS: EditorLayerState[] = [
  { id: "terrain", label: "Terrain", visible: true, locked: false },
  { id: "paths", label: "Paths", visible: true, locked: false },
  { id: "zones", label: "Zones", visible: true, locked: false },
  { id: "entities", label: "Entities", visible: true, locked: false },
  { id: "markers", label: "Markers", visible: true, locked: false },
  { id: "navigation", label: "Navigation", visible: true, locked: false },
  { id: "spawnPoints", label: "Spawn points", visible: true, locked: false },
  { id: "cameraPresets", label: "Camera presets", visible: true, locked: false },
  { id: "developmentHelpers", label: "Development helpers", visible: true, locked: false },
];

type MetricsSnapshot = {
  fps: number;
  frameMs: number;
  medianFrameMs: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  logicalCells: number;
  airCells: number;
  nonAirBlocks: number;
  chunks: number;
  instances: number;
  animatedInstances: number;
  staticTerrainInstances: number;
  surfaceQuads: number;
  surfaceTriangles: number;
  visibleChunks: number;
  culledChunks: number;
  chunkCapacity: number;
  dirtyChunks: number;
  lastRebuiltChunks: string;
  lastChunkRebuildMs: number;
  surfaceBuildMs: number;
  renderMode: TerrainRenderMode;
  blockEditCount: number;
  zoneAssignmentCount: number;
  entityAnchorCount: number;
  undoDepth: number;
  redoDepth: number;
};

type TerrainRenderMode = "instanced" | "surface";

export type BenchmarkCameraTransform = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
};

export type PortfolioBenchmarkBridge = {
  getReadyState: () => {
    phase: ExperiencePhase;
    mapId: string;
    mapName: string;
    mapRevision: string | null;
    terrainReady: boolean;
    shaderWarm: boolean;
    metricsReady: boolean;
  };
  loadMap: (mapId: string) => boolean;
  enterLoadedMap: () => void;
  prepareReveal: () => void;
  startReveal: () => void;
  setCamera: (transform: BenchmarkCameraTransform) => void;
  resetCamera: () => void;
  setInputEnabled: (enabled: boolean) => void;
  setDpr: (dpr: number | null) => void;
  getWorldMetrics: () => {
    mapDimensions: { x: number; y: number; z: number };
    logicalCells: number;
    solidBlocks: number;
    airCells: number;
    visibleFaces: number;
    renderedTerrainVertices: number;
    renderedTerrainTriangles: number;
    activeChunks: number;
    dirtyChunks: number;
    staticPrefabCount: number;
    dynamicPrefabCount: number;
    interactiveObjectCount: number;
    visibleObjectCount: number;
    chunkRebuildCount: number | null;
    staticBatchRebuildCount: number | null;
  };
};

declare global {
  interface Window {
    __portfolioExperienceMetrics?: MetricsSnapshot & {
      phase: ExperiencePhase;
    };
    __portfolioBenchmarkBridge?: PortfolioBenchmarkBridge;
  }
}

type TerrainUniforms = {
  uExpansionProgress: { value: number };
  uTime: { value: number };
  uLoaderMotion: { value: number };
};

const LOADER_ORIGIN_WORLD = new THREE.Vector3(0, 0, 0);

const BLOCK_VERTEX_SHADER = `
  uniform float uExpansionProgress;
  uniform float uTime;
  uniform float uLoaderMotion;

  attribute vec3 aRevealData;
  attribute vec3 aBlockColor;

  varying vec3 vNormal;
  varying float vReveal;
  varying float vVariation;
  varying vec3 vBlockColor;

  float easeOutBack(float x) {
    float c1 = 1.2;
    float c3 = c1 + 1.0;
    return 1.0 + c3 * pow(x - 1.0, 3.0) + c1 * pow(x - 1.0, 2.0);
  }

  void main() {
    float delay = aRevealData.r;
    float variation = aRevealData.g;
    float centerBlock = step(0.5, aRevealData.b);
    float revealWindow = 0.22;
    float reveal = centerBlock > 0.5
      ? 1.0
      : clamp((uExpansionProgress - delay) / revealWindow, 0.0, 1.0);
    float easedReveal = clamp(easeOutBack(reveal), 0.0, 1.08);
    float visibleScale = max(easedReveal, 0.001);

    vec3 transformedPosition = position;
    transformedPosition.xz *= visibleScale;
    transformedPosition.y = transformedPosition.y * visibleScale - (1.0 - easedReveal) * 5.0;

    float loaderWave = sin(uTime * 2.3 + variation * 6.28318) * 0.13 * uLoaderMotion * centerBlock;
    transformedPosition.y += loaderWave;

    vec4 worldPosition = instanceMatrix * vec4(transformedPosition, 1.0);

    vNormal = normalize(normalMatrix * normal);
    vReveal = reveal;
    vVariation = variation;
    vBlockColor = aBlockColor;

    gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
  }
`;

const BLOCK_FRAGMENT_SHADER = `
  varying vec3 vNormal;
  varying float vReveal;
  varying float vVariation;
  varying vec3 vBlockColor;

  void main() {
    vec3 base = vBlockColor;
    vec3 lightDirection = normalize(vec3(0.35, 0.8, 0.42));
    float light = clamp(dot(normalize(vNormal), lightDirection), 0.0, 1.0);
    vec3 color = base * (0.48 + light * 0.52);
    color += vec3(0.035, 0.028, 0.018) * smoothstep(0.0, 1.0, vReveal);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const SURFACE_VERTEX_SHADER = `
  uniform float uExpansionProgress;
  uniform float uTime;
  uniform float uLoaderMotion;

  attribute vec3 color;
  attribute float aVariation;
  attribute float aRevealDelay;
  attribute vec3 aCellOrigin;
  attribute float aCenterFlag;

  varying vec3 vNormal;
  varying vec3 vBlockColor;
  varying float vVariation;

  float easeOutBack(float x) {
    float c1 = 1.2;
    float c3 = c1 + 1.0;
    return 1.0 + c3 * pow(x - 1.0, 3.0) + c1 * pow(x - 1.0, 2.0);
  }

  void main() {
    float revealWindow = 0.22;
    float reveal = aCenterFlag > 0.5
      ? 1.0
      : clamp((uExpansionProgress - aRevealDelay) / revealWindow, 0.0, 1.0);
    float easedReveal = clamp(easeOutBack(reveal), 0.0, 1.08);

    // Grow each cell's real (shape-accurate) geometry outward from that
    // cell's own center rather than faking the reveal with a placeholder
    // cube — this is the same technique the instanced reveal path uses,
    // just applied in world space to a merged, per-shape mesh instead of
    // per-instance local space.
    vec3 grownPosition = mix(aCellOrigin, position, easedReveal);
    grownPosition.y -= (1.0 - easedReveal) * 5.0;

    float loaderWave = sin(uTime * 2.3 + aVariation * 6.28318) * 0.13 * uLoaderMotion * aCenterFlag;
    grownPosition.y += loaderWave;

    vNormal = normalize(normalMatrix * normal);
    vBlockColor = color;
    vVariation = aVariation;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(grownPosition, 1.0);
  }
`;

const SURFACE_FRAGMENT_SHADER = `
  varying vec3 vNormal;
  varying vec3 vBlockColor;
  varying float vVariation;

  void main() {
    vec3 base = vBlockColor;
    vec3 lightDirection = normalize(vec3(0.35, 0.8, 0.42));
    float light = clamp(dot(normalize(vNormal), lightDirection), 0.0, 1.0);
    vec3 color = base * (0.48 + light * 0.52);
    color += vec3(0.035, 0.028, 0.018);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export default function PortfolioExperience({
  initialMapId = DEFAULT_AUTHORED_MAP_ID,
  benchmarkMode = false,
}: {
  initialMapId?: string;
  benchmarkMode?: boolean;
}) {
  const [webglState, setWebglState] = useState<"checking" | "available" | "unavailable">("checking");
  const [metrics, setMetrics] = useState<(MetricsSnapshot & { phase: ExperiencePhase }) | null>(null);
  const [editorRequested, setEditorRequested] = useState(false);
  const [editorPanel, setEditorPanel] = useState<MapEditorToolbarProps | null>(null);
  const [editorLayout, setEditorLayout] = useState<EditorViewportLayoutState>(DEFAULT_VIEWPORT_LAYOUT);
  const [mapUi, setMapUi] = useState<MapUiState | null>(null);
  const phase = useExperienceStore((state) => state.phase);
  const editorEnabled =
    !benchmarkMode &&
    (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_MAP_EDITOR === "true") &&
    editorRequested;
  const editorActive = editorEnabled && phase === "explore";
  const canOpenEditor =
    (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_MAP_EDITOR === "true") &&
    phase === "explore" &&
    !editorRequested;
  const effectiveEditorLayout = getEffectiveViewportLayout(editorActive ? editorLayout : DEFAULT_VIEWPORT_LAYOUT);

  useLayoutEffect(() => {
    useExperienceStore.getState().reset();
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      setWebglState(gl ? "available" : "unavailable");
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ENABLE_MAP_EDITOR !== "true") {
      return;
    }

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const editorParam = params.get("editor");
      setEditorRequested(
        editorParam === "1" ||
        editorParam === "true" ||
        process.env.NEXT_PUBLIC_ENABLE_MAP_EDITOR === "true",
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (editorActive) {
      return;
    }

    const timer = window.setInterval(() => {
      if (window.__portfolioExperienceMetrics) {
        incrementEditorPerfCounter("reactMetricUpdates");
        setMetrics(window.__portfolioExperienceMetrics);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [editorActive]);

  return (
    <section
      className={`experience-shell ${editorActive ? "experience-shell--editor" : ""} ${effectiveEditorLayout.cleanPreview ? "experience-shell--clean-preview" : ""} ${effectiveEditorLayout.maximizedViewport ? "experience-shell--viewport-maximized" : ""}`}
      data-phase={phase}
      aria-label="Interactive portfolio map proof of concept"
      style={editorActive ? {
        "--editor-left-width": `${effectiveEditorLayout.leftWidth}px`,
        "--editor-right-width": `${effectiveEditorLayout.rightWidth}px`,
        "--editor-bottom-height": `${effectiveEditorLayout.bottomHeight}px`,
        "--editor-outliner-height": `${effectiveEditorLayout.outlinerHeight}px`,
      } as React.CSSProperties : undefined}
    >
      {webglState === "unavailable" ? (
        <div className="webgl-error" role="status">
          <h1>3D map unavailable</h1>
          <p>Your browser could not initialize WebGL. The portfolio map needs WebGL support for this proof of concept.</p>
        </div>
      ) : null}

      {webglState === "available" ? (
        <>
          <div className="map-canvas-layer">
            <Canvas
              camera={{ position: [-18, 20, 54], fov: 32, near: 0.1, far: 220 }}
              dpr={[1, 1.5]}
              flat
              gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
              onCreated={({ gl }) => {
                incrementEditorPerfCounter("canvasMounts");
                const originalSetSize = gl.setSize.bind(gl);
                gl.setSize = ((width: number, height: number, updateStyle?: boolean) => {
                  incrementEditorPerfCounter("rendererSetSizeCalls");
                  return originalSetSize(width, height, updateStyle);
                }) as typeof gl.setSize;
                gl.setClearColor("#edf1ed");
              }}
            >
              <ExperienceScene
                initialMapId={initialMapId}
                editorEnabled={editorEnabled}
                editorMinZoomDistance={effectiveEditorLayout.editorMinZoomDistance}
                benchmarkMode={benchmarkMode}
                onEditorStateChange={setEditorPanel}
                onMapUiStateChange={setMapUi}
                onCloseEditor={() => setEditorRequested(false)}
              />
            </Canvas>
          </div>
          {benchmarkMode ? null : <ExperienceOverlay phase={phase} showEditorCompass={editorActive} />}
          {metrics && !editorActive ? (
            process.env.NODE_ENV === "production" ? (
              <ProductionFpsBadge metrics={metrics} />
            ) : (
              <FixedDiagnostics metrics={metrics} />
            )
          ) : null}
          {editorActive && editorPanel ? <MapEditorToolbar {...editorPanel} onLayoutChange={setEditorLayout} /> : null}
          {canOpenEditor ? (
            <button
              className="map-editor-reopen"
              type="button"
              onClick={() => setEditorRequested(true)}
            >
              Editor
            </button>
          ) : null}
          {mapUi && !editorActive && !benchmarkMode ? <MapBrowserOverlay state={mapUi} /> : null}
        </>
      ) : (
        <div className="experience-fallback">
          <LoadingProgressPanel phase="boot" />
        </div>
      )}
    </section>
  );
}

type MapUiState = {
  browsing: BrowsingState;
  map: MapDefinition;
  zoneAssignmentCounts: Map<number, number>;
  hoveredZoneId: string | null;
  selectedMarkerId: string | null;
  zoneFocusDirection: MapZoneFocusDirection;
  onZoneFocusDirectionChange: (direction: MapZoneFocusDirection) => void;
  onSelectZone: (zoneId: string) => void;
  onFocusZone: () => void;
  onReturnOverview: () => void;
  onOpenContent: () => void;
  onCloseContent: () => void;
};

const ZONE_FOCUS_DIRECTIONS: Array<{ id: MapZoneFocusDirection; label: string }> = [
  { id: "north", label: "North" },
  { id: "south", label: "South" },
  { id: "east", label: "East" },
  { id: "west", label: "West" },
  { id: "northeast", label: "North East" },
  { id: "northwest", label: "North West" },
  { id: "southeast", label: "South East" },
  { id: "southwest", label: "South West" },
];

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

function ExperienceOverlay({ phase, showEditorCompass }: { phase: ExperiencePhase; showEditorCompass: boolean }) {
  const resetView = useExperienceStore((state) => state.resetView);
  const isAngleLocked = useExperienceStore((state) => state.isAngleLocked);
  const toggleAngleLock = useExperienceStore((state) => state.toggleAngleLock);
  const showLoadingProgress = phase === "boot" || phase === "loading";

  return (
    <div className="experience-overlay">
      <header className="overlay-header">
        <div className="overlay-actions">
          {phase === "explore" ? (
            <>
              {showEditorCompass ? <ViewportCompass /> : null}
              <button
                className="overlay-icon-button"
                type="button"
                onClick={toggleAngleLock}
                aria-label={isAngleLocked ? "Unlock camera angle" : "Lock camera angle"}
                title={isAngleLocked ? "Unlock camera angle" : "Lock camera angle"}
              >
                {isAngleLocked ? <UnlockKeyhole aria-hidden="true" size={16} /> : <LockKeyhole aria-hidden="true" size={16} />}
              </button>
              <button
                className="overlay-icon-button"
                type="button"
                onClick={resetView}
                aria-label="Reset view"
                title="Reset view"
              >
                <RotateCcw aria-hidden="true" size={16} />
              </button>
            </>
          ) : null}
        </div>
      </header>

      {showLoadingProgress ? <LoadingProgressPanel phase={phase} /> : null}
      {phase === "ready" ? <WelcomePanel /> : null}
    </div>
  );
}

function LoadingProgressPanel({ phase }: { phase: ExperiencePhase }) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAt);
    }, 80);

    return () => window.clearInterval(timer);
  }, [phase]);

  const status = getLoadingProgressStatus(phase, elapsedMs);

  return (
    <p className="loading-progress-text" aria-live="polite" aria-label="Map loading progress">
      {status.label} {status.percent}%
    </p>
  );
}

function ViewportCompass() {
  const heading = useExperienceStore((state) => state.cameraHeadingRadians);
  const snapCompassDirection = useExperienceStore((state) => state.snapCompassDirection);
  const direction = getCompassDirectionLabel(heading);

  return (
    <div className="viewport-compass" aria-label={`Camera facing ${direction}`}>
      <div className="viewport-compass__face" aria-hidden="true">
        <Compass size={14} />
        <span className="viewport-compass__needle" style={{ transform: `rotate(${heading}rad)` }} />
        <strong>{direction}</strong>
      </div>
      <div className="viewport-compass__buttons" aria-label="Snap camera direction">
        {COMPASS_DIRECTIONS.map((item) => (
          <button
            key={item.id}
            data-direction={item.id}
            type="button"
            onClick={() => snapCompassDirection(item.id)}
            title={`Face ${item.label}`}
            aria-label={`Face ${item.label}`}
          >
            {item.shortLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function WelcomePanel() {
  const panelRef = useRef<HTMLElement>(null);
  const kickerRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const context = gsap.context(() => {
      gsap.fromTo(
        panelRef.current,
        { autoAlpha: 0, y: 28 },
        { autoAlpha: 1, y: 0, duration: 0.75, ease: "power3.out" },
      );
      gsap.fromTo(
        [kickerRef.current, titleRef.current],
        { autoAlpha: 0, y: 18 },
        { autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.08, delay: 0.12 },
      );
    }, panelRef);

    return () => context.revert();
  }, []);

  return (
    <main ref={panelRef} className="welcome-panel" aria-label="Portfolio welcome">
      <p ref={kickerRef}>Welcome</p>
      <h1 ref={titleRef}>Michał Stępień</h1>
    </main>
  );
}

function ProductionFpsBadge({ metrics }: { metrics: MetricsSnapshot & { phase: ExperiencePhase } }) {
  return (
    <aside className="fps-badge" aria-label="Rendering performance">
      <span>FPS</span>
      <strong>{metrics.fps}</strong>
      <span>{metrics.medianFrameMs}ms</span>
    </aside>
  );
}

function getEffectiveViewportLayout(layout: EditorViewportLayoutState): EditorViewportLayoutState {
  const hideSideDocks = layout.cleanPreview || layout.maximizedViewport;
  return {
    ...layout,
    leftWidth: hideSideDocks ? 0 : layout.leftCollapsed ? COLLAPSED_SIDE_DOCK_WIDTH : layout.leftWidth,
    rightWidth: hideSideDocks ? 0 : layout.rightCollapsed ? COLLAPSED_SIDE_DOCK_WIDTH : layout.rightWidth,
    bottomHeight: layout.cleanPreview || layout.maximizedViewport ? 0 : layout.bottomCollapsed ? COLLAPSED_BOTTOM_DOCK_HEIGHT : layout.bottomHeight,
    editorMinZoomDistance: THREE.MathUtils.clamp(layout.editorMinZoomDistance, EDITOR_MIN_ZOOM_DISTANCE_FLOOR, 22),
  };
}

function FixedDiagnostics({ metrics }: { metrics: MetricsSnapshot & { phase: ExperiencePhase } }) {
  const [minimized, setMinimized] = useState(true);
  const panSpeed = useExperienceStore((state) => state.panSpeed);
  const rotateSpeed = useExperienceStore((state) => state.rotateSpeed);
  const dampingFactor = useExperienceStore((state) => state.dampingFactor);
  const isAngleLocked = useExperienceStore((state) => state.isAngleLocked);
  const setPanSpeed = useExperienceStore((state) => state.setPanSpeed);
  const setRotateSpeed = useExperienceStore((state) => state.setRotateSpeed);
  const setDampingFactor = useExperienceStore((state) => state.setDampingFactor);
  const toggleAngleLock = useExperienceStore((state) => state.toggleAngleLock);

  if (minimized) {
    return (
      <aside className="dev-metrics-panel dev-metrics-panel--mini" aria-label="Development rendering metrics">
        <button className="metrics-mini-button" type="button" onClick={() => setMinimized(false)}>
          <span>FPS</span>
          <strong>{metrics.fps}</strong>
        </button>
      </aside>
    );
  }

  return (
    <aside className="dev-metrics-panel" aria-label="Development rendering metrics">
      <div className="metrics-header">
        <div>
          <strong>Dev Metrics</strong>
          <span>{metrics.phase}</span>
        </div>
        <button type="button" onClick={() => setMinimized(true)} aria-label="Minimize diagnostics">
          -
        </button>
      </div>

      <dl className="metrics-grid">
        <div><dt>FPS</dt><dd>{metrics.fps}</dd></div>
        <div><dt>Avg frame</dt><dd>{metrics.frameMs}ms</dd></div>
        <div><dt>Median</dt><dd>{metrics.medianFrameMs}ms</dd></div>
        <div><dt>Mode</dt><dd>{metrics.renderMode}</dd></div>
        <div><dt>Draws</dt><dd>{metrics.calls}</dd></div>
        <div><dt>Tris</dt><dd>{metrics.triangles}</dd></div>
        <div><dt>Geoms</dt><dd>{metrics.geometries}</dd></div>
        <div><dt>Tex</dt><dd>{metrics.textures}</dd></div>
        <div><dt>Logical</dt><dd>{metrics.logicalCells}</dd></div>
        <div><dt>Air</dt><dd>{metrics.airCells}</dd></div>
        <div><dt>Solid</dt><dd>{metrics.nonAirBlocks}</dd></div>
        <div><dt>Chunks</dt><dd>{metrics.chunks}</dd></div>
        <div><dt>Visible chunks</dt><dd>{metrics.visibleChunks}</dd></div>
        <div><dt>Culled chunks</dt><dd>{metrics.culledChunks}</dd></div>
        <div><dt>Surface quads</dt><dd>{metrics.surfaceQuads}</dd></div>
        <div><dt>Surface tris</dt><dd>{metrics.surfaceTriangles}</dd></div>
        <div><dt>Capacity</dt><dd>{metrics.chunkCapacity}</dd></div>
        <div><dt>Dirty</dt><dd>{metrics.dirtyChunks}</dd></div>
        <div><dt>Edits</dt><dd>{metrics.blockEditCount}</dd></div>
        <div><dt>Zones</dt><dd>{metrics.zoneAssignmentCount}</dd></div>
        <div><dt>Markers</dt><dd>{metrics.entityAnchorCount}</dd></div>
        <div><dt>Undo</dt><dd>{metrics.undoDepth}</dd></div>
        <div><dt>Redo</dt><dd>{metrics.redoDepth}</dd></div>
        <div className="metrics-wide"><dt>Animated instances</dt><dd>{metrics.animatedInstances}</dd></div>
        <div className="metrics-wide"><dt>Static instances</dt><dd>{metrics.staticTerrainInstances}</dd></div>
        <div className="metrics-wide"><dt>Instances</dt><dd>{metrics.instances} / {metrics.chunks} chunks</dd></div>
        <div className="metrics-wide"><dt>Last rebuilt</dt><dd>{metrics.lastRebuiltChunks || "-"}</dd></div>
        <div className="metrics-wide"><dt>Rebuild time</dt><dd>{metrics.lastChunkRebuildMs}ms</dd></div>
        <div className="metrics-wide"><dt>Surface build</dt><dd>{metrics.surfaceBuildMs}ms</dd></div>
      </dl>

      <div className="metrics-controls">
        <label>
          <span>Pan sensitivity <strong>{panSpeed.toFixed(1)}x</strong></span>
          <input type="range" min="0.2" max="3" step="0.1" value={panSpeed} onChange={(event) => setPanSpeed(Number(event.target.value))} />
        </label>
        <label>
          <span>Rotate sensitivity <strong>{rotateSpeed.toFixed(1)}x</strong></span>
          <input type="range" min="0.2" max="3" step="0.1" value={rotateSpeed} onChange={(event) => setRotateSpeed(Number(event.target.value))} />
        </label>
        <label>
          <span>Damping <strong>{dampingFactor.toFixed(2)}</strong></span>
          <input type="range" min="0.05" max="0.5" step="0.01" value={dampingFactor} onChange={(event) => setDampingFactor(Number(event.target.value))} />
        </label>
        <button className="metrics-toggle" type="button" onClick={toggleAngleLock}>
          {isAngleLocked ? "Angle locked" : "Lock ground angle"}
        </button>
      </div>
    </aside>
  );
}

function MapBrowserOverlay({ state }: { state: MapUiState }) {
  const visibleZones = [...state.map.zones]
    .filter((zone) => zone.visibleInLegend && (state.zoneAssignmentCounts.get(zone.numericId) ?? 0) > 0)
    .sort((left, right) => left.displayOrder - right.displayOrder);
  const selectedZoneId = "zoneId" in state.browsing ? state.browsing.zoneId : null;
  const selectedMarker = state.selectedMarkerId
    ? state.map.markers.find((marker) => marker.id === state.selectedMarkerId) ?? null
    : null;
  const selectedZone = selectedZoneId ? visibleZones.find((zone) => zone.id === selectedZoneId) ?? null : null;
  const content = selectedMarker?.contentReference
    ? resolveContentReference(selectedMarker.contentReference.contentType, selectedMarker.contentReference.contentId, PORTFOLIO_CONTENT)
    : null;

  return (
    <div className="map-browser-ui" aria-label="Portfolio map browser">
      {state.map.presentation.legendVisible && visibleZones.length > 0 ? (
        <aside className="map-legend" aria-label={`${state.map.name} legend`}>
          <strong>{state.map.name}</strong>
          <div role="list">
            {visibleZones.map((zone) => {
              const selected = selectedZoneId === zone.id;
              const hovered = state.hoveredZoneId === zone.id;
              return (
                <button
                  key={zone.id}
                  type="button"
                  className={selected ? "selected" : hovered ? "hovered" : ""}
                  onClick={() => state.onSelectZone(zone.id)}
                >
                  <span style={{ backgroundColor: zone.color }} aria-hidden="true" />
                  <span>{zone.label}</span>
                </button>
              );
            })}
          </div>
        </aside>
      ) : null}

      {selectedZone || selectedMarker ? (
        <aside className="map-context-panel" aria-label="Selected map context">
          <button type="button" onClick={state.onReturnOverview} aria-label="Return to overview">Back</button>
          <h2>{selectedMarker?.label ?? selectedZone?.label}</h2>
          <p>{selectedMarker ? getMarkerDescription(selectedMarker) : selectedZone?.description}</p>
          <div>
            {selectedZone ? (
              <label className="map-context-direction">
                <span>View</span>
                <select value={state.zoneFocusDirection} onChange={(event) => state.onZoneFocusDirectionChange(event.target.value as MapZoneFocusDirection)}>
                  {ZONE_FOCUS_DIRECTIONS.map((direction) => (
                    <option key={direction.id} value={direction.id}>{direction.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {selectedZone ? <button type="button" onClick={state.onFocusZone}>Focus</button> : null}
            {selectedMarker?.contentReference ? <button type="button" onClick={state.onOpenContent}>Open</button> : null}
          </div>
        </aside>
      ) : null}

      {state.browsing.mode === "contentOpen" && content ? (
        <section className="map-content-panel" role="dialog" aria-modal="false" aria-label="Portfolio content">
          <button type="button" onClick={state.onCloseContent} aria-label="Close content">Close</button>
          {renderPortfolioContent(content)}
        </section>
      ) : null}
    </div>
  );
}

function getMarkerDescription(marker: MapMarkerDefinition) {
  return marker.contentReference
    ? `${marker.contentReference.contentType}: ${marker.contentReference.contentId}`
    : "Map point of interest.";
}

function getLoadingProgressStatus(phase: ExperiencePhase, elapsedMs: number) {
  if (phase === "boot") {
    return { label: "Starting renderer", percent: 4 };
  }

  if (phase === "loading") {
    const progress = THREE.MathUtils.clamp(elapsedMs / 900, 0, 1);
    const percent = Math.round(8 + progress * 84);
    const label = percent < 28
      ? "Creating terrain chunks"
      : percent < 52
        ? "Preparing block buffers"
        : percent < 76
          ? "Building visible surfaces"
          : "Warming shaders";
    return { label, percent };
  }

  return { label: "Ready", percent: 100 };
}

function renderPortfolioContent(content: NonNullable<ReturnType<typeof resolveContentReference>>) {
  if ("title" in content) {
    return (
      <article>
        <h2>{content.title}</h2>
        <p>{content.shortDescription}</p>
        <p>{content.longDescription}</p>
        <dl>
          <dt>Technologies</dt>
          <dd>{content.technologies.join(", ")}</dd>
        </dl>
      </article>
    );
  }
  if ("company" in content) {
    return (
      <article>
        <h2>{content.position}</h2>
        <p>{content.company}</p>
        <p>{content.dateRange}</p>
        <p>{content.description}</p>
      </article>
    );
  }
  if ("shortIntroduction" in content) {
    return (
      <article>
        <h2>About</h2>
        <p>{content.shortIntroduction}</p>
        <p>{content.biography}</p>
        <p>{content.currentFocus}</p>
        <p>{content.workingApproach}</p>
      </article>
    );
  }
  if ("skills" in content) {
    return (
      <article>
        <h2>{content.label}</h2>
        <ul>
          {content.skills.map((skill) => <li key={skill}>{skill}</li>)}
        </ul>
      </article>
    );
  }

  return (
    <article>
      <h2>Contact</h2>
      <p>{content.email}</p>
      {content.availability ? <p>{content.availability}</p> : null}
    </article>
  );
}

function createInitialExperienceMapState(mapId: string) {
  try {
    const loadedMap = loadMapStateSync(mapId, { includeDevelopment: process.env.NODE_ENV !== "production" });
    return {
      loadedMap,
      terrain: createTerrainDataFromWorld(loadedMap.world),
      error: null,
    };
  } catch (error) {
    const loadedMap = loadMapStateSync(DEFAULT_AUTHORED_MAP_ID, { includeDevelopment: process.env.NODE_ENV !== "production" });
    return {
      loadedMap,
      terrain: createTerrainDataFromWorld(loadedMap.world),
      error: error instanceof Error ? error.message : `Unknown map id: ${mapId}.`,
    };
  }
}

function ExperienceScene({
  initialMapId,
  editorEnabled,
  editorMinZoomDistance,
  benchmarkMode,
  onEditorStateChange,
  onMapUiStateChange,
  onCloseEditor,
}: {
  initialMapId: string;
  editorEnabled: boolean;
  editorMinZoomDistance: number;
  benchmarkMode: boolean;
  onEditorStateChange: (state: MapEditorToolbarProps | null) => void;
  onMapUiStateChange: (state: MapUiState | null) => void;
  onCloseEditor: () => void;
}) {
  const initialState = useMemo(() => createInitialExperienceMapState(initialMapId), [initialMapId]);
  const [currentMap, setCurrentMap] = useState<MapDefinition>(() => editorEnabled ? ensureEditableZones(initialState.loadedMap.definition) : initialState.loadedMap.definition);
  const mapHistoryRef = useRef<{ undo: MapDefinition[]; redo: MapDefinition[] }>({ undo: [], redo: [] });
  const [terrain, setTerrain] = useState(initialState.terrain);
  const [zoneOverlay, setZoneOverlay] = useState(() => buildZoneOverlayMeshes(initialState.loadedMap.world));
  const [editorSession, setEditorSession] = useState(() => new MapEditorSession(initialState.loadedMap.world, initialState.loadedMap.entities, initialState.loadedMap.definition.fluids.settings));
  const [tool, setTool] = useState<EditorTool>("select");
  const [paintBlockId, setPaintBlockId] = useState<BlockId>(BLOCK_IDS.Ground);
  const [applyMaterialToAddedBlocks, setApplyMaterialToAddedBlocks] = useState(false);
  const [activeShapeCategory, setActiveShapeCategory] = useState<ShapeCategory>("terrain");
  const [activeShapeId, setActiveShapeId] = useState<ShapeId>(SHAPE_IDS.CUBE);
  const [activeRotation, setActiveRotation] = useState<CellRotation>(DEFAULT_ROTATION);
  const [activeShapeState, setActiveShapeState] = useState(DEFAULT_STATE);
  const [presetId, setPresetId] = useState<MapPresetId>("portfolioCampus");
  const [renderMode, setRenderMode] = useState<TerrainRenderMode>("surface");
  const [zoneId, setZoneId] = useState(0);
  const [zoneEditMode, setZoneEditMode] = useState<ZoneEditMode>("paint");
  const [zoneSelectionMode, setZoneSelectionMode] = useState<ZoneSelectionMode>("brush");
  const [zoneFocusDirection, setZoneFocusDirection] = useState<MapZoneFocusDirection>("south");
  const [activeMapId, setActiveMapId] = useState(initialState.loadedMap.definition.id);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [browsing, dispatchBrowsing] = useReducer(reduceBrowsingState, initialState.loadedMap.definition.id, createBrowsingState);
  const [hoveredCell, setHoveredCell] = useState<GridCoordinate | null>(null);
  const [zoneRectangleAnchor, setZoneRectangleAnchor] = useState<GridCoordinate | null>(null);
  const [selectedCell, setSelectedCell] = useState<GridCoordinate | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [brushSettingsByTool, setBrushSettingsByTool] = useState<Partial<Record<EditorTool, TerrainBrushSettings>>>(() => createDefaultToolBrushSettings());
  const [primitiveType, setPrimitiveType] = useState<PrimitiveType>("box");
  // Starts unarmed (no prefab loaded) so the Place tool never places
  // something the user never picked. See handleToolChange for how it stays
  // unarmed whenever the Place tool isn't active.
  const [activePrefabId, setActivePrefabId] = useState("");
  const [activePrefabVariantId, setActivePrefabVariantId] = useState("");
  const [prefabSearch, setPrefabSearch] = useState("");
  const [entityTransformMode, setEntityTransformMode] = useState<EntityTransformMode>("translate");
  const [entityTransformDragging, setEntityTransformDragging] = useState(false);
  const [entityPopPreviewCount, setEntityPopPreviewCount] = useState(0);
  const [entityPopAnimationId, setEntityPopAnimationId] = useState<string | null>(null);
  const [collisionMode, setCollisionMode] = useState<CollisionMode>("blocking");
  const [entityColor, setEntityColor] = useState("#9ca3af");
  const [entityName, setEntityName] = useState("Placeholder");
  const [navigationNodeType, setNavigationNodeType] = useState<NavigationNodeType>("walk");
  const [viewPreferences] = useState<EditorViewPreferences>(() => (
    typeof window === "undefined" ? DEFAULT_EDITOR_VIEW_PREFERENCES : loadEditorViewPreferences(window.localStorage)
  ));
  const [layerStates, setLayerStates] = useState<EditorLayerState[]>(() => applyPersistedLayerStates(DEFAULT_EDITOR_LAYERS, viewPreferences));
  const [cleanPreview, setCleanPreview] = useState(false);
  const [zoneNeutralTerrain, setZoneNeutralTerrain] = useState(viewPreferences.zoneNeutralTerrain);
  const [zoneNeutralTerrainColor, setZoneNeutralTerrainColor] = useState(viewPreferences.zoneNeutralTerrainColor);
  const [zoneGridLinesVisible, setZoneGridLinesVisible] = useState(viewPreferences.zoneGridLinesVisible);
  const [zoneGridLineColor, setZoneGridLineColor] = useState(viewPreferences.zoneGridLineColor);
  const [mapBackgroundColor, setMapBackgroundColor] = useState(viewPreferences.mapBackgroundColor);
  useEffect(() => {
    if (typeof window === "undefined") return;
    saveEditorViewPreferences(window.localStorage, {
      version: 1,
      zoneNeutralTerrain,
      zoneNeutralTerrainColor,
      zoneGridLinesVisible,
      zoneGridLineColor,
      mapBackgroundColor,
      ...collectLayerPreferences(layerStates),
    });
  }, [zoneNeutralTerrain, zoneNeutralTerrainColor, zoneGridLinesVisible, zoneGridLineColor, mapBackgroundColor, layerStates]);
  const [validationSummary, setValidationSummary] = useState<string[]>([]);
  const [editorMessage, setEditorMessage] = useState<EditorMessage | null>(
    initialState.error ? { type: "error", text: initialState.error } : null,
  );
  const [lastRebuiltChunks, setLastRebuiltChunks] = useState<string[]>([]);
  const [lastChunkRebuildMs, setLastChunkRebuildMs] = useState(0);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [editorRevision, setEditorRevision] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState("local idle");
  const uniforms = useMemo<TerrainUniforms>(
    () => ({
      uExpansionProgress: { value: 0 },
      uTime: { value: 0 },
      uLoaderMotion: { value: 1 },
    }),
    [],
  );
  const phase = useExperienceStore((state) => state.phase);
  const markLoading = useExperienceStore((state) => state.markLoading);
  const markReady = useExperienceStore((state) => state.markReady);
  const startExpansion = useExperienceStore((state) => state.startExpansion);
  const markExpanding = useExperienceStore((state) => state.markExpanding);
  const markExplore = useExperienceStore((state) => state.markExplore);
  const reducedMotion = usePrefersReducedMotion();
  const { gl, scene, camera } = useThree();
  const initializedRef = useRef(false);
  const originalPixelRatioRef = useRef<number | null>(null);
  const [benchmarkInputEnabled, setBenchmarkInputEnabled] = useState(false);
  const editorAvailable = editorEnabled && phase === "explore";
  const lastEditorPanelSignature = useRef<string | null>(null);
  // Previously forced "instanced" (a single shared cube geometry, ignoring
  // each cell's real shape) for every phase except "explore", so the reveal
  // animation showed every non-cube shape as a plain box until it "snapped"
  // to the correct geometry the instant explore began. The surface-mesh
  // path now carries its own per-vertex reveal animation (see
  // SURFACE_VERTEX_SHADER), so the user's actual render-mode choice can be
  // honored throughout every phase instead.
  const activeRenderMode: TerrainRenderMode = renderMode;
  const editorZoneBrowsing = useMemo<BrowsingState>(() => {
    const activeZone = currentMap.zones.find((zone) => zone.numericId === zoneId);
    return activeZone ? { mode: "zoneSelected", mapId: currentMap.id, zoneId: activeZone.id } : createBrowsingState(currentMap.id);
  }, [currentMap.id, currentMap.zones, zoneId]);
  const dynamicStats = editorSession.world.getStats();
  const snapshot = editorSession.getSnapshot();
  const zoneAssignmentCounts = useMemo(
    () => countZoneAssignments(editorSession.world),
    [editorSession.world, snapshot.zoneAssignmentCount],
  );
  const selectedWorldPosition = selectedCell
    ? editorSession.world.gridToWorld(selectedCell.x, selectedCell.y, selectedCell.z)
    : null;
  const selectedChunk = selectedCell ? editorSession.world.getChunkCoordinates(selectedCell.x, selectedCell.z) : null;
  const selectedLocal = selectedCell ? editorSession.world.getLocalChunkCoordinates(selectedCell.x, selectedCell.z) : null;
  const selectedBlockId = selectedCell
    ? editorSession.world.getBlock(selectedCell.x, selectedCell.y, selectedCell.z)
    : null;
  const selectedShapeId = selectedCell
    ? editorSession.world.getShape(selectedCell.x, selectedCell.y, selectedCell.z)
    : null;
  const selectedRotation = selectedCell
    ? editorSession.world.getRotation(selectedCell.x, selectedCell.y, selectedCell.z)
    : null;
  const selectedState = selectedCell
    ? editorSession.world.getState(selectedCell.x, selectedCell.y, selectedCell.z)
    : null;
  const selectedZoneId = selectedCell ? editorSession.world.getZone(selectedCell.x, selectedCell.y, selectedCell.z) : 0;
  const activeZoneDefinition = currentMap.zones.find((zone) => zone.numericId === zoneId) ?? null;
  const selectedEntity = currentMap.entities.find((entity) => selectedEntityIds.includes(entity.id)) ?? null;
  const brushSettings = useMemo(() => getBrushSettingsForTool(tool, brushSettingsByTool), [brushSettingsByTool, tool]);
  const effectiveBrushSettings = useMemo(() => getEffectiveTerrainBrushSettings(tool, brushSettings), [brushSettings, tool]);
  const brushAffectedCellCount = useMemo(
    () => {
      if (tool === "zone") {
        void previewRevision;
        if (!hoveredCell) return 0;
        if (zoneSelectionMode === "rectangle" && zoneRectangleAnchor) {
          return getZoneRectangleFootprint(zoneRectangleAnchor, hoveredCell).length;
        }
        return getZoneBrushFootprint(hoveredCell, effectiveBrushSettings).length;
      }
      if (!getTerrainBrushOperation(tool)) {
        return 0;
      }
      void previewRevision;
      return hoveredCell ? getToolPreviewFootprint(hoveredCell, tool, effectiveBrushSettings, editorSession.world, getTerrainMutationBlockId(tool, getTerrainBrushOperation(tool)!, paintBlockId, activeShapeId, applyMaterialToAddedBlocks), zoneId).length : 0;
    },
    [activeShapeId, applyMaterialToAddedBlocks, editorSession.world, effectiveBrushSettings, hoveredCell, paintBlockId, previewRevision, tool, zoneId, zoneRectangleAnchor, zoneSelectionMode],
  );
  const editorPanelSignature = useMemo(() => JSON.stringify({
    available: editorAvailable,
    mapId: activeMapId,
    mapName: currentMap.name,
    mapDescription: currentMap.description ?? "",
    tool,
    paintBlockId,
    applyMaterialToAddedBlocks,
    activeShapeCategory,
    activeShapeId,
    activeRotation,
    activeShapeState,
    presetId,
    renderMode,
    zoneId,
    zoneEditMode,
    zoneSelectionMode,
    zoneNeutralTerrain,
    zoneNeutralTerrainColor,
    zoneGridLinesVisible,
    zoneGridLineColor,
    mapBackgroundColor,
    zones: currentMap.zones.map((zone) => `${zone.numericId}:${zone.label}:${zone.color}:${zone.visibleInLegend ? 1 : 0}:${zone.overlayVisible ? 1 : 0}:${zone.locked ? 1 : 0}`).join("|"),
    hovered: coordinateKeyOrEmpty(hoveredCell),
    selected: coordinateKeyOrEmpty(selectedCell),
    selectedBlockId,
    selectedShapeId,
    selectedRotation,
    selectedState,
    selectedZoneId,
    selectedMarkerId,
    selectedEntityId: selectedEntity?.id ?? "",
    selectedEntityIds: selectedEntityIds.join(","),
    entityCount: currentMap.entities.length,
    primitiveType,
    activePrefabId,
    activePrefabVariantId,
    prefabSearch,
    collisionMode,
    entityTransformMode,
    entityColor,
    entityName,
    brushSettings,
    brushAffectedCellCount,
    layerStates: layerStates.map((layer) => `${layer.id}:${layer.visible ? 1 : 0}:${layer.locked ? 1 : 0}`).join("|"),
    cleanPreview,
    navigationNodeType,
    navigationNodeCount: currentMap.navigation.nodes.length,
    navigationEdgeCount: currentMap.navigation.edges.length,
    routeCount: currentMap.navigation.routes.length,
    validationSummary: validationSummary.join("|"),
    dirtyChunks: editorSession.world.dirtyChunks.size,
    lastRebuiltChunks: lastRebuiltChunks.join(","),
    snapshot: {
      blockEditCount: snapshot.blockEditCount,
      zoneAssignmentCount: snapshot.zoneAssignmentCount,
      entityAnchorCount: snapshot.entityAnchorCount,
      undoDepth: snapshot.undoDepth,
      redoDepth: snapshot.redoDepth,
      hasUnsavedChanges: snapshot.hasUnsavedChanges,
    },
    autosaveStatus,
    message: editorMessage ? `${editorMessage.type}:${editorMessage.text}` : "",
  }), [
    activeMapId,
    autosaveStatus,
    brushAffectedCellCount,
    brushSettings,
    cleanPreview,
    collisionMode,
    entityTransformMode,
    currentMap.description,
    currentMap.entities.length,
    currentMap.name,
    currentMap.navigation.edges.length,
    currentMap.navigation.nodes.length,
    currentMap.navigation.routes.length,
    editorAvailable,
    editorMessage,
    editorSession.world.dirtyChunks.size,
    entityColor,
    entityName,
    hoveredCell,
    lastRebuiltChunks,
    layerStates,
    navigationNodeType,
    activeRotation,
    activeShapeCategory,
    activeShapeId,
    activeShapeState,
    applyMaterialToAddedBlocks,
    paintBlockId,
    presetId,
    primitiveType,
    activePrefabId,
    activePrefabVariantId,
    prefabSearch,
    renderMode,
    selectedBlockId,
    selectedCell,
    selectedRotation,
    selectedShapeId,
    selectedState,
    selectedEntity?.id,
    selectedEntityIds,
    selectedMarkerId,
    selectedZoneId,
    snapshot.blockEditCount,
    snapshot.entityAnchorCount,
    snapshot.hasUnsavedChanges,
    snapshot.redoDepth,
    snapshot.undoDepth,
    snapshot.zoneAssignmentCount,
    tool,
    validationSummary,
    zoneId,
    zoneEditMode,
    zoneSelectionMode,
    zoneFocusDirection,
    zoneNeutralTerrain,
    zoneNeutralTerrainColor,
    zoneGridLinesVisible,
    zoneGridLineColor,
    mapBackgroundColor,
    currentMap.zones,
  ]);
  const availableMaps = useMemo(() => listMapRegistryEntries({ includeDevelopment: process.env.NODE_ENV !== "production" }), []);
  const browsingZone = "zoneId" in browsing
    ? currentMap.zones.find((zone) => zone.id === browsing.zoneId) ?? null
    : null;
  const activeZoneFocusDirection = browsingZone?.focusDirection ?? zoneFocusDirection;
  const activeCameraPreset = useMemo(
    () => getBrowsingCameraPreset(currentMap, browsing, editorSession.world, activeZoneFocusDirection),
    [activeZoneFocusDirection, browsing, currentMap, editorSession.world],
  );
  const normalizeEditableMap = useCallback((map: MapDefinition) => editorEnabled ? ensureEditableZones(map) : map, [editorEnabled]);
  const loadEditableMapState = useCallback((nextMapId: string) => {
    const registryState = loadMapStateSync(nextMapId, { includeDevelopment: true });
    const draft = loadMapDraft(localStorage, nextMapId);
    if (draft && draft.metadata.authoringVersion === registryState.definition.metadata.authoringVersion) {
      return createLoadedMapState(normalizeEditableMap(draft));
    }
    return registryState;
  }, [normalizeEditableMap]);

  const commitMapDefinitionChange = (nextMap: MapDefinition, message: string) => {
    mapHistoryRef.current.undo.push(currentMap);
    if (mapHistoryRef.current.undo.length > 80) {
      mapHistoryRef.current.undo.shift();
    }
    mapHistoryRef.current.redo = [];
    setCurrentMap(normalizeEditableMap(nextMap));
    setEditorMessage({ type: "info", text: message });
    setEditorRevision((revision) => revision + 1);
  };

  const createCurrentMapDefinition = () => createMapDefinitionFromWorld({
    ...currentMap,
    world: editorSession.world,
    zones: ensureEditableZones(currentMap).zones,
    markers: mergeMarkerDefinitions(currentMap.markers, editorSession.entities),
    entities: currentMap.entities,
    entityGroups: currentMap.entityGroups,
    navigation: currentMap.navigation,
    spawnPoints: currentMap.spawnPoints,
    cameraPresets: currentMap.cameraPresets,
    presentation: currentMap.presentation,
    metadata: {
      ...currentMap.metadata,
      updatedAt: new Date().toISOString(),
    },
    fluidSettings: currentMap.fluids.settings,
  });

  const replaceLoadedMap = (map: MapDefinition, markSaved: boolean, message: string) => {
    const editableMap = normalizeEditableMap(map);
    const document = mapDefinitionToDocument(editableMap);
    const result = editorSession.replaceWithDocument(document, markSaved);
    const nextTerrain = createTerrainDataFromWorld(editorSession.world);
    const nextZoneOverlay = buildZoneOverlayMeshes(editorSession.world);

    setCurrentMap(editableMap);
    mapHistoryRef.current = { undo: [], redo: [] };
    setActiveMapId(map.id);
    dispatchBrowsing({ type: "changeMap", mapId: map.id });
    setTerrain(nextTerrain);
    setZoneOverlay(nextZoneOverlay);
    setLastRebuiltChunks(result.rebuiltChunkIds);
    setLastChunkRebuildMs(nextTerrain.surfaceBuildMs);
    setSelectedCell(null);
    setSelectedMarkerId(null);
    setSelectedEntityIds([]);
    setEditorMessage({ type: "info", text: message });
    setEditorRevision((revision) => revision + 1);
  };

  const replaceRebuiltChunks = (rebuiltChunks: ReturnType<MapEditorSession["applyTool"]>["rebuiltChunks"]) => {
    if (rebuiltChunks.length === 0) {
      if (editorSession.world.dirtyZoneChunks.size > 0) {
        replaceZoneOverlayChunks([...editorSession.world.dirtyZoneChunks]);
        editorSession.world.clearDirtyZoneChunks();
      }
      setLastChunkRebuildMs(0);
      setEditorRevision((revision) => revision + 1);
      return;
    }

    // eslint-disable-next-line react-hooks/purity
    const startedAt = performance.now();
    const rebuiltTerrainChunks = new Map(rebuiltChunks.map((chunk) => [chunk.id, toTerrainChunk(chunk)]));
    const rebuiltSurfaceChunks = new Map(rebuiltChunks.map((chunk) => [chunk.id, buildSurfaceChunkMesh(editorSession.world, chunk.chunkX, chunk.chunkZ)]));
    // eslint-disable-next-line react-hooks/purity
    const rebuildMs = Number((performance.now() - startedAt).toFixed(3));
    incrementEditorPerfCounter("terrainChunkRebuilds", rebuiltChunks.length);

    setTerrain((currentTerrain) => ({
      ...currentTerrain,
      chunks: currentTerrain.chunks.map((chunk) => rebuiltTerrainChunks.get(chunk.id) ?? chunk),
      surfaceChunks: currentTerrain.surfaceChunks.map((chunk) => rebuiltSurfaceChunks.get(chunk.id) ?? chunk),
      instanceCount: editorSession.world.getStats().renderedInstances,
      airCellCount: editorSession.world.getStats().airCells,
      nonAirBlockCount: editorSession.world.getStats().nonAirBlocks,
      surfaceQuadCount: currentTerrain.surfaceChunks.reduce(
        (sum, chunk) => sum + (rebuiltSurfaceChunks.get(chunk.id)?.visibleQuads ?? chunk.visibleQuads),
        0,
      ),
      surfaceTriangleCount: currentTerrain.surfaceChunks.reduce(
        (sum, chunk) => sum + (rebuiltSurfaceChunks.get(chunk.id)?.triangles ?? chunk.triangles),
        0,
      ),
    }));
    replaceZoneOverlayChunks([...new Set([...rebuiltChunks.map((chunk) => chunk.id), ...editorSession.world.dirtyZoneChunks])]);
    editorSession.world.clearDirtyZoneChunks();
    setLastRebuiltChunks([...rebuiltTerrainChunks.keys()]);
    setLastChunkRebuildMs(rebuildMs);
    setEditorRevision((revision) => revision + 1);
  };

  const replaceZoneOverlayChunks = (chunkIds: string[]) => {
    if (chunkIds.length === 0) return;
    const startedAt = performance.now();
    const chunkIdSet = new Set(chunkIds);
    const rebuiltZoneChunks = chunkIds.flatMap((chunkId) => {
      const coordinates = parseChunkId(chunkId);
      return coordinates ? buildZoneOverlayChunkMeshes(editorSession.world, coordinates.chunkX, coordinates.chunkZ) : [];
    });
    setZoneOverlay((currentOverlay) => {
      const chunks = [
        ...currentOverlay.chunks.filter((chunk) => !chunkIdSet.has(zoneOverlayBaseChunkId(chunk.id))),
        ...rebuiltZoneChunks,
      ].sort(compareZoneOverlayChunks);
      return {
        chunks,
        totalTriangles: chunks.reduce((sum, chunk) => sum + chunk.triangles, 0),
        totalCells: chunks.reduce((sum, chunk) => sum + chunk.cellCount, 0),
        buildMs: Number((performance.now() - startedAt).toFixed(3)),
      };
    });
  };

  const handleEditorCell = (coordinate: GridCoordinate) => {
    if (!editorAvailable) {
      return;
    }
    if (isLayerLocked(layerStates, getToolLayer(tool))) {
      setEditorMessage({ type: "error", text: "The active editor layer is locked." });
      return;
    }

    if (tool === "entity") {
      placeObjectAtGridColumn(coordinate);
      return;
    }

    if (tool === "zone") {
      const columns = zoneSelectionMode === "rectangle" && zoneRectangleAnchor
        ? getZoneRectangleFootprint(zoneRectangleAnchor, coordinate)
        : getZoneBrushFootprint(coordinate, effectiveBrushSettings);
      applyZoneColumns(columns, coordinate);
      return;
    }

    const editCoordinate = getToolTargetCoordinate(editorSession, tool, coordinate);
    if (!editCoordinate) {
      setEditorMessage({ type: "error", text: "No valid cell for this tool." });
      return;
    }

    setSelectedCell(editCoordinate);
    setSelectedMarkerId(null);
    setSelectedEntityIds([]);
    if (tool === "select") {
      const selectedColumnZone = editorSession.world.getColumnZone(editCoordinate.x, editCoordinate.z);
      if (selectedColumnZone > 0) setZoneId(selectedColumnZone);
    }

    const brushOperation = getTerrainBrushOperation(tool);
    const result = brushOperation
      ? editorSession.applyTerrainMutations(
        brushOperation,
        createTerrainMutations({
          world: editorSession.world,
          operation: brushOperation,
          center: editCoordinate,
          settings: effectiveBrushSettings,
          blockId: getTerrainMutationBlockId(tool, brushOperation, paintBlockId, activeShapeId, applyMaterialToAddedBlocks),
          shapeId: brushOperation === "paint-path" || brushOperation === "remove-path" ? undefined : activeShapeId,
          rotation: activeRotation,
          state: activeShapeState,
          zoneId,
        }),
      )
      : editorSession.applyTool(tool, editCoordinate, paintBlockId, zoneId);
    if (result.message) {
      setEditorMessage(result.message);
    } else if (tool !== "select") {
      setEditorMessage({ type: "info", text: `${tool} applied at ${editCoordinate.x},${editCoordinate.y},${editCoordinate.z}.` });
    }
    replaceRebuiltChunks(result.rebuiltChunks);
    if (result.changed) setPreviewRevision((revision) => revision + 1);
  };

  const handleEditorCells = (coordinates: GridCoordinate[]) => {
    if (!editorAvailable || coordinates.length === 0) {
      return;
    }
    if (isLayerLocked(layerStates, getToolLayer(tool))) {
      setEditorMessage({ type: "error", text: "The active editor layer is locked." });
      return;
    }

    if (tool === "zone") {
      applyZoneColumns(coordinates, coordinates[coordinates.length - 1]);
      return;
    }

    const brushOperation = getTerrainBrushOperation(tool);
    if (!brushOperation) {
      handleEditorCell(coordinates[coordinates.length - 1]);
      return;
    }

    const mutations = coordinates.flatMap((coordinate) => {
      const editCoordinate = getToolTargetCoordinate(editorSession, tool, coordinate);
      if (!editCoordinate) return [];
      return createTerrainMutations({
        world: editorSession.world,
        operation: brushOperation,
        center: editCoordinate,
        settings: effectiveBrushSettings,
        blockId: getTerrainMutationBlockId(tool, brushOperation, paintBlockId, activeShapeId, applyMaterialToAddedBlocks),
        shapeId: brushOperation === "paint-path" || brushOperation === "remove-path" ? undefined : activeShapeId,
        rotation: activeRotation,
        state: activeShapeState,
        zoneId,
      });
    });
    const result = editorSession.applyTerrainMutations(brushOperation, mutations);
    if (result.message) setEditorMessage(result.message);
    setSelectedCell(coordinates[coordinates.length - 1]);
    setSelectedMarkerId(null);
    setSelectedEntityIds([]);
    replaceRebuiltChunks(result.rebuiltChunks);
    if (result.changed) setPreviewRevision((revision) => revision + 1);
  };

  const applyZoneColumns = (columns: GridCoordinate[], selection: GridCoordinate) => {
    if (zoneId <= 0 || !activeZoneDefinition) {
      setEditorMessage({ type: "error", text: "Select a zone before painting zones." });
      return;
    }
    if (activeZoneDefinition?.locked) {
      setEditorMessage({ type: "error", text: `${activeZoneDefinition.label} is locked.` });
      return;
    }
    const changes = createZoneColumnChanges({
      world: editorSession.world,
      columns,
      mode: zoneEditMode,
      zoneId,
    });
    const result = editorSession.applyZoneColumnChanges(`Zone ${zoneEditMode}`, changes);
    setSelectedCell(selection);
    setSelectedMarkerId(null);
    setSelectedEntityIds([]);
    if (result.message) setEditorMessage(result.message);
    setEditorMessage({ type: "info", text: `${zoneEditMode} zone applied to ${changes.length} column${changes.length === 1 ? "" : "s"}.` });
    replaceRebuiltChunks(result.rebuiltChunks);
    if (result.changed) setPreviewRevision((revision) => revision + 1);
  };

  const handleZoneDefinitionChange = (
    numericId: number,
    patch: Partial<Pick<MapZoneDefinition, "label" | "shortLabel" | "description" | "color" | "visibleInLegend" | "overlayVisible" | "locked" | "focusDirection">>,
  ) => {
    commitMapDefinitionChange(updateEditableZone(currentMap, numericId, patch), "Zone updated.");
  };

  const handleToolChange = (nextTool: EditorTool) => {
    setTool(nextTool);
    setZoneRectangleAnchor(null);
    if (nextTool !== "zone") {
      setZoneId(0);
    }
    // Leaving the Place tool (via the tool rail, a workspace switch, or the
    // "deselect" command) un-arms whatever prefab/primitive was loaded, so
    // reactivating Place later starts empty instead of silently placing the
    // last-picked object again. The auto-revert-to-select that happens right
    // after a successful placement (placeObjectAtGridColumn) calls setTool
    // directly and skips this, so quick repeat placement of the same object
    // still works.
    if (nextTool !== "entity") {
      setActivePrefabId("");
      setActivePrefabVariantId("");
    }
  };

  const handleCreateZone = () => {
    const editableMap = ensureEditableZones(currentMap);
    const zoneCounts = countZoneAssignments(editorSession.world);
    const editableZones = editableMap.zones.filter((zone) => zone.numericId >= 1 && zone.numericId <= 10);
    const zoneAfterCurrent = (offset: number) => ((zoneId + offset - 1) % 10) + 1;
    const newZone = Array.from({ length: 10 }, (_, index) => zoneAfterCurrent(index + 1))
      .map((numericId) => editableZones.find((zone) => zone.numericId === numericId))
      .find((zone) => zone && (zoneCounts.get(zone.numericId) ?? 0) === 0)
      ?? editableZones.find((zone) => zone.numericId === zoneAfterCurrent(1))
      ?? editableZones[0]
      ?? null;

    if (!newZone) {
      setEditorMessage({ type: "error", text: "No editable zone slots are available." });
      return;
    }

    if (editableMap.zones.length !== currentMap.zones.length) {
      mapHistoryRef.current.undo.push(currentMap);
      if (mapHistoryRef.current.undo.length > 80) {
        mapHistoryRef.current.undo.shift();
      }
      mapHistoryRef.current.redo = [];
      setCurrentMap(editableMap);
      setEditorRevision((revision) => revision + 1);
    }

    setZoneId(newZone.numericId);
    setZoneEditMode("paint");
    setZoneSelectionMode("brush");
    handleToolChange("zone");
    setEditorMessage({ type: "info", text: `${newZone.label} ready. Paint or area-fill columns to assign it.` });
  };

  const handleUndo = () => {
    const previousMap = mapHistoryRef.current.undo.pop();
    if (previousMap) {
      mapHistoryRef.current.redo.push(currentMap);
      setCurrentMap(previousMap);
      setEditorMessage({ type: "info", text: "Map data undo complete." });
      setEditorRevision((revision) => revision + 1);
      return;
    }

    const result = editorSession.undo();
    replaceRebuiltChunks(result.rebuiltChunks);
    setEditorMessage({ type: "info", text: "Undo complete." });
  };

  const handleRedo = () => {
    const nextMap = mapHistoryRef.current.redo.pop();
    if (nextMap) {
      mapHistoryRef.current.undo.push(currentMap);
      setCurrentMap(nextMap);
      setEditorMessage({ type: "info", text: "Map data redo complete." });
      setEditorRevision((revision) => revision + 1);
      return;
    }

    const result = editorSession.redo();
    replaceRebuiltChunks(result.rebuiltChunks);
    setEditorMessage({ type: "info", text: "Redo complete." });
  };

  const handleResetUnsaved = () => {
    if (!window.confirm("Reset unsaved editor changes to the last saved draft/export?")) {
      return;
    }
    const result = editorSession.resetToDocument(editorSession.savedDocument);
    replaceRebuiltChunks(result.rebuiltChunks);
    setSelectedCell(null);
    setSelectedMarkerId(null);
    setSelectedEntityIds([]);
    setEditorMessage({ type: "info", text: "Unsaved changes reset." });
  };

  const handleResetFlat = () => {
    if (!window.confirm("Reset the editor map to the original flat world?")) {
      return;
    }
    const result = editorSession.resetToFlatMap();
    replaceRebuiltChunks(result.rebuiltChunks);
    setSelectedCell(null);
    setSelectedMarkerId(null);
    setSelectedEntityIds([]);
    setPresetId("flat");
    setEditorMessage({ type: "info", text: "Flat map restored." });
  };

  const handlePresetChange = (nextPresetId: MapPresetId) => {
    if (snapshot.hasUnsavedChanges && !window.confirm("Replace unsaved editor changes with the selected preset?")) {
      return;
    }

    const presetWorld = createMapPresetWorld(nextPresetId);
    const result = editorSession.replaceWithDocument(serializeMapDocument(presetWorld, []), true);
    const nextTerrain = createTerrainDataFromWorld(editorSession.world);
    const nextZoneOverlay = buildZoneOverlayMeshes(editorSession.world);
    setTerrain(nextTerrain);
    setZoneOverlay(nextZoneOverlay);
    setLastRebuiltChunks(result.rebuiltChunkIds);
    setLastChunkRebuildMs(nextTerrain.surfaceBuildMs);
    setSelectedCell(null);
    setSelectedMarkerId(null);
    setSelectedEntityIds([]);
    setPresetId(nextPresetId);
    setEditorMessage({ type: "info", text: "Preset loaded for FPS testing." });
    setEditorRevision((revision) => revision + 1);
  };

  const handleMapChange = (nextMapId: string) => {
    if (snapshot.hasUnsavedChanges && !window.confirm("Replace unsaved editor changes with the selected map?")) {
      return;
    }

    try {
      const loaded = loadEditableMapState(nextMapId);
      const editableDefinition = normalizeEditableMap(loaded.definition);

      const nextSession = new MapEditorSession(loaded.world, loaded.entities, loaded.definition.fluids.settings);
      const nextTerrain = createTerrainDataFromWorld(nextSession.world);
      const nextZoneOverlay = buildZoneOverlayMeshes(nextSession.world);
      setEditorSession(nextSession);
      setCurrentMap(editableDefinition);
      mapHistoryRef.current = { undo: [], redo: [] };
      setActiveMapId(loaded.definition.id);
      dispatchBrowsing({ type: "changeMap", mapId: loaded.definition.id });
      setTerrain(nextTerrain);
      setZoneOverlay(nextZoneOverlay);
      setLastRebuiltChunks(nextTerrain.chunks.map((chunk) => chunk.id));
      setLastChunkRebuildMs(nextTerrain.surfaceBuildMs);
      setSelectedCell(null);
      setSelectedMarkerId(null);
      setSelectedEntityIds([]);
      setEditorMessage({ type: "info", text: `Loaded ${loaded.definition.name}.` });
      setEditorRevision((revision) => revision + 1);
    } catch (error) {
      setEditorMessage({ type: "error", text: error instanceof Error ? error.message : "Map load failed." });
    }
  };

  const loadBenchmarkMap = useCallback((nextMapId: string) => {
    try {
      const loaded = loadEditableMapState(nextMapId);
      const editableDefinition = normalizeEditableMap(loaded.definition);
      const nextSession = new MapEditorSession(loaded.world, loaded.entities, loaded.definition.fluids.settings);
      const nextTerrain = createTerrainDataFromWorld(nextSession.world);
      const nextZoneOverlay = buildZoneOverlayMeshes(nextSession.world);

      setEditorSession(nextSession);
      setCurrentMap(editableDefinition);
      mapHistoryRef.current = { undo: [], redo: [] };
      setActiveMapId(loaded.definition.id);
      dispatchBrowsing({ type: "changeMap", mapId: loaded.definition.id });
      setTerrain(nextTerrain);
      setZoneOverlay(nextZoneOverlay);
      setLastRebuiltChunks(nextTerrain.chunks.map((chunk) => chunk.id));
      setLastChunkRebuildMs(nextTerrain.surfaceBuildMs);
      setSelectedCell(null);
      setSelectedMarkerId(null);
      setSelectedEntityIds([]);
      setEditorMessage({ type: "info", text: `Loaded ${loaded.definition.name}.` });
      setEditorRevision((revision) => revision + 1);
      return true;
    } catch (error) {
      setEditorMessage({ type: "error", text: error instanceof Error ? error.message : "Map load failed." });
      return false;
    }
  }, [loadEditableMapState, normalizeEditableMap]);

  const handleNewMap = () => {
    if (snapshot.hasUnsavedChanges && !window.confirm("Discard unsaved edits and create a blank development map?")) {
      return;
    }
    const id = window.prompt("New map id", `custom-map-${Date.now().toString(36)}`);
    if (!id) return;
    if (availableMaps.some((map) => map.id === id) || id === currentMap.id) {
      setEditorMessage({ type: "error", text: `Map id already exists: ${id}.` });
      return;
    }
    const name = window.prompt("New map name", "Custom Map");
    if (!name) return;

    try {
      const map = normalizeEditableMap(createBlankMapDefinition({ id, name, flatBaseLayer: true }));
      const nextSession = new MapEditorSession();
      nextSession.replaceWithDocument(mapDefinitionToDocument(map), true);
      const nextTerrain = createTerrainDataFromWorld(nextSession.world);
      const nextZoneOverlay = buildZoneOverlayMeshes(nextSession.world);
      setEditorSession(nextSession);
      setCurrentMap(map);
      mapHistoryRef.current = { undo: [], redo: [] };
      setActiveMapId(map.id);
      dispatchBrowsing({ type: "changeMap", mapId: map.id });
      setTerrain(nextTerrain);
      setZoneOverlay(nextZoneOverlay);
      setSelectedCell(null);
      setSelectedMarkerId(null);
      setSelectedEntityIds([]);
      setEditorMessage({ type: "info", text: "Blank map created." });
      setEditorRevision((revision) => revision + 1);
    } catch (error) {
      setEditorMessage({ type: "error", text: error instanceof Error ? error.message : "New map failed." });
    }
  };

  const handleDuplicateMap = () => {
    const id = window.prompt("Duplicate map id", `${currentMap.id}-copy`);
    if (!id) return;
    if (availableMaps.some((map) => map.id === id) || id === currentMap.id) {
      setEditorMessage({ type: "error", text: `Map id already exists: ${id}.` });
      return;
    }
    const name = window.prompt("Duplicate map name", `${currentMap.name} Copy`);
    if (!name) return;
    const duplicate = duplicateMapDefinition(createCurrentMapDefinition(), id, name);
    replaceLoadedMap(duplicate, false, "Map duplicated.");
  };

  const handleSaveDraft = () => {
    const saved = normalizeEditableMap(saveMapDraft(localStorage, createCurrentMapDefinition()));
    setCurrentMap(saved);
    editorSession.markSaved();
    setAutosaveStatus(`draft saved ${new Date().toLocaleTimeString()}`);
    setEditorRevision((revision) => revision + 1);
  };

  const handleRenameMap = () => {
    const name = window.prompt("Map name", currentMap.name);
    if (!name || name === currentMap.name) return;
    setCurrentMap(normalizeEditableMap({ ...currentMap, name, metadata: { ...currentMap.metadata, updatedAt: new Date().toISOString() } }));
    setEditorMessage({ type: "info", text: "Map renamed. Save draft or export to persist it." });
    setEditorRevision((revision) => revision + 1);
  };

  const handleExport = () => {
    const mapDefinition = createCurrentMapDefinition();
    const blob = new Blob([`${JSON.stringify(mapDefinition, null, 2)}\n`], { type: "application/json" });
    const link = window.document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${mapDefinition.id}.map.v1.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    editorSession.markSaved();
    setAutosaveStatus("exported");
    setEditorRevision((revision) => revision + 1);
  };

  const handleImport = async (file: File) => {
    const currentSnapshot = editorSession.getSnapshot();
    if (currentSnapshot.hasUnsavedChanges && !window.confirm("Replace unsaved editor changes with the imported map?")) {
      return;
    }

    try {
      const input = JSON.parse(await file.text());
      if (isMapDefinitionLike(input)) {
        const validation = validateMapDefinition(input);
        if (!validation.ok) {
          setEditorMessage({ type: "error", text: validation.errors.join(" ") });
          return;
        }
        replaceLoadedMap(validation.map, true, "Map definition imported.");
      } else {
        const parsed = parseMapDocument(input);
        if (!parsed.ok) {
          setEditorMessage({ type: "error", text: parsed.error });
          return;
        }
        const legacyMap = createMapDefinitionFromWorld({
          id: `imported-map-${Date.now().toString(36)}`,
          name: "Imported Legacy Map",
          kind: "custom",
          runtimeMode: "dynamic-voxel",
          world: new MapEditorSession(undefined, []).world,
          zones: currentMap.zones,
          markers: [],
          spawnPoints: currentMap.spawnPoints,
          cameraPresets: currentMap.cameraPresets,
        });
        const imported = new MapEditorSession();
        imported.replaceWithDocument(parsed.document, true);
        const upgraded = createMapDefinitionFromWorld({
          ...legacyMap,
          world: imported.world,
          markers: mergeMarkerDefinitions([], imported.entities),
        });
        replaceLoadedMap(upgraded, true, "Legacy map document imported.");
      }
    } catch {
      setEditorMessage({ type: "error", text: "Import failed. The current map was not changed." });
    }
  };

  const handleClearDraft = () => {
    deleteMapDraft(localStorage, currentMap.id);
    setAutosaveStatus("draft cleared");
  };

  const handleRemoveMarker = () => {
    if (!selectedMarkerId) {
      return;
    }

    const result = editorSession.removeMarker(selectedMarkerId);
    replaceRebuiltChunks(result.rebuiltChunks);
    setSelectedMarkerId(null);
    setEditorMessage({ type: "info", text: "Marker removed." });
  };

  const placeEntityAtSurface = (surfacePosition: THREE.Vector3 | { x: number; y: number; z: number }) => {
    if (isLayerLocked(layerStates, "entities")) {
      setEditorMessage({ type: "error", text: "The entity layer is locked." });
      return;
    }
    const entity = createEntityFromDraft({
      name: entityName,
      primitiveType,
      color: entityColor,
      collisionMode,
      transform: {
        position: { x: surfacePosition.x, y: surfacePosition.y, z: surfacePosition.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: getDefaultEntityScale(primitiveType),
      },
    }, new Set(currentMap.entities.map((entity) => entity.id)));
    const validation = validateEntityPlacement(currentMap, entity);
    setValidationSummary(validation.messages);
    if (validation.severity === "invalid") {
      setEditorMessage({ type: "error", text: validation.messages[0] ?? "Entity placement is invalid." });
      return;
    }

    commitMapDefinitionChange(addEntity(currentMap, entity), `Placed ${entity.name}.`);
    setSelectedEntityIds([entity.id]);
    setEntityPopAnimationId(entity.id);
    setSelectedCell(null);
    setSelectedMarkerId(null);
    setTool("select");
  };

  const placePrefabAtSurface = (surfacePosition: THREE.Vector3 | { x: number; y: number; z: number }) => {
    if (isLayerLocked(layerStates, "entities")) {
      setEditorMessage({ type: "error", text: "The entity layer is locked." });
      return;
    }

    const prefab = getPrefabDefinition(activePrefabId);
    if (!prefab) {
      setEditorMessage({ type: "error", text: "Select a valid prefab before placement." });
      return;
    }
    const variant = prefab.variants.find((candidate) => candidate.id === activePrefabVariantId) ?? prefab.variants[0];
    if (!variant) {
      setEditorMessage({ type: "error", text: "Selected prefab has no valid variant." });
      return;
    }

    const entity = createPrefabEntityFromDraft({
      name: prefab.name,
      prefabId: prefab.id,
      variantId: variant.id,
      color: entityColor,
      transform: {
        position: { x: surfacePosition.x, y: surfacePosition.y, z: surfacePosition.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      collisionModeOverride: collisionMode === prefab.collisionMode ? undefined : collisionMode,
    }, new Set(currentMap.entities.map((candidate) => candidate.id)));
    const grounded = groundEntityOnTerrain(editorSession.world, entity, { supportMode: "single-cell" });
    if (!grounded.ok) {
      setEditorMessage({ type: "error", text: grounded.reason });
      return;
    }
    const validation = validateEntityPlacement(currentMap, grounded.entity);
    setValidationSummary(validation.messages);
    if (validation.severity === "invalid") {
      setEditorMessage({ type: "error", text: validation.messages[0] ?? "Prefab placement is invalid." });
      return;
    }

    commitMapDefinitionChange(addEntity(currentMap, grounded.entity), `Placed ${prefab.name}.`);
    setSelectedEntityIds([grounded.entity.id]);
    setEntityPopAnimationId(grounded.entity.id);
    setSelectedCell(null);
    setSelectedMarkerId(null);
  };

  const placeObjectAtGridColumn = (coordinate: GridCoordinate) => {
    const topY = editorSession.world.getHighestNonAirY(coordinate.x, coordinate.z);
    if (topY === null) {
      setEditorMessage({ type: "error", text: "No terrain surface under this object placement." });
      return;
    }
    const surface = getTerrainSurfaceAt(editorSession.world, coordinate.x, coordinate.z);
    if (!surface.valid) {
      setEditorMessage({ type: "error", text: surface.reason });
      return;
    }
    if (activePrefabId) {
      placePrefabAtSurface(surface.worldPosition);
    } else {
      placeEntityAtSurface(surface.worldPosition);
    }
    setTool("select");
  };

  const handlePlaceEntity = () => {
    if (selectedCell) {
      placeObjectAtGridColumn(selectedCell);
      return;
    }
    handleToolChange("entity");
    setEditorMessage({ type: "info", text: "Click a terrain surface to place the selected object." });
  };

  const handleDuplicateEntity = () => {
    if (selectedEntityIds.length === 0) return;
    const nextMap = duplicateEntities(currentMap, selectedEntityIds);
    commitMapDefinitionChange(nextMap, "Entity duplicated.");
    setSelectedEntityIds(nextMap.entities.slice(-selectedEntityIds.length).map((entity) => entity.id));
  };

  const handleDeleteEntity = () => {
    if (selectedEntityIds.length === 0) return;
    commitMapDefinitionChange(deleteEntities(currentMap, selectedEntityIds), "Entity deleted.");
    setSelectedEntityIds([]);
  };

  const handleGroupEntity = () => {
    if (selectedEntityIds.length < 2) return;
    const groupId = `group-${Date.now().toString(36)}`;
    commitMapDefinitionChange(groupEntities(currentMap, selectedEntityIds, groupId, "Entity Group"), "Entities grouped.");
  };

  const handleUngroupEntity = () => {
    if (!selectedEntity?.groupId) return;
    commitMapDefinitionChange(ungroupEntities(currentMap, selectedEntity.groupId), "Entity group removed.");
  };

  const handleToggleEntityLocked = () => {
    if (!selectedEntity) return;
    commitMapDefinitionChange(updateEntity(currentMap, selectedEntity.id, (entity) => ({ ...entity, locked: !entity.locked })), "Entity lock toggled.");
  };

  const handleToggleEntityHidden = () => {
    if (!selectedEntity) return;
    commitMapDefinitionChange(updateEntity(currentMap, selectedEntity.id, (entity) => ({
      ...entity,
      appearance: { ...entity.appearance, visibleInEditor: !entity.appearance.visibleInEditor },
    })), "Entity visibility toggled.");
  };

  const handleTransformEntity = (id: string, transform: Pick<PlacedMapEntity["transform"], "position" | "rotation">) => {
    const entity = currentMap.entities.find((candidate) => candidate.id === id);
    if (!entity) {
      return false;
    }

    const nextEntity = {
      ...entity,
      transform: {
        ...entity.transform,
        position: transform.position,
        rotation: transform.rotation,
      },
    };
    const validation = validateEntityPlacement(
      { ...currentMap, entities: currentMap.entities.filter((candidate) => candidate.id !== id) },
      nextEntity,
    );
    setValidationSummary(validation.messages);
    if (validation.severity === "invalid") {
      setEditorMessage({ type: "error", text: validation.messages[0] ?? "Entity transform is invalid." });
      return false;
    }

    commitMapDefinitionChange(updateEntity(currentMap, id, () => nextEntity), `Moved ${entity.name}.`);
    setSelectedEntityIds([id]);
    setSelectedCell(null);
    setSelectedMarkerId(null);
    return true;
  };

  const handlePlaceNavigationNode = () => {
    if (isLayerLocked(layerStates, "navigation")) {
      setEditorMessage({ type: "error", text: "The navigation layer is locked." });
      return;
    }
    const basePosition = selectedWorldPosition ?? { x: 0, y: 1, z: 0 };
    const id = `nav-${navigationNodeType}-${Date.now().toString(36)}`.replace(/[^a-z0-9-]/g, "-");
    commitMapDefinitionChange(addNavigationNode(currentMap, {
      id,
      type: navigationNodeType,
      label: navigationNodeType,
      position: { x: basePosition.x, y: basePosition.y + 0.55, z: basePosition.z },
      tags: [],
      locked: false,
    }), "Navigation node placed.");
  };

  const handleConnectNavigationNodes = () => {
    const nodes = currentMap.navigation.nodes.slice(-2);
    if (nodes.length < 2) return;
    commitMapDefinitionChange(addNavigationEdge(currentMap, {
      id: `edge-${nodes[0].id}-${nodes[1].id}`.replace(/[^a-z0-9-]/g, "-"),
      fromNodeId: nodes[0].id,
      toNodeId: nodes[1].id,
      bidirectional: true,
      cost: 1,
      locked: false,
    }), "Navigation nodes connected.");
  };

  const handleCreateRoute = () => {
    const nodeIds = currentMap.navigation.nodes.map((node) => node.id);
    if (nodeIds.length < 2) return;
    commitMapDefinitionChange(addNavigationRoute(currentMap, {
      id: `route-${Date.now().toString(36)}`,
      name: "Editor Route",
      nodeIds,
      tags: [],
    }), "Route created from current nodes.");
  };

  const updateLayer = (id: EditorLayerId, patch: Partial<Pick<EditorLayerState, "visible" | "locked">>) => {
    setLayerStates((layers) => layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer));
  };

  useEffect(() => {
    markLoading();
  }, [markLoading]);

  useEffect(() => {
    if (!editorAvailable) {
      if (lastEditorPanelSignature.current !== null) {
        lastEditorPanelSignature.current = null;
      }
      onEditorStateChange(null);
      return;
    }

    if (lastEditorPanelSignature.current === editorPanelSignature) {
      return;
    }
    lastEditorPanelSignature.current = editorPanelSignature;

    onEditorStateChange({
      available: editorAvailable,
      mapId: activeMapId,
      mapName: currentMap.name,
      mapDescription: currentMap.description ?? "",
      availableMaps,
      tool,
      paintBlockId,
      applyMaterialToAddedBlocks,
      activeShapeCategory,
      activeShapeId,
      activeRotation,
      activeShapeState,
      presetId,
      renderMode,
      zoneId,
      zoneEditMode,
      zoneSelectionMode,
      zoneFocusDirection: activeZoneDefinition?.focusDirection ?? zoneFocusDirection,
      zoneDefinitions: currentMap.zones,
      zoneNeutralTerrain,
      zoneNeutralTerrainColor,
      zoneGridLinesVisible,
      zoneGridLineColor,
      mapBackgroundColor,
      hovered: hoveredCell,
      selected: selectedCell,
      selectedBlockId,
      selectedShapeId,
      selectedRotation,
      selectedState,
      selectedFluid: selectedCell ? editorSession.world.getFluid(selectedCell.x, selectedCell.y, selectedCell.z) : null,
      fluidCellCount: editorSession.world.getStats().fluidCells,
      fluidSourceCount: editorSession.world.getStats().fluidSources,
      fallingFluidCount: editorSession.world.getStats().fallingFluidCells,
      pendingFluidUpdates: 0,
      infiniteWaterSources: true,
      waterSimulationPlaying: false,
      waterBasinPreviewCellCount: 0,
      waterBasinPreviewLeaks: false,
      selectedZoneId,
      selectedWorldPosition,
      selectedChunk,
      selectedLocal,
      dirtyChunks: editorSession.world.dirtyChunks.size,
      lastRebuiltChunks,
      blockEditCount: snapshot.blockEditCount,
      zoneAssignmentCount: snapshot.zoneAssignmentCount,
      entityAnchorCount: snapshot.entityAnchorCount,
      undoDepth: snapshot.undoDepth + mapHistoryRef.current.undo.length,
      redoDepth: snapshot.redoDepth + mapHistoryRef.current.redo.length,
      hasUnsavedChanges: snapshot.hasUnsavedChanges,
      autosaveStatus,
      message: editorMessage,
      selectedMarkerId,
      selectedEntity,
      entityCount: currentMap.entities.length,
      selectedEntityIds,
      primitiveType,
      activePrefabId,
      activePrefabVariantId,
      prefabSearch,
      entityTransformMode,
      collisionMode,
      entityColor,
      entityName,
      brushSettings,
      brushAffectedCellCount,
      layerStates,
      cleanPreview,
      navigationNodeType,
      navigationNodeCount: currentMap.navigation.nodes.length,
      navigationEdgeCount: currentMap.navigation.edges.length,
      routeCount: currentMap.navigation.routes.length,
      validationSummary,
      onToolChange: handleToolChange,
      onPaintBlockChange: setPaintBlockId,
      onApplyMaterialToAddedBlocksChange: setApplyMaterialToAddedBlocks,
      onShapeCategoryChange: (category) => {
        setActiveShapeCategory(category);
        const nextShape = getShapeDefinition(activeShapeId).category === category
          ? activeShapeId
          : category === "transition"
              ? SHAPE_IDS.STAIR
              : category === "structure"
                ? SHAPE_IDS.WALL
                : category === "roof"
                  ? SHAPE_IDS.ROOF_FLAT
                  : SHAPE_IDS.CUBE;
        setActiveShapeId(nextShape);
        setActiveShapeState(DEFAULT_STATE);
      },
      onShapeChange: (shapeId) => {
        const shape = getShapeDefinition(shapeId);
        setActiveShapeId(shape.id);
        setActiveShapeCategory(shape.category);
        setActiveShapeState(DEFAULT_STATE);
      },
      onCellRotationChange: setActiveRotation,
      onShapeStateChange: (state) => setActiveShapeState(Math.max(0, Math.min(255, Math.floor(state) || 0))),
      onEyedropperCell: () => {
        if (!selectedCell) return;
        const cell = editorSession.world.getCell(selectedCell.x, selectedCell.y, selectedCell.z);
        if (!cell) return;
        setPaintBlockId(cell.blockId);
        setActiveShapeId(cell.shapeId);
        setActiveShapeCategory(getShapeDefinition(cell.shapeId).category);
        setActiveRotation(cell.rotation);
        setActiveShapeState(cell.state);
        setEditorMessage({ type: "info", text: "Cell copied to terrain brush." });
      },
      onPresetChange: handlePresetChange,
      onMapChange: handleMapChange,
      onNewMap: handleNewMap,
      onDuplicateMap: handleDuplicateMap,
      onSaveDraft: handleSaveDraft,
      onRenameMap: handleRenameMap,
      onRenderModeChange: setRenderMode,
      onZoneChange: (nextZoneId) => {
        handleToolChange(nextZoneId > 0 ? "zone" : "select");
        setZoneId(nextZoneId);
      },
      onZoneEditModeChange: (mode) => {
        handleToolChange("zone");
        setZoneEditMode(mode);
      },
      onZoneSelectionModeChange: (mode) => {
        handleToolChange("zone");
        setZoneSelectionMode(mode);
        setZoneRectangleAnchor(null);
      },
      onZoneFocusDirectionChange: setZoneFocusDirection,
      onZoneDefinitionChange: handleZoneDefinitionChange,
      onCreateZone: handleCreateZone,
      onZoneNeutralTerrainChange: setZoneNeutralTerrain,
      onZoneNeutralTerrainColorChange: setZoneNeutralTerrainColor,
      onZoneGridLinesVisibleChange: setZoneGridLinesVisible,
      onZoneGridLineColorChange: setZoneGridLineColor,
      onMapBackgroundColorChange: setMapBackgroundColor,
      onFocusActiveZone: () => {
        const activeZone = currentMap.zones.find((zone) => zone.numericId === zoneId);
        if (!activeZone) {
          setEditorMessage({ type: "error", text: "No active zone selected." });
          return;
        }
        if (!getZoneSurfaceBounds(editorSession.world, activeZone.numericId)) {
          setEditorMessage({ type: "error", text: `${activeZone.label} has no painted terrain footprint to focus.` });
          return;
        }
        dispatchBrowsing({ type: "selectZone", zoneId: activeZone.id });
        dispatchBrowsing({ type: "focusZone", previousViewId: currentMap.defaultCameraPresetId });
        setEditorMessage({ type: "info", text: `Focusing ${activeZone.label}.` });
      },
      onClearActiveZone: () => {
        const activeZone = currentMap.zones.find((zone) => zone.numericId === zoneId);
        if (!activeZone) {
          setEditorMessage({ type: "error", text: "No active zone selected." });
          return;
        }
        if (activeZone.locked) {
          setEditorMessage({ type: "error", text: `${activeZone.label} is locked.` });
          return;
        }
        const changes = [];
        for (let z = 0; z < editorSession.world.config.depth; z += 1) {
          for (let x = 0; x < editorSession.world.config.width; x += 1) {
            if (editorSession.world.getColumnZone(x, z) === zoneId) {
              changes.push({ coordinate: { x, y: 0, z }, before: zoneId, after: 0 });
            }
          }
        }
        const result = editorSession.applyZoneColumnChanges(`Clear ${activeZone.label}`, changes);
        mapHistoryRef.current.undo.push(currentMap);
        if (mapHistoryRef.current.undo.length > 80) {
          mapHistoryRef.current.undo.shift();
        }
        mapHistoryRef.current.redo = [];
        setCurrentMap(resetEditableZone(currentMap, zoneId));
        setEditorRevision((revision) => revision + 1);
        if (result.changed || editorSession.world.dirtyZoneChunks.size > 0) {
          replaceRebuiltChunks(result.rebuiltChunks);
        }
        setSelectedCell(null);
        setEditorMessage({ type: "info", text: changes.length ? `Removed ${activeZone.label} and cleared ${changes.length} column${changes.length === 1 ? "" : "s"}.` : `${activeZone.label} settings reset.` });
      },
      onUndo: handleUndo,
      onRedo: handleRedo,
      onResetUnsaved: handleResetUnsaved,
      onResetFlat: handleResetFlat,
      onExport: handleExport,
      onImport: handleImport,
      onClearDraft: handleClearDraft,
      onClose: onCloseEditor,
      onRemoveMarker: handleRemoveMarker,
      onBrushShapeChange: (shape: BrushShape) => updateToolBrushSettings(setBrushSettingsByTool, tool, (settings) => ({ ...settings, shape })),
      onBrushSizeChange: (size: number) => updateToolBrushSettings(setBrushSettingsByTool, tool, (settings) => ({ ...settings, size: Math.max(1, Math.min(9, Math.floor(size) || 1)) })),
      onPathWidthChange: (pathWidth: number) => updateToolBrushSettings(setBrushSettingsByTool, tool, (settings) => ({ ...settings, pathWidth: Math.max(1, Math.min(9, Math.floor(pathWidth) || 1)) })),
      onFlattenHeightChange: (flattenHeight: number) => updateToolBrushSettings(setBrushSettingsByTool, tool, (settings) => ({ ...settings, flattenHeight: Math.max(0, Math.min(11, Math.floor(flattenHeight) || 0)) })),
      onPrimitiveTypeChange: setPrimitiveType,
      onActivePrefabChange: (prefabId) => {
        const prefab = getPrefabDefinition(prefabId);
        setActivePrefabId(prefabId);
        setActivePrefabVariantId(prefab?.defaultVariantId ?? "");
        handleToolChange("entity");
      },
      onActivePrefabVariantChange: setActivePrefabVariantId,
      onPrefabSearchChange: setPrefabSearch,
      onEntityTransformModeChange: (mode) => {
        handleToolChange("entity");
        setEntityTransformMode(mode);
      },
      onCollisionModeChange: setCollisionMode,
      onEntityColorChange: setEntityColor,
      onEntityNameChange: setEntityName,
      onPlaceEntity: handlePlaceEntity,
      onPreviewEntityPopAnimation: () => {
        if (!activePrefabId) {
          setEditorMessage({ type: "error", text: "Select a prefab to preview its pop animation." });
          return;
        }
        setEntityPopPreviewCount((count) => count + 1);
        setEditorMessage({ type: "info", text: "Previewing object pop animation." });
      },
      onDuplicateEntity: handleDuplicateEntity,
      onDeleteEntity: handleDeleteEntity,
      onGroupEntity: handleGroupEntity,
      onUngroupEntity: handleUngroupEntity,
      onToggleEntityLocked: handleToggleEntityLocked,
      onToggleEntityHidden: handleToggleEntityHidden,
      onNavigationNodeTypeChange: setNavigationNodeType,
      onPlaceNavigationNode: handlePlaceNavigationNode,
      onConnectNavigationNodes: handleConnectNavigationNodes,
      onInfiniteWaterSourcesChange: () => undefined,
      onWaterSimulationPlayingChange: () => undefined,
      onWaterStep: () => undefined,
      onWaterSettle: () => undefined,
      onWaterReset: () => undefined,
      onWaterClearDerived: () => undefined,
      onWaterPreviewBasin: () => undefined,
      onWaterConfirmBasin: () => undefined,
      onWaterCancelBasin: () => undefined,
      onCreateRoute: handleCreateRoute,
      onLayerVisibilityChange: (id, visible) => updateLayer(id, { visible }),
      onLayerLockChange: (id, locked) => updateLayer(id, { locked }),
      onCleanPreviewChange: setCleanPreview,
    });
    incrementEditorPerfCounter("editorPanelPublishes");
  }, [
    autosaveStatus,
    activeMapId,
    availableMaps,
    currentMap,
    brushAffectedCellCount,
    brushSettings,
    editorPanelSignature,
    effectiveBrushSettings,
    cleanPreview,
    collisionMode,
    entityColor,
    entityName,
    entityTransformMode,
    entityPopPreviewCount,
    editorAvailable,
    editorMessage,
    editorRevision,
    hoveredCell,
    lastRebuiltChunks,
    onCloseEditor,
    onEditorStateChange,
    applyMaterialToAddedBlocks,
    paintBlockId,
    presetId,
    primitiveType,
    activePrefabId,
    activePrefabVariantId,
    prefabSearch,
    renderMode,
    selectedBlockId,
    selectedCell,
    selectedChunk,
    selectedLocal,
    selectedMarkerId,
    selectedEntity,
    selectedEntityIds,
    selectedWorldPosition,
    selectedZoneId,
    snapshot.blockEditCount,
    snapshot.entityAnchorCount,
    snapshot.hasUnsavedChanges,
    snapshot.redoDepth,
    snapshot.undoDepth,
    snapshot.zoneAssignmentCount,
    tool,
    validationSummary,
    zoneId,
    zoneEditMode,
    zoneSelectionMode,
    zoneNeutralTerrain,
    zoneNeutralTerrainColor,
    zoneGridLinesVisible,
    zoneGridLineColor,
    mapBackgroundColor,
    layerStates,
    navigationNodeType,
  ]);

  useEffect(() => {
    if (phase !== "explore") {
      onMapUiStateChange(null);
      return;
    }

    onMapUiStateChange({
      browsing,
      map: currentMap,
      zoneAssignmentCounts,
      hoveredZoneId,
      selectedMarkerId: browsing.mode === "itemSelected" || browsing.mode === "contentOpen" ? browsing.markerId : null,
      zoneFocusDirection: browsingZone?.focusDirection ?? zoneFocusDirection,
      onZoneFocusDirectionChange: setZoneFocusDirection,
      onSelectZone: (nextZoneId) => dispatchBrowsing({ type: "selectZone", zoneId: nextZoneId }),
      onFocusZone: () => dispatchBrowsing({ type: "focusZone", previousViewId: currentMap.defaultCameraPresetId }),
      onReturnOverview: () => dispatchBrowsing({ type: "returnToOverview", previousViewId: currentMap.defaultCameraPresetId }),
      onOpenContent: () => dispatchBrowsing({ type: "openContent" }),
      onCloseContent: () => dispatchBrowsing({ type: "closeContent" }),
    });

    return () => onMapUiStateChange(null);
  }, [browsing, browsingZone?.focusDirection, currentMap, hoveredZoneId, onMapUiStateChange, phase, zoneAssignmentCounts, zoneFocusDirection]);

  useEffect(() => {
    if (!editorAvailable) {
      return;
    }

    const timer = window.setTimeout(() => {
      try {
        const savedDraft = loadMapDraft(localStorage, currentMap.id);
        if (!savedDraft) {
          return;
        }
        if (savedDraft.metadata.authoringVersion !== currentMap.metadata.authoringVersion) {
          setAutosaveStatus("stale draft ignored");
          return;
        }

        const result = editorSession.replaceWithDocument(mapDefinitionToDocument(savedDraft), true);
        const nextTerrain = createTerrainDataFromWorld(editorSession.world);
        const nextZoneOverlay = buildZoneOverlayMeshes(editorSession.world);
        setCurrentMap(normalizeEditableMap(savedDraft));
        setTerrain(nextTerrain);
        setZoneOverlay(nextZoneOverlay);
        setLastRebuiltChunks(result.rebuiltChunkIds);
        setLastChunkRebuildMs(nextTerrain.surfaceBuildMs);
        setAutosaveStatus("draft restored");
        setEditorRevision((revision) => revision + 1);
      } catch {
        setAutosaveStatus("bad draft ignored");
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [currentMap.id, editorAvailable, editorSession]);

  useEffect(() => {
    if (!editorAvailable) {
      return;
    }

    const timer = window.setTimeout(() => {
      saveMapDraft(localStorage, createCurrentMapDefinition());
      setAutosaveStatus("local saved");
    }, 450);

    return () => window.clearTimeout(timer);
  }, [editorAvailable, editorRevision, editorSession, snapshot.hasUnsavedChanges]);

  useEffect(() => {
    if (phase !== "explore" || editorAvailable) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dispatchBrowsing({ type: "escape" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editorAvailable, phase]);

  useEffect(() => {
    if (browsing.mode !== "returningToOverview") {
      return;
    }

    const duration = activeCameraPreset?.transitionDuration ?? 0.9;
    const timer = window.setTimeout(() => {
      dispatchBrowsing({ type: "settleOverview" });
    }, reducedMotion ? 20 : duration * 1000);

    return () => window.clearTimeout(timer);
  }, [activeCameraPreset, browsing.mode, reducedMotion]);

  useEffect(() => {
    if (!editorAvailable) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedCell || selectedMarkerId) {
          setSelectedCell(null);
          setSelectedMarkerId(null);
        } else {
          onCloseEditor();
        }
      }

      const isUndoKey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z";
      const isRedoKey =
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z") ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y");

      if (isRedoKey) {
        event.preventDefault();
        handleRedo();
      } else if (isUndoKey) {
        event.preventDefault();
        handleUndo();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        handleDuplicateEntity();
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedEntityIds.length > 0) {
          event.preventDefault();
          handleDeleteEntity();
        }
      }

      if (["w", "e", "r", "f"].includes(event.key.toLowerCase()) && selectedEntityIds.length > 0) {
        setEditorMessage({ type: "info", text: `${event.key.toUpperCase()} shortcut reserved for transform controls.` });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editorAvailable, onCloseEditor, selectedCell, selectedMarkerId]);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    const startedAt = performance.now();
    gl.compile(scene, camera);

    const minimumLoaderMs = reducedMotion ? 80 : 280;
    const finish = () => {
      gsap.to(uniforms.uLoaderMotion, {
        value: 0,
        duration: reducedMotion ? 0.08 : 0.45,
        ease: "power2.out",
        onComplete: markReady,
      });
    };
    const remaining = Math.max(0, minimumLoaderMs - (performance.now() - startedAt));
    const timer = window.setTimeout(finish, remaining);

    return () => window.clearTimeout(timer);
  }, [camera, gl, markReady, reducedMotion, scene, uniforms.uLoaderMotion]);

  useEffect(() => {
    if (phase !== "expanding") {
      return;
    }

    const tween = gsap.to(uniforms.uExpansionProgress, {
      value: 1,
      duration: reducedMotion ? 0.45 : 2,
      ease: "none",
    });

    return () => {
      tween.kill();
    };
  }, [phase, reducedMotion, uniforms.uExpansionProgress]);

  useEffect(() => {
    if (!benchmarkMode) {
      return;
    }

    const defaultCamera: BenchmarkCameraTransform = {
      position: { x: 42, y: 52, z: 62 },
      target: { x: 0, y: 0, z: 0 },
    };

    window.__portfolioBenchmarkBridge = {
      getReadyState: () => ({
        phase,
        mapId: activeMapId,
        mapName: currentMap.name,
        mapRevision: currentMap.metadata.updatedAt ?? null,
        terrainReady: terrain.chunks.length > 0 && terrain.surfaceChunks.length > 0,
        shaderWarm: initializedRef.current,
        metricsReady: Boolean(window.__portfolioExperienceMetrics),
      }),
      loadMap: loadBenchmarkMap,
      enterLoadedMap: () => {
        uniforms.uExpansionProgress.value = 1;
        setBenchmarkInputEnabled(false);
        markExplore();
      },
      prepareReveal: () => {
        uniforms.uExpansionProgress.value = 0;
        setBenchmarkInputEnabled(false);
        markReady();
      },
      startReveal: () => {
        startExpansion();
      },
      setCamera: (transform) => {
        const target = new THREE.Vector3(transform.target.x, transform.target.y, transform.target.z);
        camera.position.set(transform.position.x, transform.position.y, transform.position.z);
        camera.lookAt(target);
      },
      resetCamera: () => {
        const target = new THREE.Vector3(defaultCamera.target.x, defaultCamera.target.y, defaultCamera.target.z);
        camera.position.set(defaultCamera.position.x, defaultCamera.position.y, defaultCamera.position.z);
        camera.lookAt(target);
      },
      setInputEnabled: setBenchmarkInputEnabled,
      setDpr: (dpr) => {
        if (originalPixelRatioRef.current === null) {
          originalPixelRatioRef.current = gl.getPixelRatio();
        }
        gl.setPixelRatio(dpr ?? originalPixelRatioRef.current);
      },
      getWorldMetrics: () => {
        const stats = editorSession.world.getStats();
        return {
          mapDimensions: { x: currentMap.dimensions.width, y: currentMap.dimensions.height, z: currentMap.dimensions.depth },
          logicalCells: stats.logicalCells,
          solidBlocks: stats.nonAirBlocks,
          airCells: stats.airCells,
          visibleFaces: terrain.surfaceQuadCount,
          renderedTerrainVertices: terrain.surfaceQuadCount * 4,
          renderedTerrainTriangles: terrain.surfaceTriangleCount,
          activeChunks: terrain.chunks.length,
          dirtyChunks: editorSession.world.dirtyChunks.size,
          staticPrefabCount: currentMap.entities.filter((entity) => entity.entityType === "prefab" && entity.appearance.visibleAtRuntime).length,
          dynamicPrefabCount: 0,
          interactiveObjectCount: currentMap.entities.filter((entity) => entity.appearance.visibleAtRuntime).length + currentMap.markers.filter((marker) => marker.runtimeVisible).length,
          visibleObjectCount: currentMap.entities.filter((entity) => entity.appearance.visibleAtRuntime).length,
          chunkRebuildCount: null,
          staticBatchRebuildCount: null,
        };
      },
    };

    return () => {
      if (originalPixelRatioRef.current !== null) {
        gl.setPixelRatio(originalPixelRatioRef.current);
      }
      delete window.__portfolioBenchmarkBridge;
    };
  }, [
    activeMapId,
    benchmarkMode,
    camera,
    currentMap,
    editorSession.world,
    gl,
    loadBenchmarkMap,
    markExplore,
    markReady,
    phase,
    startExpansion,
    terrain,
    uniforms.uExpansionProgress,
  ]);

  useFrame(({ clock }) => {
    // Shader uniforms are external Three.js state; updating them here avoids React rerenders.
    // eslint-disable-next-line react-hooks/immutability
    uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <>
      <color attach="background" args={[editorAvailable ? mapBackgroundColor : "#edf1ed"]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[24, 42, 18]} intensity={1.2} />
      <TerrainChunks
        chunks={terrain.chunks}
        uniforms={uniforms}
        visible={activeRenderMode === "instanced"}
      />
      <SurfaceTerrainChunks
        chunks={terrain.surfaceChunks}
        uniforms={uniforms}
        visible={activeRenderMode === "surface" || phase === "loading"}
        warmup={phase === "loading"}
        neutral={editorAvailable && zoneNeutralTerrain}
        neutralColor={zoneNeutralTerrainColor}
        gridLinesVisible={editorAvailable && zoneGridLinesVisible}
        gridLineColor={zoneGridLineColor}
      />
      <WorldEntryItem visible={phase === "ready"} position={LOADER_ORIGIN_WORLD} onActivate={startExpansion} />
      <ConstrainedMapControls
        enabled={benchmarkMode ? benchmarkInputEnabled : isInteractivePhase(phase) && !entityTransformDragging}
        phase={phase}
        editorMinZoomDistance={editorAvailable ? editorMinZoomDistance : undefined}
        focusPreset={activeCameraPreset}
        reducedMotion={reducedMotion}
        onFocusComplete={markExpanding}
        onExpansionComplete={markExplore}
      />
      <RenderInvalidator phase={phase} />
      <EditorInteractionOverlay
        editorEnabled={editorAvailable && !entityTransformDragging}
        tool={tool}
        zoneSelectionMode={zoneSelectionMode}
        renderMode={activeRenderMode}
        chunks={terrain.chunks}
        surfaceChunks={terrain.surfaceChunks}
        entities={currentMap.entities}
        world={editorSession.world}
        hoveredCell={hoveredCell}
        onHoverCell={setHoveredCell}
        onZoneRectangleAnchor={setZoneRectangleAnchor}
        onEditCell={handleEditorCell}
        onEditCells={handleEditorCells}
      />
      <BrushFootprintIndicator
        coordinate={hoveredCell}
        tool={tool}
        zoneEditMode={zoneEditMode}
        zoneSelectionMode={zoneSelectionMode}
        zoneRectangleAnchor={zoneRectangleAnchor}
        settings={effectiveBrushSettings}
        world={editorSession.world}
        blockId={paintBlockId}
        zoneId={zoneId}
        revision={previewRevision}
        visible={editorAvailable && tool !== "entity" && tool !== "add" && !cleanPreview && isLayerVisible(layerStates, "developmentHelpers")}
        color={tool === "zone" && activeZoneDefinition ? activeZoneDefinition.color : TOOL_COLORS[tool]}
      />
      <BlockPlacementGhost
        coordinate={hoveredCell}
        visible={editorAvailable && tool === "add" && !cleanPreview && isLayerVisible(layerStates, "developmentHelpers")}
        blockId={getTerrainMutationBlockId(tool, "fill", paintBlockId, activeShapeId, applyMaterialToAddedBlocks)}
        shapeId={activeShapeId}
        rotation={activeRotation}
        state={activeShapeState}
      />
      <ObjectPlacementPreview
        coordinate={hoveredCell}
        tool={tool}
        world={editorSession.world}
        primitiveType={primitiveType}
        prefabId={activePrefabId}
        variantId={activePrefabVariantId}
        color={entityColor}
        visible={editorAvailable && !cleanPreview && isLayerVisible(layerStates, "entities") && !isLayerLocked(layerStates, "entities")}
      />
      <ObjectPopAnimationPreview
        requestCount={entityPopPreviewCount}
        coordinate={hoveredCell ?? selectedCell}
        world={editorSession.world}
        prefabId={activePrefabId}
        variantId={activePrefabVariantId}
        visible={editorAvailable && !cleanPreview && isLayerVisible(layerStates, "entities")}
      />
      <EditorMarkers
        editorEnabled={editorAvailable && !cleanPreview && isLayerVisible(layerStates, "markers")}
        entities={editorSession.entities}
        world={editorSession.world}
        selectedMarkerId={selectedMarkerId}
        onSelectMarker={(id) => {
          setSelectedMarkerId(id);
          setSelectedCell(null);
          setSelectedEntityIds([]);
        }}
      />
      <EditorPlacedEntities
        editorEnabled={phase === "explore"}
        cleanPreview={cleanPreview}
        layerVisible={isLayerVisible(layerStates, "entities")}
        entities={currentMap.entities.filter((entity) => entity.entityType !== "prefab")}
        selectedEntityIds={selectedEntityIds}
        transformMode={entityTransformMode}
        transformEnabled={!cleanPreview && selectedEntityIds.length === 1}
        onSelectEntity={(id, additive) => {
          setSelectedEntityIds((ids) => additive ? [...new Set([...ids, id])] : [id]);
          setSelectedCell(null);
          setSelectedMarkerId(null);
        }}
        onTransformDraggingChange={setEntityTransformDragging}
        onTransformEntity={handleTransformEntity}
      />
      <EditorPrefabEntities
        // Previously gated to phase === "explore" only, so every object
        // popped into existence all at once the instant the reveal
        // animation finished instead of being part of the world as it grew
        // in. Visible from "expanding" (when the reveal itself starts)
        // onward so objects are already there, alongside the terrain,
        // rather than snapping in afterward.
        visible={(phase === "expanding" || phase === "explore") && isLayerVisible(layerStates, "entities")}
        cleanPreview={cleanPreview}
        entities={currentMap.entities.filter((entity) => entity.entityType === "prefab")}
        selectedEntityIds={selectedEntityIds}
        transformMode={entityTransformMode}
        transformEnabled={editorAvailable && !cleanPreview && selectedEntityIds.length === 1}
        popAnimationEntityId={entityPopAnimationId}
        onPopAnimationComplete={() => setEntityPopAnimationId(null)}
        onSelectEntity={(id, additive) => {
          setSelectedEntityIds((ids) => additive ? [...new Set([...ids, id])] : [id]);
          setSelectedCell(null);
          setSelectedMarkerId(null);
        }}
        onTransformDraggingChange={setEntityTransformDragging}
        onTransformEntity={handleTransformEntity}
      />
      <EditorNavigationHelpers
        editorEnabled={editorAvailable && !cleanPreview && isLayerVisible(layerStates, "navigation")}
        map={currentMap}
      />
      {editorAvailable && !cleanPreview && isLayerVisible(layerStates, "zones") ? (
        <ZoneOverlayChunks
          map={currentMap}
          chunks={zoneOverlay.chunks}
          browsing={editorZoneBrowsing}
          interactive={false}
          onHoverZone={() => undefined}
          onSelectZone={() => undefined}
        />
      ) : null}
      <MapInteractionProxies
        map={currentMap}
        world={editorSession.world}
        zoneOverlayChunks={zoneOverlay.chunks}
        enabled={phase === "explore" && !editorAvailable}
        browsing={browsing}
        onHoverZone={setHoveredZoneId}
        onSelectZone={(nextZoneId) => dispatchBrowsing({ type: "selectZone", zoneId: nextZoneId })}
        onSelectMarker={(marker) => {
          const itemId = marker.contentReference?.contentId ?? marker.id;
          dispatchBrowsing({
            type: "selectItem",
            markerId: marker.id,
            itemId,
            zoneId: marker.zoneId,
            previousViewId: currentMap.defaultCameraPresetId,
          });
        }}
      />
      <DevelopmentMetrics
        phase={phase}
        logicalCells={dynamicStats.logicalCells}
        airCells={dynamicStats.airCells}
        nonAirBlocks={dynamicStats.nonAirBlocks}
        chunks={terrain.chunks.length}
        instances={dynamicStats.renderedInstances}
        animatedInstances={activeRenderMode === "instanced" ? dynamicStats.renderedInstances : 0}
        staticTerrainInstances={0}
        surfaceChunks={terrain.surfaceChunks}
        surfaceQuads={terrain.surfaceQuadCount}
        surfaceTriangles={terrain.surfaceTriangleCount}
        renderMode={activeRenderMode}
        dirtyChunks={editorSession.world.dirtyChunks.size}
        lastRebuiltChunks={lastRebuiltChunks.join(",")}
        lastChunkRebuildMs={lastChunkRebuildMs}
        surfaceBuildMs={terrain.surfaceBuildMs}
        blockEditCount={snapshot.blockEditCount}
        zoneAssignmentCount={snapshot.zoneAssignmentCount}
        entityAnchorCount={snapshot.entityAnchorCount}
        undoDepth={snapshot.undoDepth}
        redoDepth={snapshot.redoDepth}
      />
    </>
  );
}

function TerrainChunks({
  chunks,
  uniforms,
  visible,
}: {
  chunks: TerrainChunk[];
  uniforms: TerrainUniforms;
  visible: boolean;
}) {
  const geometry = useMemo(() => createOpenBottomBlockGeometry(1.01, 1.01, 1.01), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: BLOCK_VERTEX_SHADER,
        fragmentShader: BLOCK_FRAGMENT_SHADER,
      }),
    [uniforms],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <group visible={visible}>
      {chunks.map((chunk) => (
        <TerrainChunkMesh
          key={chunk.id}
          chunk={chunk}
          geometry={geometry}
          material={material}
        />
      ))}
    </group>
  );
}

function SurfaceTerrainChunks({
  chunks,
  uniforms,
  visible,
  warmup,
  neutral,
  neutralColor,
  gridLinesVisible,
  gridLineColor,
}: {
  chunks: SurfaceChunkMeshData[];
  uniforms: TerrainUniforms;
  visible: boolean;
  warmup: boolean;
  neutral: boolean;
  neutralColor: string;
  gridLinesVisible: boolean;
  gridLineColor: string;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: SURFACE_VERTEX_SHADER,
        fragmentShader: SURFACE_FRAGMENT_SHADER,
        side: THREE.FrontSide,
      }),
    [uniforms],
  );
  const neutralMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: neutralColor,
        roughness: 0.74,
        metalness: 0,
      }),
    [neutralColor],
  );
  const gridLineMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: gridLineColor,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    [gridLineColor],
  );
  const warmupMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: SURFACE_VERTEX_SHADER,
        fragmentShader: SURFACE_FRAGMENT_SHADER,
        side: THREE.FrontSide,
        colorWrite: false,
        depthWrite: false,
      }),
    [uniforms],
  );

  useEffect(() => {
    return () => {
      material.dispose();
      neutralMaterial.dispose();
      gridLineMaterial.dispose();
      warmupMaterial.dispose();
    };
  }, [gridLineMaterial, material, neutralMaterial, warmupMaterial]);

  return (
    <group visible={visible}>
      {chunks.map((chunk) => (
        <SurfaceTerrainChunkMesh
          key={chunk.id}
          chunk={chunk}
          material={warmup ? warmupMaterial : neutral ? neutralMaterial : material}
          gridLineMaterial={gridLineMaterial}
          gridLinesVisible={gridLinesVisible}
        />
      ))}
    </group>
  );
}

function SurfaceTerrainChunkMesh({
  chunk,
  material,
  gridLineMaterial,
  gridLinesVisible,
}: {
  chunk: SurfaceChunkMeshData;
  material: THREE.Material;
  gridLineMaterial: THREE.Material;
  gridLinesVisible: boolean;
}) {
  const geometry = useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute("position", new THREE.BufferAttribute(chunk.positions, 3));
    nextGeometry.setAttribute("normal", new THREE.BufferAttribute(chunk.normals, 3));
    nextGeometry.setAttribute("color", new THREE.BufferAttribute(chunk.colors, 3));
    nextGeometry.setAttribute("aVariation", new THREE.BufferAttribute(chunk.variations, 1));
    nextGeometry.setAttribute("aRevealDelay", new THREE.BufferAttribute(chunk.revealDelays, 1));
    nextGeometry.setAttribute("aCellOrigin", new THREE.BufferAttribute(chunk.cellOrigins, 3));
    nextGeometry.setAttribute("aCenterFlag", new THREE.BufferAttribute(chunk.centerFlags, 1));
    nextGeometry.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
    nextGeometry.computeBoundingBox();
    nextGeometry.computeBoundingSphere();
    return nextGeometry;
  }, [chunk]);
  const edgeGeometry = useMemo(() => new THREE.EdgesGeometry(geometry, 8), [geometry]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      edgeGeometry.dispose();
    };
  }, [edgeGeometry, geometry]);

  return (
    <group>
      <mesh
        geometry={geometry}
        material={material}
        userData={{
          portfolioSurfaceChunkId: chunk.id,
          portfolioSurfaceTriangleToCell: chunk.triangleToCell,
        }}
        frustumCulled
      />
      {gridLinesVisible ? (
        <lineSegments
          geometry={edgeGeometry}
          material={gridLineMaterial}
          position={[0, 0.003, 0]}
          frustumCulled
        />
      ) : null}
    </group>
  );
}

function WorldEntryItem({
  visible,
  position,
  onActivate,
}: {
  visible: boolean;
  position: THREE.Vector3;
  onActivate: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const introOffset = useRef({ value: -0.32 });
  const crystalMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#d8b45a",
        emissive: "#4a3210",
        emissiveIntensity: 0.45,
        metalness: 0.35,
        opacity: 0,
        roughness: 0.28,
        transparent: true,
      }),
    [],
  );
  const ringMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#263b34",
        emissive: "#18221f",
        emissiveIntensity: 0.18,
        metalness: 0.1,
        opacity: 0,
        roughness: 0.46,
        transparent: true,
      }),
    [],
  );
  const hitAreaMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      crystalMaterial.dispose();
      ringMaterial.dispose();
      hitAreaMaterial.dispose();
    };
  }, [crystalMaterial, hitAreaMaterial, ringMaterial]);

  // Three.js materials are imperative GPU resources; GSAP mutates their opacity outside React state.
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    const group = groupRef.current;

    if (!visible) {
      document.body.style.cursor = "";
      gsap.killTweensOf([group?.scale, introOffset.current, crystalMaterial, ringMaterial]);
      // eslint-disable-next-line react-hooks/immutability
      crystalMaterial.opacity = 0;
      // eslint-disable-next-line react-hooks/immutability
      ringMaterial.opacity = 0;
      group?.scale.setScalar(0.18);
      introOffset.current.value = -0.32;
      return;
    }

    introOffset.current.value = -0.32;
    crystalMaterial.opacity = 0;
    ringMaterial.opacity = 0;

    if (group) {
      group.scale.setScalar(0.18);
    }

    const timeline = gsap.timeline();
    timeline.to(introOffset.current, { value: 0, duration: 0.78, ease: "back.out(1.7)" }, 0);
    if (group) {
      timeline.to(group.scale, { x: 1, y: 1, z: 1, duration: 0.78, ease: "back.out(1.7)" }, 0);
    }
    timeline.to([crystalMaterial, ringMaterial], { opacity: 1, duration: 0.42, ease: "power2.out" }, 0.05);

    return () => {
      timeline.kill();
    };
  }, [crystalMaterial, ringMaterial, visible]);

  useFrame(({ clock }) => {
    const group = groupRef.current;

    if (!group || !visible) {
      return;
    }

    group.position.y = 1.08 + introOffset.current.value + Math.sin(clock.elapsedTime * 2.8) * 0.05;
    group.rotation.y = clock.elapsedTime * 0.85;
  });

  const handlePointer = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onActivate();
  };

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = "pointer";
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = "";
  };

  return (
    <group
      ref={groupRef}
      visible={visible}
      // The loader platform used to be a y=0 cube (top at world Y 1.0); it's
      // now the y=2 slab (top at world Y 2.5) — same +1.5 offset applied
      // here so the beacon keeps hovering just above the platform's actual
      // surface instead of sitting inside/below it.
      position={[position.x, 2.26, position.z]}
      onClick={handlePointer}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <mesh material={ringMaterial} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.28, 0]}>
        <torusGeometry args={[0.42, 0.035, 8, 24]} />
      </mesh>
      <mesh material={crystalMaterial} scale={[0.58, 0.82, 0.58]}>
        <octahedronGeometry args={[0.42, 0]} />
      </mesh>
      <mesh material={hitAreaMaterial}>
        <sphereGeometry args={[0.95, 12, 8]} />
      </mesh>
    </group>
  );
}

function TerrainChunkMesh({
  chunk,
  geometry,
  material,
}: {
  chunk: TerrainChunk;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const chunkGeometry = useMemo(() => {
    const clonedGeometry = geometry.clone();
    const revealData = new Float32Array(CHUNK_MAX_INSTANCE_COUNT * 3);
    const blockColors = new Float32Array(CHUNK_MAX_INSTANCE_COUNT * 3);

    clonedGeometry.setAttribute("aRevealData", new THREE.InstancedBufferAttribute(revealData, 3).setUsage(THREE.DynamicDrawUsage));
    clonedGeometry.setAttribute("aBlockColor", new THREE.InstancedBufferAttribute(blockColors, 3).setUsage(THREE.DynamicDrawUsage));

    return clonedGeometry;
  }, [geometry]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;

    if (!mesh) {
      return;
    }

    const matrix = new THREE.Matrix4();
    const revealData = chunkGeometry.getAttribute("aRevealData") as THREE.InstancedBufferAttribute;
    const blockColors = chunkGeometry.getAttribute("aBlockColor") as THREE.InstancedBufferAttribute;

    chunk.cells.forEach((cell, index) => {
      const offset = index * 3;
      matrix.makeTranslation(cell.worldX, cell.worldY, cell.worldZ);
      mesh.setMatrixAt(index, matrix);
      revealData.array[offset] = cell.expansionDelay;
      revealData.array[offset + 1] = cell.variation;
      revealData.array[offset + 2] = cell.isCenterLoaderBlock ? 1 : 0;
      blockColors.array[offset] = cell.color[0];
      blockColors.array[offset + 1] = cell.color[1];
      blockColors.array[offset + 2] = cell.color[2];
    });

    mesh.userData.portfolioChunkId = chunk.id;
    mesh.count = chunk.cells.length;
    mesh.instanceMatrix.needsUpdate = true;
    revealData.needsUpdate = true;
    blockColors.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [chunk, chunkGeometry]);

  useEffect(() => {
    return () => {
      chunkGeometry.dispose();
    };
  }, [chunkGeometry]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[chunkGeometry, material, CHUNK_MAX_INSTANCE_COUNT]}
      frustumCulled={false}
    />
  );
}

function EditorInteractionOverlay({
  editorEnabled,
  tool,
  zoneSelectionMode,
  renderMode,
  chunks,
  surfaceChunks,
  entities,
  world,
  hoveredCell,
  onHoverCell,
  onZoneRectangleAnchor,
  onEditCell,
  onEditCells,
}: {
  editorEnabled: boolean;
  tool: EditorTool;
  zoneSelectionMode: ZoneSelectionMode;
  renderMode: TerrainRenderMode;
  chunks: TerrainChunk[];
  surfaceChunks: SurfaceChunkMeshData[];
  entities: PlacedMapEntity[];
  world: MapEditorSession["world"];
  hoveredCell: GridCoordinate | null;
  onHoverCell: (coordinate: GridCoordinate | null) => void;
  onZoneRectangleAnchor: (coordinate: GridCoordinate | null) => void;
  onEditCell: (coordinate: GridCoordinate) => void;
  onEditCells: (coordinates: GridCoordinate[]) => void;
}) {
  const { camera, gl, raycaster, scene } = useThree();
  const chunkById = useMemo(() => new Map(chunks.map((chunk) => [chunk.id, chunk])), [chunks]);
  const surfaceChunkById = useMemo(() => new Map(surfaceChunks.map((chunk) => [chunk.id, chunk])), [surfaceChunks]);
  const mousePosition = useRef(new THREE.Vector2(0, 0));
  const pointerDownPosition = useRef<{ x: number; y: number } | null>(null);
  const zoneRectangleAnchorRef = useRef<GridCoordinate | null>(null);
  const brushActive = useRef(false);
  const brushedCellKeys = useRef(new Set<string>());
  const brushedCells = useRef<GridCoordinate[]>([]);
  const continuousStrokeTool = useRef<EditorTool | null>(null);
  const lastStrokePointerPosition = useRef<{ x: number; y: number } | null>(null);
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const planeIntersection = useRef(new THREE.Vector3());
  const shouldRaycast = useRef(true);
  const editorTargets = useRef<{ chunks: THREE.InstancedMesh[]; surfaces: THREE.Mesh[]; entities: THREE.Mesh[] }>({ chunks: [], surfaces: [], entities: [] });
  const raycastHits = useRef<THREE.Intersection[]>([]);

  useEffect(() => {
    const chunksList: THREE.InstancedMesh[] = [];
    const surfacesList: THREE.Mesh[] = [];
    const entitiesList: THREE.Mesh[] = [];

    scene.traverse((object) => {
      incrementEditorPerfCounter("sceneTraversals");
      if ((object as THREE.InstancedMesh).isInstancedMesh && typeof object.userData.portfolioChunkId === "string") {
        chunksList.push(object as THREE.InstancedMesh);
      }
      if ((object as THREE.Mesh).isMesh && typeof object.userData.portfolioSurfaceChunkId === "string") {
        surfacesList.push(object as THREE.Mesh);
      }
      if ((object as THREE.Mesh).isMesh && typeof object.userData.portfolioEntityId === "string") {
        entitiesList.push(object as THREE.Mesh);
      }
    });

    editorTargets.current = { chunks: chunksList, surfaces: surfacesList, entities: entitiesList };
    shouldRaycast.current = true;
  }, [chunks, entities, scene, surfaceChunks]);

  useEffect(() => {
    if (!editorEnabled) {
      onHoverCell(null);
      return;
    }

    const updateMousePosition = (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        onHoverCell(null);
        shouldRaycast.current = false;
        return false;
      }

      mousePosition.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mousePosition.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      shouldRaycast.current = true;
      return true;
    };

    const paintCurrentHover = () => {
      raycaster.setFromCamera(mousePosition.current, camera);
      incrementEditorPerfCounter("raycasts");
      const currentHover = getHoveredEditorCell(editorTargets.current, raycastHits.current, raycaster, chunkById, surfaceChunkById, world, tool, renderMode);
      if (!currentHover) {
        return null;
      }

      const key = getStrokeBrushKey(tool, currentHover);
      if (brushedCellKeys.current.has(key)) {
        return null;
      }

      brushedCellKeys.current.add(key);
      brushedCells.current.push(currentHover);
      return currentHover;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isEditorUiEvent(event)) {
        return;
      }

      if (!updateMousePosition(event)) {
        pointerDownPosition.current = null;
        return;
      }
      pointerDownPosition.current = { x: event.clientX, y: event.clientY };

      if (tool === "zone" && zoneSelectionMode === "rectangle") {
        raycaster.setFromCamera(mousePosition.current, camera);
        incrementEditorPerfCounter("raycasts");
        const currentHover = getHoveredEditorCell(editorTargets.current, raycastHits.current, raycaster, chunkById, surfaceChunkById, world, tool, renderMode);
        zoneRectangleAnchorRef.current = currentHover;
        onZoneRectangleAnchor(currentHover);
      } else if (shouldStartContinuousTerrainStroke(tool, event)) {
        brushActive.current = true;
        continuousStrokeTool.current = tool;
        brushedCellKeys.current.clear();
        brushedCells.current = [];
        lastStrokePointerPosition.current = null;
        const paintedHover = paintCurrentHover();
        if (paintedHover && shouldApplyStrokeImmediately(tool, zoneSelectionMode)) {
          onEditCell(paintedHover);
          lastStrokePointerPosition.current = { x: event.clientX, y: event.clientY };
        }
      }

      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!updateMousePosition(event)) {
        return;
      }

      if (!brushActive.current || !shouldContinueContinuousTerrainStroke(continuousStrokeTool.current, event) || (event.buttons & 1) !== 1 || isEditorUiEvent(event)) {
        return;
      }

      if (!shouldAdvanceContinuousStroke(continuousStrokeTool.current, lastStrokePointerPosition.current, event)) {
        return;
      }

      const paintedHover = paintCurrentHover();
      if (paintedHover) {
        if (shouldApplyStrokeImmediately(tool, zoneSelectionMode)) {
          onEditCell(paintedHover);
          lastStrokePointerPosition.current = { x: event.clientX, y: event.clientY };
        }
        event.preventDefault();
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (tool === "zone" && zoneSelectionMode === "rectangle" && zoneRectangleAnchorRef.current) {
        raycaster.setFromCamera(mousePosition.current, camera);
        incrementEditorPerfCounter("raycasts");
        const currentHover = getHoveredEditorCell(editorTargets.current, raycastHits.current, raycaster, chunkById, surfaceChunkById, world, tool, renderMode);
        const anchor = zoneRectangleAnchorRef.current;
        zoneRectangleAnchorRef.current = null;
        onZoneRectangleAnchor(null);
        pointerDownPosition.current = null;
        if (currentHover) {
          onEditCells(getZoneRectangleFootprint(anchor, currentHover));
          event.preventDefault();
        }
        return;
      }

      if (brushActive.current) {
        brushActive.current = false;
        if (!shouldApplyStrokeImmediately(tool, zoneSelectionMode)) {
          onEditCells(brushedCells.current);
        }
        brushedCellKeys.current.clear();
        brushedCells.current = [];
        continuousStrokeTool.current = null;
        lastStrokePointerPosition.current = null;
        pointerDownPosition.current = null;
        event.preventDefault();
        return;
      }

      if (event.button !== 0 || !pointerDownPosition.current || isEditorUiEvent(event)) {
        pointerDownPosition.current = null;
        return;
      }

      const moved = getPointerGestureDistance(pointerDownPosition.current, event);
      pointerDownPosition.current = null;

      if (moved <= POINTER_CLICK_MAX_DISTANCE_PX) {
        raycaster.setFromCamera(mousePosition.current, camera);
        incrementEditorPerfCounter("raycasts");
        if ((tool === "entity" || tool === "select") && hasHoveredEditorEntity(editorTargets.current.entities, raycastHits.current, raycaster)) {
          return;
        }
        const currentHover = getHoveredEditorCell(editorTargets.current, raycastHits.current, raycaster, chunkById, surfaceChunkById, world, tool, renderMode);
        if (currentHover && shouldApplySingleShotEditOnPointerUp(tool)) {
          event.preventDefault();
          onEditCell(currentHover);
        }
      }
    };

    const handlePointerCancel = () => {
      brushActive.current = false;
      zoneRectangleAnchorRef.current = null;
      onZoneRectangleAnchor(null);
      brushedCellKeys.current.clear();
      brushedCells.current = [];
      continuousStrokeTool.current = null;
      lastStrokePointerPosition.current = null;
      pointerDownPosition.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("pointerup", handlePointerUp, { capture: true });
    window.addEventListener("pointercancel", handlePointerCancel, { capture: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("pointerup", handlePointerUp, { capture: true });
      window.removeEventListener("pointercancel", handlePointerCancel, { capture: true });
    };
  }, [camera, chunkById, editorEnabled, gl.domElement, onEditCell, onEditCells, onHoverCell, onZoneRectangleAnchor, raycaster, renderMode, surfaceChunkById, tool, world, zoneSelectionMode]);

  useEffect(() => {
    shouldRaycast.current = true;
  }, [chunkById, surfaceChunkById]);

  useFrame(() => {
    if (!editorEnabled || !shouldRaycast.current) {
      return;
    }

    shouldRaycast.current = false;
    raycaster.setFromCamera(mousePosition.current, camera);
    incrementEditorPerfCounter("raycasts");
    const nextHoveredCell = getHoveredEditorCell(
      editorTargets.current,
      raycastHits.current,
      raycaster,
      chunkById,
      surfaceChunkById,
      world,
      tool,
      renderMode,
      groundPlane.current,
      planeIntersection.current,
    );

    if (!sameCoordinate(hoveredCell, nextHoveredCell)) {
      onHoverCell(nextHoveredCell);
    }
  });

  return null;
}

function getHoveredEditorCell(
  terrainTargets: { chunks: THREE.InstancedMesh[]; surfaces: THREE.Mesh[] },
  hits: THREE.Intersection[],
  raycaster: THREE.Raycaster,
  chunkById: Map<string, TerrainChunk>,
  surfaceChunkById: Map<string, SurfaceChunkMeshData>,
  world: MapEditorSession["world"],
  tool: EditorTool,
  renderMode: TerrainRenderMode,
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  planeIntersection = new THREE.Vector3(),
) {
  hits.length = 0;
  raycaster.intersectObjects(renderMode === "surface" ? terrainTargets.surfaces : terrainTargets.chunks, false, hits);
  const hit = hits[0];

  if (hit && hit.instanceId !== undefined) {
    const chunk = chunkById.get(hit.object.userData.portfolioChunkId as string);
    const cellIndex = chunk?.instanceToCell[hit.instanceId];
    if (cellIndex !== undefined) {
      const coordinate = world.getCoordinates(cellIndex);
      if (coordinate) {
        if (tool === "add") {
          return getAdjacentFaceCoordinate(coordinate, hit.face?.normal, world);
        }

        return coordinate;
      }
    }
  }

  if (hit && typeof hit.faceIndex === "number" && typeof hit.object.userData.portfolioSurfaceChunkId === "string") {
    const surfaceChunk = surfaceChunkById.get(hit.object.userData.portfolioSurfaceChunkId as string);
    const cellIndex = surfaceChunk?.triangleToCell[hit.faceIndex];
    if (cellIndex !== undefined) {
      const coordinate = world.getCoordinates(cellIndex);
      if (coordinate) {
        if (tool === "add") {
          return getAdjacentFaceCoordinate(coordinate, hit.face?.normal, world);
        }

        return coordinate;
      }
    }
  }

  if (usesGroundPlaneFallback(tool) && raycaster.ray.intersectPlane(groundPlane, planeIntersection)) {
    const gridCoordinate = world.worldToGrid({ x: planeIntersection.x, y: 0, z: planeIntersection.z });
    if (gridCoordinate) {
      const topY = world.getHighestNonAirY(gridCoordinate.x, gridCoordinate.z);
      return { x: gridCoordinate.x, y: Math.max(0, topY ?? 0), z: gridCoordinate.z };
    }
  }

  return null;
}

function hasHoveredEditorEntity(
  entityTargets: THREE.Mesh[],
  hits: THREE.Intersection[],
  raycaster: THREE.Raycaster,
) {
  hits.length = 0;
  raycaster.intersectObjects(entityTargets, false, hits);
  return hits.length > 0;
}

function getAdjacentFaceCoordinate(
  coordinate: GridCoordinate,
  normal: THREE.Vector3 | undefined,
  world: MapEditorSession["world"],
) {
  if (!normal) {
    return null;
  }

  const target = {
    x: coordinate.x + Math.round(normal.x),
    y: coordinate.y + Math.round(normal.y),
    z: coordinate.z + Math.round(normal.z),
  };

  return world.isInsideWorld(target.x, target.y, target.z) ? target : null;
}

function usesGroundPlaneFallback(tool: EditorTool) {
  return tool === "raise" || tool === "lower" || tool === "marker";
}

function SelectionIndicator({
  coordinate,
  visible,
  color,
  filled = false,
}: {
  coordinate: GridCoordinate | null;
  visible: boolean;
  color: string;
  filled?: boolean;
}) {
  const wireGeometry = useMemo(() => new THREE.BoxGeometry(1.06, 1.06, 1.06), []);
  const fillGeometry = useMemo(() => new THREE.BoxGeometry(0.98, 0.98, 0.98), []);
  const wireMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color, wireframe: true, depthTest: false }), [color]);
  const fillMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }),
    [color],
  );

  useEffect(() => {
    return () => {
      wireGeometry.dispose();
      fillGeometry.dispose();
      wireMaterial.dispose();
      fillMaterial.dispose();
    };
  }, [fillGeometry, fillMaterial, wireGeometry, wireMaterial]);

  if (!visible || !coordinate) {
    return null;
  }

  const worldPosition = {
    x: (coordinate.x - 31.5),
    y: coordinate.y + 0.5,
    z: (coordinate.z - 31.5),
  };

  return (
    <group position={[worldPosition.x, worldPosition.y, worldPosition.z]} renderOrder={10}>
      {filled ? <mesh geometry={fillGeometry} material={fillMaterial} /> : null}
      <mesh geometry={wireGeometry} material={wireMaterial} />
    </group>
  );
}

function BlockPlacementGhost({
  coordinate,
  visible,
  blockId,
  shapeId,
  rotation,
  state,
}: {
  coordinate: GridCoordinate | null;
  visible: boolean;
  blockId: BlockId;
  shapeId: ShapeId;
  rotation: CellRotation;
  state: number;
}) {
  const shape = getShapeDefinition(shapeId);
  const blockColor = getBlockDefinition(blockId).developmentColor;
  const geometry = useMemo(() => createShapePreviewGeometry(shape.faces(rotation, state), blockColor), [blockColor, rotation, shape, state]);
  const material = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERTEX_SHADER,
      fragmentShader: SURFACE_FRAGMENT_SHADER,
      side: THREE.FrontSide,
    }),
    [],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  if (!visible || !coordinate) {
    return null;
  }

  return (
    <group position={[coordinate.x - 31.5, coordinate.y + 0.5, coordinate.z - 31.5]} renderOrder={12}>
      <mesh geometry={geometry} material={material} />
    </group>
  );
}

function createShapePreviewGeometry(faces: ShapeFace[], colorHex: string) {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const variations: number[] = [];
  const indices: number[] = [];
  const color = hexToRgb(colorHex);

  faces.forEach((face) => {
    const base = positions.length / 3;
    face.corners.forEach(([x, y, z]) => {
      positions.push(x * 1.01, y * 1.01, z * 1.01);
      normals.push(face.normal[0], face.normal[1], face.normal[2]);
      colors.push(...color);
      variations.push(0.5);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aVariation", new THREE.Float32BufferAttribute(variations, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalizedHex = hex.replace("#", "");
  const value = Number.parseInt(normalizedHex, 16);

  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

function BrushFootprintIndicator({
  coordinate,
  tool,
  zoneEditMode,
  zoneSelectionMode,
  zoneRectangleAnchor,
  settings,
  world,
  blockId,
  zoneId,
  revision,
  visible,
  color,
}: {
  coordinate: GridCoordinate | null;
  tool: EditorTool;
  zoneEditMode: ZoneEditMode;
  zoneSelectionMode: ZoneSelectionMode;
  zoneRectangleAnchor: GridCoordinate | null;
  settings: TerrainBrushSettings;
  world: MapEditorSession["world"];
  blockId: BlockId;
  zoneId: number;
  revision: number;
  visible: boolean;
  color: string;
}) {
  const flattenCells = useMemo(
    () => {
      void revision;
      return tool === "flatten" && coordinate
        ? getFlattenPreviewCells(coordinate, settings, world)
        : [];
    },
    [coordinate, revision, settings, tool, world],
  );
  const cells = useMemo(
    () => {
      void revision;
      if (tool === "flatten") {
        return [];
      }
      if (tool === "zone" && coordinate) {
        return zoneSelectionMode === "rectangle" && zoneRectangleAnchor
          ? getZoneRectangleFootprint(zoneRectangleAnchor, coordinate)
          : getZoneBrushFootprint(coordinate, settings);
      }
      return coordinate ? getToolPreviewFootprint(coordinate, tool, settings, world, blockId, zoneId) : [];
    },
    [blockId, coordinate, revision, settings, tool, world, zoneId, zoneRectangleAnchor, zoneSelectionMode],
  );
  const previewStyle = getBrushPreviewStyle(tool);
  const zonePreviewColor = zoneEditMode === "erase" ? "#facc15" : color;
  return (
    <>
      {flattenCells.map((cell) => (
        cell.hasSurface ? (
          <SurfaceBrushCellIndicator
            key={`${cell.coordinate.x}-${cell.coordinate.y}-${cell.coordinate.z}-${cell.action}`}
            coordinate={cell.coordinate}
            world={world}
            visible={visible}
            color={FLATTEN_PREVIEW_COLORS[cell.action]}
          />
        ) : (
          <SelectionIndicator
            key={`${cell.coordinate.x}-${cell.coordinate.y}-${cell.coordinate.z}-${cell.action}`}
            coordinate={cell.coordinate}
            visible={visible}
            color={FLATTEN_PREVIEW_COLORS[cell.action]}
            filled
          />
        )
      ))}
      {cells.map((cell) => (
        previewStyle === "cube" ? (
          <SelectionIndicator
            key={`${cell.x}-${cell.y}-${cell.z}`}
            coordinate={cell}
            visible={visible}
            color={color}
            filled={tool !== "add"}
          />
        ) : (
          <SurfaceBrushCellIndicator
            key={`${cell.x}-${cell.y}-${cell.z}`}
            coordinate={cell}
            world={world}
            visible={visible}
            color={tool === "zone" ? zonePreviewColor : color}
          />
        )
      ))}
    </>
  );
}

function SurfaceBrushCellIndicator({
  coordinate,
  world,
  visible,
  color,
}: {
  coordinate: GridCoordinate;
  world: MapEditorSession["world"];
  visible: boolean;
  color: string;
}) {
  const geometry = useMemo(() => {
    const surface = getTerrainSurfaceAt(world, coordinate.x, coordinate.z);
    if (!surface.valid) return null;
    const data = buildPreviewSurfaceGeometry(world, surface.grid);
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    nextGeometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    nextGeometry.computeVertexNormals();
    return nextGeometry;
  }, [coordinate.x, coordinate.z, world]);
  const lineGeometry = useMemo(() => {
    const surface = getTerrainSurfaceAt(world, coordinate.x, coordinate.z);
    if (!surface.valid) return null;
    const data = buildPreviewSurfaceGeometry(world, surface.grid);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(data.boundaryPositions, 3));
    return geometry;
  }, [coordinate.x, coordinate.z, world]);
  const lineMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }),
    [color],
  );
  const fillMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, depthTest: false }),
    [color],
  );

  useEffect(() => {
    return () => {
      geometry?.dispose();
      lineGeometry?.dispose();
      lineMaterial.dispose();
      fillMaterial.dispose();
    };
  }, [fillMaterial, geometry, lineGeometry, lineMaterial]);

  if (!visible || !geometry || !lineGeometry) {
    return null;
  }

  return (
    <group renderOrder={11}>
      <mesh geometry={geometry} material={fillMaterial} />
      <lineSegments geometry={lineGeometry} material={lineMaterial} />
    </group>
  );
}

function buildPreviewSurfaceGeometry(world: MapEditorSession["world"], coordinate: GridCoordinate) {
  const positions: number[] = [];
  const indices: number[] = [];
  const boundaryPositions: number[] = [];
  const center = world.gridToWorld(coordinate.x, coordinate.y, coordinate.z);
  const shape = getShapeDefinition(world.getShape(coordinate.x, coordinate.y, coordinate.z));
  const faces = shape.faces(world.getRotation(coordinate.x, coordinate.y, coordinate.z), world.getState(coordinate.x, coordinate.y, coordinate.z));
  for (const face of faces) {
    if (face.direction !== "py") continue;
    const offset = positions.length / 3;
    const normal = new THREE.Vector3(...face.normal).normalize();
    for (const corner of face.corners) {
      positions.push(
        center.x + corner[0] * 1.02 + normal.x * 0.024,
        center.y + corner[1] * 1.02 + normal.y * 0.024,
        center.z + corner[2] * 1.02 + normal.z * 0.024,
      );
    }
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    for (let index = 0; index < face.corners.length; index += 1) {
      const a = face.corners[index];
      const b = face.corners[(index + 1) % face.corners.length];
      boundaryPositions.push(
        center.x + a[0] * 1.025 + normal.x * 0.03,
        center.y + a[1] * 1.025 + normal.y * 0.03,
        center.z + a[2] * 1.025 + normal.z * 0.03,
        center.x + b[0] * 1.025 + normal.x * 0.03,
        center.y + b[1] * 1.025 + normal.y * 0.03,
        center.z + b[2] * 1.025 + normal.z * 0.03,
      );
    }
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    boundaryPositions: new Float32Array(boundaryPositions),
  };
}

function MapInteractionProxies({
  map,
  world,
  zoneOverlayChunks,
  enabled,
  browsing,
  onHoverZone,
  onSelectZone,
  onSelectMarker,
}: {
  map: MapDefinition;
  world: MapEditorSession["world"];
  zoneOverlayChunks: ZoneOverlayChunkMeshData[];
  enabled: boolean;
  browsing: BrowsingState;
  onHoverZone: (zoneId: string | null) => void;
  onSelectZone: (zoneId: string) => void;
  onSelectMarker: (marker: MapMarkerDefinition) => void;
}) {
  const markerGeometry = useMemo(() => new THREE.ConeGeometry(0.34, 0.82, 5), []);
  const markerMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#d8b45a" }), []);
  const selectedMarkerMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff" }), []);

  useEffect(() => {
    return () => {
      markerGeometry.dispose();
      markerMaterial.dispose();
      selectedMarkerMaterial.dispose();
    };
  }, [markerGeometry, markerMaterial, selectedMarkerMaterial]);

  if (!enabled) {
    return null;
  }

  return (
    <group>
      <ZoneOverlayChunks
        map={map}
        chunks={zoneOverlayChunks}
        browsing={browsing}
        onHoverZone={onHoverZone}
        onSelectZone={onSelectZone}
      />
      {map.markers.filter((marker) => marker.runtimeVisible).map((marker) => {
        const position = world.gridToWorld(marker.gridPosition.x, marker.gridPosition.y, marker.gridPosition.z);
        const selected = (browsing.mode === "itemSelected" || browsing.mode === "contentOpen") && browsing.markerId === marker.id;

        return (
          <mesh
            key={marker.id}
            geometry={markerGeometry}
            material={selected ? selectedMarkerMaterial : markerMaterial}
            position={[position.x + (marker.offset?.x ?? 0), position.y + 0.9 + (marker.offset?.y ?? 0), position.z + (marker.offset?.z ?? 0)]}
            rotation={[0, marker.rotationY, 0]}
            scale={marker.markerType === "primary" ? 1 : 0.78}
            onPointerOver={(event) => {
              event.stopPropagation();
              document.body.style.cursor = "pointer";
              onHoverZone(marker.zoneId ?? null);
            }}
            onPointerOut={(event) => {
              event.stopPropagation();
              document.body.style.cursor = "";
              onHoverZone(null);
            }}
            onClick={(event) => {
              event.stopPropagation();
              onSelectMarker(marker);
            }}
          />
        );
      })}
    </group>
  );
}

function ZoneOverlayChunks({
  map,
  chunks,
  browsing,
  interactive = true,
  onHoverZone,
  onSelectZone,
}: {
  map: MapDefinition;
  chunks: ZoneOverlayChunkMeshData[];
  browsing: BrowsingState;
  interactive?: boolean;
  onHoverZone: (zoneId: string | null) => void;
  onSelectZone: (zoneId: string) => void;
}) {
  const zonesByNumber = useMemo(() => new Map(map.zones.map((zone) => [zone.numericId, zone])), [map.zones]);
  const materials = useMemo(() => new Map(map.zones.map((zone) => [
    zone.numericId,
    new THREE.MeshBasicMaterial({
      color: zone.color,
      transparent: true,
      opacity: browsing.mode !== "overview" && "zoneId" in browsing && browsing.zoneId === zone.id ? 0.34 : 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  ])), [browsing, map.zones]);
  const boundaryMaterials = useMemo(() => new Map(map.zones.map((zone) => [
    zone.numericId,
    new THREE.LineBasicMaterial({
      color: zone.color,
      transparent: true,
      opacity: browsing.mode !== "overview" && "zoneId" in browsing && browsing.zoneId === zone.id ? 0.95 : 0.72,
      depthTest: true,
    }),
  ])), [browsing, map.zones]);

  useEffect(() => () => {
    for (const material of materials.values()) material.dispose();
    for (const material of boundaryMaterials.values()) material.dispose();
  }, [boundaryMaterials, materials]);

  return (
    <>
      {chunks.map((chunk) => {
        const zone = zonesByNumber.get(chunk.zoneId);
        if (!zone?.overlayVisible) return null;
        return (
          <ZoneOverlayChunk
            key={chunk.id}
            chunk={chunk}
            zoneId={zone.id}
            material={materials.get(chunk.zoneId)}
            boundaryMaterial={boundaryMaterials.get(chunk.zoneId)}
            interactive={interactive}
            onHoverZone={onHoverZone}
            onSelectZone={onSelectZone}
          />
        );
      })}
    </>
  );
}

function parseChunkId(chunkId: string) {
  const match = /^chunk-(\d+)-(\d+)$/.exec(chunkId);
  if (!match) return null;
  return {
    chunkX: Number(match[1]),
    chunkZ: Number(match[2]),
  };
}

function zoneOverlayBaseChunkId(zoneOverlayChunkId: string) {
  const match = /^(chunk-\d+-\d+)-zone-\d+$/.exec(zoneOverlayChunkId);
  return match?.[1] ?? zoneOverlayChunkId;
}

function compareZoneOverlayChunks(left: ZoneOverlayChunkMeshData, right: ZoneOverlayChunkMeshData) {
  return left.chunkZ - right.chunkZ || left.chunkX - right.chunkX || left.zoneId - right.zoneId;
}

function ZoneOverlayChunk({
  chunk,
  zoneId,
  material,
  boundaryMaterial,
  interactive,
  onHoverZone,
  onSelectZone,
}: {
  chunk: ZoneOverlayChunkMeshData;
  zoneId: string;
  material?: THREE.Material;
  boundaryMaterial?: THREE.Material;
  interactive: boolean;
  onHoverZone: (zoneId: string | null) => void;
  onSelectZone: (zoneId: string) => void;
}) {
  const geometry = useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute("position", new THREE.BufferAttribute(chunk.positions, 3));
    nextGeometry.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
    nextGeometry.computeVertexNormals();
    return nextGeometry;
  }, [chunk]);
  const boundaryGeometry = useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute("position", new THREE.BufferAttribute(chunk.boundaryPositions, 3));
    return nextGeometry;
  }, [chunk]);

  useEffect(() => () => {
    geometry.dispose();
    boundaryGeometry.dispose();
  }, [boundaryGeometry, geometry]);

  if (!material || !boundaryMaterial) return null;

  return (
    <group renderOrder={8}>
      <mesh
        geometry={geometry}
        material={material}
        onPointerOver={(event) => {
          if (!interactive) return;
          event.stopPropagation();
          document.body.style.cursor = "pointer";
          onHoverZone(zoneId);
        }}
        onPointerOut={(event) => {
          if (!interactive) return;
          event.stopPropagation();
          document.body.style.cursor = "";
          onHoverZone(null);
        }}
        onClick={(event) => {
          if (!interactive) return;
          event.stopPropagation();
          onSelectZone(zoneId);
        }}
      />
      <lineSegments geometry={boundaryGeometry} material={boundaryMaterial} />
    </group>
  );
}

function EditorMarkers({
  editorEnabled,
  entities,
  world,
  selectedMarkerId,
  onSelectMarker,
}: {
  editorEnabled: boolean;
  entities: MapEditorSession["entities"];
  world: MapEditorSession["world"];
  selectedMarkerId: string | null;
  onSelectMarker: (id: string) => void;
}) {
  const geometry = useMemo(() => new THREE.ConeGeometry(0.26, 0.7, 4), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: "#d46f3f" }), []);
  const selectedMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#1f7a5e" }), []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
      selectedMaterial.dispose();
    };
  }, [geometry, material, selectedMaterial]);

  if (!editorEnabled) {
    return null;
  }

  return (
    <group>
      {entities.map((entity) => {
        const position = world.gridToWorld(
          entity.gridPosition.x,
          entity.gridPosition.y,
          entity.gridPosition.z,
        );

        return (
          <mesh
            key={entity.id}
            geometry={geometry}
            material={selectedMarkerId === entity.id ? selectedMaterial : material}
            position={[position.x, position.y + 0.72, position.z]}
            rotation={[0, entity.rotationY, 0]}
            onPointerUp={(event) => {
              event.stopPropagation();
              onSelectMarker(entity.id);
            }}
          />
        );
      })}
    </group>
  );
}

function ObjectPlacementPreview({
  coordinate,
  tool,
  world,
  primitiveType,
  prefabId,
  variantId,
  color,
  visible,
}: {
  coordinate: GridCoordinate | null;
  tool: EditorTool;
  world: MapEditorSession["world"];
  primitiveType: PrimitiveType;
  prefabId: string;
  variantId: string;
  color: string;
  visible: boolean;
}) {
  const geometries = useMemo(() => createEntityPrimitiveGeometries(), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, depthWrite: false }),
    [color],
  );

  useEffect(() => {
    return () => {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      material.dispose();
    };
  }, [geometries, material]);

  if (!visible || tool !== "entity" || !coordinate) {
    return null;
  }

  const topY = world.getHighestNonAirY(coordinate.x, coordinate.z);
  if (topY === null) {
    return null;
  }

  const surface = getTerrainSurfaceAt(world, coordinate.x, coordinate.z);
  if (!surface.valid) {
    return null;
  }
  const surfacePosition = surface.worldPosition;
  const scale = getDefaultEntityScale(primitiveType);
  const prefab = prefabId ? getPrefabDefinition(prefabId) : null;
  if (prefab) {
    const entity = createPrefabEntityFromDraft({
      name: prefab.name,
      prefabId: prefab.id,
      variantId: variantId || prefab.defaultVariantId,
      transform: {
        position: { x: surfacePosition.x, y: surfacePosition.y, z: surfacePosition.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    }, new Set());
    const grounded = groundEntityOnTerrain(world, entity, { supportMode: "single-cell" });
    if (!grounded.ok) return null;
    const resolved = resolvePrefabInstance(grounded.entity);
    return (
      <group>
        {resolved.parts.map((part) => (
          <mesh
            key={`${part.partId}-${part.primitive}`}
            geometry={geometries[part.primitive]}
            material={material}
            position={[part.transform.position.x, part.transform.position.y, part.transform.position.z]}
            rotation={[part.transform.rotation.x, part.transform.rotation.y, part.transform.rotation.z]}
            scale={[part.transform.scale.x, part.transform.scale.y, part.transform.scale.z]}
            renderOrder={11}
          />
        ))}
      </group>
    );
  }

  return (
    <group position={[surfacePosition.x, surfacePosition.y, surfacePosition.z]}>
      <mesh
        geometry={geometries[primitiveType]}
        material={material}
        position={[0, getEntityVisualAnchorOffset(primitiveType), 0]}
        scale={[scale.x, scale.y, scale.z]}
        renderOrder={11}
      />
    </group>
  );
}

function ObjectPopAnimationPreview({
  requestCount,
  coordinate,
  world,
  prefabId,
  variantId,
  visible,
}: {
  requestCount: number;
  coordinate: GridCoordinate | null;
  world: MapEditorSession["world"];
  prefabId: string;
  variantId: string;
  visible: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const geometries = useMemo(() => createEntityPrimitiveGeometries(), []);
  const preview = useMemo(() => {
    if (requestCount <= 0 || !visible || !prefabId) return null;
    const target = coordinate ?? { x: Math.floor(WORLD_CONFIG.width / 2) - 1, y: 0, z: Math.floor(WORLD_CONFIG.depth / 2) - 1 };
    const surface = getTerrainSurfaceAt(world, target.x, target.z);
    if (!surface.valid) return null;
    const prefab = getPrefabDefinition(prefabId);
    if (!prefab) return null;
    const entity = createPrefabEntityFromDraft({
      name: prefab.name,
      prefabId: prefab.id,
      variantId: variantId || prefab.defaultVariantId,
      transform: {
        position: { x: surface.worldPosition.x, y: surface.worldPosition.y, z: surface.worldPosition.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    }, new Set());
    const grounded = groundEntityOnTerrain(world, entity, { supportMode: "single-cell" });
    if (!grounded.ok) return null;
    const resolved = resolvePrefabInstance(grounded.entity);
    const anchor = grounded.entity.transform.position;
    return {
      anchor,
      parts: resolved.parts.map((part) => ({
        ...part,
        transform: {
          ...part.transform,
          position: {
            x: part.transform.position.x - anchor.x,
            y: part.transform.position.y - anchor.y,
            z: part.transform.position.z - anchor.z,
          },
        },
      })),
    };
  }, [coordinate, prefabId, requestCount, variantId, visible, world]);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group || !preview) return;
    group.visible = true;
    group.position.set(preview.anchor.x, preview.anchor.y - 0.34, preview.anchor.z);
    group.rotation.set(-0.16, 0, 0.08);
    group.scale.set(0.18, 0.18, 0.18);

    const timeline = gsap.timeline();
    timeline
      .to(group.position, { y: preview.anchor.y + 0.12, duration: 0.34, ease: "back.out(2.1)" }, 0)
      .to(group.scale, { x: 1.08, y: 1.08, z: 1.08, duration: 0.34, ease: "back.out(2.35)" }, 0)
      .to(group.rotation, { x: 0.04, z: -0.035, duration: 0.28, ease: "power2.out" }, 0.04)
      .to(group.position, { y: preview.anchor.y, duration: 0.18, ease: "power2.inOut" }, 0.34)
      .to(group.scale, { x: 1, y: 1, z: 1, duration: 0.18, ease: "power2.inOut" }, 0.34)
      .to(group.rotation, { x: 0, z: 0, duration: 0.2, ease: "power2.inOut" }, 0.32);

    return () => {
      timeline.kill();
    };
  }, [preview, requestCount]);

  useEffect(() => {
    return () => {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
    };
  }, [geometries]);

  if (!preview) {
    return null;
  }

  return (
    <group ref={groupRef}>
      {preview.parts.map((part) => (
        <mesh
          key={`${requestCount}-${part.partId}`}
          geometry={geometries[part.primitive]}
          position={[part.transform.position.x, part.transform.position.y, part.transform.position.z]}
          rotation={[part.transform.rotation.x, part.transform.rotation.y, part.transform.rotation.z]}
          scale={[part.transform.scale.x, part.transform.scale.y, part.transform.scale.z]}
          renderOrder={12}
        >
          <meshBasicMaterial color={part.color} />
        </mesh>
      ))}
    </group>
  );
}

type PrefabBatch = {
  key: string;
  primitive: PrimitiveType;
  color: string;
  parts: ResolvedPrefabPart[];
};

function EditorPrefabEntities({
  visible,
  cleanPreview,
  entities,
  selectedEntityIds,
  transformMode,
  transformEnabled,
  popAnimationEntityId,
  onPopAnimationComplete,
  onSelectEntity,
  onTransformDraggingChange,
  onTransformEntity,
}: {
  visible: boolean;
  cleanPreview: boolean;
  entities: PlacedMapEntity[];
  selectedEntityIds: string[];
  transformMode: EntityTransformMode;
  transformEnabled: boolean;
  popAnimationEntityId: string | null;
  onPopAnimationComplete: () => void;
  onSelectEntity: (id: string, additive: boolean) => void;
  onTransformDraggingChange: (dragging: boolean) => void;
  onTransformEntity: (id: string, transform: Pick<PlacedMapEntity["transform"], "position" | "rotation">) => boolean;
}) {
  const geometries = useMemo(() => createEntityPrimitiveGeometries(), []);
  const selectedMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", wireframe: true, depthTest: false }), []);
  const selectedEntity = entities.find((entity) => selectedEntityIds.includes(entity.id)) ?? null;
  const batches = useMemo(() => createPrefabBatches(entities.filter((entity) => !selectedEntityIds.includes(entity.id) && (entity.appearance.visibleInEditor || cleanPreview))), [cleanPreview, entities, selectedEntityIds]);

  useEffect(() => {
    return () => {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      selectedMaterial.dispose();
    };
  }, [geometries, selectedMaterial]);

  if (!visible) {
    return null;
  }

  return (
    <group>
      {batches.map((batch) => (
        <PrefabInstancedBatch
          key={batch.key}
          batch={batch}
          geometry={geometries[batch.primitive]}
          onSelectEntity={onSelectEntity}
        />
      ))}
      {selectedEntity ? (
        <EditablePrefabEntity
          entity={selectedEntity}
          geometries={geometries}
          selectedMaterial={selectedMaterial}
          transformMode={transformMode}
          transformEnabled={transformEnabled}
          popAnimationActive={popAnimationEntityId === selectedEntity.id}
          onPopAnimationComplete={onPopAnimationComplete}
          onSelectEntity={onSelectEntity}
          onTransformDraggingChange={onTransformDraggingChange}
          onTransformEntity={onTransformEntity}
        />
      ) : null}
    </group>
  );
}

function PrefabInstancedBatch({
  batch,
  geometry,
  onSelectEntity,
}: {
  batch: PrefabBatch;
  geometry: THREE.BufferGeometry;
  onSelectEntity: (id: string, additive: boolean) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: batch.color }), [batch.color]);
  const instanceToEntityId = useMemo(() => batch.parts.map((part) => part.entityId), [batch.parts]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let index = 0; index < batch.parts.length; index += 1) {
      const transform = batch.parts[index].transform;
      position.set(transform.position.x, transform.position.y, transform.position.z);
      quaternion.setFromEuler(new THREE.Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z));
      scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [batch.parts]);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, batch.parts.length]}
      userData={{ portfolioPrefabBatchKey: batch.key }}
      onPointerUp={(event) => {
        event.stopPropagation();
        if (event.instanceId === undefined) return;
        const entityId = instanceToEntityId[event.instanceId];
        if (entityId) onSelectEntity(entityId, event.shiftKey);
      }}
    />
  );
}

function EditablePrefabEntity({
  entity,
  geometries,
  selectedMaterial,
  transformMode,
  transformEnabled,
  popAnimationActive,
  onPopAnimationComplete,
  onSelectEntity,
  onTransformDraggingChange,
  onTransformEntity,
}: {
  entity: PlacedMapEntity;
  geometries: Record<PrimitiveType, THREE.BufferGeometry>;
  selectedMaterial: THREE.Material;
  transformMode: EntityTransformMode;
  transformEnabled: boolean;
  popAnimationActive: boolean;
  onPopAnimationComplete: () => void;
  onSelectEntity: (id: string, additive: boolean) => void;
  onTransformDraggingChange: (dragging: boolean) => void;
  onTransformEntity: (id: string, transform: Pick<PlacedMapEntity["transform"], "position" | "rotation">) => boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const transformActive = useRef(false);
  const [transformObject, setTransformObject] = useState<THREE.Group | null>(null);
  const resolved = useMemo(() => resolvePrefabInstance({ ...entity, transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: entity.transform.scale } }), [entity]);
  const setGroupRef = useCallback((node: THREE.Group | null) => {
    groupRef.current = node;
    setTransformObject(node);
  }, []);

  useLayoutEffect(() => {
    if (transformActive.current) return;
    const group = groupRef.current;
    if (!group) return;
    group.position.set(entity.transform.position.x, entity.transform.position.y, entity.transform.position.z);
    group.rotation.set(entity.transform.rotation.x, entity.transform.rotation.y, entity.transform.rotation.z);
    group.scale.set(1, 1, 1);
  }, [entity.transform.position.x, entity.transform.position.y, entity.transform.position.z, entity.transform.rotation.x, entity.transform.rotation.y, entity.transform.rotation.z]);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group || !popAnimationActive || transformActive.current) return;

    group.position.set(entity.transform.position.x, entity.transform.position.y - 0.36, entity.transform.position.z);
    group.rotation.set(entity.transform.rotation.x - 0.14, entity.transform.rotation.y, entity.transform.rotation.z + 0.08);
    group.scale.set(0.16, 0.16, 0.16);

    const timeline = gsap.timeline({ onComplete: onPopAnimationComplete });
    timeline
      .to(group.position, { y: entity.transform.position.y + 0.14, duration: 0.34, ease: "back.out(2.1)" }, 0)
      .to(group.scale, { x: 1.08, y: 1.08, z: 1.08, duration: 0.34, ease: "back.out(2.35)" }, 0)
      .to(group.rotation, { x: entity.transform.rotation.x + 0.03, z: entity.transform.rotation.z - 0.03, duration: 0.28, ease: "power2.out" }, 0.04)
      .to(group.position, { y: entity.transform.position.y, duration: 0.2, ease: "power2.inOut" }, 0.34)
      .to(group.scale, { x: 1, y: 1, z: 1, duration: 0.2, ease: "power2.inOut" }, 0.34)
      .to(group.rotation, { x: entity.transform.rotation.x, z: entity.transform.rotation.z, duration: 0.22, ease: "power2.inOut" }, 0.32);

    return () => {
      timeline.kill();
    };
  }, [
    entity.transform.position.x,
    entity.transform.position.y,
    entity.transform.position.z,
    entity.transform.rotation.x,
    entity.transform.rotation.y,
    entity.transform.rotation.z,
    onPopAnimationComplete,
    popAnimationActive,
  ]);

  const restoreTransform = () => {
    const group = groupRef.current;
    if (!group) return;
    group.position.set(entity.transform.position.x, entity.transform.position.y, entity.transform.position.z);
    group.rotation.set(entity.transform.rotation.x, entity.transform.rotation.y, entity.transform.rotation.z);
    group.scale.set(1, 1, 1);
  };

  const commitTransform = () => {
    const group = groupRef.current;
    if (!group) return;
    transformActive.current = false;
    onTransformDraggingChange(false);
    const changed = onTransformEntity(entity.id, {
      position: {
        x: snapEntityTransformValue(group.position.x),
        y: snapEntityTransformValue(group.position.y),
        z: snapEntityTransformValue(group.position.z),
      },
      rotation: {
        x: snapEntityRotationValue(group.rotation.x),
        y: snapEntityRotationValue(group.rotation.y),
        z: snapEntityRotationValue(group.rotation.z),
      },
    });
    if (!changed) restoreTransform();
  };

  return (
    <>
      <group ref={setGroupRef}>
        {resolved.parts.map((part) => (
          <group key={part.partId}>
            <mesh
              geometry={geometries[part.primitive]}
              position={[part.transform.position.x, part.transform.position.y, part.transform.position.z]}
              rotation={[part.transform.rotation.x, part.transform.rotation.y, part.transform.rotation.z]}
              scale={[part.transform.scale.x, part.transform.scale.y, part.transform.scale.z]}
              userData={{ portfolioEntityId: entity.id, portfolioPrefabPartId: part.partId }}
              onPointerUp={(event) => {
                event.stopPropagation();
                onSelectEntity(entity.id, event.shiftKey);
              }}
            >
              <meshBasicMaterial color={part.color} />
            </mesh>
            <mesh
              geometry={geometries[part.primitive]}
              material={selectedMaterial}
              position={[part.transform.position.x, part.transform.position.y, part.transform.position.z]}
              rotation={[part.transform.rotation.x, part.transform.rotation.y, part.transform.rotation.z]}
              scale={[part.transform.scale.x * 1.04, part.transform.scale.y * 1.04, part.transform.scale.z * 1.04]}
              renderOrder={12}
            />
          </group>
        ))}
      </group>
      {transformEnabled && transformObject ? (
        <TransformControls
          object={transformObject}
          mode={transformMode}
          size={0.82}
          space="world"
          onMouseDown={() => {
            transformActive.current = true;
            onTransformDraggingChange(true);
          }}
          onMouseUp={commitTransform}
          onPointerMissed={restoreTransform}
        />
      ) : null}
    </>
  );
}

function createPrefabBatches(entities: PlacedMapEntity[]): PrefabBatch[] {
  const batches = new Map<string, PrefabBatch>();
  for (const entity of entities) {
    const resolved = resolvePrefabInstance(entity);
    for (const part of resolved.parts) {
      const chunkX = Math.max(0, Math.min(3, Math.floor((part.transform.position.x + 32) / 16)));
      const chunkZ = Math.max(0, Math.min(3, Math.floor((part.transform.position.z + 32) / 16)));
      const key = `${chunkX}:${chunkZ}:${part.primitive}:${part.color}`;
      const existing = batches.get(key);
      if (existing) {
        existing.parts.push(part);
      } else {
        batches.set(key, { key, primitive: part.primitive, color: part.color, parts: [part] });
      }
    }
  }
  return [...batches.values()];
}

function EditorPlacedEntities({
  editorEnabled,
  cleanPreview,
  layerVisible,
  entities,
  selectedEntityIds,
  transformMode,
  transformEnabled,
  onSelectEntity,
  onTransformDraggingChange,
  onTransformEntity,
}: {
  editorEnabled: boolean;
  cleanPreview: boolean;
  layerVisible: boolean;
  entities: PlacedMapEntity[];
  selectedEntityIds: string[];
  transformMode: EntityTransformMode;
  transformEnabled: boolean;
  onSelectEntity: (id: string, additive: boolean) => void;
  onTransformDraggingChange: (dragging: boolean) => void;
  onTransformEntity: (id: string, transform: Pick<PlacedMapEntity["transform"], "position" | "rotation">) => boolean;
}) {
  const geometries = useMemo(() => createEntityPrimitiveGeometries(), []);
  const selectedMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", wireframe: true, depthTest: false }), []);

  useEffect(() => {
    return () => {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      selectedMaterial.dispose();
    };
  }, [geometries, selectedMaterial]);

  if (!editorEnabled || !layerVisible) {
    return null;
  }

  return (
    <group>
      {entities.filter((entity) => entity.appearance.visibleInEditor || cleanPreview).map((entity) => {
        if (cleanPreview && !entity.appearance.visibleAtRuntime) return null;
        const selected = selectedEntityIds.includes(entity.id);
        return (
          <EditorPlacedEntity
            key={entity.id}
            entity={entity}
            geometry={geometries[entity.primitiveType]}
            selected={selected}
            selectedMaterial={selectedMaterial}
            transformMode={transformMode}
            transformEnabled={transformEnabled && selected}
            onSelectEntity={onSelectEntity}
            onTransformDraggingChange={onTransformDraggingChange}
            onTransformEntity={onTransformEntity}
          />
        );
      })}
    </group>
  );
}

function EditorPlacedEntity({
  entity,
  geometry,
  selected,
  selectedMaterial,
  transformMode,
  transformEnabled,
  onSelectEntity,
  onTransformDraggingChange,
  onTransformEntity,
}: {
  entity: PlacedMapEntity;
  geometry: THREE.BufferGeometry;
  selected: boolean;
  selectedMaterial: THREE.Material;
  transformMode: EntityTransformMode;
  transformEnabled: boolean;
  onSelectEntity: (id: string, additive: boolean) => void;
  onTransformDraggingChange: (dragging: boolean) => void;
  onTransformEntity: (id: string, transform: Pick<PlacedMapEntity["transform"], "position" | "rotation">) => boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const transformActive = useRef(false);
  const [transformObject, setTransformObject] = useState<THREE.Group | null>(null);
  const setGroupRef = useCallback((node: THREE.Group | null) => {
    groupRef.current = node;
    setTransformObject(node);
  }, []);

  useLayoutEffect(() => {
    if (transformActive.current) return;
    const group = groupRef.current;
    if (!group) return;
    group.position.set(entity.transform.position.x, entity.transform.position.y, entity.transform.position.z);
    group.rotation.set(entity.transform.rotation.x, entity.transform.rotation.y, entity.transform.rotation.z);
    group.scale.set(entity.transform.scale.x, entity.transform.scale.y, entity.transform.scale.z);
  }, [entity.transform.position.x, entity.transform.position.y, entity.transform.position.z, entity.transform.rotation.x, entity.transform.rotation.y, entity.transform.rotation.z, entity.transform.scale.x, entity.transform.scale.y, entity.transform.scale.z]);

  const commitTransform = () => {
    const group = groupRef.current;
    if (!group) return;
    transformActive.current = false;
    onTransformDraggingChange(false);
    const changed = onTransformEntity(entity.id, {
      position: {
        x: snapEntityTransformValue(group.position.x),
        y: snapEntityTransformValue(group.position.y),
        z: snapEntityTransformValue(group.position.z),
      },
      rotation: {
        x: snapEntityRotationValue(group.rotation.x),
        y: snapEntityRotationValue(group.rotation.y),
        z: snapEntityRotationValue(group.rotation.z),
      },
    });
    if (!changed) {
      restoreTransform();
    }
  };

  const restoreTransform = () => {
    const group = groupRef.current;
    if (!group) return;
    group.position.set(entity.transform.position.x, entity.transform.position.y, entity.transform.position.z);
    group.rotation.set(entity.transform.rotation.x, entity.transform.rotation.y, entity.transform.rotation.z);
    group.scale.set(entity.transform.scale.x, entity.transform.scale.y, entity.transform.scale.z);
  };

  return (
    <>
      <group ref={setGroupRef}>
        <mesh
          geometry={geometry}
          userData={{ portfolioEntityId: entity.id }}
          position={[0, getEntityVisualAnchorOffset(entity.primitiveType), 0]}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            onSelectEntity(entity.id, event.shiftKey);
          }}
        >
          <meshBasicMaterial
            color={entity.appearance.color}
            transparent={entity.appearance.opacity !== undefined}
            opacity={entity.appearance.opacity ?? 1}
          />
        </mesh>
        {selected ? (
          <mesh
            geometry={geometry}
            material={selectedMaterial}
            position={[0, getEntityVisualAnchorOffset(entity.primitiveType), 0]}
            scale={[1.05, 1.05, 1.05]}
            renderOrder={12}
          />
        ) : null}
        {entity.primitiveType === "sign" && entity.sign?.label ? (
          <HtmlSignLabel entity={entity} local />
        ) : null}
      </group>
      {transformEnabled && transformObject ? (
        <TransformControls
          object={transformObject}
          mode={transformMode}
          size={0.82}
          space="world"
          onMouseDown={() => {
            transformActive.current = true;
            onTransformDraggingChange(true);
          }}
          onMouseUp={commitTransform}
          onPointerMissed={restoreTransform}
        />
      ) : null}
    </>
  );
}

function HtmlSignLabel({ entity, local = false }: { entity: PlacedMapEntity; local?: boolean }) {
  return (
    <Text
      position={local ? [0, 0.12, 0.08] : [entity.transform.position.x, entity.transform.position.y + 0.12, entity.transform.position.z + 0.08]}
      rotation={local ? [0, 0, 0] : [entity.transform.rotation.x, entity.transform.rotation.y, entity.transform.rotation.z]}
      fontSize={0.22}
      color="#17201c"
      anchorX="center"
      anchorY="middle"
      maxWidth={1.2}
    >
      {entity.sign?.label ?? entity.name}
    </Text>
  );
}

function createEntityPrimitiveGeometries(): Record<PrimitiveType, THREE.BufferGeometry> {
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
    sphere: new THREE.SphereGeometry(0.5, 16, 10),
    plane: new THREE.BoxGeometry(1, 0.04, 1),
    platform: new THREE.BoxGeometry(1, 0.22, 1),
    sign: new THREE.BoxGeometry(1, 0.72, 0.08),
  };
}

function getDefaultEntityScale(primitiveType: PrimitiveType) {
  return primitiveType === "plane" ? { x: 2, y: 0.08, z: 2 } : { x: 1, y: 1, z: 1 };
}

function getEntityVisualAnchorOffset(primitiveType: PrimitiveType) {
  if (primitiveType === "plane") return 0.02;
  if (primitiveType === "platform") return 0.11;
  if (primitiveType === "sign") return 0.36;
  return 0.5;
}

function snapEntityTransformValue(value: number) {
  return Number((Math.round(value * 4) / 4).toFixed(3));
}

function snapEntityRotationValue(value: number) {
  return Number((Math.round(value / THREE.MathUtils.degToRad(5)) * THREE.MathUtils.degToRad(5)).toFixed(6));
}

function EditorNavigationHelpers({
  editorEnabled,
  map,
}: {
  editorEnabled: boolean;
  map: MapDefinition;
}) {
  const nodeGeometry = useMemo(() => new THREE.SphereGeometry(0.18, 10, 8), []);
  const nodeMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#60a5fa" }), []);
  const edgeMaterial = useMemo(() => new THREE.LineBasicMaterial({ color: "#93c5fd" }), []);

  const edgeLines = useMemo(() => {
    const nodes = new Map(map.navigation.nodes.map((node) => [node.id, node]));
    return map.navigation.edges.flatMap((edge) => {
      const from = nodes.get(edge.fromNodeId);
      const to = nodes.get(edge.toNodeId);
      if (!from || !to) return [];
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(from.position.x, from.position.y, from.position.z),
        new THREE.Vector3(to.position.x, to.position.y, to.position.z),
      ]);
      return [{ id: edge.id, object: new THREE.Line(geometry, edgeMaterial), geometry }];
    });
  }, [edgeMaterial, map.navigation.edges, map.navigation.nodes]);

  useEffect(() => {
    return () => {
      nodeGeometry.dispose();
      nodeMaterial.dispose();
      edgeMaterial.dispose();
      edgeLines.forEach((line) => line.geometry.dispose());
    };
  }, [edgeLines, edgeMaterial, nodeGeometry, nodeMaterial]);

  if (!editorEnabled) {
    return null;
  }

  return (
    <group>
      {map.navigation.nodes.map((node) => (
        <mesh
          key={node.id}
          geometry={nodeGeometry}
          material={nodeMaterial}
          position={[node.position.x, node.position.y, node.position.z]}
        />
      ))}
      {edgeLines.map((line) => <primitive key={line.id} object={line.object} />)}
    </group>
  );
}

function getToolTargetCoordinate(session: MapEditorSession, tool: EditorTool, coordinate: GridCoordinate) {
  if (tool === "raise") {
    const topY = session.world.getHighestNonAirY(coordinate.x, coordinate.z);
    const nextY = topY === null ? 0 : topY + 1;
    return nextY < session.world.config.height ? { x: coordinate.x, y: nextY, z: coordinate.z } : coordinate;
  }

  if (tool === "lower") {
    const topY = session.world.getHighestNonAirY(coordinate.x, coordinate.z);
    return topY === null ? coordinate : { x: coordinate.x, y: topY, z: coordinate.z };
  }

  if (tool === "marker") {
    const topY = session.world.getHighestNonAirY(coordinate.x, coordinate.z);
    if (topY !== null && topY >= session.world.config.height - 1) {
      return null;
    }
    const markerY = topY === null ? coordinate.y : topY + 1;
    const target = { x: coordinate.x, y: markerY, z: coordinate.z };
    return session.world.isInsideWorld(target.x, target.y, target.z) ? target : null;
  }

  return coordinate;
}

function createDefaultToolBrushSettings(): Partial<Record<EditorTool, TerrainBrushSettings>> {
  const single = { ...DEFAULT_TERRAIN_BRUSH };
  return {
    paint: { ...single },
    erase: { ...single },
    raise: { ...single },
    lower: { ...single },
    flatten: { ...single },
    fill: { ...single },
    clear: { ...single },
    path: { ...single },
    removePath: { ...single },
    zone: { ...single },
    removeZone: { ...single },
  };
}

function getBrushSettingsForTool(
  tool: EditorTool,
  settingsByTool: Partial<Record<EditorTool, TerrainBrushSettings>>,
): TerrainBrushSettings {
  return settingsByTool[tool] ?? DEFAULT_TERRAIN_BRUSH;
}

function updateToolBrushSettings(
  setSettingsByTool: Dispatch<SetStateAction<Partial<Record<EditorTool, TerrainBrushSettings>>>>,
  tool: EditorTool,
  update: (settings: TerrainBrushSettings) => TerrainBrushSettings,
) {
  setSettingsByTool((settingsByTool) => {
    const current = getBrushSettingsForTool(tool, settingsByTool);
    return {
      ...settingsByTool,
      [tool]: update(current),
    };
  });
}

function getEffectiveTerrainBrushSettings(tool: EditorTool, settings: TerrainBrushSettings): TerrainBrushSettings {
  if (tool === "path" || tool === "removePath") {
    return settings;
  }

  if (
    tool === "paint" ||
    tool === "erase" ||
    tool === "raise" ||
    tool === "lower" ||
    tool === "flatten" ||
    tool === "fill" ||
    tool === "clear"
  ) {
    return settings;
  }

  return {
    ...settings,
    shape: "single",
    size: 1,
    pathWidth: 1,
  };
}

function getToolPreviewFootprint(
  coordinate: GridCoordinate,
  tool: EditorTool,
  settings: TerrainBrushSettings,
  world: MapEditorSession["world"],
  blockId: BlockId,
  zoneId: number,
): GridCoordinate[] {
  const operation = getTerrainBrushOperation(tool);
  if (!operation) {
    return [{ ...coordinate }];
  }

  if (operation === "raise") {
    const footprint = getTerrainOperationFootprint(coordinate, operation, settings);
    return footprint.flatMap((cell) => {
      const topY = world.getHighestNonAirY(cell.x, cell.z);
      return topY === null ? [] : [{ x: cell.x, y: topY, z: cell.z }];
    });
  }

  if (operation === "flatten") {
    return getFlattenPreviewCells(coordinate, settings, world).map((cell) => cell.coordinate);
  }

  const mutations = createTerrainMutations({
    world,
    operation,
    center: coordinate,
    settings,
    blockId: operation === "paint-path" ? BLOCK_IDS.Path : blockId,
    zoneId,
  });
  if (mutations.length > 0) {
    return mutations.map((mutation) => mutation.coordinate);
  }

  return getTerrainOperationFootprint(coordinate, operation, settings);
}

type FlattenPreviewAction = "raise" | "lower" | "unchanged";

const FLATTEN_PREVIEW_COLORS: Record<FlattenPreviewAction, string> = {
  raise: "#22c55e",
  lower: "#ef4444",
  unchanged: "#94a3b8",
};

function getFlattenPreviewCells(
  coordinate: GridCoordinate,
  settings: TerrainBrushSettings,
  world: MapEditorSession["world"],
): Array<{ coordinate: GridCoordinate; action: FlattenPreviewAction; hasSurface: boolean }> {
  const desiredY = Math.max(0, Math.min(world.config.height - 1, coordinate.y));
  return getTerrainOperationFootprint(coordinate, "flatten", settings).map((cell) => {
    const topY = world.getHighestNonAirY(cell.x, cell.z);
    const action: FlattenPreviewAction = topY === null || topY < desiredY
      ? "raise"
      : topY > desiredY
        ? "lower"
        : "unchanged";
    return {
      coordinate: { x: cell.x, y: topY ?? desiredY, z: cell.z },
      action,
      hasSurface: topY !== null,
    };
  });
}

function getBrushPreviewStyle(tool: EditorTool): "surface" | "cube" {
  return tool === "add" || tool === "erase" || tool === "clear" ? "cube" : "surface";
}

function getTerrainBrushOperation(tool: EditorTool): TerrainBrushOperation | null {
  switch (tool) {
    case "add":
      return "fill";
    case "paint":
      return "paint";
    case "erase":
      return "erase";
    case "raise":
      return "raise";
    case "lower":
      return "lower";
    case "flatten":
      return "flatten";
    case "fill":
      return "fill";
    case "clear":
      return "clear";
    case "path":
      return "paint-path";
    case "removePath":
      return "remove-path";
    default:
      return null;
  }
}

function getActiveTerrainBlockId(blockId: BlockId, shapeId: ShapeId): BlockId {
  void shapeId;
  return blockId;
}

function getTerrainMutationBlockId(tool: EditorTool, operation: TerrainBrushOperation, blockId: BlockId, shapeId: ShapeId, applyMaterialToAddedBlocks = true): BlockId {
  if (operation === "paint-path") return BLOCK_IDS.Path;
  if (tool === "add") {
    return applyMaterialToAddedBlocks ? getActiveTerrainBlockId(blockId, shapeId) : BLOCK_IDS.Ground;
  }
  return getActiveTerrainBlockId(blockId, shapeId);
}

const POINTER_CLICK_MAX_DISTANCE_PX = 5;
const CONTINUOUS_SINGLE_SHOT_STEP_DISTANCE_PX = 14;

function isContinuousTerrainStrokeTool(tool: EditorTool) {
  return tool === "zone" || (
    getTerrainBrushOperation(tool) !== null &&
    !shouldApplySingleShotEditOnPointerUp(tool)
  );
}

function shouldStartContinuousTerrainStroke(tool: EditorTool, event: PointerEvent) {
  return isContinuousTerrainStrokeTool(tool) || (isModifierContinuousSingleShotTool(tool) && event.ctrlKey);
}

function shouldContinueContinuousTerrainStroke(tool: EditorTool | null, event: PointerEvent) {
  if (!tool) return false;
  return isContinuousTerrainStrokeTool(tool) || (isModifierContinuousSingleShotTool(tool) && event.ctrlKey);
}

function shouldAdvanceContinuousStroke(tool: EditorTool | null, lastPosition: { x: number; y: number } | null, event: PointerEvent) {
  if (!tool || !lastPosition || !isModifierContinuousSingleShotTool(tool)) return true;
  return getPointerGestureDistance(lastPosition, event) >= CONTINUOUS_SINGLE_SHOT_STEP_DISTANCE_PX;
}

function isModifierContinuousSingleShotTool(tool: EditorTool) {
  return tool === "add" || tool === "erase";
}

function shouldApplySingleShotEditOnPointerUp(tool: EditorTool) {
  return tool === "add" || tool === "erase" || tool === "select" || tool === "entity" || tool === "marker";
}

function getPointerGestureDistance(start: { x: number; y: number }, event: PointerEvent) {
  return Math.hypot(event.clientX - start.x, event.clientY - start.y);
}

function shouldApplyStrokeImmediately(tool: EditorTool, zoneSelectionMode: ZoneSelectionMode) {
  return tool !== "zone" || zoneSelectionMode === "brush";
}

function getStrokeBrushKey(tool: EditorTool, coordinate: GridCoordinate) {
  return tool === "add"
    ? `${coordinate.x},${coordinate.z}`
    : editorCoordinateKey(coordinate);
}

function isLayerVisible(layers: EditorLayerState[], id: EditorLayerId) {
  return layers.find((layer) => layer.id === id)?.visible ?? true;
}

function isLayerLocked(layers: EditorLayerState[], id: EditorLayerId) {
  return layers.find((layer) => layer.id === id)?.locked ?? false;
}

function getToolLayer(tool: EditorTool): EditorLayerId {
  if (tool === "zone" || tool === "removeZone") return "zones";
  if (tool === "marker") return "markers";
  if (tool === "entity") return "entities";
  if (tool === "navigation") return "navigation";
  if (tool === "path" || tool === "removePath") return "paths";
  return "terrain";
}

function mergeMarkerDefinitions(existingMarkers: MapMarkerDefinition[], entities: MapEditorSession["entities"]) {
  const existingById = new Map(existingMarkers.map((marker) => [marker.id, marker]));

  return entities.map((entity): MapMarkerDefinition => {
    const existing = existingById.get(entity.id);
    if (existing) {
      return {
        ...existing,
        gridPosition: { ...entity.gridPosition },
        offset: entity.offset ? { ...entity.offset } : undefined,
        rotationY: entity.rotationY,
      };
    }

    return {
      id: entity.id,
      type: "marker",
      markerType: "info",
      label: String(entity.metadata?.label ?? entity.id),
      zoneId: typeof entity.metadata?.zoneId === "string" && entity.metadata.zoneId.length > 0 ? entity.metadata.zoneId : undefined,
      gridPosition: { ...entity.gridPosition },
      offset: entity.offset ? { ...entity.offset } : undefined,
      rotationY: entity.rotationY,
      contentReference: getEntityContentReference(entity),
      developmentVisible: true,
      runtimeVisible: true,
      interactionRadius: 1.1,
    };
  });
}

function getEntityContentReference(entity: MapEditorSession["entities"][number]) {
  const contentType = entity.metadata?.contentType;
  const contentId = entity.metadata?.contentId;
  if (
    typeof contentType === "string" &&
    ["project", "about", "experience", "skillGroup", "contact"].includes(contentType) &&
    typeof contentId === "string" &&
    contentId.length > 0
  ) {
    return {
      contentType: contentType as NonNullable<MapMarkerDefinition["contentReference"]>["contentType"],
      contentId,
    };
  }

  return undefined;
}

function isMapDefinitionLike(value: unknown): value is MapDefinition {
  return typeof value === "object" && value !== null && "schemaVersion" in value && "blocks" in value && "markers" in value;
}

function sameCoordinate(left: GridCoordinate | null, right: GridCoordinate | null) {
  return left?.x === right?.x && left?.y === right?.y && left?.z === right?.z;
}

function editorCoordinateKey(coordinate: GridCoordinate) {
  return `${coordinate.x},${coordinate.y},${coordinate.z}`;
}

function coordinateKeyOrEmpty(coordinate: GridCoordinate | null) {
  return coordinate ? editorCoordinateKey(coordinate) : "";
}

function isEditorUiEvent(event: PointerEvent) {
  const target = event.target;

  return target instanceof HTMLElement && Boolean(target.closest(".map-editor-toolbar, button, input, select, textarea, [role='button']"));
}

function getBrowsingCameraPreset(
  map: MapDefinition,
  browsing: BrowsingState,
  world: MapEditorSession["world"],
  zoneFocusDirection: MapZoneFocusDirection,
) {
  if (browsing.mode === "returningToOverview") {
    return getMapCameraPreset(map, map.defaultCameraPresetId);
  }
  if (browsing.mode === "zoneFocused") {
    const zone = map.zones.find((candidate) => candidate.id === browsing.zoneId);
    return zone
      ? createZoneFocusCameraPreset(world, zone, zoneFocusDirection)
        ?? getMapCameraPreset(map, map.defaultCameraPresetId)
      : getMapCameraPreset(map, map.defaultCameraPresetId);
  }
  if (browsing.mode === "itemSelected" || browsing.mode === "contentOpen") {
    const marker = map.markers.find((candidate) => candidate.id === browsing.markerId);
    return getMapCameraPreset(map, marker?.focusCameraPresetId) ?? getMapCameraPreset(map, map.defaultCameraPresetId);
  }

  return null;
}

function createZoneFocusCameraPreset(
  world: MapEditorSession["world"],
  zone: MapZoneDefinition,
  direction: MapZoneFocusDirection,
): MapCameraPreset | null {
  const bounds = getZoneSurfaceBounds(world, zone.numericId);
  if (!bounds) {
    return null;
  }

  const spanX = Math.max(1, bounds.maxX - bounds.minX + world.config.blockSize);
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ + world.config.blockSize);
  const horizontalSpan = Math.max(spanX, spanZ);
  const distance = THREE.MathUtils.clamp(horizontalSpan * 2.15 + 18, 24, 96);
  const height = THREE.MathUtils.clamp(horizontalSpan * 0.42 + 18 + Math.max(0, bounds.maxY - bounds.minY) * 0.35, 18, 50);
  const directionVector = getZoneFocusDirectionVector(direction);

  return {
    id: `zone-focus-${zone.id}-${direction}-${bounds.revisionKey}`,
    label: `${zone.label} focus`,
    cameraPosition: {
      x: bounds.centerX + directionVector.x * distance,
      y: bounds.centerY + height,
      z: bounds.centerZ + directionVector.z * distance,
    },
    controlsTarget: {
      x: bounds.centerX,
      y: bounds.centerY,
      z: bounds.centerZ,
    },
    minDistance: 16,
    maxDistance: 112,
    transitionDuration: 1.35,
    preferredPolarAngle: THREE.MathUtils.degToRad(58),
  };
}

function getZoneSurfaceBounds(world: MapEditorSession["world"], zoneId: number) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let count = 0;

  for (let z = 0; z < world.config.depth; z += 1) {
    for (let x = 0; x < world.config.width; x += 1) {
      if (world.getColumnZone(x, z) !== zoneId) {
        continue;
      }

      const surface = getTerrainSurfaceAt(world, x, z);
      if (!surface.valid) {
        continue;
      }

      minX = Math.min(minX, surface.worldPosition.x);
      maxX = Math.max(maxX, surface.worldPosition.x);
      minY = Math.min(minY, surface.worldPosition.y);
      maxY = Math.max(maxY, surface.worldPosition.y);
      minZ = Math.min(minZ, surface.worldPosition.z);
      maxZ = Math.max(maxZ, surface.worldPosition.z);
      count += 1;
    }
  }

  if (count === 0) {
    return null;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2 + 0.75,
    centerZ: (minZ + maxZ) / 2,
    revisionKey: `${count}-${minX.toFixed(1)}-${maxX.toFixed(1)}-${minZ.toFixed(1)}-${maxZ.toFixed(1)}-${maxY.toFixed(1)}`,
  };
}

function getZoneFocusDirectionVector(direction: MapZoneFocusDirection) {
  switch (direction) {
    case "north":
      return { x: 0, z: 1 };
    case "south":
      return { x: 0, z: -1 };
    case "east":
      return { x: -1, z: 0 };
    case "west":
      return { x: 1, z: 0 };
    case "northeast":
      return normalizeDirection2(-1, 1);
    case "northwest":
      return normalizeDirection2(1, 1);
    case "southeast":
      return normalizeDirection2(-1, -1);
    case "southwest":
      return normalizeDirection2(1, -1);
    default:
      return { x: 0, z: -1 };
  }
}

function normalizeDirection2(x: number, z: number) {
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

function getMapCameraPreset(map: MapDefinition, presetId: string | undefined) {
  if (!presetId) {
    return null;
  }
  return map.cameraPresets.find((preset) => preset.id === presetId) ?? null;
}

function ConstrainedMapControls({
  enabled,
  phase,
  editorMinZoomDistance,
  focusPreset,
  reducedMotion,
  onFocusComplete,
  onExpansionComplete,
}: {
  enabled: boolean;
  phase: ExperiencePhase;
  editorMinZoomDistance?: number;
  focusPreset: MapCameraPreset | null;
  reducedMotion: boolean;
  onFocusComplete: () => void;
  onExpansionComplete: () => void;
}) {
  const controlsRef = useRef<React.ElementRef<typeof MapControls>>(null);
  const { camera } = useThree();
  const resetViewCount = useExperienceStore((state) => state.resetViewCount);
  const panSpeed = useExperienceStore((state) => state.panSpeed);
  const rotateSpeed = useExperienceStore((state) => state.rotateSpeed);
  const dampingFactor = useExperienceStore((state) => state.dampingFactor);
  const isAngleLocked = useExperienceStore((state) => state.isAngleLocked);
  const cameraHeadingRadians = useExperienceStore((state) => state.cameraHeadingRadians);
  const setCameraHeading = useExperienceStore((state) => state.setCameraHeading);
  const compassSnapDirection = useExperienceStore((state) => state.compassSnapDirection);
  const compassSnapCount = useExperienceStore((state) => state.compassSnapCount);
  const bounds = 36;
  const lockedAngle = useRef<number | null>(null);
  const previousResetCount = useRef(resetViewCount);
  const resetting = useRef(false);
  const resetProgress = useRef(0);
  const resetStartCamera = useRef(new THREE.Vector3());
  const resetStartTarget = useRef(new THREE.Vector3());
  const transitioning = useRef(false);
  const transitionProgress = useRef(0);
  const focusing = useRef(false);
  const focusProgress = useRef(0);
  const focusStartCamera = useRef(new THREE.Vector3());
  const focusStartTarget = useRef(new THREE.Vector3());
  const cinematicCameraPosition = useRef(new THREE.Vector3());
  const activeFocusPresetId = useRef<string | null>(null);
  const focusTween = useRef<gsap.core.Tween | null>(null);
  const compassSnapTween = useRef<gsap.core.Tween | null>(null);
  const previousCompassSnapCount = useRef(compassSnapCount);
  const loaderCameraPosition = useMemo(() => new THREE.Vector3(-18, 20, 54), []);
  const loaderTargetPosition = useMemo(() => new THREE.Vector3(LOADER_ORIGIN_WORLD.x, 13.5, LOADER_ORIGIN_WORLD.z), []);
  const startCameraPosition = useMemo(() => new THREE.Vector3(43, 32, 43), []);
  const revealCameraPosition = useMemo(() => new THREE.Vector3(58, 31, 58), []);
  const revealCameraControlPosition = useMemo(() => new THREE.Vector3(51, 43, 62), []);
  const fullCameraPosition = useMemo(() => new THREE.Vector3(16, 8.6, 16), []);
  const fullCameraControlPosition = useMemo(() => new THREE.Vector3(48, 14, 55), []);
  const targetPosition = useMemo(() => LOADER_ORIGIN_WORLD.clone(), []);
  const signFocusTargetPosition = useMemo(() => new THREE.Vector3(LOADER_ORIGIN_WORLD.x, 2.8, LOADER_ORIGIN_WORLD.z), []);

  useLayoutEffect(() => {
    const controls = controlsRef.current;

    camera.position.copy(loaderCameraPosition);
    if (controls) {
      controls.target.copy(loaderTargetPosition);
      controls.update();
    } else {
      camera.lookAt(loaderTargetPosition);
    }
  }, [camera, loaderCameraPosition, loaderTargetPosition]);

  useEffect(() => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    if (isAngleLocked) {
      const currentAngle = controls.getPolarAngle();
      lockedAngle.current = currentAngle;
      controls.minPolarAngle = currentAngle;
      controls.maxPolarAngle = currentAngle;
    } else {
      lockedAngle.current = null;
      controls.minPolarAngle = THREE.MathUtils.degToRad(20);
      controls.maxPolarAngle = THREE.MathUtils.degToRad(82);
    }
  }, [isAngleLocked]);

  useEffect(() => {
    const clearMomentum = () => {
      const controlInternals = controlsRef.current as unknown as {
        sphericalDelta?: { theta: number; phi: number };
      } | null;

      if (controlInternals?.sphericalDelta) {
        controlInternals.sphericalDelta.theta = 0;
        controlInternals.sphericalDelta.phi = 0;
      }
    };

    const updateRightMouseAction = (event: PointerEvent) => {
      if (event.button !== 2 || !controlsRef.current) {
        return;
      }

      controlsRef.current.mouseButtons.RIGHT = event.ctrlKey ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    };

    window.addEventListener("pointerup", clearMomentum);
    window.addEventListener("mouseup", clearMomentum);
    window.addEventListener("pointerdown", updateRightMouseAction, { capture: true });

    return () => {
      window.removeEventListener("pointerup", clearMomentum);
      window.removeEventListener("mouseup", clearMomentum);
      window.removeEventListener("pointerdown", updateRightMouseAction, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (resetViewCount <= previousResetCount.current) {
      return;
    }

    previousResetCount.current = resetViewCount;
    resetStartCamera.current.copy(camera.position);
    resetStartTarget.current.copy(controlsRef.current?.target ?? targetPosition);
    resetProgress.current = 0;
    resetting.current = true;
  }, [camera, resetViewCount, targetPosition]);

  useEffect(() => {
    if (phase !== "focusing") {
      return;
    }

    focusStartCamera.current.copy(camera.position);
    focusStartTarget.current.copy(controlsRef.current?.target ?? loaderTargetPosition);
    focusProgress.current = 0;
    focusing.current = true;
  }, [camera, loaderTargetPosition, phase]);

  useEffect(() => {
    if (phase !== "expanding") {
      return;
    }
    transitioning.current = true;
    transitionProgress.current = 0;
  }, [phase]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!focusPreset) {
      activeFocusPresetId.current = null;
      return;
    }
    if (!controls || !enabled) {
      return;
    }
    if (activeFocusPresetId.current === focusPreset.id) {
      return;
    }

    activeFocusPresetId.current = focusPreset.id;
    focusTween.current?.kill();

    const targetCamera = new THREE.Vector3(
      focusPreset.cameraPosition.x,
      focusPreset.cameraPosition.y,
      focusPreset.cameraPosition.z,
    );
    const targetControls = new THREE.Vector3(
      focusPreset.controlsTarget.x,
      focusPreset.controlsTarget.y,
      focusPreset.controlsTarget.z,
    );
    const tweenState = { progress: 0 };
    const startCamera = camera.position.clone();
    const startTarget = controls.target.clone();
    const startOffset = startCamera.clone().sub(startTarget);
    const endOffset = targetCamera.clone().sub(targetControls);
    const startRadius = Math.max(1, Math.hypot(startOffset.x, startOffset.z));
    const endRadius = Math.max(1, Math.hypot(endOffset.x, endOffset.z));
    const startHeight = startOffset.y;
    const endHeight = endOffset.y;
    const startAngle = Math.atan2(startOffset.z, startOffset.x);
    const endAngle = Math.atan2(endOffset.z, endOffset.x);
    const angleDelta = normalizeAngleRadians(endAngle - startAngle);

    focusTween.current = gsap.to(tweenState, {
      progress: 1,
      duration: reducedMotion ? 0.01 : focusPreset.transitionDuration ?? 1.15,
      ease: "power3.inOut",
      onUpdate: () => {
        const progress = tweenState.progress;
        const nextTarget = controls.target.lerpVectors(startTarget, targetControls, progress);
        const radius = THREE.MathUtils.lerp(startRadius, endRadius, progress);
        const height = THREE.MathUtils.lerp(startHeight, endHeight, progress);
        const angle = startAngle + angleDelta * progress;
        camera.position.set(
          nextTarget.x + Math.cos(angle) * radius,
          nextTarget.y + height,
          nextTarget.z + Math.sin(angle) * radius,
        );
        controls.update();
      },
      onComplete: () => {
        camera.position.copy(targetCamera);
        controls.target.copy(targetControls);
        controls.update();
        focusTween.current = null;
      },
    });

    return () => {
      focusTween.current?.kill();
      focusTween.current = null;
    };
  }, [camera, enabled, focusPreset, reducedMotion]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !enabled || !compassSnapDirection || previousCompassSnapCount.current === compassSnapCount) {
      return;
    }

    previousCompassSnapCount.current = compassSnapCount;
    compassSnapTween.current?.kill();

    const startCamera = camera.position.clone();
    const target = controls.target.clone();
    const offset = startCamera.clone().sub(target);
    const horizontalDistance = Math.max(1, Math.hypot(offset.x, offset.z));
    const heading = compassDirectionToHeading(compassSnapDirection);
    const targetCamera = new THREE.Vector3(
      target.x - Math.sin(heading) * horizontalDistance,
      target.y + offset.y,
      target.z + Math.cos(heading) * horizontalDistance,
    );
    const tweenState = { progress: 0 };

    compassSnapTween.current = gsap.to(tweenState, {
      progress: 1,
      duration: reducedMotion ? 0.01 : 0.55,
      ease: "power3.inOut",
      onUpdate: () => {
        camera.position.lerpVectors(startCamera, targetCamera, tweenState.progress);
        controls.target.copy(target);
        controls.update();
      },
      onComplete: () => {
        camera.position.copy(targetCamera);
        controls.target.copy(target);
        controls.update();
        compassSnapTween.current = null;
      },
    });

    return () => {
      compassSnapTween.current?.kill();
      compassSnapTween.current = null;
    };
  }, [camera, compassSnapCount, compassSnapDirection, enabled, reducedMotion]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    if ((phase === "loading" || phase === "ready") && !enabled && !transitioning.current && !focusing.current) {
      camera.position.copy(loaderCameraPosition);
      controls.target.copy(loaderTargetPosition);
      controls.update();
    }

    if (transitioning.current && !enabled) {
      transitionProgress.current = Math.min(1, transitionProgress.current + delta * (reducedMotion ? 2.2 : 0.25));
      const progress = transitionProgress.current;
      if (progress < 0.2) {
        const easedReveal = easeInOutCinematic(progress / 0.2);
        setQuadraticBezierVector(
          cinematicCameraPosition.current,
          startCameraPosition,
          revealCameraControlPosition,
          revealCameraPosition,
          easedReveal,
        );
        camera.position.copy(cinematicCameraPosition.current);
        controls.target.copy(signFocusTargetPosition);
      } else {
        const settleProgress = (progress - 0.2) / 0.8;
        const easedSettle = easeInOutCinematic(settleProgress);
        setQuadraticBezierVector(
          cinematicCameraPosition.current,
          revealCameraPosition,
          fullCameraControlPosition,
          fullCameraPosition,
          easedSettle,
        );
        camera.position.copy(cinematicCameraPosition.current);
        controls.target.copy(signFocusTargetPosition);
      }
      controls.update();

      if (transitionProgress.current >= 1) {
        transitioning.current = false;
        camera.position.copy(fullCameraPosition);
        controls.target.copy(signFocusTargetPosition);
        controls.update();
        onExpansionComplete();
      }
    }

    if (focusing.current && !enabled) {
      focusProgress.current = Math.min(1, focusProgress.current + delta * 0.7);
      const eased = easeInOutCinematic(focusProgress.current);
      camera.position.lerpVectors(focusStartCamera.current, startCameraPosition, eased);
      controls.target.lerpVectors(focusStartTarget.current, signFocusTargetPosition, eased);
      controls.update();

      if (focusProgress.current >= 1) {
        focusing.current = false;
        camera.position.copy(startCameraPosition);
        controls.target.copy(signFocusTargetPosition);
        controls.update();
        onFocusComplete();
      }
    }

    if (enabled) {
      controls.target.x = THREE.MathUtils.clamp(controls.target.x, -bounds, bounds);
      controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, WORLD_CONFIG.height);
      controls.target.z = THREE.MathUtils.clamp(controls.target.z, -bounds, bounds);
      const lookDirection = controls.target.clone().sub(camera.position);
      const nextHeading = normalizeHeadingRadians(Math.atan2(lookDirection.x, -lookDirection.z));
      if (Math.abs(normalizeAngleRadians(nextHeading - cameraHeadingRadians)) > 0.01) {
        setCameraHeading(nextHeading);
      }
    }

    if (resetting.current) {
      resetProgress.current = Math.min(1, resetProgress.current + 0.045);
      const eased = THREE.MathUtils.smoothstep(resetProgress.current, 0, 1);
      camera.position.lerpVectors(resetStartCamera.current, fullCameraPosition, eased);
      controls.target.lerpVectors(resetStartTarget.current, targetPosition, eased);
      controls.update();

      if (resetProgress.current >= 1) {
        resetting.current = false;
        if (isAngleLocked) {
          const currentAngle = controls.getPolarAngle();
          lockedAngle.current = currentAngle;
          controls.minPolarAngle = currentAngle;
          controls.maxPolarAngle = currentAngle;
        }
      }
    }
  });

  return (
    <MapControls
      ref={controlsRef}
      enabled={enabled}
      enableDamping
      dampingFactor={dampingFactor}
      enableRotate
      panSpeed={panSpeed * 0.4}
      rotateSpeed={rotateSpeed * 0.4}
      maxDistance={98}
      minDistance={editorMinZoomDistance ?? 22}
      minPolarAngle={THREE.MathUtils.degToRad(20)}
      maxPolarAngle={THREE.MathUtils.degToRad(82)}
      mouseButtons={{
        RIGHT: THREE.MOUSE.PAN,
      }}
      screenSpacePanning={false}
      touches={{
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_ROTATE,
      }}
    />
  );
}

function normalizeAngleRadians(angle: number) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function normalizeHeadingRadians(angle: number) {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

function compassDirectionToHeading(direction: CompassDirection) {
  switch (direction) {
    case "north": return 0;
    case "northeast": return Math.PI * 0.25;
    case "east": return Math.PI * 0.5;
    case "southeast": return Math.PI * 0.75;
    case "south": return Math.PI;
    case "southwest": return Math.PI * 1.25;
    case "west": return Math.PI * 1.5;
    case "northwest": return Math.PI * 1.75;
  }
}

function getCompassDirectionLabel(heading: number) {
  const normalized = normalizeHeadingRadians(heading);
  const index = Math.round(normalized / (Math.PI * 0.25)) % COMPASS_DIRECTIONS.length;
  return COMPASS_DIRECTIONS[index]?.shortLabel ?? "N";
}

function countZoneAssignments(world: VoxelWorld) {
  const counts = new Map<number, number>();
  for (let z = 0; z < world.config.depth; z += 1) {
    for (let x = 0; x < world.config.width; x += 1) {
      const zone = world.getColumnZone(x, z);
      if (zone > 0) {
        counts.set(zone, (counts.get(zone) ?? 0) + 1);
      }
    }
  }
  return counts;
}

function easeInOutCinematic(progress: number) {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

function setQuadraticBezierVector(
  out: THREE.Vector3,
  start: THREE.Vector3,
  control: THREE.Vector3,
  end: THREE.Vector3,
  progress: number,
) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  const invT = 1 - t;
  out.set(
    invT * invT * start.x + 2 * invT * t * control.x + t * t * end.x,
    invT * invT * start.y + 2 * invT * t * control.y + t * t * end.y,
    invT * invT * start.z + 2 * invT * t * control.z + t * t * end.z,
  );
}

function RenderInvalidator({ phase }: { phase: ExperiencePhase }) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (phase !== "loading" && phase !== "focusing" && phase !== "expanding") {
      invalidate();
      return;
    }

    let frame = 0;
    const tick = () => {
      invalidate();
      frame = window.requestAnimationFrame(tick);
    };

    tick();

    return () => window.cancelAnimationFrame(frame);
  }, [invalidate, phase]);

  return null;
}

function createOpenBottomBlockGeometry(width: number, height: number, depth: number) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const halfDepth = depth / 2;
  const positions = new Float32Array([
    -halfWidth, halfHeight, halfDepth, halfWidth, halfHeight, halfDepth, halfWidth, halfHeight, -halfDepth, -halfWidth,
    halfHeight, -halfDepth,
    -halfWidth, -halfHeight, halfDepth, halfWidth, -halfHeight, halfDepth, halfWidth, halfHeight, halfDepth, -halfWidth,
    halfHeight, halfDepth,
    halfWidth, -halfHeight, halfDepth, halfWidth, -halfHeight, -halfDepth, halfWidth, halfHeight, -halfDepth, halfWidth,
    halfHeight, halfDepth,
    halfWidth, -halfHeight, -halfDepth, -halfWidth, -halfHeight, -halfDepth, -halfWidth, halfHeight, -halfDepth, halfWidth,
    halfHeight, -halfDepth,
    -halfWidth, -halfHeight, -halfDepth, -halfWidth, -halfHeight, halfDepth, -halfWidth, halfHeight, halfDepth, -halfWidth,
    halfHeight, -halfDepth,
  ]);
  const normals = new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ]);
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
  ];
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function DevelopmentMetrics({
  phase,
  logicalCells,
  airCells,
  nonAirBlocks,
  chunks,
  instances,
  animatedInstances,
  staticTerrainInstances,
  surfaceChunks,
  surfaceQuads,
  surfaceTriangles,
  renderMode,
  dirtyChunks,
  lastRebuiltChunks,
  lastChunkRebuildMs,
  surfaceBuildMs,
  blockEditCount,
  zoneAssignmentCount,
  entityAnchorCount,
  undoDepth,
  redoDepth,
}: {
  phase: ExperiencePhase;
  logicalCells: number;
  airCells: number;
  nonAirBlocks: number;
  chunks: number;
  instances: number;
  animatedInstances: number;
  staticTerrainInstances: number;
  surfaceChunks: SurfaceChunkMeshData[];
  surfaceQuads: number;
  surfaceTriangles: number;
  renderMode: TerrainRenderMode;
  dirtyChunks: number;
  lastRebuiltChunks: string;
  lastChunkRebuildMs: number;
  surfaceBuildMs: number;
  blockEditCount: number;
  zoneAssignmentCount: number;
  entityAnchorCount: number;
  undoDepth: number;
  redoDepth: number;
}) {
  const { camera, gl } = useThree();
  const frameCount = useRef(0);
  const accumulatedMs = useRef(0);
  const frameTimes = useRef<number[]>([]);
  const previousTime = useRef(0);
  const lastUpdate = useRef(0);
  const projectionScreenMatrix = useRef(new THREE.Matrix4());
  const frustum = useRef(new THREE.Frustum());
  const chunkCenter = useRef(new THREE.Vector3());
  const previousCanvasSize = useRef({ width: 0, height: 0, bufferWidth: 0, bufferHeight: 0 });

  useFrame(() => {
    const now = performance.now();
    if (previousTime.current === 0) {
      previousTime.current = now;
      lastUpdate.current = now;
      return;
    }

    const delta = now - previousTime.current;
    previousTime.current = now;
    frameCount.current += 1;
    accumulatedMs.current += delta;
    frameTimes.current.push(delta);

    const canvas = gl.domElement;
    const nextCanvasSize = {
      width: Math.round(canvas.clientWidth),
      height: Math.round(canvas.clientHeight),
      bufferWidth: canvas.width,
      bufferHeight: canvas.height,
    };
    const previous = previousCanvasSize.current;
    if (
      previous.width !== 0 &&
      (previous.width !== nextCanvasSize.width ||
        previous.height !== nextCanvasSize.height ||
        previous.bufferWidth !== nextCanvasSize.bufferWidth ||
        previous.bufferHeight !== nextCanvasSize.bufferHeight)
    ) {
      incrementEditorPerfCounter("canvasResizes");
    }
    previousCanvasSize.current = nextCanvasSize;

    if (now - lastUpdate.current > 500) {
      const averageFrameMs = accumulatedMs.current / frameCount.current;
      const medianFrameMs = getMedianFrameTime(frameTimes.current);
      const chunkVisibility = getSurfaceChunkVisibility(surfaceChunks, camera, projectionScreenMatrix.current, frustum.current, chunkCenter.current);
      const nextMetrics = {
        fps: Math.round(1000 / averageFrameMs),
        frameMs: Number(averageFrameMs.toFixed(1)),
        medianFrameMs,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        logicalCells,
        airCells,
        nonAirBlocks,
        chunks,
        instances,
        animatedInstances,
        staticTerrainInstances,
        surfaceQuads,
        surfaceTriangles,
        visibleChunks: renderMode === "surface" ? chunkVisibility.visible : 0,
        culledChunks: renderMode === "surface" ? chunkVisibility.culled : 0,
        chunkCapacity: CHUNK_MAX_INSTANCE_COUNT,
        dirtyChunks,
        lastRebuiltChunks,
        lastChunkRebuildMs,
        surfaceBuildMs,
        renderMode,
        blockEditCount,
        zoneAssignmentCount,
        entityAnchorCount,
        undoDepth,
        redoDepth,
      };

      window.__portfolioExperienceMetrics = {
        ...nextMetrics,
        phase,
      };

      frameCount.current = 0;
      accumulatedMs.current = 0;
      frameTimes.current = [];
      lastUpdate.current = now;
    }
  });

  return null;
}

function getMedianFrameTime(frameTimes: number[]) {
  if (frameTimes.length === 0) {
    return 0;
  }

  const sorted = [...frameTimes].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];

  return Number(median.toFixed(1));
}

function getSurfaceChunkVisibility(
  chunks: SurfaceChunkMeshData[],
  camera: THREE.Camera,
  projectionScreenMatrix: THREE.Matrix4,
  frustum: THREE.Frustum,
  center: THREE.Vector3,
) {
  projectionScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projectionScreenMatrix);

  let visible = 0;
  for (const chunk of chunks) {
    const min = chunk.boundingBox.min;
    const max = chunk.boundingBox.max;
    center.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
    const radius = Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2;
    if (chunk.visibleQuads > 0 && frustum.intersectsSphere(new THREE.Sphere(center, radius))) {
      visible += 1;
    }
  }

  return { visible, culled: chunks.length - visible };
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(query.matches);

    updatePreference();
    query.addEventListener("change", updatePreference);

    return () => query.removeEventListener("change", updatePreference);
  }, []);

  return reducedMotion;
}
