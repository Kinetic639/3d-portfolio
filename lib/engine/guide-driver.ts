import * as THREE from "three";
import type { NavGrid } from "@/lib/navigation/nav-grid";
import { findPath, nearestStandable, pathLength } from "@/lib/navigation/path";
import type { PlacedActor } from "./entity-meshes";
import { GUIDE, guideSpot, yawTowards, type Point } from "./guide";

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
 * object and gestures at it once.
 *
 * The engine calls `update` every frame it draws; after the camera stops it
 * asks `wantsToAct` once, and draws a frame only when the guide has
 * something to do (a still world stays still).
 */
export class GuideDriver {
  private restingSince = 0;
  private attention: Point | null = null;
  private reacted = false;
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

  update(now: number, cameraMoving: boolean, target: Point, camera: Point, paused: boolean) {
    if (cameraMoving) {
      this.restingSince = now;
      return;
    }
    const actor = this.placed.actor;
    if (paused || now - this.restingSince < GUIDE.restMs || actor.busy) return;
    const here = { x: actor.position.x, z: actor.position.z };
    const spot = this.spotFor(target, camera);
    const distance = Math.hypot(spot.x - here.x, spot.z - here.z);
    if (distance <= GUIDE.slack) {
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
    const path = distance > GUIDE.appearFrom || !this.nav ? null : findPath(this.nav, here, spot);
    if (!path) {
      // Too far to walk (a flight to a zone) or out of reach: it is there when the visitor arrives, and waves.
      actor.placeAt(this.onGround(spot));
      actor.yaw = yawTowards(spot, camera);
      actor.preview("Call");
      return;
    }
    const length = pathLength(here, path);
    if (length > GUIDE.appearFrom * 1.5) {
      // A long way round (a river, a wall): appearing beats a long walk the visitor would not watch.
      actor.placeAt(this.onGround(spot));
      actor.yaw = yawTowards(spot, camera);
      actor.preview("Call");
      return;
    }
    actor.followPath(path.map((point) => this.onGround(point)), length > GUIDE.runFrom ? "run" : "walk");
  }

  /** Where to stand for a view: in front of what the camera looks at, on a column it can stand in. */
  private spotFor(target: Point, camera: Point): Point {
    const spot = guideSpot(target, camera);
    return (this.nav && nearestStandable(this.nav, spot, 4)) ?? spot;
  }

  private onGround(point: Point) {
    return new THREE.Vector3(point.x, this.groundAt(point.x, point.z), point.z);
  }
}
