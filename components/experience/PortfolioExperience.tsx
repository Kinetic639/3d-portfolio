"use client";

import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { MapControls, Text } from "@react-three/drei";
import gsap from "gsap";
import { LockKeyhole, RotateCcw, UnlockKeyhole } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import * as THREE from "three";
import {
  CHUNK_MAX_INSTANCE_COUNT,
  createTerrainDataFromWorld,
  toTerrainChunk,
  type TerrainChunk,
} from "@/lib/terrain/terrain";
import { buildSurfaceChunkMesh, type SurfaceChunkMeshData } from "@/lib/terrain/surface-mesher";
import { BLOCK_IDS, type BlockId } from "@/lib/world/block-registry";
import { parseMapDocument, serializeMapDocument } from "@/lib/world/map-document";
import type { GridCoordinate } from "@/lib/world/world-config";
import { MapEditorSession, type EditorMessage, type EditorTool } from "@/lib/editor/map-editor";
import { createMapPresetWorld, type MapPresetId } from "@/lib/editor/map-presets";
import {
  addEntity,
  createEntityFromDraft,
  deleteEntities,
  duplicateEntities,
  groupEntities,
  ungroupEntities,
  updateEntity,
  validateEntityPlacement,
} from "@/lib/editor/entity-authoring";
import {
  DEFAULT_TERRAIN_BRUSH,
  createTerrainMutations,
  getBrushFootprint,
  type BrushShape,
  type TerrainBrushOperation,
  type TerrainBrushSettings,
} from "@/lib/editor/terrain-brushes";
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
} from "@/lib/maps/map-definition";
import {
  DEFAULT_AUTHORED_MAP_ID,
  deleteMapDraft,
  listMapRegistryEntries,
  loadMapDraft,
  loadMapStateSync,
  saveMapDraft,
} from "@/lib/maps/map-registry";
import type { EditorLayerId, EditorLayerState, EditorViewportLayoutState, MapEditorToolbarProps } from "@/components/experience/MapEditorToolbar";
import { createBrowsingState, reduceBrowsingState, type BrowsingState } from "@/lib/portfolio/browsing-state";
import { PORTFOLIO_CONTENT, resolveContentReference } from "@/lib/portfolio/content";
import {
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

declare global {
  interface Window {
    __portfolioExperienceMetrics?: MetricsSnapshot & {
      phase: ExperiencePhase;
    };
  }
}

type TerrainUniforms = {
  uExpansionProgress: { value: number };
  uTime: { value: number };
  uLoaderMotion: { value: number };
};

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
  attribute vec3 color;
  attribute float aVariation;

  varying vec3 vNormal;
  varying vec3 vBlockColor;
  varying float vVariation;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vBlockColor = color;
    vVariation = aVariation;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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

export default function PortfolioExperience({ initialMapId = DEFAULT_AUTHORED_MAP_ID }: { initialMapId?: string }) {
  const [webglState, setWebglState] = useState<"checking" | "available" | "unavailable">("checking");
  const [metrics, setMetrics] = useState<(MetricsSnapshot & { phase: ExperiencePhase }) | null>(null);
  const [editorRequested, setEditorRequested] = useState(false);
  const [editorPanel, setEditorPanel] = useState<MapEditorToolbarProps | null>(null);
  const [editorLayout, setEditorLayout] = useState<EditorViewportLayoutState>(DEFAULT_VIEWPORT_LAYOUT);
  const [mapUi, setMapUi] = useState<MapUiState | null>(null);
  const phase = useExperienceStore((state) => state.phase);
  const editorEnabled = process.env.NODE_ENV !== "production" && editorRequested;
  const editorActive = editorEnabled && phase === "explore";
  const canOpenEditor = process.env.NODE_ENV !== "production" && phase === "explore" && !editorRequested;
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
    if (process.env.NODE_ENV === "production") {
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
    const timer = window.setInterval(() => {
      if (window.__portfolioExperienceMetrics) {
        setMetrics(window.__portfolioExperienceMetrics);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, []);

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
              camera={{ position: [0, 20, 54], fov: 32, near: 0.1, far: 220 }}
              dpr={[1, 1.5]}
              flat
              gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
              onCreated={({ gl }) => {
                gl.setClearColor("#edf1ed");
              }}
            >
              <ExperienceScene
                initialMapId={initialMapId}
                editorEnabled={editorEnabled}
                onEditorStateChange={setEditorPanel}
                onMapUiStateChange={setMapUi}
                onCloseEditor={() => setEditorRequested(false)}
              />
            </Canvas>
          </div>
          <ExperienceOverlay phase={phase} />
          {metrics && !editorActive ? (
            process.env.NODE_ENV === "production" ? (
              <ProductionFpsBadge metrics={metrics} />
            ) : (
              <FixedDiagnostics metrics={metrics} />
            )
          ) : null}
          {editorActive && editorPanel ? <MapEditorToolbar {...editorPanel} fps={metrics?.fps ?? null} frameMs={metrics?.frameMs ?? null} onLayoutChange={setEditorLayout} /> : null}
          {canOpenEditor ? (
            <button
              className="map-editor-reopen"
              type="button"
              onClick={() => setEditorRequested(true)}
            >
              Editor
            </button>
          ) : null}
          {mapUi && !editorActive ? <MapBrowserOverlay state={mapUi} /> : null}
        </>
      ) : (
        <div className="experience-fallback">
          <p>Preparing the interactive map.</p>
        </div>
      )}
    </section>
  );
}

type MapUiState = {
  browsing: BrowsingState;
  map: MapDefinition;
  hoveredZoneId: string | null;
  selectedMarkerId: string | null;
  onSelectZone: (zoneId: string) => void;
  onFocusZone: () => void;
  onReturnOverview: () => void;
  onOpenContent: () => void;
  onCloseContent: () => void;
};

function ExperienceOverlay({ phase }: { phase: ExperiencePhase }) {
  const resetView = useExperienceStore((state) => state.resetView);
  const isAngleLocked = useExperienceStore((state) => state.isAngleLocked);
  const toggleAngleLock = useExperienceStore((state) => state.toggleAngleLock);

  return (
    <div className="experience-overlay">
      <header className="overlay-header">
        <div className="overlay-actions">
          {phase === "explore" ? (
            <>
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

      {phase === "ready" ? <WelcomePanel /> : null}
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
    .filter((zone) => zone.visibleInLegend)
    .sort((left, right) => left.displayOrder - right.displayOrder);
  const selectedZoneId = "zoneId" in state.browsing ? state.browsing.zoneId : null;
  const selectedMarker = state.selectedMarkerId
    ? state.map.markers.find((marker) => marker.id === state.selectedMarkerId) ?? null
    : null;
  const selectedZone = selectedZoneId ? state.map.zones.find((zone) => zone.id === selectedZoneId) ?? null : null;
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
  onEditorStateChange,
  onMapUiStateChange,
  onCloseEditor,
}: {
  initialMapId: string;
  editorEnabled: boolean;
  onEditorStateChange: (state: MapEditorToolbarProps | null) => void;
  onMapUiStateChange: (state: MapUiState | null) => void;
  onCloseEditor: () => void;
}) {
  const initialState = useMemo(() => createInitialExperienceMapState(initialMapId), [initialMapId]);
  const [currentMap, setCurrentMap] = useState<MapDefinition>(initialState.loadedMap.definition);
  const mapHistoryRef = useRef<{ undo: MapDefinition[]; redo: MapDefinition[] }>({ undo: [], redo: [] });
  const [terrain, setTerrain] = useState(initialState.terrain);
  const [editorSession, setEditorSession] = useState(() => new MapEditorSession(initialState.loadedMap.world, initialState.loadedMap.entities));
  const [tool, setTool] = useState<EditorTool>("select");
  const [paintBlockId, setPaintBlockId] = useState<BlockId>(BLOCK_IDS.Path);
  const [presetId, setPresetId] = useState<MapPresetId>("portfolioCampus");
  const [renderMode, setRenderMode] = useState<TerrainRenderMode>("surface");
  const [zoneId, setZoneId] = useState(1);
  const [activeMapId, setActiveMapId] = useState(initialState.loadedMap.definition.id);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [browsing, dispatchBrowsing] = useReducer(reduceBrowsingState, initialState.loadedMap.definition.id, createBrowsingState);
  const [hoveredCell, setHoveredCell] = useState<GridCoordinate | null>(null);
  const [selectedCell, setSelectedCell] = useState<GridCoordinate | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [brushSettings, setBrushSettings] = useState<TerrainBrushSettings>(DEFAULT_TERRAIN_BRUSH);
  const [primitiveType, setPrimitiveType] = useState<PrimitiveType>("box");
  const [collisionMode, setCollisionMode] = useState<CollisionMode>("blocking");
  const [entityColor, setEntityColor] = useState("#9ca3af");
  const [entityName, setEntityName] = useState("Placeholder");
  const [navigationNodeType, setNavigationNodeType] = useState<NavigationNodeType>("walk");
  const [layerStates, setLayerStates] = useState<EditorLayerState[]>(DEFAULT_EDITOR_LAYERS);
  const [cleanPreview, setCleanPreview] = useState(false);
  const [validationSummary, setValidationSummary] = useState<string[]>([]);
  const [editorMessage, setEditorMessage] = useState<EditorMessage | null>(
    initialState.error ? { type: "error", text: initialState.error } : null,
  );
  const [lastRebuiltChunks, setLastRebuiltChunks] = useState<string[]>([]);
  const [lastChunkRebuildMs, setLastChunkRebuildMs] = useState(0);
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
  const editorAvailable = editorEnabled && phase === "explore";
  const activeRenderMode: TerrainRenderMode = phase === "explore" ? renderMode : "instanced";
  const dynamicStats = editorSession.world.getStats();
  const snapshot = editorSession.getSnapshot();
  const selectedWorldPosition = selectedCell
    ? editorSession.world.gridToWorld(selectedCell.x, selectedCell.y, selectedCell.z)
    : null;
  const selectedChunk = selectedCell ? editorSession.world.getChunkCoordinates(selectedCell.x, selectedCell.z) : null;
  const selectedLocal = selectedCell ? editorSession.world.getLocalChunkCoordinates(selectedCell.x, selectedCell.z) : null;
  const selectedBlockId = selectedCell
    ? editorSession.world.getBlock(selectedCell.x, selectedCell.y, selectedCell.z)
    : null;
  const selectedZoneId = selectedCell ? editorSession.world.getZone(selectedCell.x, selectedCell.y, selectedCell.z) : 0;
  const selectedEntity = currentMap.entities.find((entity) => selectedEntityIds.includes(entity.id)) ?? null;
  const brushAffectedCellCount = hoveredCell ? getBrushFootprint(hoveredCell, brushSettings).length : 0;
  const availableMaps = useMemo(() => listMapRegistryEntries({ includeDevelopment: process.env.NODE_ENV !== "production" }), []);
  const activeCameraPreset = useMemo(() => getBrowsingCameraPreset(currentMap, browsing), [browsing, currentMap]);

  const commitMapDefinitionChange = (nextMap: MapDefinition, message: string) => {
    mapHistoryRef.current.undo.push(currentMap);
    if (mapHistoryRef.current.undo.length > 80) {
      mapHistoryRef.current.undo.shift();
    }
    mapHistoryRef.current.redo = [];
    setCurrentMap(nextMap);
    setEditorMessage({ type: "info", text: message });
    setEditorRevision((revision) => revision + 1);
  };

  const createCurrentMapDefinition = () => createMapDefinitionFromWorld({
    ...currentMap,
    world: editorSession.world,
    zones: currentMap.zones,
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
  });

  const replaceLoadedMap = (map: MapDefinition, markSaved: boolean, message: string) => {
    const document = mapDefinitionToDocument(map);
    const result = editorSession.replaceWithDocument(document, markSaved);
    const nextTerrain = createTerrainDataFromWorld(editorSession.world);

    setCurrentMap(map);
    mapHistoryRef.current = { undo: [], redo: [] };
    setActiveMapId(map.id);
    dispatchBrowsing({ type: "changeMap", mapId: map.id });
    setTerrain(nextTerrain);
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
      setLastChunkRebuildMs(0);
      setEditorRevision((revision) => revision + 1);
      return;
    }

    const startedAt = performance.now();
    const rebuiltTerrainChunks = new Map(rebuiltChunks.map((chunk) => [chunk.id, toTerrainChunk(chunk)]));
    const rebuiltSurfaceChunks = new Map(rebuiltChunks.map((chunk) => [chunk.id, buildSurfaceChunkMesh(editorSession.world, chunk.chunkX, chunk.chunkZ)]));
    const rebuildMs = Number((performance.now() - startedAt).toFixed(3));

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
    setLastRebuiltChunks([...rebuiltTerrainChunks.keys()]);
    setLastChunkRebuildMs(rebuildMs);
    setEditorRevision((revision) => revision + 1);
  };

  const handleEditorCell = (coordinate: GridCoordinate) => {
    if (!editorAvailable) {
      return;
    }
    if (isLayerLocked(layerStates, getToolLayer(tool))) {
      setEditorMessage({ type: "error", text: "The active editor layer is locked." });
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

    const brushOperation = getTerrainBrushOperation(tool);
    const result = brushOperation
      ? editorSession.applyTerrainMutations(
        brushOperation,
        createTerrainMutations({
          world: editorSession.world,
          operation: brushOperation,
          center: editCoordinate,
          settings: brushSettings,
          blockId: brushOperation === "paint-path" ? BLOCK_IDS.Path : paintBlockId,
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
  };

  const handleEditorCells = (coordinates: GridCoordinate[]) => {
    if (!editorAvailable || coordinates.length === 0) {
      return;
    }
    if (isLayerLocked(layerStates, getToolLayer(tool))) {
      setEditorMessage({ type: "error", text: "The active editor layer is locked." });
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
        settings: brushSettings,
        blockId: brushOperation === "paint-path" ? BLOCK_IDS.Path : paintBlockId,
        zoneId,
      });
    });
    const result = editorSession.applyTerrainMutations(brushOperation, mutations);
    if (result.message) setEditorMessage(result.message);
    setSelectedCell(coordinates[coordinates.length - 1]);
    setSelectedMarkerId(null);
    setSelectedEntityIds([]);
    replaceRebuiltChunks(result.rebuiltChunks);
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
    setTerrain(nextTerrain);
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
      const draft = loadMapDraft(localStorage, nextMapId);
      const loaded = draft ? createLoadedMapState(draft) : loadMapStateSync(nextMapId, { includeDevelopment: true });

      const nextSession = new MapEditorSession(loaded.world, loaded.entities);
      const nextTerrain = createTerrainDataFromWorld(nextSession.world);
      setEditorSession(nextSession);
      setCurrentMap(loaded.definition);
      mapHistoryRef.current = { undo: [], redo: [] };
      setActiveMapId(loaded.definition.id);
      dispatchBrowsing({ type: "changeMap", mapId: loaded.definition.id });
      setTerrain(nextTerrain);
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
      const map = createBlankMapDefinition({ id, name, flatBaseLayer: true });
      const nextSession = new MapEditorSession();
      nextSession.replaceWithDocument(mapDefinitionToDocument(map), true);
      setEditorSession(nextSession);
      setCurrentMap(map);
      mapHistoryRef.current = { undo: [], redo: [] };
      setActiveMapId(map.id);
      dispatchBrowsing({ type: "changeMap", mapId: map.id });
      setTerrain(createTerrainDataFromWorld(nextSession.world));
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
    const saved = saveMapDraft(localStorage, createCurrentMapDefinition());
    setCurrentMap(saved);
    editorSession.markSaved();
    setAutosaveStatus(`draft saved ${new Date().toLocaleTimeString()}`);
    setEditorRevision((revision) => revision + 1);
  };

  const handleRenameMap = () => {
    const name = window.prompt("Map name", currentMap.name);
    if (!name || name === currentMap.name) return;
    setCurrentMap({ ...currentMap, name, metadata: { ...currentMap.metadata, updatedAt: new Date().toISOString() } });
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

  const handlePlaceEntity = () => {
    if (isLayerLocked(layerStates, "entities")) {
      setEditorMessage({ type: "error", text: "The entity layer is locked." });
      return;
    }
    const basePosition = selectedWorldPosition ?? { x: 0, y: 1, z: 0 };
    const entity = createEntityFromDraft({
      name: entityName,
      primitiveType,
      color: entityColor,
      collisionMode,
      transform: {
        position: { x: basePosition.x, y: basePosition.y + 0.5, z: basePosition.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: primitiveType === "plane" ? { x: 2, y: 0.08, z: 2 } : { x: 1, y: 1, z: 1 },
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
    setSelectedCell(null);
    setSelectedMarkerId(null);
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
      onEditorStateChange(null);
      return;
    }

    onEditorStateChange({
      available: editorAvailable,
      mapId: activeMapId,
      mapName: currentMap.name,
      mapDescription: currentMap.description ?? "",
      availableMaps,
      tool,
      paintBlockId,
      presetId,
      renderMode,
      zoneId,
      hovered: hoveredCell,
      selected: selectedCell,
      selectedBlockId,
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
      onToolChange: setTool,
      onPaintBlockChange: setPaintBlockId,
      onPresetChange: handlePresetChange,
      onMapChange: handleMapChange,
      onNewMap: handleNewMap,
      onDuplicateMap: handleDuplicateMap,
      onSaveDraft: handleSaveDraft,
      onRenameMap: handleRenameMap,
      onRenderModeChange: setRenderMode,
      onZoneChange: setZoneId,
      onUndo: handleUndo,
      onRedo: handleRedo,
      onResetUnsaved: handleResetUnsaved,
      onResetFlat: handleResetFlat,
      onExport: handleExport,
      onImport: handleImport,
      onClearDraft: handleClearDraft,
      onClose: onCloseEditor,
      onRemoveMarker: handleRemoveMarker,
      onBrushShapeChange: (shape: BrushShape) => setBrushSettings((settings) => ({ ...settings, shape })),
      onBrushSizeChange: (size: number) => setBrushSettings((settings) => ({ ...settings, size: Math.max(1, Math.min(9, Math.floor(size) || 1)) })),
      onPathWidthChange: (pathWidth: number) => setBrushSettings((settings) => ({ ...settings, pathWidth: Math.max(1, Math.min(9, Math.floor(pathWidth) || 1)) })),
      onFlattenHeightChange: (flattenHeight: number) => setBrushSettings((settings) => ({ ...settings, flattenHeight: Math.max(0, Math.min(11, Math.floor(flattenHeight) || 0)) })),
      onPrimitiveTypeChange: setPrimitiveType,
      onCollisionModeChange: setCollisionMode,
      onEntityColorChange: setEntityColor,
      onEntityNameChange: setEntityName,
      onPlaceEntity: handlePlaceEntity,
      onDuplicateEntity: handleDuplicateEntity,
      onDeleteEntity: handleDeleteEntity,
      onGroupEntity: handleGroupEntity,
      onUngroupEntity: handleUngroupEntity,
      onToggleEntityLocked: handleToggleEntityLocked,
      onToggleEntityHidden: handleToggleEntityHidden,
      onNavigationNodeTypeChange: setNavigationNodeType,
      onPlaceNavigationNode: handlePlaceNavigationNode,
      onConnectNavigationNodes: handleConnectNavigationNodes,
      onCreateRoute: handleCreateRoute,
      onLayerVisibilityChange: (id, visible) => updateLayer(id, { visible }),
      onLayerLockChange: (id, locked) => updateLayer(id, { locked }),
      onCleanPreviewChange: setCleanPreview,
    });
  }, [
    autosaveStatus,
    activeMapId,
    availableMaps,
    currentMap,
    brushAffectedCellCount,
    brushSettings,
    cleanPreview,
    collisionMode,
    entityColor,
    entityName,
    editorAvailable,
    editorMessage,
    editorRevision,
    hoveredCell,
    lastRebuiltChunks,
    onCloseEditor,
    onEditorStateChange,
    paintBlockId,
    presetId,
    primitiveType,
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
      hoveredZoneId,
      selectedMarkerId: browsing.mode === "itemSelected" || browsing.mode === "contentOpen" ? browsing.markerId : null,
      onSelectZone: (nextZoneId) => dispatchBrowsing({ type: "selectZone", zoneId: nextZoneId }),
      onFocusZone: () => dispatchBrowsing({ type: "focusZone", previousViewId: currentMap.defaultCameraPresetId }),
      onReturnOverview: () => dispatchBrowsing({ type: "returnToOverview", previousViewId: currentMap.defaultCameraPresetId }),
      onOpenContent: () => dispatchBrowsing({ type: "openContent" }),
      onCloseContent: () => dispatchBrowsing({ type: "closeContent" }),
    });

    return () => onMapUiStateChange(null);
  }, [browsing, currentMap, hoveredZoneId, onMapUiStateChange, phase]);

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

        const result = editorSession.replaceWithDocument(mapDefinitionToDocument(savedDraft), true);
        const nextTerrain = createTerrainDataFromWorld(editorSession.world);
        setCurrentMap(savedDraft);
        setTerrain(nextTerrain);
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
  }, [editorAvailable, editorRevision, editorSession]);

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
      onComplete: markExplore,
    });

    return () => {
      tween.kill();
    };
  }, [markExplore, phase, reducedMotion, uniforms.uExpansionProgress]);

  useFrame(({ clock }) => {
    // Shader uniforms are external Three.js state; updating them here avoids React rerenders.
    // eslint-disable-next-line react-hooks/immutability
    uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[24, 42, 18]} intensity={1.2} />
      <TerrainChunks
        chunks={terrain.chunks}
        uniforms={uniforms}
        visible={activeRenderMode === "instanced"}
      />
      <SurfaceTerrainChunks
        chunks={terrain.surfaceChunks}
        visible={activeRenderMode === "surface" || phase === "loading"}
        warmup={phase === "loading"}
      />
      <WorldEntryItem visible={phase === "ready"} onActivate={startExpansion} />
      <ConstrainedMapControls
        enabled={isInteractivePhase(phase)}
        phase={phase}
        focusPreset={activeCameraPreset}
        reducedMotion={reducedMotion}
        onFocusComplete={markExpanding}
      />
      <RenderInvalidator phase={phase} />
      <EditorInteractionOverlay
        editorEnabled={editorAvailable}
        tool={tool}
        renderMode={activeRenderMode}
        chunks={terrain.chunks}
        surfaceChunks={terrain.surfaceChunks}
        world={editorSession.world}
        hoveredCell={hoveredCell}
        onHoverCell={setHoveredCell}
        onEditCell={handleEditorCell}
        onEditCells={handleEditorCells}
      />
      <BrushFootprintIndicator coordinate={hoveredCell} settings={brushSettings} visible={editorAvailable && !cleanPreview && isLayerVisible(layerStates, "developmentHelpers")} color={TOOL_COLORS[tool]} />
      <SelectionIndicator coordinate={selectedCell} visible={editorAvailable && !cleanPreview && isLayerVisible(layerStates, "developmentHelpers")} color="#f59e0b" />
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
        editorEnabled={editorAvailable}
        cleanPreview={cleanPreview}
        layerVisible={isLayerVisible(layerStates, "entities")}
        entities={currentMap.entities}
        selectedEntityIds={selectedEntityIds}
        onSelectEntity={(id, additive) => {
          setSelectedEntityIds((ids) => additive ? [...new Set([...ids, id])] : [id]);
          setSelectedCell(null);
          setSelectedMarkerId(null);
        }}
      />
      <EditorNavigationHelpers
        editorEnabled={editorAvailable && !cleanPreview && isLayerVisible(layerStates, "navigation")}
        map={currentMap}
      />
      <MapInteractionProxies
        map={currentMap}
        world={editorSession.world}
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
  visible,
  warmup,
}: {
  chunks: SurfaceChunkMeshData[];
  visible: boolean;
  warmup: boolean;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SURFACE_VERTEX_SHADER,
        fragmentShader: SURFACE_FRAGMENT_SHADER,
        side: THREE.FrontSide,
      }),
    [],
  );
  const warmupMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SURFACE_VERTEX_SHADER,
        fragmentShader: SURFACE_FRAGMENT_SHADER,
        side: THREE.FrontSide,
        colorWrite: false,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      material.dispose();
      warmupMaterial.dispose();
    };
  }, [material, warmupMaterial]);

  return (
    <group visible={visible}>
      {chunks.map((chunk) => (
        <SurfaceTerrainChunkMesh key={chunk.id} chunk={chunk} material={warmup ? warmupMaterial : material} />
      ))}
    </group>
  );
}

function SurfaceTerrainChunkMesh({
  chunk,
  material,
}: {
  chunk: SurfaceChunkMeshData;
  material: THREE.Material;
}) {
  const geometry = useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute("position", new THREE.BufferAttribute(chunk.positions, 3));
    nextGeometry.setAttribute("normal", new THREE.BufferAttribute(chunk.normals, 3));
    nextGeometry.setAttribute("color", new THREE.BufferAttribute(chunk.colors, 3));
    nextGeometry.setAttribute("aVariation", new THREE.BufferAttribute(chunk.variations, 1));
    nextGeometry.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
    nextGeometry.computeBoundingBox();
    nextGeometry.computeBoundingSphere();
    return nextGeometry;
  }, [chunk]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      userData={{
        portfolioSurfaceChunkId: chunk.id,
        portfolioSurfaceTriangleToCell: chunk.triangleToCell,
      }}
      frustumCulled
    />
  );
}

function WorldEntryItem({
  visible,
  onActivate,
}: {
  visible: boolean;
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
      position={[0, 0.76, 0]}
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
  renderMode,
  chunks,
  surfaceChunks,
  world,
  hoveredCell,
  onHoverCell,
  onEditCell,
  onEditCells,
}: {
  editorEnabled: boolean;
  tool: EditorTool;
  renderMode: TerrainRenderMode;
  chunks: TerrainChunk[];
  surfaceChunks: SurfaceChunkMeshData[];
  world: MapEditorSession["world"];
  hoveredCell: GridCoordinate | null;
  onHoverCell: (coordinate: GridCoordinate | null) => void;
  onEditCell: (coordinate: GridCoordinate) => void;
  onEditCells: (coordinates: GridCoordinate[]) => void;
}) {
  const { camera, gl, raycaster, scene } = useThree();
  const chunkById = useMemo(() => new Map(chunks.map((chunk) => [chunk.id, chunk])), [chunks]);
  const surfaceChunkById = useMemo(() => new Map(surfaceChunks.map((chunk) => [chunk.id, chunk])), [surfaceChunks]);
  const mousePosition = useRef(new THREE.Vector2(0, 0));
  const pointerDownPosition = useRef<{ x: number; y: number } | null>(null);
  const brushActive = useRef(false);
  const brushedCellKeys = useRef(new Set<string>());
  const brushedCells = useRef<GridCoordinate[]>([]);
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const planeIntersection = useRef(new THREE.Vector3());
  const shouldRaycast = useRef(true);

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
      const currentHover = getHoveredEditorCell(scene, raycaster, chunkById, surfaceChunkById, world, tool, renderMode);
      if (!currentHover) {
        return false;
      }

      const key = editorCoordinateKey(currentHover);
      if (brushedCellKeys.current.has(key)) {
        return false;
      }

      brushedCellKeys.current.add(key);
      brushedCells.current.push(currentHover);
      return true;
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

      if (isStrokeBrushTool(tool)) {
        brushActive.current = true;
        brushedCellKeys.current.clear();
        brushedCells.current = [];
        paintCurrentHover();
      }

      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!updateMousePosition(event)) {
        return;
      }

      if (!brushActive.current || !isStrokeBrushTool(tool) || (event.buttons & 1) !== 1 || isEditorUiEvent(event)) {
        return;
      }

      if (paintCurrentHover()) {
        event.preventDefault();
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (brushActive.current) {
        brushActive.current = false;
        onEditCells(brushedCells.current);
        brushedCellKeys.current.clear();
        brushedCells.current = [];
        pointerDownPosition.current = null;
        event.preventDefault();
        return;
      }

      if (event.button !== 0 || !pointerDownPosition.current || isEditorUiEvent(event)) {
        pointerDownPosition.current = null;
        return;
      }

      const moved = Math.hypot(
        event.clientX - pointerDownPosition.current.x,
        event.clientY - pointerDownPosition.current.y,
      );
      pointerDownPosition.current = null;

      if (moved <= 5) {
        raycaster.setFromCamera(mousePosition.current, camera);
        const currentHover = getHoveredEditorCell(scene, raycaster, chunkById, surfaceChunkById, world, tool, renderMode);
        if (currentHover) {
          event.preventDefault();
          onEditCell(currentHover);
        }
      }
    };

    const handlePointerCancel = () => {
      brushActive.current = false;
      brushedCellKeys.current.clear();
      brushedCells.current = [];
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
  }, [camera, chunkById, editorEnabled, gl.domElement, onEditCell, onEditCells, onHoverCell, raycaster, renderMode, scene, surfaceChunkById, tool, world]);

  useEffect(() => {
    shouldRaycast.current = true;
  }, [chunkById, surfaceChunkById]);

  useFrame(() => {
    if (!editorEnabled || !shouldRaycast.current) {
      return;
    }

    shouldRaycast.current = false;
    raycaster.setFromCamera(mousePosition.current, camera);
    const nextHoveredCell = getHoveredEditorCell(
      scene,
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
  scene: THREE.Scene,
  raycaster: THREE.Raycaster,
  chunkById: Map<string, TerrainChunk>,
  surfaceChunkById: Map<string, SurfaceChunkMeshData>,
  world: MapEditorSession["world"],
  tool: EditorTool,
  renderMode: TerrainRenderMode,
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  planeIntersection = new THREE.Vector3(),
) {
  const chunkMeshes: THREE.InstancedMesh[] = [];
  const surfaceMeshes: THREE.Mesh[] = [];

  scene.traverse((object) => {
    if ((object as THREE.InstancedMesh).isInstancedMesh && typeof object.userData.portfolioChunkId === "string") {
      chunkMeshes.push(object as THREE.InstancedMesh);
    }
    if ((object as THREE.Mesh).isMesh && typeof object.userData.portfolioSurfaceChunkId === "string") {
      surfaceMeshes.push(object as THREE.Mesh);
    }
  });

  const hits = raycaster.intersectObjects(renderMode === "surface" ? surfaceMeshes : chunkMeshes, false);
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

function BrushFootprintIndicator({
  coordinate,
  settings,
  visible,
  color,
}: {
  coordinate: GridCoordinate | null;
  settings: TerrainBrushSettings;
  visible: boolean;
  color: string;
}) {
  const cells = useMemo(() => coordinate ? getBrushFootprint(coordinate, settings) : [], [coordinate, settings]);
  return (
    <>
      {cells.map((cell) => (
        <SelectionIndicator
          key={`${cell.x}-${cell.y}-${cell.z}`}
          coordinate={cell}
          visible={visible}
          color={color}
          filled
        />
      ))}
    </>
  );
}

type ZoneProxy = {
  zoneId: string;
  label: string;
  color: string;
  center: THREE.Vector3;
  size: THREE.Vector3;
};

function MapInteractionProxies({
  map,
  world,
  enabled,
  browsing,
  onHoverZone,
  onSelectZone,
  onSelectMarker,
}: {
  map: MapDefinition;
  world: MapEditorSession["world"];
  enabled: boolean;
  browsing: BrowsingState;
  onHoverZone: (zoneId: string | null) => void;
  onSelectZone: (zoneId: string) => void;
  onSelectMarker: (marker: MapMarkerDefinition) => void;
}) {
  const zoneProxies = useMemo(() => createZoneProxies(map, world), [map, world]);
  const zoneGeometry = useMemo(() => new THREE.BoxGeometry(1, 0.08, 1), []);
  const markerGeometry = useMemo(() => new THREE.ConeGeometry(0.34, 0.82, 5), []);
  const markerMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#d8b45a" }), []);
  const selectedMarkerMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff" }), []);
  const zoneMaterials = useMemo(
    () => new Map(zoneProxies.map((proxy) => [
      proxy.zoneId,
      new THREE.MeshBasicMaterial({
        color: proxy.color,
        transparent: true,
        opacity: browsing.mode !== "overview" && "zoneId" in browsing && browsing.zoneId === proxy.zoneId ? 0.32 : 0.16,
        depthWrite: false,
      }),
    ])),
    [browsing, zoneProxies],
  );

  useEffect(() => {
    return () => {
      zoneGeometry.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      selectedMarkerMaterial.dispose();
    };
  }, [markerGeometry, markerMaterial, selectedMarkerMaterial, zoneGeometry]);

  useEffect(() => {
    return () => {
      for (const material of zoneMaterials.values()) {
        material.dispose();
      }
    };
  }, [zoneMaterials]);

  if (!enabled) {
    return null;
  }

  return (
    <group>
      {zoneProxies.map((proxy) => (
        <mesh
          key={proxy.zoneId}
          geometry={zoneGeometry}
          material={zoneMaterials.get(proxy.zoneId)}
          position={proxy.center}
          scale={proxy.size}
          onPointerOver={(event) => {
            event.stopPropagation();
            document.body.style.cursor = "pointer";
            onHoverZone(proxy.zoneId);
          }}
          onPointerOut={(event) => {
            event.stopPropagation();
            document.body.style.cursor = "";
            onHoverZone(null);
          }}
          onClick={(event) => {
            event.stopPropagation();
            onSelectZone(proxy.zoneId);
          }}
        />
      ))}
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

function createZoneProxies(map: MapDefinition, world: MapEditorSession["world"]) {
  const zonesByNumber = new Map(map.zones.map((zone) => [zone.numericId, zone]));
  const bounds = new Map<number, { minX: number; maxX: number; minZ: number; maxZ: number; y: number }>();

  for (const assignment of map.zoneAssignments) {
    const zone = zonesByNumber.get(assignment.zoneId);
    if (!zone?.overlayVisible) {
      continue;
    }
    const current = bounds.get(assignment.zoneId);
    if (!current) {
      bounds.set(assignment.zoneId, {
        minX: assignment.x,
        maxX: assignment.x,
        minZ: assignment.z,
        maxZ: assignment.z,
        y: assignment.y,
      });
      continue;
    }
    current.minX = Math.min(current.minX, assignment.x);
    current.maxX = Math.max(current.maxX, assignment.x);
    current.minZ = Math.min(current.minZ, assignment.z);
    current.maxZ = Math.max(current.maxZ, assignment.z);
    current.y = Math.max(current.y, assignment.y);
  }

  const proxies: ZoneProxy[] = [];
  for (const [numericId, box] of bounds) {
    const zone = zonesByNumber.get(numericId);
    if (!zone) continue;
    const min = world.gridToWorld(box.minX, box.y, box.minZ);
    const max = world.gridToWorld(box.maxX, box.y, box.maxZ);
    proxies.push({
      zoneId: zone.id,
      label: zone.label,
      color: zone.color,
      center: new THREE.Vector3((min.x + max.x) / 2, box.y + 1.04, (min.z + max.z) / 2),
      size: new THREE.Vector3(Math.max(1, box.maxX - box.minX + 1), 1, Math.max(1, box.maxZ - box.minZ + 1)),
    });
  }

  return proxies;
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

function EditorPlacedEntities({
  editorEnabled,
  cleanPreview,
  layerVisible,
  entities,
  selectedEntityIds,
  onSelectEntity,
}: {
  editorEnabled: boolean;
  cleanPreview: boolean;
  layerVisible: boolean;
  entities: PlacedMapEntity[];
  selectedEntityIds: string[];
  onSelectEntity: (id: string, additive: boolean) => void;
}) {
  const geometries = useMemo(() => ({
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
    sphere: new THREE.SphereGeometry(0.5, 16, 10),
    plane: new THREE.BoxGeometry(1, 0.04, 1),
    platform: new THREE.BoxGeometry(1, 0.22, 1),
    sign: new THREE.BoxGeometry(1, 0.72, 0.08),
  }), []);
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
          <group key={entity.id}>
            <mesh
              geometry={geometries[entity.primitiveType]}
              position={[entity.transform.position.x, entity.transform.position.y, entity.transform.position.z]}
              rotation={[entity.transform.rotation.x, entity.transform.rotation.y, entity.transform.rotation.z]}
              scale={[entity.transform.scale.x, entity.transform.scale.y, entity.transform.scale.z]}
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
                geometry={geometries[entity.primitiveType]}
                material={selectedMaterial}
                position={[entity.transform.position.x, entity.transform.position.y, entity.transform.position.z]}
                rotation={[entity.transform.rotation.x, entity.transform.rotation.y, entity.transform.rotation.z]}
                scale={[entity.transform.scale.x * 1.05, entity.transform.scale.y * 1.05, entity.transform.scale.z * 1.05]}
                renderOrder={12}
              />
            ) : null}
            {entity.primitiveType === "sign" && entity.sign?.label ? (
              <HtmlSignLabel entity={entity} />
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

function HtmlSignLabel({ entity }: { entity: PlacedMapEntity }) {
  return (
    <Text
      position={[entity.transform.position.x, entity.transform.position.y + 0.12, entity.transform.position.z + 0.08]}
      rotation={[entity.transform.rotation.x, entity.transform.rotation.y, entity.transform.rotation.z]}
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

function getTerrainBrushOperation(tool: EditorTool): TerrainBrushOperation | null {
  switch (tool) {
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
    case "zone":
      return "assign-zone";
    case "removeZone":
      return "remove-zone";
    default:
      return null;
  }
}

function isStrokeBrushTool(tool: EditorTool) {
  return getTerrainBrushOperation(tool) !== null;
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

function isEditorUiEvent(event: PointerEvent) {
  const target = event.target;

  return target instanceof HTMLElement && Boolean(target.closest(".map-editor-toolbar, button, input, select, textarea, [role='button']"));
}

function getBrowsingCameraPreset(map: MapDefinition, browsing: BrowsingState) {
  if (browsing.mode === "returningToOverview") {
    return getMapCameraPreset(map, map.defaultCameraPresetId);
  }
  if (browsing.mode === "zoneFocused") {
    const zone = map.zones.find((candidate) => candidate.id === browsing.zoneId);
    const marker = zone?.defaultFocusMarkerId
      ? map.markers.find((candidate) => candidate.id === zone.defaultFocusMarkerId)
      : null;
    return getMapCameraPreset(map, marker?.focusCameraPresetId) ?? getMapCameraPreset(map, map.defaultCameraPresetId);
  }
  if (browsing.mode === "itemSelected" || browsing.mode === "contentOpen") {
    const marker = map.markers.find((candidate) => candidate.id === browsing.markerId);
    return getMapCameraPreset(map, marker?.focusCameraPresetId) ?? getMapCameraPreset(map, map.defaultCameraPresetId);
  }

  return null;
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
  focusPreset,
  reducedMotion,
  onFocusComplete,
}: {
  enabled: boolean;
  phase: ExperiencePhase;
  focusPreset: MapCameraPreset | null;
  reducedMotion: boolean;
  onFocusComplete: () => void;
}) {
  const controlsRef = useRef<React.ElementRef<typeof MapControls>>(null);
  const { camera } = useThree();
  const resetViewCount = useExperienceStore((state) => state.resetViewCount);
  const panSpeed = useExperienceStore((state) => state.panSpeed);
  const rotateSpeed = useExperienceStore((state) => state.rotateSpeed);
  const dampingFactor = useExperienceStore((state) => state.dampingFactor);
  const isAngleLocked = useExperienceStore((state) => state.isAngleLocked);
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
  const activeFocusPresetId = useRef<string | null>(null);
  const focusTween = useRef<gsap.core.Tween | null>(null);
  const loaderCameraPosition = useMemo(() => new THREE.Vector3(0, 20, 54), []);
  const loaderTargetPosition = useMemo(() => new THREE.Vector3(0, 13.5, 0), []);
  const startCameraPosition = useMemo(() => new THREE.Vector3(12, 15, 18), []);
  const fullCameraPosition = useMemo(() => new THREE.Vector3(42, 52, 62), []);
  const targetPosition = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useEffect(() => {
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

    focusTween.current = gsap.to(tweenState, {
      progress: 1,
      duration: reducedMotion ? 0.01 : focusPreset.transitionDuration ?? 0.9,
      ease: "power3.inOut",
      onUpdate: () => {
        camera.position.lerpVectors(startCamera, targetCamera, tweenState.progress);
        controls.target.lerpVectors(startTarget, targetControls, tweenState.progress);
        controls.update();
      },
      onComplete: () => {
        focusTween.current = null;
      },
    });

    return () => {
      focusTween.current?.kill();
      focusTween.current = null;
    };
  }, [camera, enabled, focusPreset, reducedMotion]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    if (transitioning.current && !enabled) {
      transitionProgress.current = Math.min(1, transitionProgress.current + delta * 0.6);
      const eased = THREE.MathUtils.smoothstep(transitionProgress.current, 0, 1);
      camera.position.lerpVectors(startCameraPosition, fullCameraPosition, eased);
      controls.target.copy(targetPosition);
      controls.update();

      if (transitionProgress.current >= 1) {
        transitioning.current = false;
      }
    }

    if (focusing.current && !enabled) {
      focusProgress.current = Math.min(1, focusProgress.current + delta * 0.7);
      const eased = easeInOutCinematic(focusProgress.current);
      camera.position.lerpVectors(focusStartCamera.current, startCameraPosition, eased);
      controls.target.lerpVectors(focusStartTarget.current, targetPosition, eased);
      controls.update();

      if (focusProgress.current >= 1) {
        focusing.current = false;
        camera.position.copy(startCameraPosition);
        controls.target.copy(targetPosition);
        controls.update();
        onFocusComplete();
      }
    }

    if (enabled) {
      controls.target.x = THREE.MathUtils.clamp(controls.target.x, -bounds, bounds);
      controls.target.y = 0;
      controls.target.z = THREE.MathUtils.clamp(controls.target.z, -bounds, bounds);
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
      minDistance={22}
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
      target={[0, 13.5, 0]}
    />
  );
}

function easeInOutCinematic(progress: number) {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
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
