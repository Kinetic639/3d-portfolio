"use client";

import { TransformControls, useGLTF, useTexture } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  Copy,
  FolderOpen,
  Move3D,
  Plus,
  RotateCw,
  Save,
  Scaling,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as THREE from "three";
import type { EnvironmentController } from "@/lib/environment/environment-controller";
import {
  getDefaultInstanceMode,
  getReferenceAsset,
  REFERENCE_ASSET_IDS,
  REFERENCE_ASSET_REGISTRY,
  type ReferenceAssetId,
  type SceneLabInstanceMode,
} from "@/lib/scene-lab/reference-asset-registry";
import { SceneLabController, type SceneLabInstance, type SceneLabTransformMode } from "@/lib/scene-lab/scene-lab-controller";
import {
  createSceneLabSave,
  DEFAULT_SCENE_LAB_PREFERENCES,
  parseSceneLabPreferences,
  parseSceneLabSave,
  SCENE_LAB_PREFERENCES_KEY,
  SCENE_LAB_STORAGE_KEY,
  type SceneLabPreferences,
} from "@/lib/scene-lab/scene-lab-persistence";
import { createScatteredInstances, type SceneLabScatterOptions } from "@/lib/scene-lab/scene-lab-scatter";
import { CrowActorController, DEFAULT_CROW_CONFIG } from "@/lib/style-lab/reference-study/crow-actor";
import {
  createOutlineMaterial,
  createSmoothedOutlineGeometry,
  createStylizedRockMaterial,
  createToonGradientMap,
  type HatchMode,
  type StylizedRockUniforms,
} from "@/lib/style-lab/reference-study/stylized-rock-material";
import {
  createTreeDepthMaterial,
  createTreeOutlineMaterial,
  createTreeToonMaterial,
  DEFAULT_TREE_WIND_RESPONSE,
  TreeWindResponseController,
} from "@/lib/style-lab/reference-study/tree-wind";
import styles from "./ReferenceStyleLab.module.css";

const GROUND_HALF_EXTENT = 19.5;
const DEFAULT_SCATTER: SceneLabScatterOptions = {
  count: 10,
  radius: 8,
  minimumSpacing: 1.5,
  seed: 12345,
  randomRotation: true,
  randomScale: true,
  scaleMin: 0.85,
  scaleMax: 1.15,
};

export type SceneLabStyleSettings = {
  toonBands: number;
  hatchStrength: number;
  hatchScale: number;
  hatchMode: HatchMode;
  outlineThickness: number;
  outlineColor: string;
};

export type SceneLabRenderStats = {
  fps: number;
  frameMs: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
};

type SceneLabLoadMetrics = {
  applicationInitialization: number | null;
  persistenceRead: number | null;
  assetsReady: number | null;
  treeBatchBuild: number | null;
  rockBatchBuild: number | null;
  crowInitialization: number | null;
  sceneReconstruction: number | null;
  environmentConnection: number | null;
  firstFrame: number | null;
  sceneReady: number | null;
};

const EMPTY_LOAD_METRICS: SceneLabLoadMetrics = {
  applicationInitialization: null,
  persistenceRead: null,
  assetsReady: null,
  treeBatchBuild: null,
  rockBatchBuild: null,
  crowInitialization: null,
  sceneReconstruction: null,
  environmentConnection: null,
  firstFrame: null,
  sceneReady: null,
};

type SceneLabUiState = {
  selectedAssetId: ReferenceAssetId;
  spawnMode: SceneLabInstanceMode;
  placement: "cursor" | "terrain";
  transformMode: SceneLabTransformMode;
  groundSnap: boolean;
  shadows: boolean;
  treeShadows: boolean;
  rockShadows: boolean;
  scatter: SceneLabScatterOptions;
};

export function useSceneLab(groundY: number) {
  const startedAt = useRef(typeof performance === "undefined" ? Date.now() : performance.now());
  const controller = useMemo(() => new SceneLabController(), []);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [preferences, setPreferences] = useState<SceneLabPreferences>(DEFAULT_SCENE_LAB_PREFERENCES);
  const [savedInstances, setSavedInstances] = useState<SceneLabInstance[]>([]);
  const [loadMetrics, setLoadMetrics] = useState<SceneLabLoadMetrics>(EMPTY_LOAD_METRICS);
  const [ui, setUi] = useState<SceneLabUiState>({
    selectedAssetId: "treePineFluffyBig",
    spawnMode: "individual",
    placement: "cursor",
    transformMode: "translate",
    groundSnap: true,
    shadows: true,
    treeShadows: true,
    rockShadows: true,
    scatter: DEFAULT_SCATTER,
  });

  const recordTiming = useCallback((key: keyof SceneLabLoadMetrics, duration: number) => {
    const rounded = Math.max(0, duration);
    setLoadMetrics((current) => ({ ...current, [key]: rounded }));
    if (typeof performance !== "undefined") {
      try {
        performance.measure(`scene-lab:${key}`, { start: performance.now() - rounded, end: performance.now() });
      } catch {
        // PerformanceMeasureOptions support varies in older browsers.
      }
    }
  }, []);

  useEffect(() => {
    const start = performance.now();
    const nextPreferences = parseSceneLabPreferences(localStorage.getItem(SCENE_LAB_PREFERENCES_KEY));
    const saved = parseSceneLabSave(localStorage.getItem(SCENE_LAB_STORAGE_KEY));
    const persistenceDuration = performance.now() - start;
    setPreferences(nextPreferences);
    setSavedInstances(saved?.instances ?? []);
    recordTiming("persistenceRead", persistenceDuration);

    const reconstructionStart = performance.now();
    if (nextPreferences.autoRestore && saved) controller.replaceInstances(saved.instances);
    recordTiming("sceneReconstruction", performance.now() - reconstructionStart);
    recordTiming("applicationInitialization", performance.now() - startedAt.current);
    setBootstrapped(true);
  }, [controller, recordTiming]);

  useEffect(() => {
    if (!bootstrapped) return;
    localStorage.setItem(SCENE_LAB_PREFERENCES_KEY, JSON.stringify(preferences));
  }, [bootstrapped, preferences]);

  useEffect(() => {
    if (!bootstrapped || !preferences.persistScene) return;
    const save = createSceneLabSave(controller.getInstances());
    localStorage.setItem(SCENE_LAB_STORAGE_KEY, JSON.stringify(save));
    setSavedInstances(save.instances);
  }, [bootstrapped, controller, preferences.persistScene, snapshot.contentRevision]);

  const resolveSurface = useCallback((x: number, z: number) => (
    Math.abs(x) <= GROUND_HALF_EXTENT && Math.abs(z) <= GROUND_HALF_EXTENT ? groundY : null
  ), [groundY]);

  const saveScene = useCallback(() => {
    const save = createSceneLabSave(controller.getInstances());
    localStorage.setItem(SCENE_LAB_STORAGE_KEY, JSON.stringify(save));
    setSavedInstances(save.instances);
  }, [controller]);

  const reloadSavedScene = useCallback(() => {
    const saved = parseSceneLabSave(localStorage.getItem(SCENE_LAB_STORAGE_KEY));
    if (!saved) return;
    controller.replaceInstances(saved.instances);
    setSavedInstances(saved.instances);
  }, [controller]);

  const deleteSavedScene = useCallback(() => {
    localStorage.removeItem(SCENE_LAB_STORAGE_KEY);
    setSavedInstances([]);
  }, []);

  const setPreference = useCallback(<Key extends keyof SceneLabPreferences>(key: Key, value: SceneLabPreferences[Key]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  }, []);

  const setUiValue = useCallback(<Key extends keyof SceneLabUiState>(key: Key, value: SceneLabUiState[Key]) => {
    setUi((current) => ({ ...current, [key]: value }));
  }, []);

  const setScatterValue = useCallback(<Key extends keyof SceneLabScatterOptions>(key: Key, value: SceneLabScatterOptions[Key]) => {
    setUi((current) => ({ ...current, scatter: { ...current.scatter, [key]: value } }));
  }, []);

  const scatter = useCallback((assetId = ui.selectedAssetId, count = ui.scatter.count, mode = ui.spawnMode) => {
    const origin = controller.getCursor();
    const instances = createScatteredInstances(
      assetId,
      mode,
      origin,
      { ...ui.scatter, count },
      resolveSurface,
    );
    controller.addInstances(instances);
    return instances.length;
  }, [controller, resolveSurface, ui.scatter, ui.selectedAssetId, ui.spawnMode]);

  const applyPreset = useCallback((preset: "empty" | "light" | "medium" | "heavy" | "extreme") => {
    if (preset === "empty") {
      controller.clearAll();
      return;
    }
    const counts = {
      light: [10, 10, 1],
      medium: [50, 50, 3],
      heavy: [100, 100, 5],
      extreme: [250, 500, 10],
    }[preset];
    const origin = new THREE.Vector3(0, groundY, 0);
    const trees = createScatteredInstances("treePineFluffyBig", "instanced", origin, {
      ...ui.scatter,
      count: counts[0],
      radius: preset === "extreme" ? 18 : 12,
      minimumSpacing: preset === "extreme" ? 0.85 : 1.2,
      seed: ui.scatter.seed,
    }, resolveSurface);
    const rocks = createScatteredInstances("rock", "instanced", origin, {
      ...ui.scatter,
      count: counts[1],
      radius: preset === "extreme" ? 18.5 : 12.5,
      minimumSpacing: preset === "extreme" ? 0.45 : 0.75,
      seed: ui.scatter.seed + 101,
    }, resolveSurface);
    const crows = createScatteredInstances("crow", "actor", origin, {
      ...ui.scatter,
      count: counts[2],
      radius: 9,
      minimumSpacing: 1.5,
      seed: ui.scatter.seed + 202,
      randomScale: false,
    }, resolveSurface);
    controller.replaceWithNewInstances([...trees, ...rocks, ...crows]);
  }, [controller, groundY, resolveSurface, ui.scatter]);

  const spawn = useCallback(() => {
    if (ui.placement === "terrain") {
      controller.beginPlacement(ui.selectedAssetId);
      return;
    }
    const cursor = controller.getCursor();
    const surfaceY = resolveSurface(cursor.x, cursor.z);
    if (surfaceY === null) return;
    cursor.y = surfaceY;
    controller.spawnAt(ui.selectedAssetId, ui.spawnMode, cursor);
  }, [controller, resolveSurface, ui.placement, ui.selectedAssetId, ui.spawnMode]);

  return {
    controller,
    snapshot,
    ui,
    preferences,
    savedInstances,
    loadMetrics,
    startedAt: startedAt.current,
    resolveSurface,
    recordTiming,
    setPreference,
    setUiValue,
    setScatterValue,
    saveScene,
    reloadSavedScene,
    deleteSavedScene,
    scatter,
    applyPreset,
    spawn,
  };
}

export type SceneLabHandle = ReturnType<typeof useSceneLab>;

function countInstances(instances: readonly SceneLabInstance[], assetId: ReferenceAssetId, mode?: SceneLabInstanceMode) {
  return instances.filter((instance) => instance.assetId === assetId && (!mode || instance.mode === mode)).length;
}

function formatTiming(value: number | null) {
  return value === null ? "Pending" : `${value.toFixed(1)} ms`;
}

function NumberInput({ label, value, min, max, step = 1, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.sceneLabNumber}>
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export function SceneLabPanel({ lab, stats }: { lab: SceneLabHandle; stats: SceneLabRenderStats }) {
  const { controller, snapshot, ui, preferences, savedInstances, loadMetrics } = lab;
  const selected = controller.getInstance(snapshot.selectedId);
  const treeCount = countInstances(snapshot.instances, "treePineFluffyBig");
  const instancedTreeCount = countInstances(snapshot.instances, "treePineFluffyBig", "instanced");
  const individualTreeCount = treeCount - instancedTreeCount;
  const rockCount = countInstances(snapshot.instances, "rock");
  const crowCount = countInstances(snapshot.instances, "crow");
  const savedTreeCount = countInstances(savedInstances, "treePineFluffyBig");
  const savedRockCount = countInstances(savedInstances, "rock");
  const savedCrowCount = countInstances(savedInstances, "crow");
  const asset = getReferenceAsset(ui.selectedAssetId);
  const supportsInstancing = asset.capabilities.instancing;

  const selectAsset = (assetId: ReferenceAssetId) => {
    lab.setUiValue("selectedAssetId", assetId);
    lab.setUiValue("spawnMode", getDefaultInstanceMode(assetId));
    controller.cancelPlacement();
  };

  return (
    <aside className={styles.sceneLabPanel} aria-label="Scene Lab controls">
      <header className={styles.actorHeader}>
        <div>
          <h2>Scene Lab</h2>
          <p>Asset spawner · persistence · stress testing</p>
        </div>
      </header>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Asset</h3>
        <label className={styles.selectControl}>
          <span>Asset</span>
          <select value={ui.selectedAssetId} onChange={(event) => selectAsset(event.target.value as ReferenceAssetId)}>
            {REFERENCE_ASSET_IDS.map((assetId) => <option key={assetId} value={assetId}>{REFERENCE_ASSET_REGISTRY[assetId].label}</option>)}
          </select>
        </label>
        <div className={styles.segmented} aria-label="Spawn representation">
          <button type="button" disabled={!supportsInstancing} aria-pressed={ui.spawnMode === "individual" || ui.spawnMode === "actor"} onClick={() => lab.setUiValue("spawnMode", asset.assetType === "skinnedActor" ? "actor" : "individual")}>Individual</button>
          <button type="button" disabled={!supportsInstancing} aria-pressed={ui.spawnMode === "instanced"} onClick={() => lab.setUiValue("spawnMode", "instanced")}>Instanced</button>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Single</h3>
        <div className={styles.segmented} aria-label="Placement mode">
          <button type="button" aria-pressed={ui.placement === "cursor"} onClick={() => lab.setUiValue("placement", "cursor")}>At cursor</button>
          <button type="button" aria-pressed={ui.placement === "terrain"} onClick={() => lab.setUiValue("placement", "terrain")}>Click terrain</button>
        </div>
        <button type="button" className={styles.sceneLabPrimary} onClick={lab.spawn}>
          <Plus size={14} /> {snapshot.pendingAssetId ? "Click terrain to place" : "Spawn"}
        </button>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Multiple</h3>
        <div className={styles.sceneLabGridTwo}>
          <NumberInput label="Count" value={ui.scatter.count} min={1} max={1000} onChange={(value) => lab.setScatterValue("count", value)} />
          <NumberInput label="Radius" value={ui.scatter.radius} min={1} max={20} step={0.5} onChange={(value) => lab.setScatterValue("radius", value)} />
          <NumberInput label="Spacing" value={ui.scatter.minimumSpacing} min={0} max={8} step={0.1} onChange={(value) => lab.setScatterValue("minimumSpacing", value)} />
          <NumberInput label="Seed" value={ui.scatter.seed} min={0} max={99999999} onChange={(value) => lab.setScatterValue("seed", value)} />
          <NumberInput label="Scale min" value={ui.scatter.scaleMin} min={0.1} max={4} step={0.05} onChange={(value) => lab.setScatterValue("scaleMin", value)} />
          <NumberInput label="Scale max" value={ui.scatter.scaleMax} min={0.1} max={4} step={0.05} onChange={(value) => lab.setScatterValue("scaleMax", value)} />
        </div>
        <div className={styles.sceneLabToggleRow}>
          <label><input type="checkbox" checked={ui.scatter.randomRotation} onChange={(event) => lab.setScatterValue("randomRotation", event.target.checked)} /> Random rotation</label>
          <label><input type="checkbox" checked={ui.scatter.randomScale} onChange={(event) => lab.setScatterValue("randomScale", event.target.checked)} /> Random scale</label>
        </div>
        <button type="button" className={styles.sceneLabPrimary} onClick={() => lab.scatter()}>
          <Plus size={14} /> Scatter
        </button>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Quick stress</h3>
        <div className={styles.sceneLabQuickRow}>
          {[1, 10, 25, 50, 100, 250].map((count) => <button key={`tree-${count}`} type="button" onClick={() => lab.scatter("treePineFluffyBig", count, ui.spawnMode === "individual" ? "individual" : "instanced")}>{count === 1 ? "+1" : count} trees</button>)}
        </div>
        <div className={styles.sceneLabQuickRow}>
          {[10, 50, 100, 500].map((count) => <button key={`rock-${count}`} type="button" onClick={() => lab.scatter("rock", count, ui.spawnMode === "individual" ? "individual" : "instanced")}>{count} rocks</button>)}
        </div>
        <div className={styles.sceneLabQuickRow}>
          {[1, 5, 10, 20].map((count) => <button key={`crow-${count}`} type="button" onClick={() => lab.scatter("crow", count, "actor")}>{count} crows</button>)}
        </div>
        <div className={styles.sceneLabPresetRow}>
          {(["empty", "light", "medium", "heavy", "extreme"] as const).map((preset) => <button key={preset} type="button" onClick={() => lab.applyPreset(preset)}>{preset === "extreme" ? "Extreme dev" : preset}</button>)}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Transform</h3>
        <div className={styles.sceneLabToolRow}>
          <button type="button" title="Move (W)" aria-pressed={ui.transformMode === "translate"} onClick={() => lab.setUiValue("transformMode", "translate")}><Move3D size={14} /> Move</button>
          <button type="button" title="Rotate (E)" aria-pressed={ui.transformMode === "rotate"} onClick={() => lab.setUiValue("transformMode", "rotate")}><RotateCw size={14} /> Rotate</button>
          <button type="button" title="Scale (R)" aria-pressed={ui.transformMode === "scale"} onClick={() => lab.setUiValue("transformMode", "scale")}><Scaling size={14} /> Scale</button>
        </div>
        <label className={styles.sceneLabCheck}><input type="checkbox" checked={ui.groundSnap} onChange={(event) => lab.setUiValue("groundSnap", event.target.checked)} /> Ground snap</label>
        <div className={styles.sceneLabActionRow}>
          <button type="button" disabled={!selected} onClick={() => controller.duplicateSelected()}><Copy size={14} /> Duplicate</button>
          <button type="button" disabled={!selected} onClick={() => controller.deleteSelected()}><Trash2 size={14} /> Delete</button>
        </div>
        <p className={styles.note}>{selected ? `${getReferenceAsset(selected.assetId).label} · ${selected.mode}` : "No Scene Lab object selected"}</p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Shadows</h3>
        <div className={styles.sceneLabToggleRow}>
          <label><input type="checkbox" checked={ui.shadows} onChange={(event) => lab.setUiValue("shadows", event.target.checked)} /> All</label>
          <label><input type="checkbox" checked={ui.treeShadows} onChange={(event) => lab.setUiValue("treeShadows", event.target.checked)} /> Trees</label>
          <label><input type="checkbox" checked={ui.rockShadows} onChange={(event) => lab.setUiValue("rockShadows", event.target.checked)} /> Rocks</label>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Clear</h3>
        <div className={styles.sceneLabActionRow}>
          <button type="button" onClick={() => controller.clearAsset(ui.selectedAssetId)}><Trash2 size={14} /> Selected type</button>
          <button type="button" onClick={() => controller.clearAll()}><Trash2 size={14} /> All spawned</button>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Persistence</h3>
        <div className={styles.sceneLabToggleRow}>
          <label><input type="checkbox" checked={preferences.persistScene} onChange={(event) => lab.setPreference("persistScene", event.target.checked)} /> Persist scene</label>
          <label><input type="checkbox" checked={preferences.autoRestore} onChange={(event) => lab.setPreference("autoRestore", event.target.checked)} /> Auto restore</label>
        </div>
        <div className={styles.sceneLabActionRow}>
          <button type="button" onClick={lab.saveScene}><Save size={14} /> Save</button>
          <button type="button" onClick={lab.reloadSavedScene}><FolderOpen size={14} /> Reload</button>
          <button type="button" onClick={() => controller.clearAll()}><Trash2 size={14} /> Clear runtime</button>
          <button type="button" onClick={lab.deleteSavedScene}><Trash2 size={14} /> Delete saved</button>
        </div>
        <dl className={styles.stats}>
          <dt>Saved instances</dt><dd>{savedInstances.length}</dd>
          <dt>Saved trees</dt><dd>{savedTreeCount}</dd>
          <dt>Saved rocks</dt><dd>{savedRockCount}</dd>
          <dt>Saved crows</dt><dd>{savedCrowCount}</dd>
        </dl>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Runtime</h3>
        <dl className={styles.stats}>
          <dt>FPS</dt><dd>{stats.fps.toFixed(1)}</dd>
          <dt>Frame</dt><dd>{stats.frameMs.toFixed(2)} ms</dd>
          <dt>Draw calls</dt><dd>{stats.calls}</dd>
          <dt>Triangles</dt><dd>{Math.round(stats.triangles).toLocaleString()}</dd>
          <dt>Geometries</dt><dd>{stats.geometries}</dd>
          <dt>Textures</dt><dd>{stats.textures}</dd>
          <dt>Individual trees</dt><dd>{individualTreeCount}</dd>
          <dt>Instanced trees</dt><dd>{instancedTreeCount}</dd>
          <dt>Tree batches</dt><dd>{instancedTreeCount > 0 ? 1 : 0}</dd>
          <dt>Rocks</dt><dd>{rockCount}</dd>
          <dt>Crows</dt><dd>{crowCount}</dd>
          <dt>Animation mixers</dt><dd>{crowCount + 1}</dd>
        </dl>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Scene load</h3>
        <dl className={styles.stats}>
          <dt>Application init</dt><dd>{formatTiming(loadMetrics.applicationInitialization)}</dd>
          <dt>Persistence read</dt><dd>{formatTiming(loadMetrics.persistenceRead)}</dd>
          <dt>Assets ready</dt><dd>{formatTiming(loadMetrics.assetsReady)}</dd>
          <dt>Tree batch build</dt><dd>{formatTiming(loadMetrics.treeBatchBuild)}</dd>
          <dt>Rock batch build</dt><dd>{formatTiming(loadMetrics.rockBatchBuild)}</dd>
          <dt>Crow initialization</dt><dd>{formatTiming(loadMetrics.crowInitialization)}</dd>
          <dt>Reconstruction</dt><dd>{formatTiming(loadMetrics.sceneReconstruction)}</dd>
          <dt>Environment link</dt><dd>{formatTiming(loadMetrics.environmentConnection)}</dd>
          <dt>First frame</dt><dd>{formatTiming(loadMetrics.firstFrame)}</dd>
          <dt>Scene ready</dt><dd>{formatTiming(loadMetrics.sceneReady)}</dd>
        </dl>
        <p className={styles.note}>Refreshes may use the browser cache. Disable cache in Chrome DevTools Network for a cold-load measurement.</p>
      </section>
    </aside>
  );
}

type StaticPart = {
  geometry: THREE.BufferGeometry;
  outlineGeometry: THREE.BufferGeometry;
  localMatrix: THREE.Matrix4;
};

type SceneLabResources = {
  treePrototype: THREE.Group;
  treeParts: StaticPart[];
  treeMaterial: THREE.MeshToonMaterial;
  treeOutlineMaterial: THREE.ShaderMaterial;
  treeDepthMaterial: THREE.MeshDepthMaterial;
  rockPrototype: THREE.Group;
  rockParts: StaticPart[];
  rockMaterial: THREE.MeshToonMaterial;
  rockOutlineMaterial: THREE.ShaderMaterial;
  dispose: () => void;
};

function collectStaticParts(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const inverseRoot = scene.matrixWorld.clone().invert();
  const parts: StaticPart[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    parts.push({
      geometry: object.geometry,
      outlineGeometry: createSmoothedOutlineGeometry(object.geometry),
      localMatrix: inverseRoot.clone().multiply(object.matrixWorld),
    });
  });
  return parts;
}

function applyPrototypeMaterials(
  source: THREE.Group,
  material: THREE.Material,
  outlineMaterial: THREE.ShaderMaterial,
  outlineGeometries: readonly THREE.BufferGeometry[],
  depthMaterial?: THREE.Material,
) {
  const prototype = source.clone(true);
  const meshes: THREE.Mesh[] = [];
  prototype.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  meshes.forEach((object, meshIndex) => {
    object.material = material;
    object.customDepthMaterial = depthMaterial;
    object.castShadow = true;
    object.receiveShadow = true;
    const outline = new THREE.Mesh(outlineGeometries[meshIndex], outlineMaterial);
    outline.name = `${object.name || "asset"}-scene-lab-outline`;
    outline.renderOrder = -1;
    outline.frustumCulled = false;
    outline.raycast = () => undefined;
    object.add(outline);
  });
  return prototype;
}

function prepareSceneLabResources({
  rockScene,
  treeScene,
  treeDiffuseSource,
  environment,
  style,
}: {
  rockScene: THREE.Group;
  treeScene: THREE.Group;
  treeDiffuseSource: THREE.Texture;
  environment: EnvironmentController;
  style: SceneLabStyleSettings;
}): SceneLabResources {
  const gradientMap = createToonGradientMap(style.toonBands);
  const hatchUniforms: StylizedRockUniforms = {
    hatchStrength: { value: style.hatchStrength },
    hatchScale: { value: style.hatchScale },
    hatchMode: { value: style.hatchMode === "screen" ? 1 : 0 },
  };
  const response = new TreeWindResponseController(DEFAULT_TREE_WIND_RESPONSE);
  const treeDiffuse = treeDiffuseSource.clone();
  treeDiffuse.flipY = false;
  treeDiffuse.colorSpace = THREE.SRGBColorSpace;
  treeDiffuse.anisotropy = 4;
  treeDiffuse.needsUpdate = true;

  const treeMaterial = createTreeToonMaterial(
    treeDiffuse,
    gradientMap,
    hatchUniforms,
    environment.windUniforms,
    response.uniforms,
  );
  const treeOutlineMaterial = createTreeOutlineMaterial(
    treeDiffuse,
    style.outlineColor,
    style.outlineThickness * 0.55,
    environment.windUniforms,
    response.uniforms,
  );
  const treeDepthMaterial = createTreeDepthMaterial(treeDiffuse, environment.windUniforms, response.uniforms);
  const treeParts = collectStaticParts(treeScene);
  const treePrototype = applyPrototypeMaterials(
    treeScene,
    treeMaterial,
    treeOutlineMaterial,
    treeParts.map((part) => part.outlineGeometry),
    treeDepthMaterial,
  );

  let rockDiffuse: THREE.Texture | null = null;
  rockScene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || rockDiffuse) return;
    const sourceMaterial = Array.isArray(object.material) ? object.material[0] : object.material;
    if (sourceMaterial instanceof THREE.MeshStandardMaterial) rockDiffuse = sourceMaterial.map;
  });
  const resolvedRockDiffuse = rockDiffuse as THREE.Texture | null;
  if (resolvedRockDiffuse) {
    resolvedRockDiffuse.colorSpace = THREE.SRGBColorSpace;
    resolvedRockDiffuse.anisotropy = 4;
  }
  const rockMaterial = createStylizedRockMaterial(resolvedRockDiffuse, gradientMap, hatchUniforms);
  const rockOutlineMaterial = createOutlineMaterial(style.outlineColor);
  rockOutlineMaterial.uniforms.uThickness.value = style.outlineThickness;
  const rockParts = collectStaticParts(rockScene);
  const rockPrototype = applyPrototypeMaterials(
    rockScene,
    rockMaterial,
    rockOutlineMaterial,
    rockParts.map((part) => part.outlineGeometry),
  );

  return {
    treePrototype,
    treeParts,
    treeMaterial,
    treeOutlineMaterial,
    treeDepthMaterial,
    rockPrototype,
    rockParts,
    rockMaterial,
    rockOutlineMaterial,
    dispose: () => {
      gradientMap.dispose();
      treeDiffuse.dispose();
      treeMaterial.dispose();
      treeOutlineMaterial.dispose();
      treeDepthMaterial.dispose();
      rockMaterial.dispose();
      rockOutlineMaterial.dispose();
      for (const part of [...treeParts, ...rockParts]) part.outlineGeometry.dispose();
    },
  };
}

function composeInstanceMatrix(instance: SceneLabInstance, localMatrix: THREE.Matrix4) {
  const position = new THREE.Vector3().fromArray(instance.position);
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...instance.rotation));
  const scale = new THREE.Vector3().fromArray(instance.scale);
  return new THREE.Matrix4().compose(position, quaternion, scale).multiply(localMatrix);
}

function SceneLabIndividual({
  instance,
  prototype,
  selected,
  shadows,
  controller,
}: {
  instance: SceneLabInstance;
  prototype: THREE.Group;
  selected: boolean;
  shadows: boolean;
  controller: SceneLabController;
}) {
  const object = useMemo(() => prototype.clone(true), [prototype]);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    controller.attachObject(instance.id, group);
    return () => controller.attachObject(instance.id, null);
  }, [controller, instance.id]);

  useEffect(() => {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || child.name.endsWith("scene-lab-outline")) return;
      child.castShadow = shadows;
      child.receiveShadow = shadows;
    });
  }, [object, shadows]);

  return (
    <group
      ref={groupRef}
      position={instance.position}
      rotation={instance.rotation}
      scale={instance.scale}
      onClick={(event) => {
        if (event.delta > 4) return;
        event.stopPropagation();
        controller.select(instance.id);
      }}
    >
      <primitive object={object} />
      {selected ? <SelectionRing assetId={instance.assetId} /> : null}
    </group>
  );
}

function SelectionRing({ assetId }: { assetId: ReferenceAssetId }) {
  const radius = assetId === "treePineFluffyBig" ? 2.1 : assetId === "rock" ? 1.45 : 0.5;
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.025} renderOrder={30}>
      <ringGeometry args={[radius, radius + 0.08, 64]} />
      <meshBasicMaterial color="#e8a447" transparent opacity={0.95} depthWrite={false} depthTest={false} />
    </mesh>
  );
}

function InstancedPart({
  part,
  material,
  instances,
  shadows,
  controller,
  outline = false,
  depthMaterial,
}: {
  part: StaticPart;
  material: THREE.Material;
  instances: readonly SceneLabInstance[];
  shadows: boolean;
  controller: SceneLabController;
  outline?: boolean;
  depthMaterial?: THREE.Material;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    instances.forEach((instance, index) => mesh.setMatrixAt(index, composeInstanceMatrix(instance, part.localMatrix)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [instances, part.localMatrix]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[outline ? part.outlineGeometry : part.geometry, material, instances.length]}
      castShadow={!outline && shadows}
      receiveShadow={!outline && shadows}
      customDepthMaterial={!outline ? depthMaterial : undefined}
      frustumCulled
      renderOrder={outline ? -1 : 0}
      raycast={outline ? () => undefined : undefined}
      onClick={outline ? undefined : (event) => {
        if (event.delta > 4 || event.instanceId === undefined) return;
        event.stopPropagation();
        const instance = instances[event.instanceId];
        if (instance) controller.select(instance.id);
      }}
    />
  );
}

function InstancedAssetBatch({
  instances,
  parts,
  material,
  outlineMaterial,
  depthMaterial,
  shadows,
  controller,
  onBuild,
}: {
  instances: readonly SceneLabInstance[];
  parts: readonly StaticPart[];
  material: THREE.Material;
  outlineMaterial: THREE.ShaderMaterial;
  depthMaterial?: THREE.Material;
  shadows: boolean;
  controller: SceneLabController;
  onBuild: (duration: number) => void;
}) {
  const buildStart = useMemo(() => performance.now(), [instances]);

  useEffect(() => {
    onBuild(performance.now() - buildStart);
  }, [buildStart, onBuild]);

  if (instances.length === 0) return null;
  return (
    <>
      {parts.map((part, index) => (
        <group key={index}>
          <InstancedPart part={part} material={material} instances={instances} shadows={shadows} controller={controller} depthMaterial={depthMaterial} />
          <InstancedPart part={part} material={outlineMaterial} instances={instances} shadows={false} controller={controller} outline />
        </group>
      ))}
    </>
  );
}

function SceneLabCrow({
  instance,
  source,
  animations,
  style,
  selected,
  shadows,
  controller,
  resolveSurface,
  onInitialized,
}: {
  instance: SceneLabInstance;
  source: THREE.Group;
  animations: readonly THREE.AnimationClip[];
  style: SceneLabStyleSettings;
  selected: boolean;
  shadows: boolean;
  controller: SceneLabController;
  resolveSurface: (x: number, z: number) => number | null;
  onInitialized: (duration: number) => void;
}) {
  const initializationStart = useMemo(() => performance.now(), []);
  const actor = useMemo(() => new CrowActorController(source, animations, DEFAULT_CROW_CONFIG, {
    toonBands: style.toonBands,
    hatchStrength: 0,
    hatchScale: style.hatchScale,
    hatchMode: style.hatchMode,
    outlineThickness: style.outlineThickness * DEFAULT_CROW_CONFIG.outlineScale,
    outlineColor: style.outlineColor,
  }), [animations, source]);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    onInitialized(performance.now() - initializationStart);
  }, [initializationStart, onInitialized]);

  useEffect(() => {
    actor.updateStyle({
      toonBands: style.toonBands,
      hatchStrength: 0,
      hatchScale: style.hatchScale,
      hatchMode: style.hatchMode,
      outlineThickness: style.outlineThickness * DEFAULT_CROW_CONFIG.outlineScale,
      outlineColor: style.outlineColor,
    });
  }, [actor, style]);

  useEffect(() => {
    actor.model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = shadows;
      child.receiveShadow = shadows;
    });
  }, [actor, shadows]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    controller.attachObject(instance.id, group);
    return () => controller.attachObject(instance.id, null);
  }, [controller, instance.id]);

  useEffect(() => () => actor.dispose(), [actor]);

  useFrame((_, delta) => actor.update(Math.min(delta, 0.1), resolveSurface));

  return (
    <group
      ref={groupRef}
      position={instance.position}
      rotation={instance.rotation}
      scale={instance.scale}
      onClick={(event) => {
        if (event.delta > 4) return;
        event.stopPropagation();
        controller.select(instance.id);
      }}
    >
      <primitive object={actor.root} />
      {selected ? <SelectionRing assetId="crow" /> : null}
    </group>
  );
}

function SceneLabGizmo({ lab }: { lab: SceneLabHandle }) {
  const object = lab.controller.getSelectedObject();
  const selected = lab.controller.getInstance(lab.snapshot.selectedId);
  if (!object || !selected || selected.mode === "instanced") return null;

  return (
    <TransformControls
      object={object}
      mode={lab.ui.transformMode}
      space={lab.ui.transformMode === "rotate" ? "local" : "world"}
      size={0.8}
      onMouseDown={() => lab.controller.setTransforming(true)}
      onObjectChange={() => {
        if (!lab.ui.groundSnap || lab.ui.transformMode !== "translate" || selected.assetId === "crow") return;
        const surfaceY = lab.resolveSurface(object.position.x, object.position.z);
        if (surfaceY !== null) object.position.y = surfaceY + getReferenceAsset(selected.assetId).defaults.groundOffset;
      }}
      onMouseUp={() => {
        lab.controller.setTransforming(false);
        lab.controller.commitObjectTransform(selected.id);
      }}
    />
  );
}

function SceneLabFirstFrame({ lab }: { lab: SceneLabHandle }) {
  const recorded = useRef(false);
  useFrame(() => {
    if (recorded.current) return;
    recorded.current = true;
    const elapsed = performance.now() - lab.startedAt;
    lab.recordTiming("firstFrame", elapsed);
    lab.recordTiming("sceneReady", elapsed);
  });
  return null;
}

export function SceneLabWorld({
  lab,
  environment,
  style,
}: {
  lab: SceneLabHandle;
  environment: EnvironmentController;
  style: SceneLabStyleSettings;
}) {
  const rockSource = useGLTF(REFERENCE_ASSET_REGISTRY.rock.source.model);
  const treeSource = useGLTF(REFERENCE_ASSET_REGISTRY.treePineFluffyBig.source.model);
  const crowSource = useGLTF(REFERENCE_ASSET_REGISTRY.crow.source.model);
  const treeTextureUrls = REFERENCE_ASSET_REGISTRY.treePineFluffyBig.source.textures ?? [];
  const treeTextures = useTexture([...treeTextureUrls]) as THREE.Texture[];
  const activeResources = useRef<SceneLabResources | null>(null);
  const resources = useMemo(() => prepareSceneLabResources({
    rockScene: rockSource.scene,
    treeScene: treeSource.scene,
    treeDiffuseSource: treeTextures[0],
    environment,
    style,
  }), [environment, rockSource.scene, style, treeSource.scene, treeTextures]);
  const assetsReported = useRef(false);

  useEffect(() => {
    activeResources.current = resources;
    return () => {
      activeResources.current = null;
      queueMicrotask(() => {
        if (activeResources.current !== resources) resources.dispose();
      });
    };
  }, [resources]);

  useEffect(() => {
    if (assetsReported.current) return;
    assetsReported.current = true;
    lab.recordTiming("assetsReady", performance.now() - lab.startedAt);
    lab.recordTiming("environmentConnection", performance.now() - lab.startedAt);
  }, [lab]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, button") || target?.isContentEditable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        lab.controller.duplicateSelected();
        return;
      }
      if (event.key === "Delete") lab.controller.deleteSelected();
      else if (event.key === "Escape") lab.controller.cancelPlacement();
      else if (event.key.toLowerCase() === "w") lab.setUiValue("transformMode", "translate");
      else if (event.key.toLowerCase() === "e") lab.setUiValue("transformMode", "rotate");
      else if (event.key.toLowerCase() === "r") lab.setUiValue("transformMode", "scale");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lab]);

  const individuals = lab.snapshot.instances.filter((instance) => instance.mode === "individual");
  const instancedTrees = lab.snapshot.instances.filter((instance) => instance.assetId === "treePineFluffyBig" && instance.mode === "instanced");
  const instancedRocks = lab.snapshot.instances.filter((instance) => instance.assetId === "rock" && instance.mode === "instanced");
  const crows = lab.snapshot.instances.filter((instance) => instance.assetId === "crow");
  const treeShadows = lab.ui.shadows && lab.ui.treeShadows;
  const rockShadows = lab.ui.shadows && lab.ui.rockShadows;
  const crowInitializationTotal = useRef(0);

  const reportCrowInitialization = useCallback((duration: number) => {
    crowInitializationTotal.current += duration;
    lab.recordTiming("crowInitialization", crowInitializationTotal.current);
  }, [lab]);

  return (
    <>
      {individuals.map((instance) => (
        <SceneLabIndividual
          key={instance.id}
          instance={instance}
          prototype={instance.assetId === "treePineFluffyBig" ? resources.treePrototype : resources.rockPrototype}
          selected={lab.snapshot.selectedId === instance.id}
          shadows={instance.assetId === "treePineFluffyBig" ? treeShadows : rockShadows}
          controller={lab.controller}
        />
      ))}
      <InstancedAssetBatch
        instances={instancedTrees}
        parts={resources.treeParts}
        material={resources.treeMaterial}
        outlineMaterial={resources.treeOutlineMaterial}
        depthMaterial={resources.treeDepthMaterial}
        shadows={treeShadows}
        controller={lab.controller}
        onBuild={(duration) => lab.recordTiming("treeBatchBuild", duration)}
      />
      <InstancedAssetBatch
        instances={instancedRocks}
        parts={resources.rockParts}
        material={resources.rockMaterial}
        outlineMaterial={resources.rockOutlineMaterial}
        shadows={rockShadows}
        controller={lab.controller}
        onBuild={(duration) => lab.recordTiming("rockBatchBuild", duration)}
      />
      {crows.map((instance) => (
        <SceneLabCrow
          key={instance.id}
          instance={instance}
          source={crowSource.scene}
          animations={crowSource.animations}
          style={style}
          selected={lab.snapshot.selectedId === instance.id}
          shadows={lab.ui.shadows}
          controller={lab.controller}
          resolveSurface={lab.resolveSurface}
          onInitialized={reportCrowInitialization}
        />
      ))}
      {lab.snapshot.selectedId && lab.controller.getInstance(lab.snapshot.selectedId)?.mode === "instanced" ? (
        <group position={lab.controller.getInstance(lab.snapshot.selectedId)?.position}>
          <SelectionRing assetId={lab.controller.getInstance(lab.snapshot.selectedId)?.assetId ?? "rock"} />
        </group>
      ) : null}
      <SceneLabGizmo lab={lab} />
      <SceneLabFirstFrame lab={lab} />
    </>
  );
}

export function handleSceneLabTerrainPointer(lab: SceneLabHandle, point: THREE.Vector3) {
  lab.controller.setCursor(point);
}

export function handleSceneLabTerrainClick(lab: SceneLabHandle, point: THREE.Vector3) {
  if (!lab.controller.getSnapshot().pendingAssetId || lab.controller.getSnapshot().transforming) return false;
  lab.controller.consumePlacement(point, lab.ui.spawnMode);
  return true;
}

useGLTF.preload(REFERENCE_ASSET_REGISTRY.rock.source.model);
useGLTF.preload(REFERENCE_ASSET_REGISTRY.treePineFluffyBig.source.model);
useGLTF.preload(REFERENCE_ASSET_REGISTRY.crow.source.model);
for (const texture of REFERENCE_ASSET_REGISTRY.treePineFluffyBig.source.textures ?? []) useTexture.preload(texture);
