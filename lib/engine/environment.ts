import * as THREE from "three";
import type { MapEnvironment } from "@/lib/maps/map-definition";

/**
 * Global environment state: time of day, wind and (later) weather.
 *
 * Every effect reads the same shared uniforms, so custom materials opt in by
 * spreading `environment.uniforms` into their own uniform block. Changing the
 * weather or the hour only changes uniform values and light parameters; it
 * never switches shader variants, so it can never trigger a mid-session
 * shader compile.
 */
export type EnvironmentUniforms = {
  uTime: { value: number };
  /** xz = unit direction the wind blows towards, y = strength 0-1. */
  uWind: { value: THREE.Vector3 };
  /** 0 = night, 1 = full day. */
  uDaylight: { value: number };
};

/** Lighting and background of the original project: what placed objects are lit by and what shows beyond the map. */
const ORIGINAL_LOOK = {
  background: "#edf1ed",
  ambientIntensity: 0.9,
  sunIntensity: 1.2,
  sunPosition: [24, 42, 18] as const,
};

export class Environment {
  readonly uniforms: EnvironmentUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector3(1, 0.25, 0) },
    uDaylight: { value: 1 },
  };
  readonly sun = new THREE.DirectionalLight("#ffffff", ORIGINAL_LOOK.sunIntensity);
  readonly ambient = new THREE.AmbientLight("#ffffff", ORIGINAL_LOOK.ambientIntensity);
  readonly background = new THREE.Color(ORIGINAL_LOOK.background);

  constructor(scene: THREE.Scene) {
    this.sun.position.set(...ORIGINAL_LOOK.sunPosition);
    scene.add(this.sun, this.sun.target, this.ambient);
    scene.background = this.background;
    this.apply({ timeOfDay: 14, wind: { direction: 90, strength: 0.25 } });
  }

  apply(environment: MapEnvironment) {
    this.setTimeOfDay(environment.timeOfDay);
    this.setWind(environment.wind.direction, environment.wind.strength);
  }

  /**
   * Sets the hour. For now it only drives `uDaylight`: the lights and the
   * background keep the project's established look whatever the hour, and
   * the terrain is shaded by its own fixed light. A day and night cycle
   * would add its palette here and feed it to the terrain material.
   */
  setTimeOfDay(hour: number) {
    const wrapped = ((hour % 24) + 24) % 24;
    const dayAngle = ((wrapped - 6) / 12) * Math.PI;
    this.uniforms.uDaylight.value = THREE.MathUtils.clamp(Math.sin(dayAngle) * 1.6 + 0.2, 0, 1);
  }

  setWind(directionDegrees: number, strength: number) {
    const radians = THREE.MathUtils.degToRad(directionDegrees);
    // 0 degrees = north = -Z.
    this.uniforms.uWind.value.set(Math.sin(radians), THREE.MathUtils.clamp(strength, 0, 1), -Math.cos(radians));
  }

  update(elapsedSeconds: number) {
    this.uniforms.uTime.value = elapsedSeconds;
  }
}
