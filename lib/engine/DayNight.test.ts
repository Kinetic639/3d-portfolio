import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createSkyState, sampleSky } from "./day-night";
import { DEFAULT_LIGHTING, STYLE_LAB_LIGHTING } from "./surface-style";

const background = new THREE.Color("#edf1ed");
/** Compass bearing of a direction, degrees clockwise from north (world -z); east is +x. */
const bearing = (v: THREE.Vector3) => ((Math.atan2(v.x, -v.z) * 180) / Math.PI + 360) % 360;

describe("day and night", () => {
  it("is exactly the map's own lighting by day, coming from both directions", () => {
    for (const lighting of [DEFAULT_LIGHTING, STYLE_LAB_LIGHTING]) {
      for (const path of ["dusk", "dawn"] as const) {
        const sky = sampleSky(0, lighting, background, createSkyState(), path);
        const sun = new THREE.Vector3(lighting.sunPosition.x, lighting.sunPosition.y, lighting.sunPosition.z).normalize();
        expect(sky.lightDirection.distanceTo(sun)).toBeLessThan(1e-9);
        expect(sky.sunDisc.distanceTo(sun)).toBeLessThan(1e-9);
        expect(sky.lightIntensity).toBeCloseTo(lighting.sunIntensity, 9);
        expect(sky.lightColor.getHexString()).toBe(new THREE.Color(lighting.sunColor).getHexString());
        expect(sky.skyIntensity).toBeCloseTo(lighting.skyIntensity, 9);
        expect(sky.background.getHex()).toBe(background.getHex());
        expect(sky.terrainTint.toArray()).toEqual([1, 1, 1]);
        expect(sky.shadowFactor).toBe(1);
      }
    }
  });

  it("sets the sun in the west and raises the moon in the east, turning the shadows as they go", () => {
    const sample = (t: number, path: "dusk" | "dawn") => sampleSky(t, DEFAULT_LIGHTING, background, createSkyState(), path);
    // Just before the sun goes under, it is low in the west half of the sky.
    const sunset = sample(0.44, "dusk").sunDisc;
    expect(sunset.y).toBeLessThan(0.05);
    expect(bearing(sunset)).toBeGreaterThan(180);
    // The light does not only sink: its bearing turns on the way.
    expect(Math.abs(bearing(sample(0, "dusk").lightDirection) - bearing(sample(0.3, "dusk").lightDirection))).toBeGreaterThan(30);
    // The moon comes up in the east and climbs.
    const moonrise = sample(0.56, "dusk").moonDisc;
    expect(bearing(moonrise)).toBeGreaterThan(45);
    expect(bearing(moonrise)).toBeLessThan(135);
    const night = sample(1, "dusk");
    expect(night.lightDirection.distanceTo(night.moonDisc)).toBeLessThan(1e-9);
    expect(night.moonDisc.y).toBeGreaterThan(0.4);
    expect(night.sunDisc.y).toBeLessThan(0);
    expect(night.background.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.15);
    // Back to day, time runs on: the moon sets in the west, the sun rises in the east.
    expect(bearing(sample(0.55, "dawn").moonDisc)).toBeGreaterThan(180);
    const sunrise = sample(0.44, "dawn").sunDisc;
    expect(sunrise.y).toBeLessThan(0.1);
    expect(bearing(sunrise)).toBeLessThan(180);
  });

  it("hands the light from one body to the other at the horizon, where it is dark, without jumps", () => {
    for (const path of ["dusk", "dawn"] as const) {
      expect(sampleSky(0.5, DEFAULT_LIGHTING, background, createSkyState(), path).lightIntensity).toBe(0);
      let previous = sampleSky(0, DEFAULT_LIGHTING, background, createSkyState(), path);
      for (let step = 1; step <= 400; step += 1) {
        const sky = sampleSky(step / 400, DEFAULT_LIGHTING, background, createSkyState(), path);
        expect(Math.abs(sky.lightIntensity - previous.lightIntensity)).toBeLessThan(0.1);
        // A visible light never jumps across the sky.
        if (sky.lightIntensity > 0.01 && previous.lightIntensity > 0.01) expect(sky.lightDirection.distanceTo(previous.lightDirection)).toBeLessThan(0.05);
        previous = sky;
      }
    }
  });
});
