import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import {
  createOutlineMaterial,
  createSmoothedOutlineGeometry,
  createStylizedRockMaterial,
  createToonGradientMap,
  type HatchMode,
  type StylizedRockUniforms,
} from "./stylized-rock-material";

export type CrowState = "IDLE" | "WALKING" | "RUNNING" | "TAKING_OFF" | "FLYING" | "LANDING" | "PREVIEW" | "STOPPED";
export type CrowMovementMode = "walk" | "run" | "flight";
export type CrowAnimationRole = "idle" | "fly" | "takeoff" | "landing" | "walk" | "run";

export type CrowActorConfig = {
  walkSpeed: number;
  runSpeed: number;
  flightSpeed: number;
  flightHeight: number;
  rotationSpeed: number;
  animationFadeDuration: number;
  groundOffset: number;
  modelScale: number;
  modelForwardYaw: number;
  outlineScale: number;
};

export type CrowStyleSettings = {
  toonBands: number;
  hatchStrength: number;
  hatchScale: number;
  hatchMode: HatchMode;
  outlineThickness: number;
  outlineColor: THREE.ColorRepresentation;
};

export type CrowActorSnapshot = {
  selected: boolean;
  state: CrowState;
  currentAnimation: string | null;
  currentSpeed: number;
  target: readonly [number, number, number] | null;
  revision: number;
};

export type ResolvedCrowAnimation = {
  clip: THREE.AnimationClip;
  reversed: boolean;
};

export const DEFAULT_CROW_CONFIG: CrowActorConfig = {
  walkSpeed: 0.75,
  runSpeed: 1.65,
  flightSpeed: 2.8,
  flightHeight: 3,
  rotationSpeed: 7,
  animationFadeDuration: 0.2,
  groundOffset: 0,
  modelScale: 0.015,
  modelForwardYaw: 0,
  outlineScale: 0.25,
};

const LOOPING_ROLE_PATTERN = /(idle|fly|walk|run|loop|lobby)/i;
const ROOT_POSITION_TRACK_PATTERN = /(^|[/.])root\.position$/i;

export function normalizeCrowClipName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isLoopingCrowClip(name: string) {
  return LOOPING_ROLE_PATTERN.test(normalizeCrowClipName(name));
}

export function resolveCrowAnimations(clips: readonly THREE.AnimationClip[]) {
  const find = (role: Exclude<CrowAnimationRole, "landing">) => {
    const candidates = clips.filter((clip) => normalizeCrowClipName(clip.name).includes(role));
    return candidates.sort((left, right) => scoreClip(left, role) - scoreClip(right, role))[0] ?? null;
  };
  const takeoff = find("takeoff");
  const landing = clips.find((clip) => /landing|land/.test(normalizeCrowClipName(clip.name))) ?? null;

  return {
    idle: wrap(find("idle")),
    fly: wrap(find("fly")),
    takeoff: wrap(takeoff),
    landing: landing ? { clip: landing, reversed: false } : takeoff ? { clip: takeoff, reversed: true } : null,
    walk: wrap(find("walk")),
    run: wrap(find("run")),
  } satisfies Record<CrowAnimationRole, ResolvedCrowAnimation | null>;
}

export function sanitizeCrowAnimationClips(clips: readonly THREE.AnimationClip[]) {
  let removedRootTranslationTracks = 0;
  const sanitizedClips = clips.map((source) => {
    const clip = source.clone();
    clip.tracks = clip.tracks.filter((track) => {
      const remove = ROOT_POSITION_TRACK_PATTERN.test(track.name);
      if (remove) removedRootTranslationTracks += 1;
      return !remove;
    });
    clip.resetDuration();
    return clip;
  });
  return { clips: sanitizedClips, removedRootTranslationTracks };
}

export function createCrowFlightCurve(start: THREE.Vector3, target: THREE.Vector3, flightHeight: number) {
  const control = start.clone().lerp(target, 0.5);
  control.y = Math.max(start.y, target.y) + flightHeight;
  return new THREE.QuadraticBezierCurve3(start.clone(), control, target.clone());
}

export function dampCrowAngle(current: number, target: number, smoothing: number, delta: number) {
  const difference = THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + difference * (1 - Math.exp(-smoothing * delta));
}

export class CrowActorController {
  readonly id = "reference-crow";
  readonly root = new THREE.Group();
  readonly model: THREE.Group;
  readonly mixer: THREE.AnimationMixer;
  readonly clips: readonly THREE.AnimationClip[];
  readonly removedRootTranslationTracks: number;

  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly resolved: ReturnType<typeof resolveCrowAnimations>;
  private readonly listeners = new Set<(snapshot: CrowActorSnapshot) => void>();
  private readonly hatchUniforms: StylizedRockUniforms;
  private readonly toonMaterials: THREE.MeshToonMaterial[] = [];
  private readonly outlineMaterials: THREE.ShaderMaterial[] = [];
  private readonly ownedOutlineGeometries: THREE.BufferGeometry[] = [];
  private gradientMap: THREE.DataTexture;
  private config: CrowActorConfig;
  private currentAction: THREE.AnimationAction | null = null;
  private currentDirection = 1;
  private target: THREE.Vector3 | null = null;
  private flightCurve: THREE.QuadraticBezierCurve3 | null = null;
  private flightProgress = 0;
  private flightDuration = 1;
  private selected = false;
  private state: CrowState = "IDLE";
  private currentAnimation: string | null = null;
  private currentSpeed = 0;
  private revision = 0;
  private sequence: "takeoff" | "landing" | "manual" | null = null;
  private readonly direction = new THREE.Vector3();
  private readonly nextPosition = new THREE.Vector3();
  private readonly flightTangent = new THREE.Vector3();
  private readonly onMixerFinished = (event: THREE.Event & { action: THREE.AnimationAction }) => {
    if (event.action !== this.currentAction) return;
    if (this.sequence === "takeoff") this.beginFlight();
    else if (this.sequence === "landing" || this.sequence === "manual") this.resumeIdle();
  };

  constructor(
    sourceModel: THREE.Group,
    sourceClips: readonly THREE.AnimationClip[],
    config: Partial<CrowActorConfig>,
    style: CrowStyleSettings,
  ) {
    this.config = { ...DEFAULT_CROW_CONFIG, ...config };
    this.model = cloneSkeleton(sourceModel) as THREE.Group;
    this.model.name = "Reference crow model";
    this.model.scale.setScalar(this.config.modelScale);
    this.root.name = "Reference crow actor";
    this.root.userData.actorId = this.id;
    this.root.add(this.model);

    const sanitized = sanitizeCrowAnimationClips(sourceClips);
    this.clips = sanitized.clips;
    this.removedRootTranslationTracks = sanitized.removedRootTranslationTracks;
    this.resolved = resolveCrowAnimations(this.clips);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.mixer.addEventListener("finished", this.onMixerFinished);
    for (const clip of this.clips) this.actions.set(clip.name, this.mixer.clipAction(clip));

    this.hatchUniforms = {
      hatchStrength: { value: style.hatchStrength },
      hatchScale: { value: style.hatchScale },
      hatchMode: { value: style.hatchMode === "screen" ? 1 : 0 },
    };
    this.gradientMap = createToonGradientMap(style.toonBands);
    this.prepareVisuals(style);
    this.playSemantic("idle", true);
  }

  get snapshot(): CrowActorSnapshot {
    return {
      selected: this.selected,
      state: this.state,
      currentAnimation: this.currentAnimation,
      currentSpeed: this.currentSpeed,
      target: this.target ? [this.target.x, this.target.y, this.target.z] : null,
      revision: this.revision,
    };
  }

  subscribe(listener: (snapshot: CrowActorSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  setSelected(selected: boolean) {
    if (this.selected === selected) return;
    this.selected = selected;
    this.emit();
  }

  updateConfig(config: Partial<CrowActorConfig>) {
    this.config = { ...this.config, ...config };
    this.model.scale.setScalar(this.config.modelScale);
  }

  updateStyle(style: CrowStyleSettings) {
    this.hatchUniforms.hatchStrength.value = style.hatchStrength;
    this.hatchUniforms.hatchScale.value = style.hatchScale;
    this.hatchUniforms.hatchMode.value = style.hatchMode === "screen" ? 1 : 0;
    const nextGradient = createToonGradientMap(style.toonBands);
    const previousGradient = this.gradientMap;
    this.gradientMap = nextGradient;
    for (const material of this.toonMaterials) {
      material.gradientMap = nextGradient;
      material.needsUpdate = true;
    }
    previousGradient.dispose();
    for (const material of this.outlineMaterials) {
      material.uniforms.uThickness.value = style.outlineThickness;
      material.uniforms.uColor.value.set(style.outlineColor);
    }
  }

  commandDestination(destination: THREE.Vector3, mode: CrowMovementMode) {
    this.target = destination.clone().add(new THREE.Vector3(0, this.config.groundOffset, 0));
    this.sequence = null;
    if (mode === "flight") {
      this.flightCurve = createCrowFlightCurve(this.root.position, this.target, this.config.flightHeight);
      this.flightProgress = 0;
      this.flightDuration = Math.max(this.flightCurve.getLength() / this.config.flightSpeed, 0.01);
      this.setState("TAKING_OFF", 0);
      if (!this.playSemantic("takeoff", false, "takeoff")) this.beginFlight();
      return;
    }

    const running = mode === "run";
    this.setState(running ? "RUNNING" : "WALKING", running ? this.config.runSpeed : this.config.walkSpeed);
    this.playSemantic(running ? "run" : "walk", true);
  }

  playClip(name: string) {
    const clip = this.clips.find((candidate) => candidate.name === name);
    if (!clip) return false;
    this.target = null;
    this.flightCurve = null;
    this.setState("PREVIEW", 0);
    const loop = isLoopingCrowClip(clip.name);
    this.sequence = loop ? null : "manual";
    return this.playResolved({ clip, reversed: false }, loop);
  }

  previewLanding() {
    const landing = this.resolved.landing;
    if (!landing) return false;
    this.target = null;
    this.flightCurve = null;
    this.setState("PREVIEW", 0);
    this.sequence = "manual";
    return this.playResolved(landing, false);
  }

  stop() {
    this.target = null;
    this.flightCurve = null;
    this.sequence = null;
    this.mixer.stopAllAction();
    this.currentAction = null;
    this.currentAnimation = null;
    this.setState("STOPPED", 0);
  }

  resumeIdle() {
    this.target = null;
    this.flightCurve = null;
    this.sequence = null;
    this.setState("IDLE", 0);
    this.playSemantic("idle", true);
  }

  update(delta: number, resolveSurface?: (x: number, z: number) => number | null) {
    this.mixer.update(delta);
    if (!this.target) return;

    if (this.state === "WALKING" || this.state === "RUNNING") {
      this.updateGroundMovement(delta, resolveSurface);
    } else if (this.state === "FLYING") {
      this.updateFlight(delta);
    }
  }

  getFlightPathPoints(segments = 32) {
    return this.flightCurve?.getPoints(segments) ?? [];
  }

  dispose() {
    this.mixer.removeEventListener("finished", this.onMixerFinished);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    for (const material of this.toonMaterials) material.dispose();
    for (const material of this.outlineMaterials) material.dispose();
    for (const geometry of this.ownedOutlineGeometries) geometry.dispose();
    this.gradientMap.dispose();
    this.listeners.clear();
  }

  private prepareVisuals(style: CrowStyleSettings) {
    const meshes: THREE.Mesh[] = [];
    this.model.traverse((object) => {
      object.userData.actorId = this.id;
      if (object instanceof THREE.Mesh) meshes.push(object);
    });

    for (const mesh of meshes) {
      const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const diffuseMap = sourceMaterial instanceof THREE.MeshStandardMaterial ? sourceMaterial.map : null;
      if (diffuseMap) diffuseMap.colorSpace = THREE.SRGBColorSpace;
      const toonMaterial = createStylizedRockMaterial(diffuseMap, this.gradientMap, this.hatchUniforms);
      toonMaterial.name = "Reference crow alpha-tested toon material";
      toonMaterial.alphaTest = 0.33;
      toonMaterial.transparent = false;
      toonMaterial.depthWrite = true;
      toonMaterial.side = THREE.DoubleSide;
      mesh.material = toonMaterial;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.toonMaterials.push(toonMaterial);

      const outlineGeometry = createSmoothedOutlineGeometry(mesh.geometry);
      const outlineMaterial = createOutlineMaterial(style.outlineColor, { alphaMap: diffuseMap, alphaTest: 0.33 });
      outlineMaterial.uniforms.uThickness.value = style.outlineThickness;
      const outline = mesh instanceof THREE.SkinnedMesh
        ? new THREE.SkinnedMesh(outlineGeometry, outlineMaterial)
        : new THREE.Mesh(outlineGeometry, outlineMaterial);
      if (outline instanceof THREE.SkinnedMesh && mesh instanceof THREE.SkinnedMesh) {
        outline.bindMode = mesh.bindMode;
        outline.bind(mesh.skeleton, mesh.bindMatrix);
        outline.bindMatrixInverse.copy(mesh.bindMatrixInverse);
      }
      outline.name = `${mesh.name || "crow"}-outline`;
      outline.renderOrder = -1;
      outline.frustumCulled = false;
      mesh.add(outline);
      this.outlineMaterials.push(outlineMaterial);
      this.ownedOutlineGeometries.push(outlineGeometry);
    }
  }

  private updateGroundMovement(delta: number, resolveSurface?: (x: number, z: number) => number | null) {
    if (!this.target) return;
    this.direction.subVectors(this.target, this.root.position);
    this.direction.y = 0;
    const remaining = this.direction.length();
    const speed = this.state === "RUNNING" ? this.config.runSpeed : this.config.walkSpeed;
    const step = speed * delta;
    if (remaining <= step) {
      this.root.position.copy(this.target);
      this.resumeIdle();
      return;
    }
    this.direction.multiplyScalar(1 / remaining);
    this.nextPosition.copy(this.root.position).addScaledVector(this.direction, step);
    const surfaceY = resolveSurface?.(this.nextPosition.x, this.nextPosition.z);
    if (surfaceY !== null && surfaceY !== undefined) this.nextPosition.y = surfaceY + this.config.groundOffset;
    this.root.position.copy(this.nextPosition);
    this.faceDirection(this.direction, delta);
  }

  private beginFlight() {
    if (!this.target || !this.flightCurve) return this.resumeIdle();
    this.sequence = null;
    this.setState("FLYING", this.config.flightSpeed);
    this.playSemantic("fly", true);
  }

  private updateFlight(delta: number) {
    if (!this.target || !this.flightCurve) return;
    this.flightProgress = Math.min(1, this.flightProgress + delta / this.flightDuration);
    this.flightCurve.getPoint(this.flightProgress, this.nextPosition);
    this.flightCurve.getTangent(Math.min(this.flightProgress + 0.01, 1), this.flightTangent);
    this.root.position.copy(this.nextPosition);
    this.flightTangent.y = 0;
    if (this.flightTangent.lengthSq() > 1e-6) this.faceDirection(this.flightTangent.normalize(), delta);
    if (this.flightProgress < 1) return;
    this.root.position.copy(this.target);
    this.setState("LANDING", 0);
    if (!this.playSemantic("landing", false, "landing")) this.resumeIdle();
  }

  private faceDirection(direction: THREE.Vector3, delta: number) {
    const targetYaw = Math.atan2(direction.x, direction.z) + this.config.modelForwardYaw;
    this.root.rotation.y = dampCrowAngle(this.root.rotation.y, targetYaw, this.config.rotationSpeed, delta);
  }

  private playSemantic(role: CrowAnimationRole, loop: boolean, sequence: "takeoff" | "landing" | null = null) {
    const resolved = this.resolved[role];
    if (!resolved) {
      console.warn(`[CrowActor] Missing semantic animation: ${role}.`);
      return false;
    }
    this.sequence = sequence;
    return this.playResolved(resolved, loop);
  }

  private playResolved(resolved: ResolvedCrowAnimation, loop: boolean) {
    const action = this.actions.get(resolved.clip.name);
    if (!action) return false;
    const direction = resolved.reversed ? -1 : 1;
    if (this.currentAction === action && this.currentDirection === direction && action.isRunning()) return true;
    const previous = this.currentAction;
    if (previous && previous !== action) previous.fadeOut(this.config.animationFadeDuration);
    if (previous === action) action.stop();
    action.enabled = true;
    action.reset();
    action.setEffectiveTimeScale(direction);
    action.setEffectiveWeight(1);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    if (resolved.reversed) action.time = resolved.clip.duration;
    action.fadeIn(this.config.animationFadeDuration).play();
    this.currentAction = action;
    this.currentDirection = direction;
    this.currentAnimation = resolved.reversed ? `${resolved.clip.name} (reversed)` : resolved.clip.name;
    this.emit();
    return true;
  }

  private setState(state: CrowState, speed: number) {
    this.state = state;
    this.currentSpeed = speed;
    this.emit();
  }

  private emit() {
    this.revision += 1;
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}

function wrap(clip: THREE.AnimationClip | null): ResolvedCrowAnimation | null {
  return clip ? { clip, reversed: false } : null;
}

function scoreClip(clip: THREE.AnimationClip, role: string) {
  const normalized = normalizeCrowClipName(clip.name);
  const exact = normalized === `animcrow${role}` ? 0 : 10;
  const ambientPenalty = normalized.includes("village") || normalized.includes("lobby") ? 100 : 0;
  return exact + ambientPenalty + clip.duration;
}
