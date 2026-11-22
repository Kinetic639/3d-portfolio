import * as THREE from "three";
import type { PlacedActor } from "./entity-meshes";
import { GUIDE, planGuideMove, yawTowards, type Point } from "./guide";

const angleBetween = (a: number, b: number) => Math.abs(THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI);

/**
 * Drives the guide's actor from the camera (docs/roadmap.md, B6): when the
 * camera has been still for a moment, the guide walks or runs to stand near
 * what it looks at, or appears there when that is far (a flight to a zone);
 * then it turns to face the visitor. While content is open it turns to the
 * object and gestures at it once.
 *
 * The engine calls `update` every frame it draws, and draws one frame after
 * the camera stops so the guide can decide (see WorldEngine).
 */
export class GuideDriver {
  private restingSince = 0;
  private attention: Point | null = null;
  private reacted = false;

  constructor(
    readonly placed: PlacedActor,
    private readonly groundAt: (x: number, z: number) => number,
    private readonly home: { position: THREE.Vector3; yaw: number },
  ) {}

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

  update(now: number, cameraMoving: boolean, target: Point, camera: Point, paused: boolean) {
    if (cameraMoving) {
      this.restingSince = now;
      return;
    }
    const actor = this.placed.actor;
    if (paused || now - this.restingSince < GUIDE.restMs || actor.busy) return;
    const here = { x: actor.position.x, z: actor.position.z };
    const move = planGuideMove(here, target, camera);
    if (move.kind === "stay") {
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
    const spot = new THREE.Vector3(move.spot.x, this.groundAt(move.spot.x, move.spot.z), move.spot.z);
    if (move.kind === "appear") {
      // Too far to walk (a flight to a zone): it is there when the visitor arrives, and waves.
      actor.placeAt(spot);
      actor.yaw = yawTowards(move.spot, camera);
      actor.preview("Call");
      return;
    }
    actor.goTo(spot, move.kind);
  }
}
