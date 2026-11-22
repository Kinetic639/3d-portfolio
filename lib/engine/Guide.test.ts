import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { Actor, DEFAULT_ACTOR } from "./actor";
import type { PlacedActor } from "./entity-meshes";
import { fidgetGap, GUIDE, guideSpot, IDLE, pickFidget, planGuideMove, yawTowards } from "./guide";
import { GuideDriver } from "./guide-driver";

describe("the guide's decisions", () => {
  const target = { x: 0, z: 0 };
  const camera = { x: 0, z: 30 };

  it("stands in front of what the camera looks at, towards the camera and a little aside", () => {
    const spot = guideSpot(target, camera);
    expect(spot.z).toBeCloseTo(GUIDE.standOff);
    expect(Math.abs(spot.x)).toBeCloseTo(GUIDE.aside);
  });

  it("stays when close, walks a little, runs further, appears from far away", () => {
    const spot = guideSpot(target, camera);
    expect(planGuideMove({ x: spot.x + 1, z: spot.z }, target, camera).kind).toBe("stay");
    expect(planGuideMove({ x: spot.x + 5, z: spot.z }, target, camera).kind).toBe("walk");
    expect(planGuideMove({ x: spot.x + 15, z: spot.z }, target, camera).kind).toBe("run");
    expect(planGuideMove({ x: spot.x + 60, z: spot.z }, target, camera).kind).toBe("appear");
  });

  it("faces a point: 0 looks along +z", () => {
    expect(yawTowards({ x: 0, z: 0 }, { x: 0, z: 5 })).toBeCloseTo(0);
    expect(yawTowards({ x: 0, z: 0 }, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2);
  });

  it("fidgets while it waits: looks aside or folds its arms, never arms twice in a row", () => {
    expect(pickFidget(() => 0.1, null).kind).toBe("arms");
    expect(pickFidget(() => 0.1, "arms").kind).toBe("look");
    const look = pickFidget(() => 0.9, null);
    expect(look.kind).toBe("look");
    if (look.kind === "look") expect(Math.abs(look.offset)).toBeLessThanOrEqual(IDLE.lookAngle[1]);
    expect(fidgetGap(() => 0)).toBe(IDLE.between[0]);
  });
});

describe("the guide waiting", () => {
  // The foot patch draws into a canvas; a stub is enough here.
  vi.stubGlobal("document", {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: "" }) }),
  });
  const clip = (name: string) => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack(".position[x]", [0, 1], [0, 0])]);
  const clips = ["Idle", "Walk", "Run", "Call", "Interact", "ArmsFolded"].map(clip);
  const target = { x: 0, z: 0 };
  const camera = { x: 0, z: 30 };

  function waitingGuide() {
    const spot = guideSpot(target, camera);
    const actor = new Actor(new THREE.Object3D(), clips, DEFAULT_ACTOR, { position: new THREE.Vector3(spot.x, 0, spot.z), yaw: yawTowards(spot, camera) });
    const placed: PlacedActor = { entityId: "guide", modelId: "guide", name: "Guide", actor, bounds: () => new THREE.Sphere() };
    const driver = new GuideDriver(placed, () => 0, null, { position: new THREE.Vector3(), yaw: 0 });
    const seen = new Set<string>();
    /** Runs it for some seconds of a still camera, 30 frames a second. */
    const run = (fromMs: number, seconds: number, quiet = false, random = () => 0.1) => {
      for (let ms = fromMs; ms < fromMs + seconds * 1000; ms += 1000 / 30) {
        driver.update(ms, false, target, camera, false, quiet, random);
        actor.update(1 / 30, () => 0);
        seen.add(actor.status.animation ?? "");
      }
    };
    return { actor, driver, seen, run };
  }

  it("folds its arms after a while, and later waves once", () => {
    const { seen, run } = waitingGuide();
    run(0, IDLE.firstAfter + 1);
    expect(seen.has("ArmsFolded")).toBe(true);
    expect(seen.has("Call")).toBe(false);
    run((IDLE.firstAfter + 1) * 1000, IDLE.waveAfter);
    expect(seen.has("Call")).toBe(true);
  });

  it("does nothing on its own when nobody sees it or motion is held", () => {
    const { actor, seen, run } = waitingGuide();
    run(0, IDLE.waveAfter + 5, true);
    expect([...seen]).toEqual(["Idle"]);
    expect(actor.busy).toBe(false);
  });

  it("appears (pops up) when the spot is far away", () => {
    const { actor, driver } = waitingGuide();
    driver.update(1000, false, { x: 200, z: 0 }, { x: 200, z: 30 }, false);
    expect(actor.position.x).toBeGreaterThan(190);
    expect(actor.size).toBeLessThan(0.01);
  });
});
