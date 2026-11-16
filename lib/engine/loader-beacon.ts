import * as THREE from "three";

/** Height of the crystal's centre above the platform's top (original: 1.5 + 1.72 over a platform topped at 2.5). */
const HOVER_HEIGHT = 0.72;
const INTRO_SECONDS = 0.78;
const FADE_DELAY = 0.05;
const FADE_SECONDS = 0.42;
const START_SCALE = 0.18;
const START_DROP = -0.32;

/** GSAP's back.out(1.7), the original intro curve. */
function backOut(t: number, overshoot = 1.7) {
  const u = t - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
}

/**
 * The crystal floating over the loader platform: a gold octahedron in a dark
 * ring, turning slowly and bobbing. It pops in when the world is ready to be
 * entered and disappears the moment the visitor enters, as in the original.
 */
export class LoaderBeacon {
  readonly group = new THREE.Group();
  private readonly spinner = new THREE.Group();
  private readonly crystal: THREE.MeshStandardMaterial;
  private readonly ring: THREE.MeshStandardMaterial;
  private readonly disposables: Array<{ dispose: () => void }> = [];
  /** Seconds since the intro started, or null while hidden. */
  private shownFor: number | null = null;

  constructor() {
    this.group.name = "loader-beacon";
    this.crystal = new THREE.MeshStandardMaterial({
      color: "#d8b45a", emissive: "#4a3210", emissiveIntensity: 0.45, metalness: 0.35, roughness: 0.28, transparent: true, opacity: 0,
    });
    this.ring = new THREE.MeshStandardMaterial({
      color: "#263b34", emissive: "#18221f", emissiveIntensity: 0.18, metalness: 0.1, roughness: 0.46, transparent: true, opacity: 0,
    });
    const ringGeometry = new THREE.TorusGeometry(0.42, 0.035, 8, 24);
    const crystalGeometry = new THREE.OctahedronGeometry(0.42, 0);
    const ringMesh = new THREE.Mesh(ringGeometry, this.ring);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = -0.28;
    const crystalMesh = new THREE.Mesh(crystalGeometry, this.crystal);
    crystalMesh.scale.set(0.58, 0.82, 0.58);
    this.spinner.add(ringMesh, crystalMesh);
    this.group.add(this.spinner);
    this.disposables.push(ringGeometry, crystalGeometry, this.crystal, this.ring);
    this.group.visible = false;
  }

  /** True between `show` and `hide`. */
  get shown() {
    return this.shownFor !== null;
  }

  /** Puts the beacon over a platform whose top centre is at (x, top, z). */
  place(x: number, top: number, z: number) {
    this.group.position.set(x, top + HOVER_HEIGHT, z);
  }

  /** Starts the pop-in. */
  show() {
    this.shownFor = 0;
    this.group.visible = true;
    this.pose(0);
  }

  hide() {
    this.shownFor = null;
    this.group.visible = false;
  }

  /** Makes the beacon render fully, for warm-up. `hide` or `show` undoes it. */
  forceVisible() {
    this.group.visible = true;
    this.crystal.opacity = this.ring.opacity = 1;
  }

  /** Advances the animation; `elapsed` is the scene clock, for the idle spin and bob. */
  update(deltaSeconds: number, elapsed: number) {
    if (this.shownFor === null) return;
    this.shownFor += deltaSeconds;
    this.pose(elapsed);
  }

  dispose() {
    this.disposables.forEach((item) => item.dispose());
    this.group.clear();
  }

  private pose(elapsed: number) {
    const t = this.shownFor ?? 0;
    const intro = backOut(Math.min(1, t / INTRO_SECONDS));
    this.spinner.scale.setScalar(START_SCALE + (1 - START_SCALE) * intro);
    this.spinner.position.y = START_DROP * (1 - intro) + Math.sin(elapsed * 2.8) * 0.05;
    this.spinner.rotation.y = elapsed * 0.85;
    const fade = THREE.MathUtils.clamp((t - FADE_DELAY) / FADE_SECONDS, 0, 1);
    // power2.out
    this.crystal.opacity = this.ring.opacity = 1 - (1 - fade) * (1 - fade);
  }
}
