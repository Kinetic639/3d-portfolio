"use client";

import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import gsap from "gsap";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  CHUNK_MAX_INSTANCE_COUNT,
  createTerrainDataFromWorld,
  toTerrainChunk,
  type TerrainChunk,
} from "@/lib/terrain/terrain";
import { buildSurfaceChunkMesh, type SurfaceChunkMeshData } from "@/lib/terrain/surface-mesher";
import { BLOCK_IDS, type BlockId } from "@/lib/world/block-registry";
import { MAP_DOCUMENT_FILENAME, parseMapDocument, serializeMapDocument } from "@/lib/world/map-document";
import type { GridCoordinate } from "@/lib/world/world-config";
import { MapEditorSession, type EditorMessage, type EditorTool } from "@/lib/editor/map-editor";
import { createMapPresetWorld, type MapPresetId } from "@/lib/editor/map-presets";
import type { MapEditorToolbarProps } from "@/components/experience/MapEditorToolbar";
import {
  type ExperiencePhase,
  isInteractivePhase,
  useExperienceStore,
} from "@/lib/experience/experience-store";

const MapEditorToolbar = dynamic(() => import("@/components/experience/MapEditorToolbar"), { ssr: false });
const EDITOR_STORAGE_KEY = "portfolio-map-editor-draft.v1";
const DEFAULT_MAP_PRESET_ID: MapPresetId = "portfolioCampus";
const TOOL_COLORS: Record<EditorTool, string> = {
  select: "#38bdf8",
  paint: "#38bdf8",
  add: "#10b981",
  erase: "#ef4444",
  raise: "#10b981",
  lower: "#f97316",
  zone: "#eab308",
  marker: "#a855f7",
};

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
    vec3 base = mix(vBlockColor * 0.92, min(vBlockColor * 1.12, vec3(1.0)), vVariation);
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
    vec3 base = mix(vBlockColor * 0.92, min(vBlockColor * 1.12, vec3(1.0)), vVariation);
    vec3 lightDirection = normalize(vec3(0.35, 0.8, 0.42));
    float light = clamp(dot(normalize(vNormal), lightDirection), 0.0, 1.0);
    vec3 color = base * (0.48 + light * 0.52);
    color += vec3(0.035, 0.028, 0.018);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export default function PortfolioExperience() {
  const [webglState, setWebglState] = useState<"checking" | "available" | "unavailable">("checking");
  const [metrics, setMetrics] = useState<(MetricsSnapshot & { phase: ExperiencePhase }) | null>(null);
  const [editorRequested, setEditorRequested] = useState(false);
  const [editorPanel, setEditorPanel] = useState<MapEditorToolbarProps | null>(null);
  const phase = useExperienceStore((state) => state.phase);
  const editorEnabled = process.env.NODE_ENV !== "production" && editorRequested;

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
        process.env.NODE_ENV === "development" ||
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
      className="experience-shell"
      data-phase={phase}
      aria-label="Interactive portfolio map proof of concept"
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
                editorEnabled={editorEnabled}
                onEditorStateChange={setEditorPanel}
                onCloseEditor={() => setEditorRequested(false)}
              />
            </Canvas>
          </div>
          <ExperienceOverlay phase={phase} />
          {metrics ? (
            process.env.NODE_ENV === "production" ? (
              <ProductionFpsBadge metrics={metrics} />
            ) : (
              <FixedDiagnostics metrics={metrics} />
            )
          ) : null}
          {editorEnabled && editorPanel ? <MapEditorToolbar {...editorPanel} /> : null}
        </>
      ) : (
        <div className="experience-fallback">
          <p>Preparing the interactive map.</p>
        </div>
      )}
    </section>
  );
}

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
              <button className="overlay-button" type="button" onClick={toggleAngleLock}>
                {isAngleLocked ? "Unlock Angle" : "Lock Angle"}
              </button>
              <button className="overlay-button" type="button" onClick={resetView}>
                Reset View
              </button>
            </>
          ) : null}
          {phase === "explore" ? (
            <div className="phase-pill" aria-live="polite">
              <span className="phase-dot" />
              <span>{phase}</span>
            </div>
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

function createInitialTerrainData() {
  return createTerrainDataFromWorld(createMapPresetWorld(DEFAULT_MAP_PRESET_ID));
}

function ExperienceScene({
  editorEnabled,
  onEditorStateChange,
  onCloseEditor,
}: {
  editorEnabled: boolean;
  onEditorStateChange: (state: MapEditorToolbarProps | null) => void;
  onCloseEditor: () => void;
}) {
  const initialPresetId: MapPresetId = DEFAULT_MAP_PRESET_ID;
  const [terrain, setTerrain] = useState(() => createInitialTerrainData());
  const [tool, setTool] = useState<EditorTool>("select");
  const [paintBlockId, setPaintBlockId] = useState<BlockId>(BLOCK_IDS.Path);
  const [presetId, setPresetId] = useState<MapPresetId>(initialPresetId);
  const [renderMode, setRenderMode] = useState<TerrainRenderMode>("surface");
  const [zoneId, setZoneId] = useState(1);
  const [hoveredCell, setHoveredCell] = useState<GridCoordinate | null>(null);
  const [selectedCell, setSelectedCell] = useState<GridCoordinate | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [editorMessage, setEditorMessage] = useState<EditorMessage | null>(null);
  const [lastRebuiltChunks, setLastRebuiltChunks] = useState<string[]>([]);
  const [lastChunkRebuildMs, setLastChunkRebuildMs] = useState(0);
  const [editorRevision, setEditorRevision] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState("local idle");
  const [editorSession] = useState(() => new MapEditorSession(terrain.world));
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

    const editCoordinate = getToolTargetCoordinate(editorSession, tool, coordinate);
    if (!editCoordinate) {
      setEditorMessage({ type: "error", text: "No valid cell for this tool." });
      return;
    }

    setSelectedCell(editCoordinate);
    setSelectedMarkerId(null);

    const result = editorSession.applyTool(tool, editCoordinate, paintBlockId, zoneId);
    if (result.message) {
      setEditorMessage(result.message);
    } else if (tool !== "select") {
      setEditorMessage({ type: "info", text: `${tool} applied at ${editCoordinate.x},${editCoordinate.y},${editCoordinate.z}.` });
    }
    replaceRebuiltChunks(result.rebuiltChunks);
  };

  const handleUndo = () => {
    const result = editorSession.undo();
    replaceRebuiltChunks(result.rebuiltChunks);
    setEditorMessage({ type: "info", text: "Undo complete." });
  };

  const handleRedo = () => {
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
    setPresetId(nextPresetId);
    setEditorMessage({ type: "info", text: "Preset loaded for FPS testing." });
    setEditorRevision((revision) => revision + 1);
  };

  const handleExport = () => {
    const mapDocument = serializeMapDocument(editorSession.world, editorSession.entities);
    const blob = new Blob([`${JSON.stringify(mapDocument, null, 2)}\n`], { type: "application/json" });
    const link = window.document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = MAP_DOCUMENT_FILENAME;
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
      const parsed = parseMapDocument(JSON.parse(await file.text()));
      if (!parsed.ok) {
        setEditorMessage({ type: "error", text: parsed.error });
        return;
      }

      const result = editorSession.replaceWithDocument(parsed.document, true);
      const nextTerrain = createTerrainDataFromWorld(editorSession.world);
      setTerrain(nextTerrain);
      setLastRebuiltChunks(result.rebuiltChunkIds);
      setLastChunkRebuildMs(nextTerrain.surfaceBuildMs);
      setSelectedCell(null);
      setSelectedMarkerId(null);
      setEditorMessage({ type: "info", text: "Map imported." });
      setEditorRevision((revision) => revision + 1);
    } catch {
      setEditorMessage({ type: "error", text: "Import failed. The current map was not changed." });
    }
  };

  const handleClearDraft = () => {
    localStorage.removeItem(EDITOR_STORAGE_KEY);
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
      undoDepth: snapshot.undoDepth,
      redoDepth: snapshot.redoDepth,
      hasUnsavedChanges: snapshot.hasUnsavedChanges,
      autosaveStatus,
      message: editorMessage,
      selectedMarkerId,
      onToolChange: setTool,
      onPaintBlockChange: setPaintBlockId,
      onPresetChange: handlePresetChange,
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
    });
  }, [
    autosaveStatus,
    editorAvailable,
    editorMessage,
    editorRevision,
    hoveredCell,
    lastRebuiltChunks,
    onCloseEditor,
    onEditorStateChange,
    paintBlockId,
    presetId,
    renderMode,
    selectedBlockId,
    selectedCell,
    selectedChunk,
    selectedLocal,
    selectedMarkerId,
    selectedWorldPosition,
    selectedZoneId,
    snapshot.blockEditCount,
    snapshot.entityAnchorCount,
    snapshot.hasUnsavedChanges,
    snapshot.redoDepth,
    snapshot.undoDepth,
    snapshot.zoneAssignmentCount,
    tool,
    zoneId,
  ]);

  useEffect(() => {
    if (!editorAvailable) {
      return;
    }

    const timer = window.setTimeout(() => {
      const savedDraft = localStorage.getItem(EDITOR_STORAGE_KEY);
      if (!savedDraft) {
        return;
      }

      try {
        const parsed = parseMapDocument(JSON.parse(savedDraft));
        if (!parsed.ok) {
          setAutosaveStatus("bad draft ignored");
          return;
        }

        const result = editorSession.replaceWithDocument(parsed.document, true);
        const nextTerrain = createTerrainDataFromWorld(editorSession.world);
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
  }, [editorAvailable, editorSession]);

  useEffect(() => {
    if (!editorAvailable) {
      return;
    }

    const timer = window.setTimeout(() => {
      localStorage.setItem(
        EDITOR_STORAGE_KEY,
        JSON.stringify(serializeMapDocument(editorSession.world, editorSession.entities)),
      );
      setAutosaveStatus("local saved");
    }, 450);

    return () => window.clearTimeout(timer);
  }, [editorAvailable, editorRevision, editorSession]);

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
      <ConstrainedMapControls enabled={isInteractivePhase(phase)} phase={phase} onFocusComplete={markExpanding} />
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
      />
      <SelectionIndicator coordinate={hoveredCell} visible={editorAvailable} color={TOOL_COLORS[tool]} filled />
      <SelectionIndicator coordinate={selectedCell} visible={editorAvailable} color="#f59e0b" />
      <EditorMarkers
        editorEnabled={editorAvailable}
        entities={editorSession.entities}
        world={editorSession.world}
        selectedMarkerId={selectedMarkerId}
        onSelectMarker={(id) => {
          setSelectedMarkerId(id);
          setSelectedCell(null);
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

  useEffect(() => {
    const group = groupRef.current;

    if (!visible) {
      document.body.style.cursor = "";
      gsap.killTweensOf([group?.scale, introOffset.current, crystalMaterial, ringMaterial]);
      crystalMaterial.opacity = 0;
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
}) {
  const { camera, raycaster, scene } = useThree();
  const chunkById = useMemo(() => new Map(chunks.map((chunk) => [chunk.id, chunk])), [chunks]);
  const surfaceChunkById = useMemo(() => new Map(surfaceChunks.map((chunk) => [chunk.id, chunk])), [surfaceChunks]);
  const mousePosition = useRef(new THREE.Vector2(0, 0));
  const pointerDownPosition = useRef<{ x: number; y: number } | null>(null);
  const brushActive = useRef(false);
  const brushedCellKeys = useRef(new Set<string>());
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const planeIntersection = useRef(new THREE.Vector3());
  const shouldRaycast = useRef(true);

  useEffect(() => {
    if (!editorEnabled) {
      onHoverCell(null);
      return;
    }

    const updateMousePosition = (event: PointerEvent) => {
      mousePosition.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mousePosition.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
      shouldRaycast.current = true;
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
      onEditCell(currentHover);
      return true;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isEditorUiEvent(event)) {
        return;
      }

      updateMousePosition(event);
      pointerDownPosition.current = { x: event.clientX, y: event.clientY };

      if (tool === "paint") {
        brushActive.current = true;
        brushedCellKeys.current.clear();
        paintCurrentHover();
      }

      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateMousePosition(event);

      if (!brushActive.current || tool !== "paint" || (event.buttons & 1) !== 1 || isEditorUiEvent(event)) {
        return;
      }

      if (paintCurrentHover()) {
        event.preventDefault();
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (brushActive.current) {
        brushActive.current = false;
        brushedCellKeys.current.clear();
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
  }, [camera, chunkById, editorEnabled, onEditCell, onHoverCell, raycaster, renderMode, scene, surfaceChunkById, tool, world]);

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

function ConstrainedMapControls({
  enabled,
  phase,
  onFocusComplete,
}: {
  enabled: boolean;
  phase: ExperiencePhase;
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
