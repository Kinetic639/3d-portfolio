import { createStore, type StoreApi } from "zustand/vanilla";
import type { MapContentReference } from "@/lib/maps/map-definition";
import type { FrameRecorder } from "@/lib/perf/frame-recorder";

/**
 * The only channel between the 3D engine and the React UI.
 *
 * Three rules keep the page's UI work independent of what happens in the world:
 *
 * 1. `state` holds low-frequency, semantic facts only (which phase we are in,
 *    which interactable is hovered, how far loading got). It changes a handful
 *    of times per interaction, never per frame or per pointer move.
 * 2. The UI talks to the engine through `commands`; the engine talks back
 *    through `events`. Neither side calls the other directly.
 * 3. Per-frame data (pointer position, camera transform, frame times) never
 *    enters this module. The engine keeps it internally; diagnostics read it
 *    from the engine and write to the DOM without React.
 *
 * The open content item is deliberately NOT stored here: the URL is its source
 * of truth, so Back, Escape and deep links all work through the router.
 */
export type WorldPhase =
  /** No engine yet: landing page only. */
  | "idle"
  /** Engine code and world assets are downloading in the background. */
  | "loading"
  /** Assets are in memory; GPU resources and shaders are being prepared. */
  | "warming"
  /** Warm-up verified. Entering is guaranteed not to load or compile anything. */
  | "ready"
  /** Transition from the landing page into the world is playing. */
  | "entering"
  /** Visitor is exploring. */
  | "world"
  /** Transition back to the landing page is playing. */
  | "leaving"
  /** WebGL is missing or the engine failed. The landing page stays fully usable. */
  | "unavailable";

export type QualityTier = "low" | "medium" | "high";

export type HoveredInteractable = {
  id: string;
  label: string;
  content: MapContentReference | null;
  /** What a click does: open content, or start a mini-game. */
  action: "open" | "play";
};

/** The creature the visitor has chosen, if any (see actor.ts). */
export type ActorHud = {
  entityId: string;
  name: string;
  state: "idle" | "walking" | "running" | "taking-off" | "flying" | "landing" | "preview";
  /** How a click on the ground sends it: "auto" picks walk, run or flight by distance and height. */
  movement: "auto" | "walk" | "run" | "flight";
  /** The camera keeps it in view; moving the view by hand stops that. */
  following: boolean;
};

export type MinigameHud = {
  gameId: string;
  zoneId: string;
  title: string;
  /** Free-form counters a mini-game wants shown, e.g. { ore: 3 }. */
  counters: Record<string, number>;
  hint?: string;
};

export type WorldBridgeState = {
  phase: WorldPhase;
  /** 0-1 across loading and warming. */
  progress: number;
  quality: QualityTier;
  hovered: HoveredInteractable | null;
  minigame: MinigameHud | null;
  actor: ActorHud | null;
  /** The visitor locked the camera's tilt (the original's angle lock). */
  angleLocked: boolean;
  error: string | null;
};

export type WorldCommand =
  | { type: "enter"; focus?: MapContentReference; inset?: { right?: number; bottom?: number }; reducedMotion?: boolean }
  | { type: "exit"; reducedMotion?: boolean }
  | { type: "focus-content"; content: MapContentReference; inset?: { right?: number; bottom?: number } }
  | { type: "clear-focus" }
  | { type: "set-quality"; quality: QualityTier }
  | { type: "leave-minigame" }
  | { type: "release-actor" }
  | { type: "set-angle-lock"; locked: boolean }
  | { type: "reset-view" }
  | { type: "follow-actor" }
  | { type: "set-actor-movement"; movement: ActorHud["movement"] };

export type WorldEvent =
  | { type: "content-activated"; content: MapContentReference; interactableId: string }
  | { type: "entered" }
  | { type: "exited" };

type Listener<T> = (message: T) => void;

class Channel<T> {
  private listeners = new Set<Listener<T>>();

  subscribe(listener: Listener<T>) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(message: T) {
    // Copy: a listener may unsubscribe while being notified.
    for (const listener of [...this.listeners]) listener(message);
  }
}

/** What the engine lets diagnostics read. Not reactive: readers poll it (the perf HUD, twice a second). */
export type EngineDiagnostics = {
  frames: FrameRecorder;
  /** Renderer counters of the last frame drawn. */
  stats: { readonly drawCalls: number; readonly triangles: number; readonly geometries: number; readonly textures: number; readonly programs: number; readonly picks: number };
};

export type WorldBridge = {
  store: StoreApi<WorldBridgeState>;
  commands: Channel<WorldCommand>;
  events: Channel<WorldEvent>;
  /** Engine-side helper: only publishes when something actually changed. */
  set: (patch: Partial<WorldBridgeState>) => void;
  /** Back to the initial state, bypassing transition rules. For engine teardown only. */
  reset: () => void;
  /** Per-frame data for diagnostics (rule 3): set by the engine while it exists. */
  diagnostics: { engine: EngineDiagnostics | null };
};

const INITIAL_STATE: WorldBridgeState = {
  phase: "idle",
  progress: 0,
  quality: "high",
  hovered: null,
  minigame: null,
  actor: null,
  angleLocked: false,
  error: null,
};

/** Legal phase changes. Anything else is a programming error and is ignored with a warning. */
const PHASE_TRANSITIONS: Record<WorldPhase, WorldPhase[]> = {
  idle: ["loading", "unavailable"],
  loading: ["warming", "unavailable", "idle"],
  warming: ["ready", "unavailable", "idle"],
  ready: ["entering", "unavailable", "idle"],
  entering: ["world", "unavailable"],
  world: ["leaving", "unavailable"],
  leaving: ["ready", "unavailable"],
  unavailable: [],
};

export function canTransitionPhase(from: WorldPhase, to: WorldPhase) {
  return from === to || PHASE_TRANSITIONS[from].includes(to);
}

export function createWorldBridge(): WorldBridge {
  const store = createStore<WorldBridgeState>(() => ({ ...INITIAL_STATE }));

  const set = (patch: Partial<WorldBridgeState>) => {
    const current = store.getState();
    let next = patch;
    if (patch.phase !== undefined && !canTransitionPhase(current.phase, patch.phase)) {
      console.warn(`[world-bridge] Ignored illegal phase change ${current.phase} -> ${patch.phase}.`);
      const { phase: _ignored, ...rest } = patch;
      void _ignored;
      next = rest;
    }
    const changed = (Object.keys(next) as Array<keyof WorldBridgeState>).some((key) => !isEqual(current[key], next[key]));
    if (changed) store.setState(next);
  };

  const reset = () => store.setState({ ...INITIAL_STATE }, true);

  return { store, commands: new Channel<WorldCommand>(), events: new Channel<WorldEvent>(), set, reset, diagnostics: { engine: null } };
}

function isEqual(left: unknown, right: unknown) {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  // State values are small flat-ish records; a structural compare avoids
  // publishing identical hover/minigame objects created on every engine tick.
  return JSON.stringify(left) === JSON.stringify(right);
}

/** One bridge per page. The engine and every UI component import this instance. */
export const worldBridge = createWorldBridge();
