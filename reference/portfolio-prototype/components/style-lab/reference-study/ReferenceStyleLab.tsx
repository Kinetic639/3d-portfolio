"use client";

import { OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  EnvironmentController,
  getWindDirectionDegrees,
  type EnvironmentState,
  type EnvironmentWindPreset,
  type EnvironmentWindState,
} from "@/lib/environment/environment-controller";
import {
  CrowActorController,
  DEFAULT_CROW_CONFIG,
  isLoopingCrowClip,
  type CrowActorConfig,
  type CrowActorSnapshot,
  type CrowMovementMode,
} from "@/lib/style-lab/reference-study/crow-actor";
import {
  createOutlineMaterial,
  createSmoothedOutlineGeometry,
  createStylizedRockMaterial,
  createToonGradientMap,
  type HatchMode,
  type StylizedRockUniforms,
} from "@/lib/style-lab/reference-study/stylized-rock-material";
import {
  createTreeDebugMaterial,
  createTreeDepthMaterial,
  createTreeOutlineMaterial,
  createTreeToonMaterial,
  DEFAULT_TREE_WIND_RESPONSE,
  getAvailableTreeWindSources,
  getTreeDebugModes,
  setTreeDebugMode,
  TreeStyleUniformController,
  TreeWindResponseController,
  type TreeDebugMode,
  type TreeWindResponseSettings,
} from "@/lib/style-lab/reference-study/tree-wind";
import {
  handleSceneLabTerrainClick,
  handleSceneLabTerrainPointer,
  SceneLabPanel,
  SceneLabWorld,
  useSceneLab,
  type SceneLabHandle,
} from "./SceneLab";
import styles from "./ReferenceStyleLab.module.css";

const ROCK_URL = "/models/rocks-land/RockLandSmall001.glb";
const CROW_URL = "/models/characters/crow.glb";
const TREE_URL = "/models/enviroment/trees/TreePineFluffyBig.glb";
const TREE_DIFFUSE_URL = "/models/enviroment/trees/T_TreePineFluffy_D_001.png";
const TREE_DETAIL_URL = "/models/enviroment/trees/T_TreePineFluffy_D_002.png";
const TREE_MASK_URL = "/models/enviroment/trees/T_TreePineFluffy_M_001.png";
const GROUND_Y = -0.435;
const TREE_DISPLAY_SCALE = 0.48;
const TREE_INSTANCES = [
  { position: [-2.8, GROUND_Y, -2.7] as const, scale: TREE_DISPLAY_SCALE },
  { position: [0.1, GROUND_Y, -3.8] as const, scale: 0.38 },
  { position: [-2.2, GROUND_Y, 1.7] as const, scale: 0.31 },
] as const;
const SHADOW_CAMERA_EXTENT = 8;
const SHADOW_MAP_SIZE = 2048;

type StyleSettings = {
  sunIntensity: number;
  sunX: number;
  sunY: number;
  sunZ: number;
  hemisphereIntensity: number;
  toonBands: number;
  hatchStrength: number;
  hatchScale: number;
  hatchMode: HatchMode;
  outlineThickness: number;
  outlineColor: string;
  aoIntensity: number;
  shadowBias: number;
  shadowNormalBias: number;
};

type RenderStats = {
  fps: number;
  frameMs: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
};

type CrowDebugSettings = {
  path: boolean;
  target: boolean;
  bounds: boolean;
};

type TreeMeshInspection = {
  name: string;
  attributes: string[];
  triangles: number;
  indexed: boolean;
  groups: Array<{ start: number; count: number; materialIndex: number }>;
  materialNames: string[];
};

type TreeInspection = {
  objectNames: string[];
  meshes: TreeMeshInspection[];
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
};

type TreeAppearanceSettings = {
  outlineScale: number;
};

const DEFAULT_TREE_APPEARANCE: TreeAppearanceSettings = {
  outlineScale: 0.55,
};

const DEFAULT_SETTINGS: StyleSettings = {
  sunIntensity: 2.4,
  sunX: -4.5,
  sunY: 7,
  sunZ: 3.5,
  hemisphereIntensity: 1.15,
  toonBands: 4,
  hatchStrength: 0,
  hatchScale: 2,
  hatchMode: "uv",
  outlineThickness: 0.012,
  outlineColor: "#252927",
  aoIntensity: 0.22,
  shadowBias: -0.0004,
  shadowNormalBias: 0.025,
};

const EMPTY_STATS: RenderStats = {
  fps: 0,
  frameMs: 0,
  calls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
};

export default function ReferenceStyleLab() {
  const environment = useMemo(() => new EnvironmentController(), []);
  const sceneLab = useSceneLab(GROUND_Y);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [compileState, setCompileState] = useState("Preparing shaders");
  const [crowActor, setCrowActor] = useState<CrowActorController | null>(null);
  const [crowSnapshot, setCrowSnapshot] = useState<CrowActorSnapshot | null>(null);
  const [crowMode, setCrowMode] = useState<CrowMovementMode>("flight");
  const [crowConfig, setCrowConfig] = useState(DEFAULT_CROW_CONFIG);
  const [crowDebug, setCrowDebug] = useState<CrowDebugSettings>({ path: true, target: true, bounds: false });
  const [treeSelected, setTreeSelected] = useState(false);
  const [treeInspection, setTreeInspection] = useState<TreeInspection | null>(null);
  const [environmentState, setEnvironmentState] = useState<EnvironmentState>(() => environment.getState());
  const [treeWindResponse, setTreeWindResponse] = useState<TreeWindResponseSettings>(DEFAULT_TREE_WIND_RESPONSE);
  const [treeAppearance, setTreeAppearance] = useState<TreeAppearanceSettings>(DEFAULT_TREE_APPEARANCE);
  const [treeMesh, setTreeMesh] = useState(0);
  const [treeDebugMode, setTreeDebugModeState] = useState<TreeDebugMode>("normal");

  const handleCrowReady = useCallback((actor: CrowActorController | null) => {
    setCrowActor(actor);
  }, []);

  useEffect(() => {
    if (!crowActor) return;
    const unsubscribe = crowActor.subscribe(setCrowSnapshot);
    return () => {
      unsubscribe();
    };
  }, [crowActor]);

  useEffect(() => {
    if (!sceneLab.snapshot.selectedId) return;
    setTreeSelected(false);
    crowActor?.setSelected(false);
  }, [crowActor, sceneLab.snapshot.selectedId]);

  const updateEnvironmentWind = useCallback((patch: Partial<EnvironmentWindState>) => {
    environment.setWind(patch);
    setEnvironmentState(environment.getState());
  }, [environment]);

  const setEnvironmentWindDirection = useCallback((degrees: number) => {
    environment.setWindDirectionDegrees(degrees);
    setEnvironmentState(environment.getState());
  }, [environment]);

  const applyEnvironmentPreset = useCallback((preset: EnvironmentWindPreset) => {
    environment.applyWindPreset(preset);
    setEnvironmentState(environment.getState());
  }, [environment]);

  return (
    <main className={styles.shell}>
      <div className={styles.canvas}>
        <Canvas
          camera={{ position: [3.8, 2.7, 4.8], fov: 34, near: 0.05, far: 80 }}
          dpr={[1, 1.5]}
          flat
          shadows={{ type: THREE.PCFShadowMap }}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.setClearColor("#bfd0c0");
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.NoToneMapping;
          }}
        >
          <ReferenceScene
            environment={environment}
            sceneLab={sceneLab}
            settings={settings}
            crowActor={crowActor}
            crowSnapshot={crowSnapshot}
            crowMode={crowMode}
            crowConfig={crowConfig}
            crowDebug={crowDebug}
            treeSelected={treeSelected}
            treeWindResponse={treeWindResponse}
            treeAppearance={treeAppearance}
            treeMesh={treeMesh}
            treeDebugMode={treeDebugMode}
            onTreeSelect={() => {
              sceneLab.controller.select(null);
              crowActor?.setSelected(false);
              setTreeSelected(true);
            }}
            onTreeInspection={setTreeInspection}
            onCrowSelect={() => {
              sceneLab.controller.select(null);
              setTreeSelected(false);
            }}
            onCrowReady={handleCrowReady}
            onStats={setStats}
            onCompileState={setCompileState}
          />
        </Canvas>
      </div>
      {crowActor && crowSnapshot?.selected ? (
        <CrowPanel
          actor={crowActor}
          snapshot={crowSnapshot}
          mode={crowMode}
          config={crowConfig}
          debug={crowDebug}
          setMode={setCrowMode}
          setConfig={setCrowConfig}
          setDebug={setCrowDebug}
        />
      ) : null}
      {treeSelected && treeInspection ? (
        <TreePanel
          inspection={treeInspection}
          windResponse={treeWindResponse}
          appearance={treeAppearance}
          selectedMesh={treeMesh}
          debugMode={treeDebugMode}
          setWindResponse={setTreeWindResponse}
          setAppearance={setTreeAppearance}
          setSelectedMesh={setTreeMesh}
          setDebugMode={setTreeDebugModeState}
          onClose={() => setTreeSelected(false)}
        />
      ) : null}
      <SceneLabPanel lab={sceneLab} stats={stats} />
      <StylePanel
        settings={settings}
        setSettings={setSettings}
        environmentState={environmentState}
        updateEnvironmentWind={updateEnvironmentWind}
        setEnvironmentWindDirection={setEnvironmentWindDirection}
        applyEnvironmentPreset={applyEnvironmentPreset}
        stats={stats}
        compileState={compileState}
      />
    </main>
  );
}

function ReferenceScene({
  environment,
  sceneLab,
  settings,
  crowActor,
  crowSnapshot,
  crowMode,
  crowConfig,
  crowDebug,
  treeSelected,
  treeWindResponse,
  treeAppearance,
  treeMesh,
  treeDebugMode,
  onTreeSelect,
  onTreeInspection,
  onCrowSelect,
  onCrowReady,
  onStats,
  onCompileState,
}: {
  environment: EnvironmentController;
  sceneLab: SceneLabHandle;
  settings: StyleSettings;
  crowActor: CrowActorController | null;
  crowSnapshot: CrowActorSnapshot | null;
  crowMode: CrowMovementMode;
  crowConfig: CrowActorConfig;
  crowDebug: CrowDebugSettings;
  treeSelected: boolean;
  treeWindResponse: TreeWindResponseSettings;
  treeAppearance: TreeAppearanceSettings;
  treeMesh: number;
  treeDebugMode: TreeDebugMode;
  onTreeSelect: () => void;
  onTreeInspection: (inspection: TreeInspection) => void;
  onCrowSelect: () => void;
  onCrowReady: (actor: CrowActorController | null) => void;
  onStats: (stats: RenderStats) => void;
  onCompileState: (state: string) => void;
}) {
  const lightRef = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    if (!lightRef.current) return;
    lightRef.current.target.position.set(0, 0.15, 0);
    lightRef.current.target.updateMatrixWorld();
  }, []);

  const commandCrow = (event: ThreeEvent<MouseEvent>) => {
    if (!crowActor?.snapshot.selected || event.delta > 4) return;
    event.stopPropagation();
    crowActor.commandDestination(event.point, crowMode);
  };

  const handleGroundClick = (event: ThreeEvent<MouseEvent>) => {
    if (handleSceneLabTerrainClick(sceneLab, event.point)) {
      event.stopPropagation();
      return;
    }
    sceneLab.controller.select(null);
    commandCrow(event);
  };

  return (
    <>
      <EnvironmentRuntime controller={environment} />
      <color attach="background" args={["#bfd0c0"]} />
      <hemisphereLight args={["#dce8dc", "#52635a", settings.hemisphereIntensity]} />
      <directionalLight
        ref={lightRef}
        castShadow
        color="#fff0d3"
        intensity={settings.sunIntensity}
        position={[settings.sunX, settings.sunY, settings.sunZ]}
        shadow-mapSize-width={SHADOW_MAP_SIZE}
        shadow-mapSize-height={SHADOW_MAP_SIZE}
        shadow-camera-left={-SHADOW_CAMERA_EXTENT}
        shadow-camera-right={SHADOW_CAMERA_EXTENT}
        shadow-camera-top={SHADOW_CAMERA_EXTENT}
        shadow-camera-bottom={-SHADOW_CAMERA_EXTENT}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
        shadow-bias={settings.shadowBias}
        shadow-normalBias={settings.shadowNormalBias}
      />
      <Suspense fallback={null}>
        <StylizedRock settings={settings} onDestination={commandCrow} />
        <CrowActorView
          settings={settings}
          config={crowConfig}
          selected={crowSnapshot?.selected ?? false}
          debug={crowDebug}
          snapshot={crowSnapshot}
          onSelect={onCrowSelect}
          onReady={onCrowReady}
        />
        <ReferenceTree
          environment={environment}
          settings={settings}
          selected={treeSelected}
          windResponse={treeWindResponse}
          appearance={treeAppearance}
          selectedMesh={treeMesh}
          debugMode={treeDebugMode}
          onSelect={onTreeSelect}
          onInspection={onTreeInspection}
        />
        <SceneLabWorld
          lab={sceneLab}
          environment={environment}
          style={settings}
        />
        <ShaderWarmup onStateChange={onCompileState} />
      </Suspense>
      <ContactPatch intensity={settings.aoIntensity} />
      <mesh
        receiveShadow
        rotation-x={-Math.PI / 2}
        position-y={GROUND_Y}
        onPointerMove={(event) => handleSceneLabTerrainPointer(sceneLab, event.point)}
        onClick={handleGroundClick}
      >
        <planeGeometry args={[40, 40]} />
        <meshLambertMaterial color="#79936f" />
      </mesh>
      <gridHelper args={[16, 32, "#5c7157", "#6d8465"]} position-y={-0.428} />
      <OrbitControls
        makeDefault
        target={[0, 1.25, 0]}
        enableDamping
        dampingFactor={0.08}
        minDistance={1.1}
        maxDistance={12}
        minPolarAngle={Math.PI * 0.08}
        maxPolarAngle={Math.PI * 0.48}
      />
      <RendererStats onStats={onStats} />
    </>
  );
}

function EnvironmentRuntime({ controller }: { controller: EnvironmentController }) {
  useFrame((_, delta) => {
    controller.update(delta);
  });
  return null;
}

function StylizedRock({ settings, onDestination }: { settings: StyleSettings; onDestination: (event: ThreeEvent<MouseEvent>) => void }) {
  const { scene } = useGLTF(ROCK_URL);
  const gradientMap = useMemo(() => createToonGradientMap(settings.toonBands), [settings.toonBands]);
  const uniforms = useMemo<StylizedRockUniforms>(() => ({
    hatchStrength: { value: settings.hatchStrength },
    hatchScale: { value: settings.hatchScale },
    hatchMode: { value: settings.hatchMode === "screen" ? 1 : 0 },
  }), [settings.hatchMode, settings.hatchScale, settings.hatchStrength]);

  const studyScene = useMemo(() => {
    const clone = scene.clone(true);
    const meshes: THREE.Mesh[] = [];

    clone.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });

    for (const mesh of meshes) {
      const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const diffuseMap = sourceMaterial instanceof THREE.MeshStandardMaterial ? sourceMaterial.map : null;
      if (diffuseMap) {
        diffuseMap.colorSpace = THREE.SRGBColorSpace;
        diffuseMap.anisotropy = 4;
      }

      mesh.material = createStylizedRockMaterial(diffuseMap, gradientMap, uniforms);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const outline = new THREE.Mesh(createSmoothedOutlineGeometry(mesh.geometry), createOutlineMaterial(settings.outlineColor));
      outline.name = `${mesh.name || "rock"}-outline`;
      outline.userData.isReferenceOutline = true;
      outline.renderOrder = -1;
      outline.castShadow = false;
      outline.receiveShadow = false;
      mesh.add(outline);
    }

    return clone;
  }, [gradientMap, scene, settings.outlineColor, uniforms]);

  useEffect(() => {
    studyScene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.material instanceof THREE.ShaderMaterial && object.material.name.includes("outline")) {
        object.material.uniforms.uThickness.value = settings.outlineThickness;
        object.material.uniforms.uColor.value.set(settings.outlineColor);
      }
    });
  }, [settings.outlineColor, settings.outlineThickness, studyScene]);

  useEffect(() => () => {
    studyScene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
      if (object.userData.isReferenceOutline) object.geometry.dispose();
    });
    gradientMap.dispose();
  }, [gradientMap, studyScene]);

  return <primitive object={studyScene} onClick={onDestination} />;
}

function CrowActorView({
  settings,
  config,
  selected,
  debug,
  snapshot,
  onSelect,
  onReady,
}: {
  settings: StyleSettings;
  config: CrowActorConfig;
  selected: boolean;
  debug: CrowDebugSettings;
  snapshot: CrowActorSnapshot | null;
  onSelect: () => void;
  onReady: (actor: CrowActorController | null) => void;
}) {
  const { scene, animations } = useGLTF(CROW_URL);
  const activeActor = useRef<CrowActorController | null>(null);
  const actor = useMemo(() => {
    const next = new CrowActorController(scene, animations, DEFAULT_CROW_CONFIG, {
      toonBands: DEFAULT_SETTINGS.toonBands,
      hatchStrength: 0,
      hatchScale: DEFAULT_SETTINGS.hatchScale,
      hatchMode: DEFAULT_SETTINGS.hatchMode,
      outlineThickness: DEFAULT_SETTINGS.outlineThickness * DEFAULT_CROW_CONFIG.outlineScale,
      outlineColor: DEFAULT_SETTINGS.outlineColor,
    });
    next.root.position.set(-2.15, GROUND_Y, 1.25);
    next.root.rotation.y = -0.55;
    return next;
  }, [animations, scene]);

  useEffect(() => {
    activeActor.current = actor;
    onReady(actor);
    return () => {
      onReady(null);
      activeActor.current = null;
      queueMicrotask(() => {
        if (activeActor.current !== actor) actor.dispose();
      });
    };
  }, [actor, onReady]);

  useEffect(() => {
    actor.updateConfig(config);
  }, [actor, config]);

  useEffect(() => {
    actor.updateStyle({
      toonBands: settings.toonBands,
      hatchStrength: 0,
      hatchScale: settings.hatchScale,
      hatchMode: settings.hatchMode,
      outlineThickness: settings.outlineThickness * config.outlineScale,
      outlineColor: settings.outlineColor,
    });
  }, [actor, config.outlineScale, settings.hatchMode, settings.hatchScale, settings.outlineColor, settings.outlineThickness, settings.toonBands]);

  useFrame((_, delta) => {
    actor.update(Math.min(delta, 0.1), () => GROUND_Y);
  });

  const selectCrow = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4) return;
    event.stopPropagation();
    onSelect();
    actor.setSelected(true);
  };

  return (
    <>
      <primitive object={actor.root} onClick={selectCrow}>
        {selected ? (
          <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
            <ringGeometry args={[0.46, 0.52, 48]} />
            <meshBasicMaterial color="#e8a447" transparent opacity={0.9} depthWrite={false} />
          </mesh>
        ) : null}
      </primitive>
      <CrowDebug actor={actor} snapshot={snapshot} settings={debug} />
    </>
  );
}

function CrowDebug({ actor, snapshot, settings }: { actor: CrowActorController; snapshot: CrowActorSnapshot | null; settings: CrowDebugSettings }) {
  const path = useMemo(() => {
    void snapshot?.revision;
    const points = actor.getFlightPathPoints();
    if (points.length < 2) return null;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: "#f0a33a", depthTest: false, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 20;
    return line;
  }, [actor, snapshot?.revision]);
  const bounds = useMemo(() => {
    const helper = new THREE.BoxHelper(actor.root, new THREE.Color("#62c9ff"));
    helper.material.depthTest = false;
    helper.renderOrder = 21;
    return helper;
  }, [actor]);

  useFrame(() => {
    if (settings.bounds) bounds.update();
  });

  useEffect(() => () => {
    path?.geometry.dispose();
    (path?.material as THREE.Material | undefined)?.dispose();
  }, [path]);

  useEffect(() => () => {
    bounds.geometry.dispose();
    bounds.material.dispose();
  }, [bounds]);

  return (
    <>
      {settings.path && path ? <primitive object={path} /> : null}
      {settings.target && snapshot?.target ? (
        <mesh position={snapshot.target} renderOrder={22}>
          <sphereGeometry args={[0.09, 16, 10]} />
          <meshBasicMaterial color="#ffbf58" depthTest={false} />
        </mesh>
      ) : null}
      {settings.bounds ? <primitive object={bounds} /> : null}
    </>
  );
}

function ReferenceTree({
  environment,
  settings,
  selected,
  windResponse,
  appearance,
  selectedMesh,
  debugMode,
  onSelect,
  onInspection,
}: {
  environment: EnvironmentController;
  settings: StyleSettings;
  selected: boolean;
  windResponse: TreeWindResponseSettings;
  appearance: TreeAppearanceSettings;
  selectedMesh: number;
  debugMode: TreeDebugMode;
  onSelect: () => void;
  onInspection: (inspection: TreeInspection) => void;
}) {
  const { scene } = useGLTF(TREE_URL);
  const sourceTextures = useTexture({
    diffuse: TREE_DIFFUSE_URL,
    detail: TREE_DETAIL_URL,
    mask: TREE_MASK_URL,
  });
  const responseController = useMemo(() => new TreeWindResponseController(DEFAULT_TREE_WIND_RESPONSE), []);
  const styleController = useMemo(() => new TreeStyleUniformController(
    DEFAULT_SETTINGS.hatchStrength,
    DEFAULT_SETTINGS.hatchScale,
    DEFAULT_SETTINGS.hatchMode,
  ), []);
  const activeResources = useRef<ReturnType<typeof prepareTreeResources> | null>(null);
  const activeTextures = useRef<ReturnType<typeof prepareTreeTextures> | null>(null);
  const gradientMap = useMemo(() => createToonGradientMap(settings.toonBands), [settings.toonBands]);

  const preparedTextures = useMemo(
    () => prepareTreeTextures(sourceTextures),
    [sourceTextures],
  );

  const inspection = useMemo<TreeInspection>(() => {
    const objectNames: string[] = [];
    const meshes: TreeMeshInspection[] = [];
    scene.traverse((object) => {
      objectNames.push(object.name || `(unnamed ${object.type})`);
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const triangleCount = object.geometry.index
        ? object.geometry.index.count / 3
        : object.geometry.getAttribute("position").count / 3;
      meshes.push({
        name: object.name,
        attributes: Object.keys(object.geometry.attributes),
        triangles: triangleCount,
        indexed: Boolean(object.geometry.index),
        groups: object.geometry.groups.map((group: { start: number; count: number; materialIndex?: number }) => ({
          start: group.start,
          count: group.count,
          materialIndex: group.materialIndex ?? 0,
        })),
        materialNames: materials.map((material) => material.name),
      });
    });
    const bounds = new THREE.Box3().setFromObject(scene);
    return {
      objectNames,
      meshes,
      boundsMin: bounds.min.toArray(),
      boundsMax: bounds.max.toArray(),
    };
  }, [scene]);

  const prepared = useMemo(() => prepareTreeResources({
    scene,
    diffuseMap: preparedTextures.diffuse,
    maskMap: preparedTextures.mask,
    detailMap: preparedTextures.detail,
    gradientMap,
    hatchUniforms: styleController.hatchUniforms,
    globalWindUniforms: environment.windUniforms,
    responseController,
  }), [environment, gradientMap, preparedTextures, responseController, scene, styleController]);
  const treeRoots = useMemo(
    () => TREE_INSTANCES.map((_, index) => (index === 0 ? prepared.root : prepared.root.clone(true))),
    [prepared],
  );

  useEffect(() => {
    activeTextures.current = preparedTextures;
    return () => {
      activeTextures.current = null;
      queueMicrotask(() => {
        if (activeTextures.current !== preparedTextures) disposeTreeTextures(preparedTextures);
      });
    };
  }, [preparedTextures]);

  useEffect(() => {
    activeResources.current = prepared;
    return () => {
      activeResources.current = null;
      queueMicrotask(() => {
        if (activeResources.current !== prepared) disposeTreeResources(prepared);
      });
    };
  }, [prepared]);

  useEffect(() => {
    onInspection(inspection);
  }, [inspection, onInspection]);

  useEffect(() => {
    responseController.apply(windResponse);
  }, [responseController, windResponse]);

  useEffect(() => {
    styleController.apply(settings.hatchStrength, settings.hatchScale, settings.hatchMode);
    updateTreeOutlineSettings(prepared, settings, appearance);
  }, [appearance, prepared, settings, styleController]);

  useEffect(() => {
    prepared.meshes.forEach((mesh, index) => {
      const showDebug = debugMode !== "normal" && index === selectedMesh;
      mesh.material = showDebug ? prepared.debugMaterial : prepared.toonMaterial;
      prepared.outlines[index].visible = !showDebug;
    });
    if (debugMode !== "normal") setTreeDebugMode(prepared.debugMaterial, debugMode);
  }, [debugMode, prepared, selectedMesh]);

  const selectTree = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4) return;
    event.stopPropagation();
    onSelect();
  };

  return (
    <>
      {TREE_INSTANCES.map((instance, index) => (
        <group key={index} position={instance.position} scale={instance.scale} onClick={selectTree}>
          <primitive object={treeRoots[index]} />
          {selected && index === 0 ? (
            <mesh rotation-x={-Math.PI / 2} position-y={0.025}>
              <ringGeometry args={[2.05, 2.16, 64]} />
              <meshBasicMaterial color="#e8a447" transparent opacity={0.9} depthWrite={false} />
            </mesh>
          ) : null}
        </group>
      ))}
    </>
  );
}

function prepareTreeResources({
  scene,
  diffuseMap,
  maskMap,
  detailMap,
  gradientMap,
  hatchUniforms,
  globalWindUniforms,
  responseController,
}: {
  scene: THREE.Group;
  diffuseMap: THREE.Texture;
  maskMap: THREE.Texture;
  detailMap: THREE.Texture;
  gradientMap: THREE.Texture;
  hatchUniforms: StylizedRockUniforms;
  globalWindUniforms: EnvironmentController["windUniforms"];
  responseController: TreeWindResponseController;
}) {
  const root = scene.clone(true);
  const meshes: THREE.Mesh[] = [];
  const outlines: THREE.Mesh[] = [];
  const toonMaterial = createTreeToonMaterial(
    diffuseMap,
    gradientMap,
    hatchUniforms,
    globalWindUniforms,
    responseController.uniforms,
  );
  const outlineMaterial = createTreeOutlineMaterial(
    diffuseMap,
    DEFAULT_SETTINGS.outlineColor,
    DEFAULT_SETTINGS.outlineThickness * DEFAULT_TREE_APPEARANCE.outlineScale,
    globalWindUniforms,
    responseController.uniforms,
  );
  const depthMaterial = createTreeDepthMaterial(diffuseMap, globalWindUniforms, responseController.uniforms);
  const debugMaterial = createTreeDebugMaterial(
    diffuseMap,
    maskMap,
    detailMap,
    globalWindUniforms,
    responseController.uniforms,
  );

  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });

  for (const object of meshes) {
    object.material = toonMaterial;
    object.customDepthMaterial = depthMaterial;
    object.castShadow = true;
    object.receiveShadow = true;

    const outline = new THREE.Mesh(createSmoothedOutlineGeometry(object.geometry), outlineMaterial);
    outline.name = `${object.name}-outline`;
    outline.userData.isReferenceOutline = true;
    outline.renderOrder = -1;
    outline.frustumCulled = false;
    object.add(outline);
    outlines.push(outline);
  }

  return { root, meshes, outlines, toonMaterial, outlineMaterial, depthMaterial, debugMaterial, gradientMap };
}

function prepareTreeTextures(source: { diffuse: THREE.Texture; detail: THREE.Texture; mask: THREE.Texture }) {
  const diffuse = source.diffuse.clone();
  const detail = source.detail.clone();
  const mask = source.mask.clone();
  diffuse.flipY = false;
  diffuse.colorSpace = THREE.SRGBColorSpace;
  detail.flipY = false;
  detail.colorSpace = THREE.SRGBColorSpace;
  mask.flipY = false;
  mask.colorSpace = THREE.NoColorSpace;
  for (const texture of [diffuse, detail, mask]) {
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }
  return { diffuse, detail, mask };
}

function disposeTreeTextures(textures: ReturnType<typeof prepareTreeTextures>) {
  textures.diffuse.dispose();
  textures.detail.dispose();
  textures.mask.dispose();
}

function updateTreeOutlineSettings(
  resources: ReturnType<typeof prepareTreeResources>,
  settings: StyleSettings,
  appearance: TreeAppearanceSettings,
) {
  resources.outlineMaterial.uniforms.uThickness.value = settings.outlineThickness * appearance.outlineScale;
  resources.outlineMaterial.uniforms.uColor.value.set(settings.outlineColor);
}

function disposeTreeResources(resources: ReturnType<typeof prepareTreeResources>) {
  for (const outline of resources.outlines) outline.geometry.dispose();
  resources.toonMaterial.dispose();
  resources.outlineMaterial.dispose();
  resources.depthMaterial.dispose();
  resources.debugMaterial.dispose();
  resources.gradientMap.dispose();
}

function TreePanel({
  inspection,
  windResponse,
  appearance,
  selectedMesh,
  debugMode,
  setWindResponse,
  setAppearance,
  setSelectedMesh,
  setDebugMode,
  onClose,
}: {
  inspection: TreeInspection;
  windResponse: TreeWindResponseSettings;
  appearance: TreeAppearanceSettings;
  selectedMesh: number;
  debugMode: TreeDebugMode;
  setWindResponse: React.Dispatch<React.SetStateAction<TreeWindResponseSettings>>;
  setAppearance: React.Dispatch<React.SetStateAction<TreeAppearanceSettings>>;
  setSelectedMesh: (index: number) => void;
  setDebugMode: (mode: TreeDebugMode) => void;
  onClose: () => void;
}) {
  const mesh = inspection.meshes[selectedMesh] ?? inspection.meshes[0];
  const debugModes = getTreeDebugModes(mesh.attributes);
  const windSources = getAvailableTreeWindSources(mesh.attributes);
  const updateWindResponse = <Key extends keyof TreeWindResponseSettings>(key: Key, value: TreeWindResponseSettings[Key]) => {
    setWindResponse((current) => ({ ...current, [key]: value }));
  };

  return (
    <aside className={`${styles.actorPanel} ${styles.treePanel}`} aria-label="Tree reference controls">
      <header className={styles.actorHeader}>
        <div>
          <h2>Tree reference</h2>
          <p>Static mesh · authored GPU wind weights</p>
        </div>
        <button type="button" className={styles.closeButton} aria-label="Close tree controls" onClick={onClose}>×</button>
      </header>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Asset wind response</h3>
        <Range label="Tree sway" value={windResponse.treeSwayResponse} min={0} max={2} step={0.02} onChange={(value) => updateWindResponse("treeSwayResponse", value)} />
        <Range label="Branches" value={windResponse.branchResponse} min={0} max={2} step={0.02} onChange={(value) => updateWindResponse("branchResponse", value)} />
        <Range label="Leaf flutter" value={windResponse.leafResponse} min={0} max={2} step={0.02} onChange={(value) => updateWindResponse("leafResponse", value)} />
        <Range label="Stiffness" value={windResponse.stiffness} min={0.2} max={3} step={0.02} onChange={(value) => updateWindResponse("stiffness", value)} />
        <Range label="Outline scale" value={appearance.outlineScale} min={0} max={2} step={0.05} onChange={(value) => setAppearance((current) => ({ ...current, outlineScale: value }))} />
        <label className={styles.selectControl}>
          <span>Wind weight source</span>
          <select value={windResponse.weightSource} onChange={(event) => updateWindResponse("weightSource", event.target.value as TreeWindResponseSettings["weightSource"])}>
            {windSources.map((source) => <option key={source} value={source}>{formatTreeMode(source)}</option>)}
          </select>
        </label>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Tree attribute debug</h3>
        <div className={styles.meshTabs}>
          {inspection.meshes.map((candidate, index) => (
            <button key={candidate.name} type="button" aria-pressed={selectedMesh === index} onClick={() => setSelectedMesh(index)}>
              {candidate.name.includes("Base") ? "Base" : candidate.name.includes("Upper") ? "Upper" : candidate.name}
            </button>
          ))}
        </div>
        <div className={styles.debugGrid}>
          {debugModes.map((mode) => (
            <button key={mode} type="button" aria-pressed={debugMode === mode} onClick={() => setDebugMode(mode)}>{formatTreeMode(mode)}</button>
          ))}
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Selected mesh data</h3>
        <dl className={styles.stats}>
          <dt>Triangles</dt><dd>{mesh.triangles.toLocaleString()}</dd>
          <dt>Indexed</dt><dd>{mesh.indexed ? "Yes" : "No"}</dd>
          <dt>Groups</dt><dd>{mesh.groups.length}</dd>
          <dt>Material</dt><dd>{mesh.materialNames.join(", ")}</dd>
          <dt>UV sets</dt><dd>{mesh.attributes.filter((attribute) => attribute === "uv" || attribute.startsWith("uv") || attribute.startsWith("texcoord_")).length}</dd>
        </dl>
        <p className={styles.attributeList}>{mesh.attributes.join(" · ")}</p>
        <p className={styles.note}>D_001: 512² painted diffuse with alpha. D_002: 2048² alternate painted atlas with alpha. M_001: 512² grayscale mask; RGB channels are identical.</p>
      </section>
    </aside>
  );
}

function formatTreeMode(mode: string) {
  const labels: Record<string, string> = {
    normal: "Normal material",
    uv: "UV0",
    uv1: "UV1",
    uv2: "UV2",
    uv3: "UV3",
    texcoord_4: "UV4",
    texcoord_5: "UV5",
    texcoord_6: "UV6",
    texcoord_7: "UV7",
    height: "Height fallback",
    "color_1-r": "Color 1 · R",
    "color_1-g": "Color 1 · G",
    "color_1-b": "Color 1 · B",
    "color_1-a": "Color 1 · A",
    "color-r": "Color 0 · R",
    "color-g": "Color 0 · G",
    "color-b": "Color 0 · B",
    "color-a": "Color 0 · A",
    "uv-x": "UV0 · X",
    "uv-y": "UV0 · Y",
    "uv1-x": "UV1 · X",
    "uv1-y": "UV1 · Y",
    "uv2-x": "UV2 · X",
    "uv2-y": "UV2 · Y",
    "mask-r": "M_001 · R",
    "mask-g": "M_001 · G",
    "mask-b": "M_001 · B",
    "mask-a": "M_001 · A",
    "detail-r": "D_002 · R",
    "detail-g": "D_002 · G",
    "detail-b": "D_002 · B",
    "detail-a": "D_002 · A",
  };
  return labels[mode] ?? mode;
}

function CrowPanel({
  actor,
  snapshot,
  mode,
  config,
  debug,
  setMode,
  setConfig,
  setDebug,
}: {
  actor: CrowActorController;
  snapshot: CrowActorSnapshot;
  mode: CrowMovementMode;
  config: CrowActorConfig;
  debug: CrowDebugSettings;
  setMode: (mode: CrowMovementMode) => void;
  setConfig: React.Dispatch<React.SetStateAction<CrowActorConfig>>;
  setDebug: React.Dispatch<React.SetStateAction<CrowDebugSettings>>;
}) {
  const updateConfig = <Key extends keyof CrowActorConfig>(key: Key, value: CrowActorConfig[Key]) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };
  const updateDebug = (key: keyof CrowDebugSettings, value: boolean) => {
    setDebug((current) => ({ ...current, [key]: value }));
  };

  return (
    <aside className={styles.actorPanel} aria-label="Crow actor controls">
      <header className={styles.actorHeader}>
        <div>
          <h2>Crow actor</h2>
          <p>{snapshot.state} · {snapshot.currentAnimation ?? "No animation"}</p>
        </div>
        <button type="button" className={styles.closeButton} aria-label="Close crow controls" onClick={() => actor.setSelected(false)}>×</button>
      </header>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Destination mode</h3>
        <div className={styles.segmentedThree} aria-label="Crow movement mode">
          {(["walk", "run", "flight"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{value}</button>
          ))}
        </div>
        <p className={styles.note}>With the crow selected, click the ground or rock to set its destination.</p>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Animation clips</h3>
        <div className={styles.clipList}>
          {actor.clips.map((clip) => (
            <button key={clip.name} type="button" className={styles.clipButton} onClick={() => actor.playClip(clip.name)}>
              <span>{clip.name}</span>
              <small>{clip.duration.toFixed(2)} s · {isLoopingCrowClip(clip.name) ? "loop" : "once"}</small>
            </button>
          ))}
        </div>
        <div className={styles.commandRow}>
          <button type="button" onClick={() => actor.previewLanding()}>Landing fallback</button>
          <button type="button" onClick={() => actor.stop()}>Stop</button>
          <button type="button" onClick={() => actor.resumeIdle()}>Resume idle</button>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Motion</h3>
        <Range label="Walk speed" value={config.walkSpeed} min={0.1} max={3} step={0.05} onChange={(value) => updateConfig("walkSpeed", value)} />
        <Range label="Run speed" value={config.runSpeed} min={0.2} max={5} step={0.05} onChange={(value) => updateConfig("runSpeed", value)} />
        <Range label="Flight speed" value={config.flightSpeed} min={0.5} max={8} step={0.1} onChange={(value) => updateConfig("flightSpeed", value)} />
        <Range label="Flight height" value={config.flightHeight} min={0.2} max={8} step={0.1} onChange={(value) => updateConfig("flightHeight", value)} />
        <Range label="Turn speed" value={config.rotationSpeed} min={1} max={16} step={0.25} onChange={(value) => updateConfig("rotationSpeed", value)} />
        <Range label="Crossfade" value={config.animationFadeDuration} min={0} max={1} step={0.01} onChange={(value) => updateConfig("animationFadeDuration", value)} />
        <Range label="Outline scale" value={config.outlineScale} min={0} max={2} step={0.05} onChange={(value) => updateConfig("outlineScale", value)} />
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Diagnostics</h3>
        <dl className={styles.stats}>
          <dt>State</dt><dd>{snapshot.state}</dd>
          <dt>Animation</dt><dd>{snapshot.currentAnimation ?? "None"}</dd>
          <dt>Speed</dt><dd>{snapshot.currentSpeed.toFixed(2)}</dd>
          <dt>Root tracks removed</dt><dd>{actor.removedRootTranslationTracks}</dd>
        </dl>
        <div className={styles.toggleRow}>
          <Toggle label="Path" checked={debug.path} onChange={(value) => updateDebug("path", value)} />
          <Toggle label="Target" checked={debug.target} onChange={(value) => updateDebug("target", value)} />
          <Toggle label="Bounds" checked={debug.bounds} onChange={(value) => updateDebug("bounds", value)} />
        </div>
      </section>
    </aside>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ContactPatch({ intensity }: { intensity: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.426, 0.04]} renderOrder={1}>
      <circleGeometry args={[1.05, 48]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={{
          uColor: { value: new THREE.Color("#26342d") },
          uOpacity: { value: intensity },
        }}
        vertexShader={`
          varying vec2 vPatchUv;
          void main() {
            vPatchUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          uniform float uOpacity;
          varying vec2 vPatchUv;
          void main() {
            float radius = length(vPatchUv - vec2(0.5)) * 2.0;
            float alpha = (1.0 - smoothstep(0.08, 1.0, radius)) * uOpacity;
            gl_FragColor = vec4(uColor, alpha);
          }
        `}
      />
    </mesh>
  );
}

function ShaderWarmup({ onStateChange }: { onStateChange: (state: string) => void }) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    onStateChange("Compiling shaders");
    try {
      gl.compile(scene, camera);
      onStateChange("Shaders warm");
    } catch {
      onStateChange("Warmup unavailable");
    }
  }, [camera, gl, onStateChange, scene]);

  return null;
}

function RendererStats({ onStats }: { onStats: (stats: RenderStats) => void }) {
  const { gl } = useThree();
  const sample = useRef({ elapsed: 0, frames: 0 });

  useFrame((_, delta) => {
    sample.current.elapsed += delta;
    sample.current.frames += 1;
    if (sample.current.elapsed < 0.3) return;

    const frameMs = (sample.current.elapsed / sample.current.frames) * 1000;
    onStats({
      fps: 1000 / frameMs,
      frameMs,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });
    sample.current.elapsed = 0;
    sample.current.frames = 0;
  });

  return null;
}

function StylePanel({
  settings,
  setSettings,
  environmentState,
  updateEnvironmentWind,
  setEnvironmentWindDirection,
  applyEnvironmentPreset,
  stats,
  compileState,
}: {
  settings: StyleSettings;
  setSettings: React.Dispatch<React.SetStateAction<StyleSettings>>;
  environmentState: EnvironmentState;
  updateEnvironmentWind: (patch: Partial<EnvironmentWindState>) => void;
  setEnvironmentWindDirection: (degrees: number) => void;
  applyEnvironmentPreset: (preset: EnvironmentWindPreset) => void;
  stats: RenderStats;
  compileState: string;
}) {
  const update = <Key extends keyof StyleSettings>(key: Key, value: StyleSettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };
  const wind = environmentState.wind;
  const directionDegrees = getWindDirectionDegrees(wind.direction);

  return (
    <aside className={styles.panel} aria-label="Reference style controls">
      <header className={styles.panelHeader}>
        <h1>Reference Style Study</h1>
        <p>Shared rock and animated-character lighting, hatch, outline and shadow treatment.</p>
      </header>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Environment · Weather · Wind</h2>
        <Toggle label="Enabled" checked={wind.enabled} onChange={(enabled) => updateEnvironmentWind({ enabled })} />
        <div className={styles.weatherPresetRow}>
          {(["calm", "lightBreeze", "windy", "strongWind", "storm"] as const).map((preset) => (
            <button key={preset} type="button" onClick={() => applyEnvironmentPreset(preset)}>{formatWindPreset(preset)}</button>
          ))}
        </div>
        <Range label="Direction" value={directionDegrees} min={0} max={359} step={1} digits={0} onChange={setEnvironmentWindDirection} />
        <Range label="Strength" value={wind.strength} min={0} max={2} step={0.02} onChange={(strength) => updateEnvironmentWind({ strength })} />
        <Range label="Speed" value={wind.speed} min={0.1} max={2.5} step={0.02} onChange={(speed) => updateEnvironmentWind({ speed })} />
        <Range label="Gust strength" value={wind.gustStrength} min={0} max={1} step={0.01} onChange={(gustStrength) => updateEnvironmentWind({ gustStrength })} />
        <Range label="Gust frequency" value={wind.gustFrequency} min={0.02} max={0.6} step={0.01} onChange={(gustFrequency) => updateEnvironmentWind({ gustFrequency })} />
        <Range label="Turbulence" value={wind.turbulence} min={0} max={1} step={0.01} onChange={(turbulence) => updateEnvironmentWind({ turbulence })} />
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Lighting</h2>
        <Range label="Sun" value={settings.sunIntensity} min={0} max={5} step={0.05} onChange={(value) => update("sunIntensity", value)} />
        <Range label="Sun X" value={settings.sunX} min={-10} max={10} step={0.1} onChange={(value) => update("sunX", value)} />
        <Range label="Sun Y" value={settings.sunY} min={1} max={12} step={0.1} onChange={(value) => update("sunY", value)} />
        <Range label="Sun Z" value={settings.sunZ} min={-10} max={10} step={0.1} onChange={(value) => update("sunZ", value)} />
        <Range label="Hemisphere" value={settings.hemisphereIntensity} min={0} max={3} step={0.05} onChange={(value) => update("hemisphereIntensity", value)} />
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Surface</h2>
        <Range label="Toon bands" value={settings.toonBands} min={2} max={6} step={1} digits={0} onChange={(value) => update("toonBands", value)} />
        <Range label="Hatch power" value={settings.hatchStrength} min={0} max={1} step={0.01} onChange={(value) => update("hatchStrength", value)} />
        <Range label="Hatch scale" value={settings.hatchScale} min={0.5} max={5} step={0.05} onChange={(value) => update("hatchScale", value)} />
        <div className={styles.segmented} aria-label="Hatching coordinates">
          <button type="button" aria-pressed={settings.hatchMode === "uv"} onClick={() => update("hatchMode", "uv")}>UV stable</button>
          <button type="button" aria-pressed={settings.hatchMode === "screen"} onClick={() => update("hatchMode", "screen")}>Screen</button>
        </div>
        <p className={styles.note}>No hatch texture was supplied. This shader-generated crosshatch is a temporary fallback.</p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Edges and depth</h2>
        <Range label="Outline" value={settings.outlineThickness} min={0} max={0.04} step={0.001} digits={3} onChange={(value) => update("outlineThickness", value)} />
        <div className={styles.control}>
          <label htmlFor="outline-color">Edge color</label>
          <input id="outline-color" type="color" value={settings.outlineColor} onChange={(event) => update("outlineColor", event.target.value)} />
          <output>{settings.outlineColor}</output>
        </div>
        <Range label="Contact AO" value={settings.aoIntensity} min={0} max={0.7} step={0.01} onChange={(value) => update("aoIntensity", value)} />
        <Range label="Bias" value={settings.shadowBias} min={-0.003} max={0.003} step={0.0001} digits={4} onChange={(value) => update("shadowBias", value)} />
        <Range label="Normal bias" value={settings.shadowNormalBias} min={0} max={0.15} step={0.001} digits={3} onChange={(value) => update("shadowNormalBias", value)} />
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Renderer</h2>
        <dl className={styles.stats}>
          <dt>Shader</dt><dd>{compileState}</dd>
          <dt>FPS</dt><dd>{stats.fps.toFixed(1)}</dd>
          <dt>Frame</dt><dd>{stats.frameMs.toFixed(2)} ms</dd>
          <dt>Draw calls</dt><dd>{stats.calls}</dd>
          <dt>Triangles</dt><dd>{Math.round(stats.triangles).toLocaleString()}</dd>
          <dt>Geometries</dt><dd>{stats.geometries}</dd>
          <dt>Textures</dt><dd>{stats.textures}</dd>
        </dl>
      </section>
    </aside>
  );
}

function formatWindPreset(preset: EnvironmentWindPreset) {
  const labels: Record<EnvironmentWindPreset, string> = {
    calm: "Calm",
    lightBreeze: "Breeze",
    windy: "Windy",
    strongWind: "Strong",
    storm: "Storm",
  };
  return labels[preset];
}

function Range({
  label,
  value,
  min,
  max,
  step,
  digits = 2,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  digits?: number;
  onChange: (value: number) => void;
}) {
  const id = `style-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div className={styles.control}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
      <output htmlFor={id}>{value.toFixed(digits)}</output>
    </div>
  );
}

useGLTF.preload(ROCK_URL);
useGLTF.preload(CROW_URL);
useGLTF.preload(TREE_URL);
useTexture.preload(TREE_DIFFUSE_URL);
useTexture.preload(TREE_DETAIL_URL);
useTexture.preload(TREE_MASK_URL);
