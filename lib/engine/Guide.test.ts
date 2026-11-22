import { describe, expect, it } from "vitest";
import { GUIDE, guideSpot, planGuideMove, yawTowards } from "./guide";

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
});
