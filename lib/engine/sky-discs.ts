import * as THREE from "three";
import type { SkyState } from "./day-night";

/**
 * The sun and the moon as discs in the sky, far beyond the map, in the
 * directions day-night.ts gives. They stay centred on the camera (at any
 * distance they look the same, as the real ones do) and are drawn behind
 * the terrain, so hills and the edge of the world hide them like a horizon.
 * Two sprites, made once and always in the scene (compiled with everything
 * else); below the horizon they are simply out of sight.
 */

/** Far enough to be behind everything, within the camera's far plane (600). */
const DISTANCE = 520;
/** Apparent diameter of the glow around each disc, in radians. */
const SIZE = THREE.MathUtils.degToRad(5);

function discTexture(inner: string, rim: string, glow: string) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.3, inner);
  gradient.addColorStop(0.36, rim);
  gradient.addColorStop(0.42, glow);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class SkyDiscs {
  readonly group = new THREE.Group();
  private readonly sun: THREE.Sprite;
  private readonly moon: THREE.Sprite;

  constructor() {
    this.group.name = "sky-discs";
    this.sun = this.disc(discTexture("#fffbe8", "#ffd56e", "rgba(255, 176, 80, 0.45)"));
    this.moon = this.disc(discTexture("#f2f5ff", "#cfdaf8", "rgba(170, 192, 255, 0.35)"));
    this.sun.name = "sun";
    this.moon.name = "moon";
  }

  private disc(map: THREE.Texture) {
    const material = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false });
    const sprite = new THREE.Sprite(material);
    const scale = 2 * DISTANCE * Math.tan(SIZE / 2);
    sprite.scale.set(scale, scale, 1);
    // Drawn before the terrain's transparent neighbours, after the opaque ground that hides it.
    sprite.renderOrder = -1;
    sprite.frustumCulled = false;
    this.group.add(sprite);
    return sprite;
  }

  /** Puts the discs where the sky state says, around the camera. Call before drawing. */
  update(camera: THREE.Camera, sky: SkyState) {
    camera.getWorldPosition(this.sun.position);
    this.moon.position.copy(this.sun.position);
    this.sun.position.addScaledVector(sky.sunDisc, DISTANCE);
    this.moon.position.addScaledVector(sky.moonDisc, DISTANCE);
  }

  dispose() {
    for (const sprite of [this.sun, this.moon]) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    this.group.clear();
  }
}
