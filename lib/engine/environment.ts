import * as THREE from "three";
import type { MapEnvironment } from "@/lib/maps/map-definition";
import { resolveLighting, resolveShadows, type LightingState, type ShadowState } from "./surface-style";
import { Wind } from "./wind";

/**
 * Global environment state: time of day, wind and (later) weather.
 *
 * Every effect reads the same shared uniforms, so custom materials opt in by
 * spreading `environment.uniforms` (or `environment.wind.uniforms`) into
 * their own uniform block. Changing the
 * weather or the hour only changes uniform values and light parameters; it
 * never switches shader variants, so it can never trigger a mid-session
 * shader compile.
 */
export type EnvironmentUniforms = {
  uTime: { value: number };
  /** 0 = night, 1 = full day. */
  uDaylight: { value: number };
};

/** Background of the original project; its lighting is DEFAULT_LIGHTING in surface-style.ts. */
const ORIGINAL_BACKGROUND = "#edf1ed";

export class Environment {
  readonly uniforms: EnvironmentUniforms = {
    uTime: { value: 0 },
    uDaylight: { value: 1 },
  };
  readonly sun = new THREE.DirectionalLight("#ffffff", 1.2);
  /** Sky light. White over white is exactly the original's ambient light; the style lab tints it. */
  readonly sky = new THREE.HemisphereLight("#ffffff", "#ffffff", 0.9);
  readonly background = new THREE.Color(ORIGINAL_BACKGROUND);
  private lighting: LightingState = resolveLighting(undefined);
  private shadows: ShadowState = resolveShadows(undefined);
  /** Unit vector towards the sun. */
  private readonly sunDirection = new THREE.Vector3(0, 1, 0);
  private readonly shadowFocus = new THREE.Vector3();
  private readonly lightRight = new THREE.Vector3();
  private readonly lightUp = new THREE.Vector3();
  /** The map's wind; see wind.ts. */
  readonly wind = new Wind();

  constructor(scene: THREE.Scene) {
    scene.add(this.sun, this.sun.target, this.sky);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    scene.background = this.background;
    this.apply({ timeOfDay: 14, wind: { direction: 90, strength: 0.25 } });
  }

  apply(environment: MapEnvironment) {
    this.setTimeOfDay(environment.timeOfDay);
    this.wind.apply(environment.wind);
    this.applyLighting(resolveLighting(environment.lighting));
    this.applyShadows(resolveShadows(environment.shadows));
  }

  get shadowSettings() {
    return { ...this.shadows };
  }

  /** Whether the renderer should draw shadow maps. The engine also turns them off on the lowest quality. */
  get shadowsEnabled() {
    return this.shadows.enabled;
  }

  private applyLighting(lighting: LightingState) {
    this.lighting = lighting;
    this.sun.intensity = lighting.sunIntensity;
    this.sun.color.set(lighting.sunColor);
    this.sunDirection.set(lighting.sunPosition.x, lighting.sunPosition.y, lighting.sunPosition.z).normalize();
    this.sky.intensity = lighting.skyIntensity;
    this.sky.color.set(lighting.skyColor);
    this.sky.groundColor.set(lighting.groundColor);
    this.placeSun(this.shadowFocus, 0);
  }

  private applyShadows(shadows: ShadowState) {
    const resized = shadows.mapSize !== this.shadows.mapSize;
    this.shadows = shadows;
    this.sun.castShadow = shadows.enabled;
    this.sun.shadow.bias = shadows.bias;
    this.sun.shadow.normalBias = shadows.normalBias;
    this.sun.shadow.intensity = shadows.strength;
    this.sun.shadow.mapSize.set(shadows.mapSize, shadows.mapSize);
    if (resized && this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  /**
   * Centres the sun and its shadow camera on what the camera looks at. The
   * shadow covers a square that grows with the view distance, and its centre
   * moves in whole shadow-map texels, so shadows do not shimmer while panning.
   */
  followView(focus: THREE.Vector3, viewDistance: number) {
    this.placeSun(focus, viewDistance);
  }

  private placeSun(focus: THREE.Vector3, viewDistance: number) {
    const camera = this.sun.shadow.camera;
    const extent = THREE.MathUtils.clamp(viewDistance * 0.9, 12, 80);
    if (camera.right !== extent) {
      camera.left = -extent;
      camera.right = extent;
      camera.top = extent;
      camera.bottom = -extent;
      camera.updateProjectionMatrix();
    }
    // Snap the focus to the shadow map's texel grid, in the light's own axes.
    const texel = (extent * 2) / this.shadows.mapSize;
    this.lightRight.set(0, 1, 0).cross(this.sunDirection);
    if (this.lightRight.lengthSq() < 1e-6) this.lightRight.set(1, 0, 0);
    this.lightRight.normalize();
    this.lightUp.copy(this.sunDirection).cross(this.lightRight).normalize();
    const right = Math.round(focus.dot(this.lightRight) / texel) * texel;
    const up = Math.round(focus.dot(this.lightUp) / texel) * texel;
    const depth = focus.dot(this.sunDirection);
    this.shadowFocus.copy(this.lightRight).multiplyScalar(right).addScaledVector(this.lightUp, up).addScaledVector(this.sunDirection, depth);
    this.sun.target.position.copy(this.shadowFocus);
    this.sun.position.copy(this.shadowFocus).addScaledVector(this.sunDirection, 150);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
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

  /** Called once per drawn frame. */
  update(elapsedSeconds: number, deltaSeconds = 0) {
    this.uniforms.uTime.value = elapsedSeconds;
    this.wind.update(deltaSeconds);
  }
}
