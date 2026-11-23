import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Actor, APPEAR_SECONDS, appearSize, dampAngle, DEFAULT_ACTOR, flightCurve, resolveActor, resolveActorClips } from "./actor";

const clip = (name: string, duration = 1) => new THREE.AnimationClip(name, duration, [new THREE.NumberKeyframeTrack(".position[x]", [0, duration], [0, 0])]);
const CROW_CLIPS = ["ANIM_Crow_IdleLookAround", "ANIM_Crow_Walk", "ANIM_Crow_Run", "ANIM_Crow_TakeOff", "ANIM_Crow_Fly", "Crow_Fly_Village_Loop"].map((name) => clip(name, name.includes("Village") ? 18 : 1));
const flat = () => 2;

describe("actor", () => {
  it("finds the crow's clips by name, prefers short clips over ambient loops, and lands by playing take-off backwards", () => {
    const roles = resolveActorClips(CROW_CLIPS);
    expect(roles.idle?.clip.name).toBe("ANIM_Crow_IdleLookAround");
    expect(roles.fly?.clip.name).toBe("ANIM_Crow_Fly");
    expect(roles.takeoff?.clip.name).toBe("ANIM_Crow_TakeOff");
    expect(roles.landing).toMatchObject({ reversed: true });
    expect(roles.landing?.clip.name).toBe("ANIM_Crow_TakeOff");
  });

  it("turns the short way and arcs its flight above the higher end", () => {
    expect(dampAngle(0, Math.PI * 1.5, 1000, 1)).toBeCloseTo(-Math.PI / 2, 5);
    const curve = flightCurve(new THREE.Vector3(0, 2, 0), new THREE.Vector3(10, 4, 0), 3);
    expect(curve.v1.y).toBe(7);
    expect(resolveActor({ walkSpeed: 1 }, { walkSpeed: 2 })).toEqual({ ...DEFAULT_ACTOR, walkSpeed: 2 });
  });

  it("walks to a point on the ground, faces it, and rests there", () => {
    const actor = new Actor(new THREE.Object3D(), CROW_CLIPS, { ...DEFAULT_ACTOR, walkSpeed: 2 }, { position: new THREE.Vector3(0, 2, 0), yaw: 0 });
    actor.goTo(new THREE.Vector3(4, 2, 0), "walk");
    expect(actor.status).toMatchObject({ state: "walking", animation: "ANIM_Crow_Walk" });
    for (let step = 0; step < 60; step += 1) actor.update(1 / 30, flat);
    expect(actor.position.x).toBeCloseTo(4, 3);
    expect(actor.status).toMatchObject({ state: "idle", animation: "ANIM_Crow_IdleLookAround" });
    expect(actor.yaw).toBeCloseTo(Math.PI / 2, 1); // facing +X
    expect(actor.busy).toBe(false);
  });

  it("takes off, flies the arc and lands at the target", () => {
    const actor = new Actor(new THREE.Object3D(), CROW_CLIPS, DEFAULT_ACTOR, { position: new THREE.Vector3(0, 2, 0), yaw: 0 });
    actor.goTo(new THREE.Vector3(0, 2, 8), "flight");
    expect(actor.status.state).toBe("taking-off");
    const seen = new Set<string>();
    let highest = 0;
    for (let step = 0; step < 400; step += 1) {
      actor.update(1 / 30, flat);
      seen.add(actor.status.state);
      highest = Math.max(highest, actor.position.y);
    }
    expect([...seen]).toEqual(expect.arrayContaining(["taking-off", "flying", "landing", "idle"]));
    expect(highest).toBeGreaterThan(3);
    expect(actor.position.toArray()).toEqual([0, 2, 8]);
  });

  it("previews a clip where it stands", () => {
    const actor = new Actor(new THREE.Object3D(), CROW_CLIPS, DEFAULT_ACTOR, { position: new THREE.Vector3(), yaw: 0 });
    expect(actor.preview("Crow_Fly_Village_Loop")).toBe(true);
    expect(actor.status).toMatchObject({ state: "preview", animation: "Crow_Fly_Village_Loop" });
    expect(actor.preview("Nope")).toBe(false);
    actor.rest();
    expect(actor.status.state).toBe("idle");
  });

  it("appears by popping up from nothing, a little over its size, and is busy until it settles", () => {
    expect(appearSize(0)).toBeLessThan(0.01);
    expect(Math.max(...Array.from({ length: 40 }, (_, step) => appearSize(step / 40)))).toBeGreaterThan(1);
    expect(appearSize(1)).toBe(1);
    const actor = new Actor(new THREE.Object3D(), CROW_CLIPS, DEFAULT_ACTOR, { position: new THREE.Vector3(), yaw: 0 });
    actor.appear(new THREE.Vector3(3, 2, 1));
    expect(actor.position.toArray()).toEqual([3, 2, 1]);
    expect(actor.size).toBeLessThan(0.01);
    expect(actor.busy).toBe(true);
    for (let step = 0; step * (1 / 30) < APPEAR_SECONDS + 0.05; step += 1) actor.update(1 / 30, flat);
    expect(actor.size).toBe(1);
    expect(actor.busy).toBe(false);
  });

  it("rests in another clip when told to, and in the idle clip again after", () => {
    const actor = new Actor(new THREE.Object3D(), [...CROW_CLIPS, clip("ArmsFolded")], DEFAULT_ACTOR, { position: new THREE.Vector3(), yaw: 0 });
    actor.setIdle("ArmsFolded");
    expect(actor.status).toMatchObject({ state: "idle", animation: "ArmsFolded" });
    actor.goTo(new THREE.Vector3(1, 2, 0), "walk");
    for (let step = 0; step < 60; step += 1) actor.update(1 / 30, flat);
    expect(actor.status.animation).toBe("ArmsFolded");
    actor.setIdle(null);
    expect(actor.status.animation).toBe("ANIM_Crow_IdleLookAround");
  });

  it("speeds up through walk, run and sprint, slows down to arrive, and plays each clip at a tempo that keeps the feet planted", () => {
    const clips = ["Idle", "Walk", "Run", "Sprint"].map((name) => clip(name));
    const config = { ...DEFAULT_ACTOR, walkSpeed: 1.15, runSpeed: 4.8, sprintSpeed: 7, acceleration: 9, walkClipSpeed: 1, runClipSpeed: 6, sprintClipSpeed: 8.7, crossfade: 0 };
    const actor = new Actor(new THREE.Object3D(), clips, config, { position: new THREE.Vector3(0, 2, 0), yaw: 0 });
    actor.followPath([new THREE.Vector3(0, 2, 15), new THREE.Vector3(0, 2, 30)], "sprint");
    const seen: string[] = [];
    let fastest = 0;
    let previousZ = 0;
    let lastStep = 0;
    for (let frame = 0; frame < 600 && actor.busy; frame += 1) {
      actor.update(1 / 60, flat);
      const name = actor.status.animation ?? "";
      if (seen[seen.length - 1] !== name) seen.push(name);
      const speed = (actor.position.z - previousZ) * 60;
      previousZ = actor.position.z;
      if (speed > 0) lastStep = speed;
      fastest = Math.max(fastest, speed);
      if (name === "Sprint") expect(speed / 8.7).toBeCloseTo((actor as unknown as { current: THREE.AnimationAction }).current.timeScale, 1);
    }
    expect(seen).toEqual(["Walk", "Run", "Sprint", "Run", "Walk", "Idle"]);
    expect(fastest).toBeCloseTo(7, 1);
    expect(lastStep).toBeLessThan(1);
    expect(actor.position.z).toBeCloseTo(30, 3);
  });

  it("without acceleration or clip speeds it moves as before: at once at its gait's speed, clips at their own tempo", () => {
    const actor = new Actor(new THREE.Object3D(), CROW_CLIPS, DEFAULT_ACTOR, { position: new THREE.Vector3(0, 2, 0), yaw: 0 });
    actor.goTo(new THREE.Vector3(10, 2, 0), "run");
    actor.update(0.1, flat);
    expect(actor.position.x).toBeCloseTo(DEFAULT_ACTOR.runSpeed * 0.1, 5);
    expect(actor.status.animation).toBe("ANIM_Crow_Run");
  });
});
