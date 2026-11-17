import * as THREE from "three";

/**
 * Zone names over the terrain, like the names on a map: they fade in as the
 * camera zooms out and are gone close up, where the objects speak for
 * themselves. Each is a sprite of constant size on screen, drawn over the
 * terrain (no depth test), from a small canvas texture made once.
 *
 * Cheap by construction: a handful of sprites sharing one program; while
 * hidden they are not drawn at all.
 */

export type ZoneLabelSpec = {
  zoneId: string;
  text: string;
  color: string;
  x: number;
  y: number;
  z: number;
};

/** Distances over which the names fade in, before the curve's scaling for narrow screens. */
export const LABEL_FADE_NEAR = 30;
export const LABEL_FADE_FAR = 40;
/** Height of a name on screen, in CSS pixels. */
const LABEL_PIXELS = 26;
/** How far above the ground a name floats: low, under the icons of the objects in the zone. */
const LABEL_LIFT = 0.8;

type Label = { spec: ZoneLabelSpec; sprite: THREE.Sprite; material: THREE.SpriteMaterial; texture: THREE.CanvasTexture; aspect: number };

export class ZoneLabels {
  readonly group = new THREE.Group();
  private readonly labels: Label[] = [];
  private opacity = 0;
  private warming = false;
  private screen = { heightPx: 900, fovDegrees: 32 };

  constructor(specs: ZoneLabelSpec[]) {
    this.group.name = "zone-labels";
    this.group.renderOrder = 10;
    for (const spec of specs) {
      const { canvas, aspect } = drawLabel(spec.text, spec.color);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, opacity: 0 });
      const sprite = new THREE.Sprite(material);
      sprite.name = `zone-label:${spec.zoneId}`;
      sprite.position.set(spec.x, spec.y + LABEL_LIFT, spec.z);
      sprite.renderOrder = 10;
      sprite.userData.zoneId = spec.zoneId;
      this.group.add(sprite);
      this.labels.push({ spec, sprite, material, texture, aspect });
    }
    this.resize(this.screen.heightPx, this.screen.fovDegrees);
    this.apply();
  }

  /** Keeps the names the same size in pixels whatever the window. */
  resize(heightPx: number, fovDegrees: number) {
    this.screen = { heightPx, fovDegrees };
    // A non-attenuated sprite's scale is in view units at distance 1.
    const unitsPerPixel = (2 * Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2)) / Math.max(1, heightPx);
    const height = LABEL_PIXELS * unitsPerPixel;
    for (const label of this.labels) label.sprite.scale.set(height * label.aspect, height, 1);
  }

  /** Sets how visible the names are from the camera's distance. Returns true when that changed. */
  update(distance: number, near: number, far: number, hidden: boolean) {
    const next = hidden ? 0 : THREE.MathUtils.smoothstep(distance, near, far);
    if (Math.abs(next - this.opacity) < 0.005 && !(next === 0 && this.opacity !== 0)) return false;
    this.opacity = next;
    this.apply();
    return true;
  }

  /** Warm-up draws the names so their program and textures exist before anyone sees them. */
  showForWarmUp(show: boolean) {
    this.warming = show;
    this.apply();
  }

  get visible() {
    return this.opacity > 0.01;
  }

  /** The zone whose name is under a screen point (normalised device coordinates), or null. */
  pick(camera: THREE.Camera, ndcX: number, ndcY: number, aspect: number) {
    if (!this.visible) return null;
    const point = new THREE.Vector3();
    for (const label of [...this.labels].reverse()) {
      point.copy(label.sprite.position).project(camera);
      if (point.z > 1) continue;
      // Sprite scale is in view units at distance 1; on screen (NDC) that is scale / tan(fov/2).
      const halfHeight = label.sprite.scale.y / (2 * Math.tan(THREE.MathUtils.degToRad(this.screen.fovDegrees) / 2));
      const halfWidth = (label.sprite.scale.x / label.sprite.scale.y) * halfHeight / aspect;
      if (Math.abs(ndcX - point.x) <= halfWidth * 1.0 && Math.abs(ndcY - point.y) <= halfHeight * 1.0) return label.spec.zoneId;
    }
    return null;
  }

  dispose() {
    for (const label of this.labels) {
      label.material.dispose();
      label.texture.dispose();
    }
    this.group.clear();
  }

  private apply() {
    const opacity = this.warming ? 1 : this.opacity;
    for (const label of this.labels) {
      label.material.opacity = opacity;
      label.sprite.visible = opacity > 0.01;
    }
  }
}

/** A name on a rounded pill, drawn at twice the size it is shown for sharp text on high-density screens. */
function drawLabel(text: string, color: string) {
  const scale = 2;
  const fontPx = 15 * scale;
  const paddingX = 11 * scale;
  const heightPx = LABEL_PIXELS * scale;
  const measure = document.createElement("canvas").getContext("2d")!;
  const font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  measure.font = font;
  const dot = 8 * scale;
  const widthPx = Math.ceil(measure.measureText(text).width + paddingX * 2 + dot + 6 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const context = canvas.getContext("2d")!;
  const radius = heightPx / 2;
  context.fillStyle = "rgba(247, 249, 246, 0.9)";
  context.beginPath();
  context.roundRect(1, 1, widthPx - 2, heightPx - 2, radius - 1);
  context.fill();
  context.strokeStyle = "rgba(24, 34, 31, 0.18)";
  context.lineWidth = scale;
  context.stroke();
  context.fillStyle = color;
  context.beginPath();
  context.arc(paddingX + dot / 2, heightPx / 2, dot / 2, 0, Math.PI * 2);
  context.fill();
  context.font = font;
  context.fillStyle = "#18221f";
  context.textBaseline = "middle";
  context.fillText(text, paddingX + dot + 6 * scale, heightPx / 2 + scale);
  return { canvas, aspect: widthPx / heightPx };
}
