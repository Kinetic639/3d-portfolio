import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { dampLook, glance, LOOK_LIMITS, lookTowards, looksEqual, NECK_SHARE, type Look } from "./look";

/**
 * The living portrait (docs/roadmap.md, B3): the guide from the waist up in
 * its own small canvas inside the frame. A separate scene, not the world's
 * canvas: on phones the portrait scrolls with the page, which a fixed canvas
 * could only follow by redrawing (and lagging) on every scroll.
 *
 * It draws only while it is running (in view, the tab shown, the world not in
 * front) and at most 30 times a second. The head and neck turn towards the
 * pointer and the eyes follow by moving their texture (the test guide has no
 * eye bones); without a pointer it glances around now and then. Face shape
 * keys (blink...) are used when the model has them.
 */

/** At most 30 frames a second; the small allowance keeps a 60 Hz display at every other frame, not every third. */
const FRAME_MS = 1000 / 30 - 4;
/** Head turn speed (per second): quick enough to feel alive, slow enough to be calm. */
const TURN_RATE = 5;
/** How far the eyes' texture moves for a full turn: the eyes lead the head. */
const EYE_SHIFT = { x: 0.11, y: 0.06 };
/** After this long without the pointer moving, the guide glances around on its own. */
const POINTER_IDLE_MS = 4000;
/** Looking at the visitor: the idle clip looks a little down, so the head comes up a touch. */
const REST: Look = { yaw: 0, pitch: 0.12 };
/** One blink, closing and opening. */
const BLINK_MS = 150;

export type PortraitStats = { frames: number; loadedAt: number | null };

export class PortraitScene {
  readonly stats: PortraitStats = { frames: 0, loadedAt: null };
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(26, 4 / 5, 0.05, 20);
  private mixer: THREE.AnimationMixer | null = null;
  private idle: THREE.AnimationAction | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private head: THREE.Bone | null = null;
  private neck: THREE.Bone | null = null;
  private eyes: THREE.Texture | null = null;
  private blink: { mesh: THREE.Mesh; index: number } | null = null;
  private look: Look = { ...REST };
  private target: Look = { ...REST };
  private pointerAt = -Infinity;
  private nextGlanceAt = 0;
  private nextBlinkAt = 0;
  private blinkStartedAt = -Infinity;
  private running = false;
  private frame = 0;
  private lastDraw = 0;
  private readonly still: boolean;
  // Scratch objects, reused every frame.
  private readonly eyesWorld = new THREE.Vector3();
  private readonly parentWorld = new THREE.Quaternion();
  private readonly turn = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");

  constructor(private readonly canvas: HTMLCanvasElement, options: { still: boolean }) {
    this.still = options.still;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x667766, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.5, 3, 3);
    this.scene.add(key);
  }

  /** Loads the model and frames it. Resolves once the first frame is drawn. */
  async load(url: string, signal?: AbortSignal) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    if (signal?.aborted) return;
    const model = gltf.scene;
    this.scene.add(model);
    model.traverse((object) => {
      if ((object as THREE.Bone).isBone && object.name === "Head") this.head = object as THREE.Bone;
      if ((object as THREE.Bone).isBone && object.name === "neck_01") this.neck = object as THREE.Bone;
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.name === "MI_Eyes" && material.map) {
        // Its own copy: moving it must not move any other user of the texture.
        material.map = material.map.clone();
        this.eyes = material.map;
      }
      const blinkIndex = mesh.morphTargetDictionary?.blink;
      if (blinkIndex !== undefined) this.blink = { mesh, index: blinkIndex };
    });

    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.idle = this.actions.get("Idle") ?? null;
    this.idle?.play();
    this.mixer.update(0.8);
    model.updateMatrixWorld(true);

    // Frame from the chest up, around the head as it stands in the idle pose.
    const head = new THREE.Vector3();
    this.head?.getWorldPosition(head);
    this.camera.position.set(0, head.y + 0.02, 1.85);
    this.camera.lookAt(0, head.y - 0.12, 0);

    await this.renderer.compileAsync(this.scene, this.camera);
    if (signal?.aborted) return;
    this.draw(performance.now());
    this.stats.loadedAt = performance.now();
  }

  /** Canvas size in CSS pixels; drawn at the device's pixel ratio, up to 2. */
  resize(width: number, height: number) {
    if (width === 0 || height === 0) return;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (!this.running) this.draw(performance.now());
  }

  /** The pointer moved (client pixels). */
  pointTo(clientX: number, clientY: number) {
    if (this.still || !this.head) return;
    this.pointerAt = performance.now();
    const rect = this.canvas.getBoundingClientRect();
    // The eyes' place on the page: the head bone, projected into the canvas.
    this.head.getWorldPosition(this.eyesWorld).project(this.camera);
    const eyesX = rect.left + ((this.eyesWorld.x + 1) / 2) * rect.width;
    const eyesY = rect.top + ((1 - this.eyesWorld.y) / 2) * rect.height;
    const towards = lookTowards(clientX, clientY, eyesX, eyesY);
    // Level with the eyes is straight ahead, which for this idle pose means the head a touch up.
    this.target = { yaw: towards.yaw, pitch: towards.pitch + REST.pitch };
  }

  /** Plays a clip once (a greeting...), then goes back to idle. */
  play(name: string) {
    const action = this.actions.get(name);
    if (!action || !this.idle || this.still) return;
    action.reset().setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    action.crossFadeFrom(this.idle, 0.25, false).play();
    const back = () => {
      this.mixer?.removeEventListener("finished", back);
      this.idle?.reset().crossFadeFrom(action, 0.35, false).play();
    };
    this.mixer?.addEventListener("finished", back);
  }

  /** Starts or stops drawing. Stopped, it draws nothing at all. */
  setRunning(running: boolean) {
    if (this.still || running === this.running) return;
    this.running = running;
    if (running) {
      this.lastDraw = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    } else {
      cancelAnimationFrame(this.frame);
    }
  }

  /**
   * The poster (scripts/guide/portrait-poster.mjs): the idle pose looking at
   * the visitor, as a WebP data URL with a transparent background.
   */
  capture(): string {
    this.look = { ...REST };
    this.target = { ...REST };
    this.pointerAt = Infinity;
    this.idle?.reset().play();
    this.mixer?.setTime(0.8);
    this.draw(performance.now());
    return this.canvas.toDataURL("image/webp", 0.9);
  }

  get isRunning() {
    return this.running;
  }

  dispose() {
    this.setRunning(false);
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const material of [mesh.material].flat()) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    });
    this.renderer.dispose();
  }

  private readonly tick = (now: number) => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.tick);
    if (now - this.lastDraw < FRAME_MS) return;
    this.draw(now);
  };

  private draw(now: number) {
    const delta = Math.min(0.1, Math.max(0, now - this.lastDraw) / 1000);
    this.lastDraw = now;
    if (now - this.pointerAt > POINTER_IDLE_MS && now >= this.nextGlanceAt) {
      // Nobody points: a calm glance somewhere, now and then, and back to the visitor.
      this.target = this.nextGlanceAt === 0 || Math.random() < 0.4 ? { ...REST } : glance(Math.random);
      this.nextGlanceAt = now + 2500 + Math.random() * 3500;
    }
    if (!looksEqual(this.look, this.target)) this.look = dampLook(this.look, this.target, TURN_RATE, delta);

    this.mixer?.update(delta);
    // Turns are added on top of the clip, in world space: neck first, then the head.
    this.turnBone(this.neck, this.look.yaw * NECK_SHARE, this.look.pitch * NECK_SHARE);
    this.turnBone(this.head, this.look.yaw * (1 - NECK_SHARE), this.look.pitch * (1 - NECK_SHARE));
    if (this.eyes) {
      this.eyes.offset.set((-this.look.yaw / LOOK_LIMITS.yaw) * EYE_SHIFT.x, (this.look.pitch / LOOK_LIMITS.up) * EYE_SHIFT.y);
    }
    this.updateBlink(now);
    this.renderer.render(this.scene, this.camera);
    this.stats.frames += 1;
  }

  /** Rotates a bone by a yaw and pitch given in world space (the camera's view), after the clip has posed it. */
  private turnBone(bone: THREE.Bone | null, yaw: number, pitch: number) {
    if (!bone?.parent || (yaw === 0 && pitch === 0)) return;
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(this.parentWorld);
    this.turn.setFromEuler(this.euler.set(-pitch, yaw, 0));
    // local' = (P^-1 * R * P) * local, so the bone turns by R in the world.
    const parentInverse = this.parentWorld.clone().invert();
    bone.quaternion.premultiply(parentInverse.multiply(this.turn).multiply(this.parentWorld));
  }

  /** Blinks every few seconds, when the model has a blink shape. */
  private updateBlink(now: number) {
    if (!this.blink) return;
    if (now >= this.nextBlinkAt) {
      this.blinkStartedAt = now;
      this.nextBlinkAt = now + 2500 + Math.random() * 3500;
    }
    const since = now - this.blinkStartedAt;
    this.blink.mesh.morphTargetInfluences![this.blink.index] = since < BLINK_MS ? Math.sin((since / BLINK_MS) * Math.PI) : 0;
  }
}
