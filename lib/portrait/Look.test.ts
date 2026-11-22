import { describe, expect, it } from "vitest";
import { dampLook, glance, LOOK_LIMITS, lookTowards, looksEqual } from "./look";

describe("the portrait's look", () => {
  it("turns towards the pointer: right is positive yaw, up is positive pitch", () => {
    const right = lookTowards(900, 100, 100, 100);
    expect(right.yaw).toBeGreaterThan(0);
    expect(right.pitch).toBeCloseTo(0);
    const above = lookTowards(100, -300, 100, 100);
    expect(above.pitch).toBeGreaterThan(0);
    expect(above.yaw).toBeCloseTo(0);
  });

  it("stays within its limits, and bows less than it looks up", () => {
    expect(lookTowards(1e6, 0, 0, 0).yaw).toBe(LOOK_LIMITS.yaw);
    expect(lookTowards(-1e6, 0, 0, 0).yaw).toBe(-LOOK_LIMITS.yaw);
    expect(lookTowards(0, -1e6, 0, 0).pitch).toBe(LOOK_LIMITS.up);
    expect(lookTowards(0, 1e6, 0, 0).pitch).toBe(-LOOK_LIMITS.down);
    expect(LOOK_LIMITS.down).toBeLessThan(LOOK_LIMITS.up);
  });

  it("eases the same whatever the frame rate", () => {
    const target = { yaw: 0.5, pitch: 0.2 };
    let at30 = { yaw: 0, pitch: 0 };
    for (let i = 0; i < 30; i += 1) at30 = dampLook(at30, target, 5, 1 / 30);
    let at60 = { yaw: 0, pitch: 0 };
    for (let i = 0; i < 60; i += 1) at60 = dampLook(at60, target, 5, 1 / 60);
    expect(at30.yaw).toBeCloseTo(at60.yaw, 6);
    expect(looksEqual(at30, target, 0.01)).toBe(true);
  });

  it("glances somewhere calm, inside the limits", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const look = glance(() => r);
      expect(Math.abs(look.yaw)).toBeLessThanOrEqual(LOOK_LIMITS.yaw);
      expect(look.pitch).toBeLessThanOrEqual(LOOK_LIMITS.up);
      expect(look.pitch).toBeGreaterThanOrEqual(-LOOK_LIMITS.down);
    }
  });
});
