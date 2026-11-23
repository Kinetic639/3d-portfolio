import * as THREE from "three";
import type { NavGrid } from "@/lib/navigation/nav-grid";
import { findPath, nearestStandable, pathLength } from "@/lib/navigation/path";
import type { PlacedActor } from "./entity-meshes";
import { fidgetGap, GUIDE, guideSpot, IDLE, pickFidget, yawTowards, type Fidget, type Point } from "./guide";

/**
 * A soft dark patch under the guide's feet, which goes where it goes: it stands in for a cast shadow.
 * Casting into the shadow map, the skinned guide held the day/night switch to 30 fps (traced).
 */
function makeFootShadow() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(0,0,0,0.55)");
  gradient.addColorStop(0.55, "rgba(0,0,0,0.3)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = "guide-foot-shadow";
  mesh.renderOrder = 1;
  return mesh;
}

const angleBetween = (a: number, b: number) => Math.abs(THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI);

/**
 * Drives the guide's actor from the camera (docs/roadmap.md, B6): when the
 * camera has been still for a moment, the guide walks or runs to stand near
 * what it looks at, along a path around trees, walls and steps too high
 * (docs/navigation.md), or appears there when that is far or out of reach;
 * then it turns to face the visitor. While content is open it turns to the
 * object and gestures at it once. While it waits it looks around or folds
 * its arms now and then, and after a long quiet waves once (only in view,
 * and never with motion held: a still world stays still).
 *
 * The engine calls `update` every frame it draws; after the camera stops it
 * asks `wantsToAct` once, and draws a frame only when the guide has
 * something to do (a still world stays still).
 */
export class GuideDriver {
  private restingSince = 0;
  private attention: Point | null = null;
  private reacted = false;
  /** What it does while it waits, and until when (ms); null between fidgets. */
  private fidget: (Fidget & { until: number }) | null = null;
  private lastFidget: Fidget["kind"] | null = null;
  /** When the next fidget starts (ms); 0 until it has settled. */
  private nextFidgetAt = 0;
  private waved = false;
  /** The patch under its feet; the engine adds it to the scene. */
  readonly footShadow = makeFootShadow();

  constructor(
    readonly placed: PlacedActor,
    private readonly groundAt: (x: number, z: number) => number,
    private readonly nav: NavGrid | null,
    private readonly home: { position: THREE.Vector3; yaw: number },
  ) {}

  /** Keeps the patch under the feet (each frame the engine draws). */
  syncFootShadow() {
    const actor = this.placed.actor;
    this.footShadow.position.set(actor.position.x, this.groundAt(actor.position.x, actor.position.z) + 0.02, actor.position.z);
    this.footShadow.rotation.z = -actor.yaw;
    this.footShadow.scale.setScalar(actor.size);
  }

  dispose() {
    this.footShadow.geometry.dispose();
    (this.footShadow.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.footShadow.material as THREE.MeshBasicMaterial).dispose();
  }

  /** Back where it starts (the world was left; the next entry finds it at the arrival). */
  reset() {
    this.placed.actor.placeAt(this.home.position);
    this.placed.actor.yaw = this.home.yaw;
    this.attention = null;
    this.reacted = false;
    this.settle(0);
  }

  /** The end of the entry: it turns to the visitor and waves. */
  greet(camera: Point) {
    const actor = this.placed.actor;
    actor.turnTo(yawTowards(actor.position, camera));
    actor.preview("Call");
  }

  /** Something was opened (its object, on the ground), or closed (null). */
  attend(point: Point | null) {
    this.attention = point;
    this.reacted = false;
    this.settle(0);
  }

  /** Whether, with the camera at rest here, the guide would move, turn or gesture (so a frame is worth drawing). */
  wantsToAct(target: Point, camera: Point) {
    const actor = this.placed.actor;
    if (actor.busy) return true;
    const here = { x: actor.position.x, z: actor.position.z };
    const spot = this.spotFor(target, camera);
    if (Math.hypot(spot.x - here.x, spot.z - here.z) > GUIDE.slack) return true;
    if (this.attention) return !this.reacted;
    return angleBetween(actor.yaw, yawTowards(here, camera)) > 0.35;
  }

  /**
   * `quiet`: nobody would see it fidget (out of view) or motion is held; it
   * still goes where it should, but does nothing on its own.
   */
  update(now: number, cameraMoving: boolean, target: Point, camera: Point, paused: boolean, quiet = false, random: () => number = Math.random) {
    if (cameraMoving) {
      this.restingSince = now;
      this.waved = false;
      return;
    }
    const actor = this.placed.actor;
    if (paused || now - this.restingSince < GUIDE.restMs || actor.busy) return;
    const here = { x: actor.position.x, z: actor.position.z };
    const spot = this.spotFor(target, camera);
    const distance = Math.hypot(spot.x - here.x, spot.z - here.z);
    if (distance <= GUIDE.slack) {
      if (this.wait(now, here, camera, quiet, random)) return;
      if (this.attention) {
        // Once per opening: a look at the object and a gesture towards it.
        if (!this.reacted) {
          this.reacted = true;
          actor.turnTo(yawTowards(here, this.attention));
          actor.preview("Interact");
        }
        return;
      }
      const facing = yawTowards(here, camera);
      if (angleBetween(actor.yaw, facing) > 0.35) actor.turnTo(facing);
      return;
    }
    // On its way: whatever it was doing while it waited ends.
    this.settle(0);
    const path = distance > GUIDE.appearFrom || !this.nav ? null : findPath(this.nav, here, spot);
    if (!path) {
      // Too far to walk (a flight to a zone) or out of reach: it is there when the visitor arrives, and waves.
      actor.appear(this.onGround(spot));
      actor.yaw = yawTowards(spot, camera);
      actor.preview("Call");
      return;
    }
    const length = pathLength(here, path);
    if (length > GUIDE.appearFrom * 1.5) {
      // A long way round (a river, a wall): appearing beats a long walk the visitor would not watch.
      actor.appear(this.onGround(spot));
      actor.yaw = yawTowards(spot, camera);
      actor.preview("Call");
      return;
    }
    actor.followPath(path.map((point) => this.onGround(point)), length > GUIDE.sprintFrom ? "sprint" : length > GUIDE.runFrom ? "run" : "walk");
  }

  /**
   * Its life while it waits at its spot: fidgets and the one wave. Returns
   * true when it did something this frame (the rest of `update` waits).
   */
  private wait(now: number, here: Point, camera: Point, quiet: boolean, random: () => number) {
    const actor = this.placed.actor;
    if (quiet || this.attention) {
      if (this.fidget) this.endFidget(here, camera);
      return false;
    }
    if (this.fidget) {
      if (now < this.fidget.until) return true;
      this.endFidget(here, camera);
      this.nextFidgetAt = now + fidgetGap(random) * 1000;
      return true;
    }
    // Facing the visitor first; the waiting starts from there.
    if (angleBetween(actor.yaw, yawTowards(here, camera)) > 0.35) return false;
    if (this.nextFidgetAt === 0) {
      this.nextFidgetAt = now + IDLE.firstAfter * 1000;
      return false;
    }
    if (!this.waved && now - this.restingSince > IDLE.waveAfter * 1000) {
      this.waved = true;
      actor.preview("Call");
      return true;
    }
    if (now < this.nextFidgetAt) return false;
    const fidget = pickFidget(random, this.lastFidget);
    this.fidget = { ...fidget, until: now + fidget.seconds * 1000 };
    this.lastFidget = fidget.kind;
    if (fidget.kind === "arms") actor.setIdle("ArmsFolded");
    else actor.turnTo(yawTowards(here, camera) + fidget.offset);
    return true;
  }

  private endFidget(here: Point, camera: Point) {
    if (this.fidget?.kind === "arms") this.placed.actor.setIdle(null);
    else if (this.fidget?.kind === "look") this.placed.actor.turnTo(yawTowards(here, camera));
    this.fidget = null;
  }

  /** Stops waiting: no fidget, the idle clip again, and the countdown starts afresh when it next settles. */
  private settle(at: number) {
    if (this.fidget?.kind === "arms") this.placed.actor.setIdle(null);
    this.fidget = null;
    this.nextFidgetAt = at;
  }

  /** Where to stand for a view: in front of what the camera looks at, on a column it can stand in. */
  private spotFor(target: Point, camera: Point): Point {
    // Looking at the central platform (the arrival): its place is the middle of it.
    const home = this.home.position;
    if (Math.hypot(target.x - home.x, target.z - home.z) < GUIDE.slack) return { x: home.x, z: home.z };
    const spot = guideSpot(target, camera);
    return (this.nav && nearestStandable(this.nav, spot, 4)) ?? spot;
  }

  private onGround(point: Point) {
    return new THREE.Vector3(point.x, this.groundAt(point.x, point.z), point.z);
  }
}
