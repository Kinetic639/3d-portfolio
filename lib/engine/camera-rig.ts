import * as THREE from "three";

export type CameraBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type CameraRigOptions = {
  /** Degrees above the horizon the camera looks down from. Fixed for the whole session. */
  pitchDegrees?: number;
  fov?: number;
  minDistance?: number;
  maxDistance?: number;
  initialDistance?: number;
  /** Mouse buttons that pan (0 left, 1 middle, 2 right). Touch always pans. Default: left. */
  panButtons?: number[];
  /** Called for a press-and-release that did not move: a click or tap on the world. */
  onTap?: (clientX: number, clientY: number) => void;
  /** Called whenever the rig needs another frame. */
  onChange: () => void;
};

const TAP_SLOP_PX = 6;
const DEFAULT_EASE_RATE = 12;
const KEY_PAN = new Map<string, [number, number]>([
  ["ArrowLeft", [-1, 0]], ["KeyA", [-1, 0]],
  ["ArrowRight", [1, 0]], ["KeyD", [1, 0]],
  ["ArrowUp", [0, -1]], ["KeyW", [0, -1]],
  ["ArrowDown", [0, 1]], ["KeyS", [0, 1]],
]);

/**
 * Fixed-angle top-down camera: no rotation, bounded pan and zoom.
 *
 * Input (mouse, touch, keyboard) only moves a *goal*; `update` eases the real
 * camera towards it. Nothing here touches React or the bridge: camera motion
 * is engine-internal by design.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly element: HTMLElement;
  private readonly options: Required<Omit<CameraRigOptions, "onTap">> & Pick<CameraRigOptions, "onTap">;
  private readonly direction = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly goalTarget = new THREE.Vector3();
  private distance: number;
  private goalDistance: number;
  private bounds: CameraBounds = { minX: -32, maxX: 32, minZ: -32, maxZ: 32 };
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pressStart: { x: number; y: number; moved: boolean } | null = null;
  private pinchDistance = 0;
  private readonly heldKeys = new Set<string>();
  private enabled = true;
  /** A timed approach in progress, or null. While set, it drives the distance instead of the ease. */
  private approach: { from: number; elapsed: number; duration: number } | null = null;
  private readonly abort = new AbortController();

  constructor(element: HTMLElement, options: CameraRigOptions) {
    this.element = element;
    this.options = {
      pitchDegrees: options.pitchDegrees ?? 55,
      fov: options.fov ?? 32,
      minDistance: options.minDistance ?? 16,
      maxDistance: options.maxDistance ?? 82,
      initialDistance: options.initialDistance ?? 62,
      panButtons: options.panButtons ?? [0],
      onTap: options.onTap,
      onChange: options.onChange,
    };
    this.camera = new THREE.PerspectiveCamera(this.options.fov, 1, 0.5, 600);
    const pitch = THREE.MathUtils.degToRad(this.options.pitchDegrees);
    // Camera sits south of the target and looks north, tilted down by `pitch`.
    this.direction.set(0, Math.sin(pitch), Math.cos(pitch));
    this.distance = this.goalDistance = this.options.initialDistance;
    this.bind();
    this.apply();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.pointers.clear();
      this.pressStart = null;
      this.heldKeys.clear();
    }
  }

  /** Changes which mouse buttons pan and the zoom range. */
  configure(settings: { panButtons?: number[]; minDistance?: number; maxDistance?: number }) {
    if (settings.panButtons) this.options.panButtons = settings.panButtons;
    if (settings.minDistance !== undefined) this.options.minDistance = settings.minDistance;
    if (settings.maxDistance !== undefined) this.options.maxDistance = settings.maxDistance;
    this.clampGoal();
    this.options.onChange();
  }

  setBounds(bounds: CameraBounds) {
    this.bounds = bounds;
    this.clampGoal();
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Moves the goal. With `immediate`, the camera jumps there without easing. */
  lookAt(x: number, z: number, distance?: number, immediate = false) {
    this.goalTarget.set(x, 0, z);
    if (distance !== undefined) this.goalDistance = distance;
    this.clampGoal();
    if (immediate) {
      this.target.copy(this.goalTarget);
      this.distance = this.goalDistance;
      this.apply();
    }
    this.options.onChange();
  }

  /** True while a pointer is pressed on the canvas (dragging or pinching). */
  isPointerDown() {
    return this.pointers.size > 0;
  }

  /**
   * Centres a ground point in the part of the viewport that UI does not
   * cover. `inset` is the size, in CSS pixels, of panels on the right and bottom edges.
   */
  focusOn(x: number, z: number, distance: number, inset: { right?: number; bottom?: number } = {}) {
    this.goalDistance = distance;
    this.clampGoal();
    const units = this.worldUnitsPerPixel();
    this.goalTarget.set(
      x + ((inset.right ?? 0) / 2) * units,
      0,
      z + (((inset.bottom ?? 0) / 2) * units) / this.direction.y,
    );
    this.clampGoal();
    this.options.onChange();
  }

  /**
   * Cinematic approach: starts far away (possibly beyond the zoom limit) and
   * glides to the current goal over roughly `seconds`. With `seconds` of 0 the
   * camera is placed at the goal immediately.
   */
  playApproach(fromDistance: number, seconds: number) {
    this.target.copy(this.goalTarget);
    if (seconds <= 0) {
      this.approach = null;
      this.distance = this.goalDistance;
    } else {
      this.distance = fromDistance;
      this.approach = { from: fromDistance, elapsed: 0, duration: seconds };
    }
    this.apply();
    this.options.onChange();
  }

  /** Camera pose for a given goal, without moving the rig. Used to rehearse views during warm-up. */
  poseAt(distance: number, into: THREE.PerspectiveCamera) {
    into.copy(this.camera);
    into.position.copy(this.goalTarget).addScaledVector(this.direction, distance);
    into.lookAt(this.goalTarget);
    into.updateMatrixWorld();
    return into;
  }

  getGoal() {
    return { x: this.goalTarget.x, z: this.goalTarget.z, distance: this.goalDistance };
  }

  getView() {
    return { x: this.target.x, z: this.target.z, distance: this.distance };
  }

  /** Advances easing and held-key motion. Returns true while the camera is still moving. */
  update(deltaSeconds: number) {
    if (this.heldKeys.size > 0) {
      let panX = 0;
      let panZ = 0;
      let zoom = 0;
      for (const code of this.heldKeys) {
        const pan = KEY_PAN.get(code);
        if (pan) {
          panX += pan[0];
          panZ += pan[1];
        }
        if (code === "Equal" || code === "NumpadAdd") zoom -= 1;
        if (code === "Minus" || code === "NumpadSubtract") zoom += 1;
      }
      const speed = this.goalDistance * 0.9 * deltaSeconds;
      this.goalTarget.x += panX * speed;
      this.goalTarget.z += panZ * speed;
      this.goalDistance *= 1 + zoom * 1.2 * deltaSeconds;
      this.clampGoal();
    }

    // Frame-rate independent exponential ease.
    const ease = 1 - Math.exp(-deltaSeconds * DEFAULT_EASE_RATE);
    this.target.lerp(this.goalTarget, ease);
    if (this.approach) {
      // Timed, so the transition lasts exactly as long as it was asked to.
      this.approach.elapsed += deltaSeconds;
      const t = Math.min(1, this.approach.elapsed / this.approach.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.distance = this.approach.from + (this.goalDistance - this.approach.from) * eased;
      if (t >= 1) this.approach = null;
    } else {
      this.distance += (this.goalDistance - this.distance) * ease;
    }

    const settled =
      this.approach === null &&
      this.heldKeys.size === 0 &&
      this.target.distanceToSquared(this.goalTarget) < 1e-6 &&
      Math.abs(this.goalDistance - this.distance) < 1e-3;
    if (settled) {
      this.target.copy(this.goalTarget);
      this.distance = this.goalDistance;
    }
    this.apply();
    return !settled;
  }

  dispose() {
    this.abort.abort();
  }

  private apply() {
    this.camera.position.copy(this.target).addScaledVector(this.direction, this.distance);
    this.camera.lookAt(this.target);
  }

  private clampGoal() {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    this.goalTarget.x = THREE.MathUtils.clamp(this.goalTarget.x, minX, maxX);
    this.goalTarget.z = THREE.MathUtils.clamp(this.goalTarget.z, minZ, maxZ);
    this.goalDistance = THREE.MathUtils.clamp(this.goalDistance, this.options.minDistance, this.options.maxDistance);
  }

  /** World units covered by one CSS pixel at the target's depth. */
  private worldUnitsPerPixel() {
    const height = this.element.clientHeight || 1;
    return (2 * this.goalDistance * Math.tan(THREE.MathUtils.degToRad(this.options.fov) / 2)) / height;
  }

  private panByPixels(dx: number, dy: number) {
    const units = this.worldUnitsPerPixel();
    this.goalTarget.x -= dx * units;
    // The ground is foreshortened vertically by the pitch.
    this.goalTarget.z -= (dy * units) / this.direction.y;
    this.clampGoal();
    this.options.onChange();
  }

  private zoomBy(factor: number) {
    this.goalDistance *= factor;
    this.clampGoal();
    this.options.onChange();
  }

  private bind() {
    const { signal } = this.abort;
    const element = this.element;

    element.addEventListener("pointerdown", (event) => {
      if (!this.enabled || (event.pointerType === "mouse" && !this.options.panButtons.includes(event.button))) return;
      try {
        // Keeps the drag alive when the pointer leaves the canvas.
        element.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a nicety; a pointer that is already gone must not break input handling.
      }
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 1) {
        this.pressStart = { x: event.clientX, y: event.clientY, moved: false };
      } else {
        // A second finger turns the gesture into a pinch; it can no longer be a tap.
        if (this.pressStart) this.pressStart.moved = true;
        this.pinchDistance = this.currentPinchDistance();
      }
    }, { signal });

    element.addEventListener("pointermove", (event) => {
      const previous = this.pointers.get(event.pointerId);
      if (!this.enabled || !previous) return;
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      previous.x = event.clientX;
      previous.y = event.clientY;

      if (this.pointers.size >= 2) {
        const distance = this.currentPinchDistance();
        if (this.pinchDistance > 0 && distance > 0) this.zoomBy(this.pinchDistance / distance);
        this.pinchDistance = distance;
        return;
      }

      const press = this.pressStart;
      if (press && !press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP_SLOP_PX) {
        press.moved = true;
      }
      if (press?.moved) this.panByPixels(dx, dy);
    }, { signal });

    const release = (event: PointerEvent) => {
      if (!this.pointers.delete(event.pointerId)) return;
      const press = this.pressStart;
      if (this.pointers.size === 0) {
        this.pressStart = null;
        if (this.enabled && press && !press.moved && event.type === "pointerup") {
          this.options.onTap?.(event.clientX, event.clientY);
        }
      } else {
        this.pinchDistance = 0;
      }
    };
    element.addEventListener("pointerup", release, { signal });
    element.addEventListener("pointercancel", release, { signal });

    element.addEventListener("wheel", (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      // Trackpads send many small deltas, mouse wheels a few large ones; exp() handles both.
      this.zoomBy(Math.exp(THREE.MathUtils.clamp(event.deltaY, -120, 120) * 0.0015));
    }, { signal, passive: false });

    element.addEventListener("keydown", (event) => {
      if (!this.enabled || event.ctrlKey || event.metaKey || event.altKey) return;
      if (KEY_PAN.has(event.code) || ["Equal", "Minus", "NumpadAdd", "NumpadSubtract"].includes(event.code)) {
        event.preventDefault();
        this.heldKeys.add(event.code);
        this.options.onChange();
      }
    }, { signal });
    element.addEventListener("keyup", (event) => this.heldKeys.delete(event.code), { signal });
    element.addEventListener("blur", () => this.heldKeys.clear(), { signal });
  }

  private currentPinchDistance() {
    const [first, second] = [...this.pointers.values()];
    return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
  }
}
