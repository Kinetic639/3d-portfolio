import * as THREE from "three";

export type CameraBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type CameraRigOptions = {
  /** Degrees above the horizon the camera looks down from, at the start. */
  pitchDegrees?: number;
  /** Compass direction the camera stands in, seen from its target: 0 south, 90 east. At the start. */
  yawDegrees?: number;
  minPitchDegrees?: number;
  maxPitchDegrees?: number;
  /** Height of the point the camera orbits. */
  targetHeight?: number;
  /** Ground moved per pixel dragged, relative to the size of a pixel at the target. */
  panSpeed?: number;
  /** Multiplies how far a drag turns the camera. */
  rotateSpeed?: number;
  /** Whether the visitor may turn and tilt the camera. */
  rotate?: boolean;
  /** Whether Q and E turn the camera. */
  rotateKeys?: boolean;
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

/**
 * The visitor's camera as it was in the original: looking across the terrain
 * from a low angle, close, free to turn. (Original: camera at 16, 8.6, 16
 * looking at 0, 2.8, 0; polar angle limited to 20-82 degrees; distance 22-98.)
 */
export const VISITOR_CAMERA = {
  pitchDegrees: 14.4,
  yawDegrees: 45,
  minPitchDegrees: 8,
  maxPitchDegrees: 70,
  targetHeight: 2.8,
  initialDistance: 23.4,
  minDistance: 22,
  maxDistance: 98,
  panSpeed: 0.4,
  panButtons: [0, 2],
} satisfies Partial<CameraRigOptions>;

const TAP_SLOP_PX = 6;
/** Turn per pixel dragged: a drag across the viewport's height is this fraction of a full turn. */
const ROTATE_SPEED = 0.4;
const KEY_TURN_RATE = 1.4;
const DEFAULT_EASE_RATE = 12;
const KEY_PAN = new Map<string, [number, number]>([
  ["ArrowLeft", [-1, 0]], ["KeyA", [-1, 0]],
  ["ArrowRight", [1, 0]], ["KeyD", [1, 0]],
  ["ArrowUp", [0, -1]], ["KeyW", [0, -1]],
  ["ArrowDown", [0, 1]], ["KeyS", [0, 1]],
]);

/**
 * Orbiting map camera: bounded pan, zoom, turn and tilt around a point on the ground.
 *
 * Mouse: drag pans, wheel zooms, Ctrl + right drag turns and tilts. Touch: one
 * finger pans, two fingers zoom (pinch) and turn (move together). Keys:
 * arrows or WASD pan, + and - zoom, Q and E turn.
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
  private yaw: number;
  private goalYaw: number;
  private pitch: number;
  private goalPitch: number;
  private dragMode: "pan" | "rotate" = "pan";
  private readonly pinchCentre = { x: 0, y: 0 };
  private bounds: CameraBounds = { minX: -32, maxX: 32, minZ: -32, maxZ: 32 };
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pressStart: { x: number; y: number; moved: boolean; canTap: boolean } | null = null;
  private pinchDistance = 0;
  private readonly heldKeys = new Set<string>();
  private enabled = true;
  private readonly abort = new AbortController();

  constructor(element: HTMLElement, options: CameraRigOptions) {
    this.element = element;
    this.options = {
      pitchDegrees: options.pitchDegrees ?? 55,
      yawDegrees: options.yawDegrees ?? 0,
      minPitchDegrees: options.minPitchDegrees ?? 8,
      maxPitchDegrees: options.maxPitchDegrees ?? 89,
      targetHeight: options.targetHeight ?? 0,
      panSpeed: options.panSpeed ?? 1,
      rotateSpeed: options.rotateSpeed ?? 1,
      rotate: options.rotate ?? true,
      rotateKeys: options.rotateKeys ?? true,
      fov: options.fov ?? 32,
      minDistance: options.minDistance ?? 16,
      maxDistance: options.maxDistance ?? 82,
      initialDistance: options.initialDistance ?? 62,
      panButtons: options.panButtons ?? [0],
      onTap: options.onTap,
      onChange: options.onChange,
    };
    this.camera = new THREE.PerspectiveCamera(this.options.fov, 1, 0.5, 600);
    this.pitch = this.goalPitch = THREE.MathUtils.degToRad(this.options.pitchDegrees);
    this.yaw = this.goalYaw = THREE.MathUtils.degToRad(this.options.yawDegrees);
    this.target.y = this.goalTarget.y = this.options.targetHeight;
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

  /** Changes how the camera is controlled and how far it may go. Does not move it unless a limit requires. */
  configure(settings: Partial<Pick<CameraRigOptions, "panButtons" | "minDistance" | "maxDistance" | "minPitchDegrees" | "maxPitchDegrees" | "targetHeight" | "panSpeed" | "rotateSpeed" | "rotateKeys">>) {
    Object.assign(this.options, Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined)));
    this.target.y = this.goalTarget.y = this.options.targetHeight;
    this.clampGoal();
    this.apply();
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
    this.goalTarget.set(x, this.options.targetHeight, z);
    if (distance !== undefined) this.goalDistance = distance;
    this.clampGoal();
    if (immediate) this.jumpToGoal();
    this.options.onChange();
  }

  /** Turns and tilts the camera. Either angle may be left as it is. */
  setOrientation(yawDegrees: number | undefined, pitchDegrees: number | undefined, immediate = false) {
    if (yawDegrees !== undefined) {
      // Take the short way round from wherever the camera is now.
      const turn = THREE.MathUtils.degToRad(yawDegrees) - this.goalYaw;
      this.goalYaw += Math.atan2(Math.sin(turn), Math.cos(turn));
    }
    if (pitchDegrees !== undefined) this.goalPitch = THREE.MathUtils.degToRad(pitchDegrees);
    this.clampGoal();
    if (immediate) this.jumpToGoal();
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
    this.goalTarget.set(x, this.options.targetHeight, z);
    // Shift right and towards the camera, so the point sits in the middle of what is left.
    // The ground is foreshortened by the pitch; at very low angles the shift is capped.
    this.moveGoal(((inset.right ?? 0) / 2) * units, (((inset.bottom ?? 0) / 2) * units) / Math.max(Math.sin(this.goalPitch), 0.35));
    this.clampGoal();
    this.options.onChange();
  }

  /** Camera pose for a given goal, without moving the rig. Used to rehearse views during warm-up. */
  poseAt(distance: number, into: THREE.PerspectiveCamera) {
    into.copy(this.camera);
    into.position.copy(this.goalTarget).addScaledVector(this.directionFor(this.goalYaw, this.goalPitch), distance);
    into.lookAt(this.goalTarget);
    into.updateMatrixWorld();
    return into;
  }

  getGoal() {
    return {
      x: this.goalTarget.x, z: this.goalTarget.z, distance: this.goalDistance,
      yawDegrees: THREE.MathUtils.radToDeg(this.goalYaw), pitchDegrees: THREE.MathUtils.radToDeg(this.goalPitch),
    };
  }

  getView() {
    return {
      x: this.target.x, z: this.target.z, distance: this.distance,
      yawDegrees: THREE.MathUtils.radToDeg(this.yaw), pitchDegrees: THREE.MathUtils.radToDeg(this.pitch),
    };
  }

  /** Advances easing and held-key motion. Returns true while the camera is still moving. */
  update(deltaSeconds: number) {
    if (this.heldKeys.size > 0) {
      let panX = 0;
      let panZ = 0;
      let zoom = 0;
      let turn = 0;
      for (const code of this.heldKeys) {
        const pan = KEY_PAN.get(code);
        if (pan) {
          panX += pan[0];
          panZ += pan[1];
        }
        if (code === "Equal" || code === "NumpadAdd") zoom -= 1;
        if (code === "Minus" || code === "NumpadSubtract") zoom += 1;
        if (code === "KeyQ") turn += 1;
        if (code === "KeyE") turn -= 1;
      }
      const speed = this.goalDistance * 0.9 * deltaSeconds;
      this.moveGoal(panX * speed, panZ * speed);
      this.goalDistance *= 1 + zoom * 1.2 * deltaSeconds;
      this.goalYaw += turn * KEY_TURN_RATE * deltaSeconds;
      this.clampGoal();
    }

    // Frame-rate independent exponential ease.
    const ease = 1 - Math.exp(-deltaSeconds * DEFAULT_EASE_RATE);
    this.target.lerp(this.goalTarget, ease);
    this.yaw += (this.goalYaw - this.yaw) * ease;
    this.pitch += (this.goalPitch - this.pitch) * ease;
    this.distance += (this.goalDistance - this.distance) * ease;

    const settled =
      this.heldKeys.size === 0 &&
      this.target.distanceToSquared(this.goalTarget) < 1e-6 &&
      Math.abs(this.goalDistance - this.distance) < 1e-3 &&
      Math.abs(this.goalYaw - this.yaw) < 1e-4 &&
      Math.abs(this.goalPitch - this.pitch) < 1e-4;
    if (settled) this.jumpToGoal();
    else this.apply();
    return !settled;
  }

  dispose() {
    this.abort.abort();
  }

  /** Unit vector from the target to the camera. Yaw 0 puts the camera south of the target, looking north. */
  private directionFor(yaw: number, pitch: number) {
    return this.direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  }

  private apply() {
    this.camera.position.copy(this.target).addScaledVector(this.directionFor(this.yaw, this.pitch), this.distance);
    this.camera.lookAt(this.target);
  }

  private jumpToGoal() {
    this.target.copy(this.goalTarget);
    this.distance = this.goalDistance;
    this.yaw = this.goalYaw;
    this.pitch = this.goalPitch;
    this.apply();
  }

  /** Moves the goal over the ground in the camera's own terms: `right` across the screen, `back` towards the camera. */
  private moveGoal(right: number, back: number) {
    const sin = Math.sin(this.goalYaw);
    const cos = Math.cos(this.goalYaw);
    this.goalTarget.x += right * cos + back * sin;
    this.goalTarget.z += -right * sin + back * cos;
  }

  private clampGoal() {
    this.goalPitch = THREE.MathUtils.clamp(
      this.goalPitch,
      THREE.MathUtils.degToRad(this.options.minPitchDegrees),
      THREE.MathUtils.degToRad(this.options.maxPitchDegrees),
    );
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
    const units = this.worldUnitsPerPixel() * this.options.panSpeed;
    // Dragging down pushes the view away from the camera, as with any map.
    this.moveGoal(-dx * units, -dy * units);
    this.clampGoal();
    this.options.onChange();
  }

  private rotateByPixels(dx: number, dy: number) {
    if (!this.options.rotate) return;
    const perPixel = (2 * Math.PI * ROTATE_SPEED * this.options.rotateSpeed) / (this.element.clientHeight || 1);
    this.goalYaw -= dx * perPixel;
    this.goalPitch += dy * perPixel;
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
      if (!this.enabled) return;
      const mouse = event.pointerType === "mouse";
      const rotates = mouse && event.button === 2 && event.ctrlKey && this.options.rotate;
      if (mouse && !rotates && !this.options.panButtons.includes(event.button)) return;
      try {
        // Keeps the drag alive when the pointer leaves the canvas.
        element.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a nicety; a pointer that is already gone must not break input handling.
      }
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 1) {
        this.dragMode = rotates ? "rotate" : "pan";
        // Only the main button (or a finger) can click; a still press of another button is nothing.
        this.pressStart = { x: event.clientX, y: event.clientY, moved: false, canTap: !mouse || event.button === 0 };
      } else {
        // A second finger turns the gesture into a pinch; it can no longer be a tap.
        if (this.pressStart) this.pressStart.moved = true;
        this.pinchDistance = this.currentPinchDistance();
        this.currentPinchCentre(this.pinchCentre);
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
        // Two fingers moving together turn and tilt the camera.
        const { x, y } = this.pinchCentre;
        this.currentPinchCentre(this.pinchCentre);
        this.rotateByPixels(this.pinchCentre.x - x, this.pinchCentre.y - y);
        return;
      }

      const press = this.pressStart;
      if (press && !press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP_SLOP_PX) {
        press.moved = true;
      }
      if (!press?.moved) return;
      if (this.dragMode === "rotate") this.rotateByPixels(dx, dy);
      else this.panByPixels(dx, dy);
    }, { signal });

    const release = (event: PointerEvent) => {
      if (!this.pointers.delete(event.pointerId)) return;
      const press = this.pressStart;
      if (this.pointers.size === 0) {
        this.pressStart = null;
        if (this.enabled && press && press.canTap && !press.moved && event.type === "pointerup") {
          this.options.onTap?.(event.clientX, event.clientY);
        }
      } else {
        this.pinchDistance = 0;
      }
    };
    element.addEventListener("pointerup", release, { signal });
    element.addEventListener("pointercancel", release, { signal });

    // The right button drags the map; its menu would only get in the way.
    element.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });

    element.addEventListener("wheel", (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      // Trackpads send many small deltas, mouse wheels a few large ones; exp() handles both.
      this.zoomBy(Math.exp(THREE.MathUtils.clamp(event.deltaY, -120, 120) * 0.0015));
    }, { signal, passive: false });

    element.addEventListener("keydown", (event) => {
      if (!this.enabled || event.ctrlKey || event.metaKey || event.altKey) return;
      const turns = this.options.rotate && this.options.rotateKeys && (event.code === "KeyQ" || event.code === "KeyE");
      if (turns || KEY_PAN.has(event.code) || ["Equal", "Minus", "NumpadAdd", "NumpadSubtract"].includes(event.code)) {
        event.preventDefault();
        this.heldKeys.add(event.code);
        this.options.onChange();
      }
    }, { signal });
    element.addEventListener("keyup", (event) => this.heldKeys.delete(event.code), { signal });
    element.addEventListener("blur", () => this.heldKeys.clear(), { signal });
  }

  private currentPinchCentre(into: { x: number; y: number }) {
    const [first, second] = [...this.pointers.values()];
    if (first && second) {
      into.x = (first.x + second.x) / 2;
      into.y = (first.y + second.y) / 2;
    }
  }

  private currentPinchDistance() {
    const [first, second] = [...this.pointers.values()];
    return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
  }
}
