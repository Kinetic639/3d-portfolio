"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import gsap from "gsap";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  CHUNK_MAX_INSTANCE_COUNT,
  createTerrainData,
  toTerrainChunk,
  type TerrainChunk,
} from "@/lib/terrain/terrain";
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
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  logicalCells: number;
  airCells: number;
  nonAirBlocks: number;
  chunks: number;
  instances: number;
  chunkCapacity: number;
  dirtyChunks: number;
  lastRebuiltChunks: string;
  blockEditCount: number;
  zoneAssignmentCount: number;
  entityAnchorCount: number;
  undoDepth: number;
  redoDepth: number;
};

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

export default function PortfolioExperience() {
  const [webglState, setWebglState] = useState<"checking" | "available" | "unavailable">("checking");
  const [metrics, setMetrics] = useState<(MetricsSnapshot & { phase: ExperiencePhase }) | null>(null);
  const [editorRequested, setEditorRequested] = useState(false);
  const [editorPanel, setEditorPanel] = useState<MapEditorToolbarProps | null>(null);
  const phase = useExperienceStore((state) => state.phase);
  const editorEnabled = process.env.NODE_ENV !== "production" && editorRequested;

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
              camera={{ position: [12, 15, 18], fov: 32, near: 0.1, far: 220 }}
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
  const startExpansion = useExperienceStore((state) => state.startExpansion);
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
          <div className="phase-pill" aria-live="polite">
            <span className="phase-dot" />
            <span>{phase}</span>
          </div>
        </div>
      </header>

      {phase === "loading" ? (
        <div className="loading-pill" role="status">
          Preparing terrain chunks and matrices...
        </div>
      ) : null}

      {(phase === "ready" || phase === "expanding") ? (
        <footer className="overlay-footer">
          <button
            className="expand-button"
            type="button"
            onClick={startExpansion}
            disabled={phase === "expanding"}
          >
            {phase === "expanding" ? "Expanding map..." : "Expand map"}
          </button>
        </footer>
      ) : null}
    </div>
  );
}

function ProductionFpsBadge({ metrics }: { metrics: MetricsSnapshot & { phase: ExperiencePhase } }) {
  return (
    <aside className="fps-badge" aria-label="Rendering performance">
      <span>FPS</span>
      <strong>{metrics.fps}</strong>
      <span>{metrics.frameMs}ms</span>
    </aside>
  );
}

function FixedDiagnostics({ metrics }: { metrics: MetricsSnapshot & { phase: ExperiencePhase } }) {
  const [minimized, setMinimized] = useState(false);
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
        <div><dt>Frame</dt><dd>{metrics.frameMs}ms</dd></div>
        <div><dt>Draws</dt><dd>{metrics.calls}</dd></div>
        <div><dt>Tris</dt><dd>{metrics.triangles}</dd></div>
        <div><dt>Geoms</dt><dd>{metrics.geometries}</dd></div>
        <div><dt>Tex</dt><dd>{metrics.textures}</dd></div>
        <div><dt>Logical</dt><dd>{metrics.logicalCells}</dd></div>
        <div><dt>Air</dt><dd>{metrics.airCells}</dd></div>
        <div><dt>Solid</dt><dd>{metrics.nonAirBlocks}</dd></div>
        <div><dt>Chunks</dt><dd>{metrics.chunks}</dd></div>
        <div><dt>Capacity</dt><dd>{metrics.chunkCapacity}</dd></div>
        <div><dt>Dirty</dt><dd>{metrics.dirtyChunks}</dd></div>
        <div><dt>Edits</dt><dd>{metrics.blockEditCount}</dd></div>
        <div><dt>Zones</dt><dd>{metrics.zoneAssignmentCount}</dd></div>
        <div><dt>Markers</dt><dd>{metrics.entityAnchorCount}</dd></div>
        <div><dt>Undo</dt><dd>{metrics.undoDepth}</dd></div>
        <div><dt>Redo</dt><dd>{metrics.redoDepth}</dd></div>
        <div className="metrics-wide"><dt>Instances</dt><dd>{metrics.instances} / {metrics.chunks} chunks</dd></div>
        <div className="metrics-wide"><dt>Last rebuilt</dt><dd>{metrics.lastRebuiltChunks || "-"}</dd></div>
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

function ExperienceScene({
  editorEnabled,
  onEditorStateChange,
  onCloseEditor,
}: {
  editorEnabled: boolean;
  onEditorStateChange: (state: MapEditorToolbarProps | null) => void;
  onCloseEditor: () => void;
}) {
  const [terrain, setTerrain] = useState(() => createTerrainData());
  const [tool, setTool] = useState<EditorTool>("select");
  const [paintBlockId, setPaintBlockId] = useState<BlockId>(BLOCK_IDS.Path);
  const [presetId, setPresetId] = useState<MapPresetId>("flat");
  const [zoneId, setZoneId] = useState(1);
  const [hoveredCell, setHoveredCell] = useState<GridCoordinate | null>(null);
  const [selectedCell, setSelectedCell] = useState<GridCoordinate | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [editorMessage, setEditorMessage] = useState<EditorMessage | null>(null);
  const [lastRebuiltChunks, setLastRebuiltChunks] = useState<string[]>([]);
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
  const markExplore = useExperienceStore((state) => state.markExplore);
  const reducedMotion = usePrefersReducedMotion();
  const { gl, scene, camera } = useThree();
  const initializedRef = useRef(false);
  const editorAvailable = editorEnabled && phase === "explore";
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
      setEditorRevision((revision) => revision + 1);
      return;
    }

    const rebuiltTerrainChunks = new Map(rebuiltChunks.map((chunk) => [chunk.id, toTerrainChunk(chunk)]));

    setTerrain((currentTerrain) => ({
      ...currentTerrain,
      chunks: currentTerrain.chunks.map((chunk) => rebuiltTerrainChunks.get(chunk.id) ?? chunk),
      instanceCount: editorSession.world.getStats().renderedInstances,
      airCellCount: editorSession.world.getStats().airCells,
      nonAirBlockCount: editorSession.world.getStats().nonAirBlocks,
    }));
    setLastRebuiltChunks([...rebuiltTerrainChunks.keys()]);
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
    setTerrain((currentTerrain) => ({
      ...currentTerrain,
      world: editorSession.world,
      chunks: editorSession.world.createRenderChunks().map(toTerrainChunk),
      instanceCount: editorSession.world.getStats().renderedInstances,
      airCellCount: editorSession.world.getStats().airCells,
      nonAirBlockCount: editorSession.world.getStats().nonAirBlocks,
    }));
    setLastRebuiltChunks(result.rebuiltChunkIds);
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
      const importedTerrainChunks = editorSession.world.createRenderChunks().map(toTerrainChunk);
      setTerrain((currentTerrain) => ({
        ...currentTerrain,
        world: editorSession.world,
        chunks: importedTerrainChunks,
        instanceCount: editorSession.world.getStats().renderedInstances,
        airCellCount: editorSession.world.getStats().airCells,
        nonAirBlockCount: editorSession.world.getStats().nonAirBlocks,
      }));
      setLastRebuiltChunks(result.rebuiltChunkIds);
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
        setTerrain((currentTerrain) => ({
          ...currentTerrain,
          world: editorSession.world,
          chunks: editorSession.world.createRenderChunks().map(toTerrainChunk),
          instanceCount: editorSession.world.getStats().renderedInstances,
          airCellCount: editorSession.world.getStats().airCells,
          nonAirBlockCount: editorSession.world.getStats().nonAirBlocks,
        }));
        setLastRebuiltChunks(result.rebuiltChunkIds);
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
      />
      <ConstrainedMapControls enabled={isInteractivePhase(phase)} phase={phase} />
      <RenderInvalidator phase={phase} />
      <EditorInteractionOverlay
        editorEnabled={editorAvailable}
        tool={tool}
        chunks={terrain.chunks}
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
        dirtyChunks={editorSession.world.dirtyChunks.size}
        lastRebuiltChunks={lastRebuiltChunks.join(",")}
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
}: {
  chunks: TerrainChunk[];
  uniforms: TerrainUniforms;
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
    <group>
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
  chunks,
  world,
  hoveredCell,
  onHoverCell,
  onEditCell,
}: {
  editorEnabled: boolean;
  tool: EditorTool;
  chunks: TerrainChunk[];
  world: MapEditorSession["world"];
  hoveredCell: GridCoordinate | null;
  onHoverCell: (coordinate: GridCoordinate | null) => void;
  onEditCell: (coordinate: GridCoordinate) => void;
}) {
  const { camera, raycaster, scene } = useThree();
  const chunkById = useMemo(() => new Map(chunks.map((chunk) => [chunk.id, chunk])), [chunks]);
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
      const currentHover = getHoveredEditorCell(scene, raycaster, chunkById, world, tool);
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
        const currentHover = getHoveredEditorCell(scene, raycaster, chunkById, world, tool);
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
  }, [camera, chunkById, editorEnabled, onEditCell, onHoverCell, raycaster, scene, tool, world]);

  useEffect(() => {
    shouldRaycast.current = true;
  }, [chunkById]);

  useFrame(() => {
    if (!editorEnabled || !shouldRaycast.current) {
      return;
    }

    shouldRaycast.current = false;
    raycaster.setFromCamera(mousePosition.current, camera);
    const nextHoveredCell = getHoveredEditorCell(scene, raycaster, chunkById, world, tool, groundPlane.current, planeIntersection.current);

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
  world: MapEditorSession["world"],
  tool: EditorTool,
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  planeIntersection = new THREE.Vector3(),
) {
  const chunkMeshes: THREE.InstancedMesh[] = [];

  scene.traverse((object) => {
    if ((object as THREE.InstancedMesh).isInstancedMesh && typeof object.userData.portfolioChunkId === "string") {
      chunkMeshes.push(object as THREE.InstancedMesh);
    }
  });

  const hits = raycaster.intersectObjects(chunkMeshes, false);
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

function ConstrainedMapControls({ enabled, phase }: { enabled: boolean; phase: ExperiencePhase }) {
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
  const startCameraPosition = useMemo(() => new THREE.Vector3(12, 15, 18), []);
  const fullCameraPosition = useMemo(() => new THREE.Vector3(42, 52, 62), []);
  const targetPosition = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useEffect(() => {
    camera.position.copy(startCameraPosition);
    camera.lookAt(targetPosition);
  }, [camera, startCameraPosition, targetPosition]);

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

    window.addEventListener("pointerup", clearMomentum);
    window.addEventListener("mouseup", clearMomentum);

    return () => {
      window.removeEventListener("pointerup", clearMomentum);
      window.removeEventListener("mouseup", clearMomentum);
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

    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -bounds, bounds);
    controls.target.y = 0;
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -bounds, bounds);

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
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.PAN,
      }}
      screenSpacePanning={false}
      touches={{
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_ROTATE,
      }}
      target={[0, 0, 0]}
    />
  );
}

function RenderInvalidator({ phase }: { phase: ExperiencePhase }) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (phase !== "loading" && phase !== "expanding") {
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
  dirtyChunks,
  lastRebuiltChunks,
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
  dirtyChunks: number;
  lastRebuiltChunks: string;
  blockEditCount: number;
  zoneAssignmentCount: number;
  entityAnchorCount: number;
  undoDepth: number;
  redoDepth: number;
}) {
  const { gl } = useThree();
  const frameCount = useRef(0);
  const accumulatedMs = useRef(0);
  const previousTime = useRef(0);
  const lastUpdate = useRef(0);

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

    if (now - lastUpdate.current > 500) {
      const averageFrameMs = accumulatedMs.current / frameCount.current;
      const nextMetrics = {
        fps: Math.round(1000 / averageFrameMs),
        frameMs: Number(averageFrameMs.toFixed(1)),
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        logicalCells,
        airCells,
        nonAirBlocks,
        chunks,
        instances,
        chunkCapacity: CHUNK_MAX_INSTANCE_COUNT,
        dirtyChunks,
        lastRebuiltChunks,
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
      lastUpdate.current = now;
    }
  });

  return null;
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
