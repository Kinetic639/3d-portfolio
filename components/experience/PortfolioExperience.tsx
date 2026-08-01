"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import gsap from "gsap";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  TERRAIN_INSTANCE_COUNT,
  createTerrainData,
  type TerrainChunk,
} from "@/lib/terrain/terrain";
import {
  type ExperiencePhase,
  isInteractivePhase,
  useExperienceStore,
} from "@/lib/experience/experience-store";

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

  varying vec3 vNormal;
  varying float vReveal;
  varying float vVariation;

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

    gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
  }
`;

const BLOCK_FRAGMENT_SHADER = `
  varying vec3 vNormal;
  varying float vReveal;
  varying float vVariation;

  void main() {
    vec3 base = mix(vec3(0.31, 0.47, 0.42), vec3(0.42, 0.56, 0.50), vVariation);
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
  const phase = useExperienceStore((state) => state.phase);

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
              <ExperienceScene />
            </Canvas>
          </div>
          <ExperienceOverlay phase={phase} />
          {process.env.NODE_ENV !== "production" && metrics ? <FixedDiagnostics metrics={metrics} /> : null}
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
        <div className="metrics-wide"><dt>Instances</dt><dd>{metrics.instances} / 16 chunks</dd></div>
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

function ExperienceScene() {
  const terrain = useMemo(() => createTerrainData(), []);
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

  useEffect(() => {
    markLoading();
  }, [markLoading]);

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
      <TerrainChunks chunks={terrain.chunks} uniforms={uniforms} />
      <ConstrainedMapControls enabled={isInteractivePhase(phase)} phase={phase} />
      <RenderInvalidator phase={phase} />
      <DevelopmentMetrics
        phase={phase}
        logicalCells={terrain.logicalCellCount}
        airCells={terrain.airCellCount}
        nonAirBlocks={terrain.nonAirBlockCount}
        chunks={terrain.chunks.length}
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
  const geometry = useMemo(() => createOpenBottomBlockGeometry(1.01, 0.74, 1.01), []);
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
        <TerrainChunkMesh key={chunk.id} chunk={chunk} geometry={geometry} material={material} />
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
    const revealData = new Float32Array(chunk.cells.length * 3);

    chunk.cells.forEach((cell, index) => {
      const offset = index * 3;
      revealData[offset] = cell.expansionDelay;
      revealData[offset + 1] = cell.variation;
      revealData[offset + 2] = cell.isCenterLoaderBlock ? 1 : 0;
    });

    clonedGeometry.setAttribute("aRevealData", new THREE.InstancedBufferAttribute(revealData, 3));

    return clonedGeometry;
  }, [chunk, geometry]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;

    if (!mesh) {
      return;
    }

    const matrix = new THREE.Matrix4();

    chunk.cells.forEach((cell, index) => {
      matrix.makeTranslation(cell.worldX, cell.worldY, cell.worldZ);
      mesh.setMatrixAt(index, matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [chunk]);

  useEffect(() => {
    return () => {
      chunkGeometry.dispose();
    };
  }, [chunkGeometry]);

  return <instancedMesh ref={meshRef} args={[chunkGeometry, material, chunk.cells.length]} frustumCulled={false} />;
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
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
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
}: {
  phase: ExperiencePhase;
  logicalCells: number;
  airCells: number;
  nonAirBlocks: number;
  chunks: number;
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
        instances: TERRAIN_INSTANCE_COUNT,
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
