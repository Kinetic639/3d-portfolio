import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { findSectionByPath, zoneSection } from "@/lib/content/places";
import { pitchOnCurve, VISITOR_ZOOM_CURVE } from "./camera-rig";
import { frameZone, measureZones, planFlight, sampleFlight } from "./zones";
import type { WorldQuery } from "./world-query";

const pitchAt = (distance: number) => THREE.MathUtils.degToRad(pitchOnCurve(VISITOR_ZOOM_CURVE, distance));
const view = { yawRadians: Math.PI / 4, fovDegrees: 32, aspect: 16 / 9, pitchAt, minDistance: 14, maxDistance: 90 };

describe("zones as places", () => {
  it("measures each zone's bounds and puts its name on one of its own columns", () => {
    // An L-shaped zone 1 whose mean falls outside it, on an 8 x 8 grid.
    const zones = new Uint8Array(64);
    for (let x = 0; x < 8; x += 1) zones[x] = 1;
    for (let z = 0; z < 8; z += 1) zones[z * 8] = 1;
    const query = { width: 8, depth: 8, columnZone: (x: number, z: number) => zones[x + 8 * z], surfaceHeight: () => 2 } as unknown as WorldQuery;
    const area = measureZones(query).get(1)!;
    expect(area).toMatchObject({ minX: -4, maxX: 4, minZ: -4, maxZ: 4, columns: 15, labelY: 2 });
    const column = { x: area.labelX - 0.5 + 4, z: area.labelZ - 0.5 + 4 };
    expect(zones[column.x + 8 * column.z]).toBe(1);
  });

  it("frames a bigger zone from further away, within the curve's range", () => {
    const small = frameZone({ minX: -4, maxX: 4, minZ: -4, maxZ: 4 }, view);
    const large = frameZone({ minX: -16, maxX: 16, minZ: -16, maxZ: 16 }, view);
    expect(small).toMatchObject({ x: 0, z: 0 });
    expect(large.distance).toBeGreaterThan(small.distance);
    expect(small.distance).toBeGreaterThanOrEqual(14);
    expect(frameZone({ minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, view).distance).toBe(90);
  });

  it("flies with the cinematic ease, rises over long trips and turns the short way", () => {
    const plan = planFlight({ x: 0, z: 0, distance: 24, yaw: THREE.MathUtils.degToRad(170) }, { x: 60, z: 0, distance: 24, yaw: THREE.MathUtils.degToRad(-170) });
    expect(plan.rise).toBeGreaterThan(0);
    const middle = sampleFlight(plan, plan.seconds / 2);
    expect(middle.distance).toBeGreaterThan(24);
    expect(Math.abs(plan.to.yaw - plan.from.yaw)).toBeCloseTo(THREE.MathUtils.degToRad(20), 6);
    const end = sampleFlight(plan, plan.seconds);
    expect(end).toMatchObject({ x: 60, z: 0, done: true });
    expect(end.distance).toBeCloseTo(24, 9);
    // A short hop does not rise.
    expect(planFlight({ x: 0, z: 0, distance: 24, yaw: 0 }, { x: 5, z: 0, distance: 24, yaw: 0 }).rise).toBe(0);
  });

  it("maps zones to site sections by reference or, for older maps, by name", () => {
    expect(zoneSection({ label: "Projekty", contentReference: { contentType: "project", contentId: "x" } })?.segment).toBe("projects");
    expect(zoneSection({ label: "contact" })?.segment).toBe("contact");
    expect(zoneSection({ label: "Zone 7" })).toBeNull();
    expect(findSectionByPath("/projects")?.kind).toBe("project");
    // Singletons are items, not lists.
    expect(findSectionByPath("/about")).toBeNull();
    expect(findSectionByPath("/projects/one")).toBeNull();
  });
});
