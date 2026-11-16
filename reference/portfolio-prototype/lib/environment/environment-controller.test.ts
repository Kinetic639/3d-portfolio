import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  DEFAULT_ENVIRONMENT_STATE,
  EnvironmentController,
  getWindDirectionDegrees,
} from "./environment-controller";

describe("EnvironmentController", () => {
  it("normalizes global XZ direction and updates shared uniforms immediately", () => {
    const controller = new EnvironmentController();
    const uniforms = controller.windUniforms;

    controller.setWind({ direction: new THREE.Vector2(8, 0), strength: 1.25 });

    expect(controller.windUniforms).toBe(uniforms);
    expect(uniforms.uWindDirection.value.toArray()).toEqual([1, 0]);
    expect(uniforms.uWindStrength.value).toBe(1.25);
  });

  it("advances one global clock and produces one coherent gust value", () => {
    const controller = new EnvironmentController();
    const firstConsumerGust = controller.windUniforms.uWindGust;
    const secondConsumerGust = controller.windUniforms.uWindGust;

    controller.update(0.1);

    expect(controller.windUniforms.uWindTime.value).toBeCloseTo(0.1);
    expect(firstConsumerGust).toBe(secondConsumerGust);
    expect(firstConsumerGust.value).toBeGreaterThanOrEqual(0);
  });

  it("applies presets without replacing direction or uniform references", () => {
    const controller = new EnvironmentController();
    const directionUniform = controller.windUniforms.uWindDirection;
    const directionBefore = controller.getState().wind.direction;

    controller.applyWindPreset("strongWind");

    expect(controller.windUniforms.uWindDirection).toBe(directionUniform);
    expect(controller.getState().wind.direction.toArray()).toEqual(directionBefore.toArray());
    expect(controller.getState().wind.strength).toBeGreaterThan(DEFAULT_ENVIRONMENT_STATE.wind.strength);
  });

  it("disables wind without discarding configured weather values", () => {
    const controller = new EnvironmentController();
    controller.setWind({ enabled: false, strength: 1.4, turbulence: 0.8 });

    expect(controller.getState().wind.strength).toBe(1.4);
    expect(controller.windUniforms.uWindStrength.value).toBe(0);
    expect(controller.windUniforms.uWindTurbulence.value).toBe(0);
  });

  it("round trips compass direction degrees", () => {
    const controller = new EnvironmentController();
    controller.setWindDirectionDegrees(270);

    expect(getWindDirectionDegrees(controller.getState().wind.direction)).toBeCloseTo(270);
  });
});
