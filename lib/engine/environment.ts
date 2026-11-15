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

type SkyKeyframe = {
  hour: number;
  sky: string;
  sun: string;
  sunIntensity: number;
  ambient: string;
  ambientIntensity: number;
};

// Placeholder palette. Art direction replaces these values, not the system.
const SKY_KEYFRAMES: SkyKeyframe[] = [
  { hour: 0, sky: "#141b2e", sun: "#8fa3d8", sunIntensity: 0.25, ambient: "#33406b", ambientIntensity: 0.55 },
  { hour: 5.5, sky: "#3a4266", sun: "#f2a36b", sunIntensity: 0.6, ambient: "#5a5f8a", ambientIntensity: 0.6 },
  { hour: 8, sky: "#bfe3f2", sun: "#ffe9c4", sunIntensity: 1.6, ambient: "#bcd4e6", ambientIntensity: 0.85 },
  { hour: 13, sky: "#cdeefa", sun: "#fff7e6", sunIntensity: 2.1, ambient: "#d6e8f2", ambientIntensity: 0.95 },
  { hour: 18, sky: "#f3c9a0", sun: "#ffb37a", sunIntensity: 1.3, ambient: "#c9a9a0", ambientIntensity: 0.75 },
  { hour: 20.5, sky: "#2b3050", sun: "#b27a8c", sunIntensity: 0.4, ambient: "#444a78", ambientIntensity: 0.55 },
  { hour: 24, sky: "#141b2e", sun: "#8fa3d8", sunIntensity: 0.25, ambient: "#33406b", ambientIntensity: 0.55 },
];

export class Environment {
  readonly uniforms: EnvironmentUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector3(1, 0.25, 0) },
    uDaylight: { value: 1 },
  };
  readonly sun = new THREE.DirectionalLight("#ffffff", 2);
  readonly ambient = new THREE.HemisphereLight("#ffffff", "#6b6257", 0.9);
  readonly background = new THREE.Color();
  readonly fog = new THREE.Fog("#ffffff", 120, 320);
  private readonly scratchA = new THREE.Color();
  private readonly scratchB = new THREE.Color();

  constructor(scene: THREE.Scene) {
    scene.add(this.sun, this.sun.target, this.ambient);
    scene.background = this.background;
    scene.fog = this.fog;
    this.apply({ timeOfDay: 14, wind: { direction: 90, strength: 0.25 } });
  }

  apply(environment: MapEnvironment) {
    this.setTimeOfDay(environment.timeOfDay);
    this.setWind(environment.wind.direction, environment.wind.strength);
  }

  setTimeOfDay(hour: number) {
    const wrapped = ((hour % 24) + 24) % 24;
    const nextIndex = SKY_KEYFRAMES.findIndex((keyframe) => keyframe.hour > wrapped);
    const next = SKY_KEYFRAMES[nextIndex === -1 ? SKY_KEYFRAMES.length - 1 : nextIndex];
    const previous = SKY_KEYFRAMES[Math.max(0, (nextIndex === -1 ? SKY_KEYFRAMES.length - 1 : nextIndex) - 1)];
    const span = next.hour - previous.hour;
    const t = span > 0 ? (wrapped - previous.hour) / span : 0;
    const mix = (from: string, to: string, target: THREE.Color) =>
      target.copy(this.scratchA.set(from)).lerp(this.scratchB.set(to), t);

    mix(previous.sky, next.sky, this.background);
    this.fog.color.copy(this.background);
    mix(previous.sun, next.sun, this.sun.color);
    this.sun.intensity = THREE.MathUtils.lerp(previous.sunIntensity, next.sunIntensity, t);
    mix(previous.ambient, next.ambient, this.ambient.color);
    this.ambient.intensity = THREE.MathUtils.lerp(previous.ambientIntensity, next.ambientIntensity, t);

    // The light arcs east -> south -> west. At night it stands in for the moon, kept above the horizon.
    const dayAngle = ((wrapped - 6) / 12) * Math.PI;
    const elevation = Math.max(0.28, Math.sin(dayAngle));
    this.sun.position.set(Math.cos(dayAngle) * 80, elevation * 90, 45);
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
