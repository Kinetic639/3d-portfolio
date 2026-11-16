import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createCrowFlightCurve,
  dampCrowAngle,
  resolveCrowAnimations,
  sanitizeCrowAnimationClips,
} from "./crow-actor";

describe("crow actor animation helpers", () => {
  it("resolves short semantic clips and reverses takeoff when landing is absent", () => {
    const clips = [
      new THREE.AnimationClip("Crow_Fly_Village_Loop", 18, []),
      new THREE.AnimationClip("ANIM_Crow_Fly", 1, []),
      new THREE.AnimationClip("ANIM_Crow_IdleLookAround", 4, []),
      new THREE.AnimationClip("ANIM_Crow_TakeOff", 2, []),
      new THREE.AnimationClip("ANIM_Crow_Walk", 1, []),
      new THREE.AnimationClip("ANIM_Crow_Run", 1, []),
    ];

    const resolved = resolveCrowAnimations(clips);
    expect(resolved.fly?.clip.name).toBe("ANIM_Crow_Fly");
    expect(resolved.landing?.clip.name).toBe("ANIM_Crow_TakeOff");
    expect(resolved.landing?.reversed).toBe(true);
  });

  it("removes actor root translation without removing skeletal translation", () => {
    const rootTrack = new THREE.VectorKeyframeTrack("root.position", [0, 1], [0, 0, 0, 4, 2, 8]);
    const boneTrack = new THREE.VectorKeyframeTrack("CROW_-Pelvis.position", [0, 1], [0, 0, 0, 0, 0.1, 0]);
    const source = new THREE.AnimationClip("Crow_Lobby", 1, [rootTrack, boneTrack]);
    const result = sanitizeCrowAnimationClips([source]);

    expect(result.removedRootTranslationTracks).toBe(1);
    expect(result.clips[0].tracks.map((track) => track.name)).toEqual(["CROW_-Pelvis.position"]);
    expect(source.tracks).toHaveLength(2);
  });

  it("creates an elevated curved flight path ending exactly at its destination", () => {
    const start = new THREE.Vector3(0, 1, 0);
    const target = new THREE.Vector3(6, 2, 4);
    const curve = createCrowFlightCurve(start, target, 4);

    expect(curve.getPoint(0).distanceTo(start)).toBeLessThan(1e-7);
    expect(curve.getPoint(1).distanceTo(target)).toBeLessThan(1e-7);
    expect(curve.getPoint(0.5).y).toBeGreaterThan(Math.max(start.y, target.y));
  });

  it("rotates across the shortest angular distance", () => {
    const current = Math.PI - 0.05;
    const target = -Math.PI + 0.05;
    const next = dampCrowAngle(current, target, 10, 1 / 60);
    expect(next).toBeGreaterThan(current);
    expect(next - current).toBeLessThan(0.05);
  });
});
