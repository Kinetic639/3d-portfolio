import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  ENTRY_SECONDS,
  FOCUS_SECONDS,
  loaderView,
  POP_SECONDS,
  POP_STAGGER_SECONDS,
  popDelay,
  rehearsalTimes,
  sampleEntry,
  samplePop,
  type EntryPlan,
} from "./entry-sequence";

const plan: EntryPlan = {
  platformX: 0,
  platformZ: 0,
  platformTop: 2.5,
  finalPosition: new THREE.Vector3(16, 8.6, 16),
  finalTarget: new THREE.Vector3(0, 2.8, 0),
};

describe("entry sequence", () => {
  it("starts at the loader view and ends exactly at the visitor's resting view", () => {
    const position = new THREE.Vector3();
    const target = new THREE.Vector3();
    const loaderPosition = new THREE.Vector3();
    const loaderTarget = new THREE.Vector3();
    loaderView(plan, loaderPosition, loaderTarget);
    // The original's landing camera.
    expect(loaderPosition.toArray()).toEqual([-18, 20, 54]);
    expect(loaderTarget.toArray()).toEqual([0, 17, 0]);

    const start = sampleEntry(plan, 0, position, target);
    expect(position.distanceTo(loaderPosition)).toBeLessThan(1e-9);
    expect(start).toMatchObject({ wave: 0, done: false });

    const end = sampleEntry(plan, ENTRY_SECONDS, position, target);
    expect(end.done).toBe(true);
    expect(position.distanceTo(plan.finalPosition)).toBeLessThan(1e-9);
    expect(target.distanceTo(plan.finalTarget)).toBeLessThan(1e-9);
  });

  it("moves continuously: no jump between consecutive frames", () => {
    const previous = new THREE.Vector3();
    const position = new THREE.Vector3();
    const target = new THREE.Vector3();
    sampleEntry(plan, 0, previous, target);
    let largest = 0;
    for (let seconds = 1 / 60; seconds <= ENTRY_SECONDS; seconds += 1 / 60) {
      sampleEntry(plan, seconds, position, target);
      largest = Math.max(largest, position.distanceTo(previous));
      previous.copy(position);
    }
    // The swing out is fast (as in the original), but never a jump.
    expect(largest).toBeLessThan(2.5);

    // The three parts of the path meet where they hand over.
    const before = new THREE.Vector3();
    const after = new THREE.Vector3();
    for (const boundary of [FOCUS_SECONDS, FOCUS_SECONDS + 0.8]) {
      sampleEntry(plan, boundary - 1e-6, before, target);
      sampleEntry(plan, boundary + 1e-6, after, target);
      expect(before.distanceTo(after)).toBeLessThan(1e-3);
    }
  });

  it("follows the platform: a raised or moved platform shifts the whole path", () => {
    const moved = { ...plan, platformX: 10, platformZ: -4, platformTop: 5.5 };
    const position = new THREE.Vector3();
    const target = new THREE.Vector3();
    loaderView(moved, position, target);
    expect(position.toArray()).toEqual([-8, 23, 50]);
  });

  it("grows the terrain only after the focus and pops objects once the original area is grown", () => {
    const position = new THREE.Vector3();
    const target = new THREE.Vector3();
    expect(sampleEntry(plan, FOCUS_SECONDS - 0.01, position, target).wave).toBe(0);
    const twoSecondsIn = sampleEntry(plan, FOCUS_SECONDS + 2, position, target);
    expect(twoSecondsIn.wave).toBeCloseTo(1, 6);
    expect(twoSecondsIn.popSeconds).toBeCloseTo(0, 6);
    expect(sampleEntry(plan, FOCUS_SECONDS + 1, position, target).popSeconds).toBeLessThan(0);
  });

  it("rehearses the whole path", () => {
    const times = rehearsalTimes(12);
    expect(times[0]).toBe(0);
    expect(times[11]).toBeCloseTo(ENTRY_SECONDS, 9);
  });
});

describe("object pop", () => {
  it("is hidden before its delay, overshoots, and rests at full size", () => {
    expect(samplePop(-1, 0).scale).toBeLessThan(0.01);
    const peak = Math.max(...Array.from({ length: 60 }, (_, step) => samplePop((step / 60) * POP_SECONDS, 0).scale));
    expect(peak).toBeGreaterThan(1);
    const rest = samplePop(POP_SECONDS, 0);
    expect(rest.scale).toBeCloseTo(1, 9);
    for (const value of [rest.lift, rest.tiltX, rest.tiltZ]) expect(value).toBeCloseTo(0, 9);
  });

  it("starts near objects first and is the same on every visit", () => {
    expect(popDelay(0, "a")).toBeLessThan(popDelay(1, "a"));
    expect(popDelay(0.5, "house")).toBe(popDelay(0.5, "house"));
    expect(popDelay(1, "x")).toBeLessThanOrEqual(POP_STAGGER_SECONDS);
  });
});
