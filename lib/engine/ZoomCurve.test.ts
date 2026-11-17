import { describe, expect, it } from "vitest";
import { pitchOnCurve, VISITOR_CAMERA, VISITOR_ZOOM_CURVE } from "./camera-rig";

describe("zoom curve", () => {
  it("passes through its points and is flat beyond the ends", () => {
    for (const point of VISITOR_ZOOM_CURVE) expect(pitchOnCurve(VISITOR_ZOOM_CURVE, point.distance)).toBeCloseTo(point.pitchDegrees, 9);
    expect(pitchOnCurve(VISITOR_ZOOM_CURVE, 1)).toBe(VISITOR_ZOOM_CURVE[0].pitchDegrees);
    expect(pitchOnCurve(VISITOR_ZOOM_CURVE, 500)).toBe(VISITOR_ZOOM_CURVE[VISITOR_ZOOM_CURVE.length - 1].pitchDegrees);
  });

  it("only rises while zooming out: no dip or overshoot between points", () => {
    let previous = -Infinity;
    for (let distance = 10; distance <= 100; distance += 0.25) {
      const pitch = pitchOnCurve(VISITOR_ZOOM_CURVE, distance);
      expect(pitch).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = pitch;
    }
  });

  it("rests where the visitor's camera starts", () => {
    expect(pitchOnCurve(VISITOR_ZOOM_CURVE, VISITOR_CAMERA.initialDistance)).toBeCloseTo(VISITOR_CAMERA.pitchDegrees, 9);
  });
});
