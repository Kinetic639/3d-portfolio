import * as THREE from "three";
import type { ModelActorSettings } from "@/lib/maps/map-definition";

/**
 * A creature that moves where it is sent: the style lab's crow controller
 * (crow-actor.ts on the old prototype) without React and without its own
 * materials (toon shading and outlines come from the entity layer).
 *
 * States: idle, walking, running, taking off, flying (a quadratic arc over
 * the ground at `flightHeight`), landing, and previewing a clip. Clips are
 * found by name ("idle", "walk", "run", "takeoff", "fly", "land"); landing
 * plays take-off backwards when there is no landing clip, as in the lab.
 * Root motion is removed by the model pipeline (`rootMotionNode`).
 *
 * The actor owns only a position and a heading; the entity layer turns them
 * into the model's matrix.
 */
export type ActorState = "idle" | "walking" | "running" | "taking-off" | "flying" | "landing" | "preview";
export type ActorMovement = "walk" | "run" | "flight";
export type ActorConfig = Required<ModelActorSettings>;

/** The lab's crow defaults. Speeds in blocks per second. */
export const DEFAULT_ACTOR: ActorConfig = {
  walkSpeed: 0.75,
  runSpeed: 1.65,
  flightSpeed: 2.8,
  flightHeight: 3,
  turnSpeed: 7,
  crossfade: 0.2,
  groundOffset: 0,
  forwardYaw: 0,
};

export const resolveActor = (defaults: ModelActorSettings | undefined, overrides: ModelActorSettings | undefined): ActorConfig => ({ ...DEFAULT_ACTOR, ...defaults, ...overrides });

type Role = "idle" | "walk" | "run" | "takeoff" | "fly";
type Resolved = { clip: THREE.AnimationClip; reversed: boolean };

const normalise = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const LOOPING = /(idle|fly|walk|run|loop|lobby)/;
/** How long appearing takes (a pop: grows from nothing, overshoots a little, settles). */
export const APPEAR_SECONDS = 0.45;

/** Size while appearing, 0..1 of the way: from nothing, a little over, then exactly 1. */
export function appearSize(progress: number) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  const eased = 1 - Math.pow(1 - t, 3);
  return 0.001 + 0.999 * eased + Math.sin(Math.PI * t) * (1 - t) * 0.35;
}

/** How fast a walking creature's height follows the ground, per second: about 0.1 s to settle on a step. */
const STEP_RATE = 30;

/** The best clip for a role: name contains the role; long ambient loops ("village", "lobby") last. */
export function resolveActorClips(clips: readonly THREE.AnimationClip[]) {
  const find = (role: Role) => clips
    .filter((clip) => normalise(clip.name).includes(role))
    .sort((a, b) => score(a) - score(b))[0] ?? null;
  const score = (clip: THREE.AnimationClip) => {
    const name = normalise(clip.name);
    return (name.includes("village") || name.includes("lobby") ? 100 : 0) + clip.duration;
  };
  const wrap = (clip: THREE.AnimationClip | null): Resolved | null => (clip ? { clip, reversed: false } : null);
  const takeoff = find("takeoff");
  const landing = clips.find((clip) => /landing|land(?!s)/.test(normalise(clip.name)) && !normalise(clip.name).includes("takeoff")) ?? null;
  return {
    idle: wrap(find("idle")),
    walk: wrap(find("walk")),
    run: wrap(find("run")),
    takeoff: wrap(takeoff),
    fly: wrap(find("fly")),
    landing: landing ? { clip: landing, reversed: false } : takeoff ? { clip: takeoff, reversed: true } : null,
  };
}

/** Shortest-way turn towards an angle, eased (the lab's dampCrowAngle). */
export function dampAngle(current: number, target: number, rate: number, delta: number) {
  const difference = THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + difference * (1 - Math.exp(-rate * delta));
}

/** The lab's flight: a quadratic arc whose middle is `height` above the higher end. */
export function flightCurve(start: THREE.Vector3, target: THREE.Vector3, height: number) {
  const control = start.clone().lerp(target, 0.5);
  control.y = Math.max(start.y, target.y) + height;
  return new THREE.QuadraticBezierCurve3(start.clone(), control, target.clone());
}

export class Actor {
  readonly position: THREE.Vector3;
  /** Heading in radians, as the model's rotation about Y. */
  yaw: number;
  /** Size, as a factor of its own (1 at rest; less while appearing). */
  size = 1;
  readonly clips: readonly THREE.AnimationClip[];
  private config: ActorConfig;
  private state: ActorState = "idle";
  /** A heading to turn to in place, while idle (the guide facing the visitor); null when there is none. */
  private facing: number | null = null;
  /** The rest of a path being walked (after the current target). */
  private waypoints: THREE.Vector3[] = [];
  /** A clip to rest in instead of the idle one (arms folded); null for the idle clip. */
  private idleOverride: Resolved | null = null;
  /** Seconds into appearing, or null when it is not appearing. */
  private appearing: number | null = null;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly roles: ReturnType<typeof resolveActorClips>;
  private current: THREE.AnimationAction | null = null;
  private currentName: string | null = null;
  private currentDirection = 1;
  private target: THREE.Vector3 | null = null;
  private curve: THREE.QuadraticBezierCurve3 | null = null;
  private progress = 0;
  private duration = 1;
  private sequence: "takeoff" | "landing" | "manual" | null = null;
  private readonly step = new THREE.Vector3();
  private readonly next = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly onFinished = (event: { action: THREE.AnimationAction }) => {
    if (event.action !== this.current) return;
    if (this.sequence === "takeoff") this.beginFlight();
    else if (this.sequence === "landing" || this.sequence === "manual") this.rest();
  };

  constructor(root: THREE.Object3D, clips: readonly THREE.AnimationClip[], config: ActorConfig, start: { position: THREE.Vector3; yaw: number }) {
    this.position = start.position.clone();
    this.yaw = start.yaw;
    this.config = config;
    this.clips = clips;
    this.mixer = new THREE.AnimationMixer(root);
    this.mixer.addEventListener("finished", this.onFinished as never);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.roles = resolveActorClips(clips);
    this.play(this.roles.idle, true);
    this.mixer.update(0);
  }

  get status() {
    return { state: this.state, animation: this.currentName, target: this.target ? this.target.clone() : null };
  }

  /** True while it travels, turns in place or plays a one-off clip (take-off, landing, preview). */
  get busy() {
    return this.state !== "idle" || this.facing !== null || this.appearing !== null;
  }

  /** Turns in place to a heading (radians), once it is not travelling. */
  turnTo(yaw: number) {
    this.facing = yaw;
  }

  /** Puts it at a point at once (no travel), resting. */
  placeAt(position: THREE.Vector3) {
    this.position.copy(position).add(new THREE.Vector3(0, this.config.groundOffset, 0));
    this.facing = null;
    this.rest();
  }

  /** Puts it at a point, popping up there from nothing. */
  appear(position: THREE.Vector3) {
    this.placeAt(position);
    this.appearing = 0;
    this.size = appearSize(0);
  }

  /** Rests in another looping clip (by name) instead of the idle one, or in the idle one again (null). */
  setIdle(name: string | null) {
    const clip = name ? this.clips.find((candidate) => candidate.name === name) : null;
    this.idleOverride = clip ? { clip, reversed: false } : null;
    if (this.state === "idle") this.play(this.idleOverride ?? this.roles.idle, true);
  }

  setConfig(config: ActorConfig) {
    this.config = config;
  }

  /** Walks (or runs) through points on the ground, one after another, without stopping between them. */
  followPath(points: THREE.Vector3[], movement: "walk" | "run") {
    if (points.length === 0) return;
    this.goTo(points[0], movement);
    this.waypoints = points.slice(1).map((point) => point.clone().add(new THREE.Vector3(0, this.config.groundOffset, 0)));
  }

  /** Sends it to a point on the ground. */
  goTo(destination: THREE.Vector3, movement: ActorMovement) {
    this.facing = null;
    this.waypoints = [];
    this.target = destination.clone().add(new THREE.Vector3(0, this.config.groundOffset, 0));
    this.sequence = null;
    if (movement === "flight") {
      this.curve = flightCurve(this.position, this.target, this.config.flightHeight);
      this.progress = 0;
      this.duration = Math.max(this.curve.getLength() / this.config.flightSpeed, 0.01);
      this.state = "taking-off";
      if (!this.play(this.roles.takeoff, false, "takeoff")) this.beginFlight();
      return;
    }
    this.curve = null;
    this.state = movement === "run" ? "running" : "walking";
    this.play(movement === "run" ? this.roles.run : this.roles.walk, true);
  }

  /** The lab's clip preview: plays any clip where the actor stands. */
  preview(name: string) {
    const clip = this.clips.find((candidate) => candidate.name === name);
    if (!clip) return false;
    this.target = null;
    this.curve = null;
    this.state = "preview";
    const loop = LOOPING.test(normalise(clip.name));
    this.sequence = loop ? null : "manual";
    return this.playResolved({ clip, reversed: false }, loop);
  }

  rest() {
    this.target = null;
    this.curve = null;
    this.sequence = null;
    this.state = "idle";
    this.play(this.idleOverride ?? this.roles.idle, true);
  }

  /** Moves and animates. `animate` false skips the skeleton (out of view); movement still advances. */
  update(delta: number, groundAt: (x: number, z: number) => number, animate = true) {
    if (animate) this.mixer.update(delta);
    if (this.appearing !== null) {
      this.appearing += delta;
      const progress = this.appearing / APPEAR_SECONDS;
      this.size = progress >= 1 ? 1 : appearSize(progress);
      if (progress >= 1) this.appearing = null;
    }
    if (!this.target) {
      // Turning in place also while a clip plays where it stands (a gesture towards something).
      if (this.facing !== null && (this.state === "idle" || this.state === "preview")) {
        this.yaw = dampAngle(this.yaw, this.facing, this.config.turnSpeed, delta);
        const left = THREE.MathUtils.euclideanModulo(this.facing - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
        if (Math.abs(left) < 0.01) {
          this.yaw = this.facing;
          this.facing = null;
        }
      }
      return;
    }
    if (this.state === "walking" || this.state === "running") this.walk(delta, groundAt);
    else if (this.state === "flying") this.fly(delta);
  }

  /** Planned flight path, for debugging views. */
  path(segments = 32) {
    return this.curve?.getPoints(segments) ?? [];
  }

  dispose() {
    this.mixer.removeEventListener("finished", this.onFinished as never);
    this.mixer.stopAllAction();
  }

  private walk(delta: number, groundAt: (x: number, z: number) => number) {
    const target = this.target!;
    this.step.subVectors(target, this.position);
    this.step.y = 0;
    const remaining = this.step.length();
    const distance = (this.state === "running" ? this.config.runSpeed : this.config.walkSpeed) * delta;
    if (remaining <= distance) {
      // On to the next point of a path, carrying on with the same gait.
      const next = this.waypoints.shift();
      if (next) {
        this.target = next;
        return;
      }
      this.position.copy(target);
      this.rest();
      return;
    }
    this.step.multiplyScalar(1 / remaining);
    this.next.copy(this.position).addScaledVector(this.step, distance);
    // Up and down steps over about a tenth of a second instead of in one frame.
    const ground = groundAt(this.next.x, this.next.z) + this.config.groundOffset;
    this.next.y = this.position.y + (ground - this.position.y) * (1 - Math.exp(-STEP_RATE * delta));
    this.position.copy(this.next);
    this.face(this.step, delta);
  }

  private beginFlight() {
    if (!this.target || !this.curve) {
      this.rest();
      return;
    }
    this.sequence = null;
    this.state = "flying";
    this.play(this.roles.fly, true);
  }

  private fly(delta: number) {
    const curve = this.curve!;
    this.progress = Math.min(1, this.progress + delta / this.duration);
    curve.getPoint(this.progress, this.next);
    curve.getTangent(Math.min(this.progress + 0.01, 1), this.tangent);
    this.position.copy(this.next);
    this.tangent.y = 0;
    if (this.tangent.lengthSq() > 1e-6) this.face(this.tangent.normalize(), delta);
    if (this.progress < 1) return;
    this.position.copy(this.target!);
    this.state = "landing";
    if (!this.play(this.roles.landing, false, "landing")) this.rest();
  }

  private face(direction: THREE.Vector3, delta: number) {
    const goal = Math.atan2(direction.x, direction.z) + THREE.MathUtils.degToRad(this.config.forwardYaw);
    this.yaw = dampAngle(this.yaw, goal, this.config.turnSpeed, delta);
  }

  private play(resolved: Resolved | null, loop: boolean, sequence: "takeoff" | "landing" | null = null) {
    if (!resolved) return false;
    this.sequence = sequence;
    return this.playResolved(resolved, loop);
  }

  private playResolved(resolved: Resolved, loop: boolean) {
    const action = this.actions.get(resolved.clip.name);
    if (!action) return false;
    const direction = resolved.reversed ? -1 : 1;
    if (this.current === action && this.currentDirection === direction && action.isRunning()) return true;
    const previous = this.current;
    if (previous && previous !== action) previous.fadeOut(this.config.crossfade);
    if (previous === action) action.stop();
    action.enabled = true;
    action.reset();
    action.setEffectiveTimeScale(direction);
    action.setEffectiveWeight(1);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    if (resolved.reversed) action.time = resolved.clip.duration;
    action.fadeIn(this.config.crossfade).play();
    this.current = action;
    this.currentDirection = direction;
    this.currentName = resolved.reversed ? `${resolved.clip.name} (reversed)` : resolved.clip.name;
    return true;
  }
}
