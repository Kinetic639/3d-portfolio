import { create } from "zustand";

export type ExperiencePhase = "boot" | "loading" | "ready" | "focusing" | "expanding" | "explore";

type ExperienceState = {
  phase: ExperiencePhase;
  resetViewCount: number;
  panSpeed: number;
  rotateSpeed: number;
  dampingFactor: number;
  isAngleLocked: boolean;
  setPhase: (phase: ExperiencePhase) => void;
  setPanSpeed: (speed: number) => void;
  setRotateSpeed: (speed: number) => void;
  setDampingFactor: (factor: number) => void;
  toggleAngleLock: () => void;
  markLoading: () => void;
  markReady: () => void;
  startExpansion: () => void;
  markExpanding: () => void;
  markExplore: () => void;
  resetView: () => void;
  reset: () => void;
};

const transitionOrder: Record<ExperiencePhase, number> = {
  boot: 0,
  loading: 1,
  ready: 2,
  focusing: 3,
  expanding: 4,
  explore: 5,
};

function canTransition(from: ExperiencePhase, to: ExperiencePhase) {
  return transitionOrder[to] >= transitionOrder[from];
}

export const useExperienceStore = create<ExperienceState>((set, get) => ({
  phase: "boot",
  resetViewCount: 0,
  panSpeed: 1,
  rotateSpeed: 1,
  dampingFactor: 0.25,
  isAngleLocked: false,
  setPhase: (phase) => {
    if (canTransition(get().phase, phase)) {
      set({ phase });
    }
  },
  setPanSpeed: (panSpeed) => set({ panSpeed }),
  setRotateSpeed: (rotateSpeed) => set({ rotateSpeed }),
  setDampingFactor: (dampingFactor) => set({ dampingFactor }),
  toggleAngleLock: () => set((state) => ({ isAngleLocked: !state.isAngleLocked })),
  markLoading: () => get().setPhase("loading"),
  markReady: () => get().setPhase("ready"),
  startExpansion: () => get().setPhase("focusing"),
  markExpanding: () => get().setPhase("expanding"),
  markExplore: () => get().setPhase("explore"),
  resetView: () => set((state) => ({ resetViewCount: state.resetViewCount + 1 })),
  reset: () => set({ phase: "boot", resetViewCount: 0, isAngleLocked: false }),
}));

export function isInteractivePhase(phase: ExperiencePhase) {
  return phase === "explore";
}
