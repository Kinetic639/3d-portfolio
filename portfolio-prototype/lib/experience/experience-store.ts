import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ExperiencePhase = "boot" | "loading" | "ready" | "focusing" | "expanding" | "explore";
export type CompassDirection = "north" | "northeast" | "east" | "southeast" | "south" | "southwest" | "west" | "northwest";

type ExperienceState = {
  phase: ExperiencePhase;
  resetViewCount: number;
  cameraHeadingRadians: number;
  compassSnapDirection: CompassDirection | null;
  compassSnapCount: number;
  panSpeed: number;
  rotateSpeed: number;
  dampingFactor: number;
  isAngleLocked: boolean;
  setPhase: (phase: ExperiencePhase) => void;
  setCameraHeading: (heading: number) => void;
  snapCompassDirection: (direction: CompassDirection) => void;
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

export const useExperienceStore = create<ExperienceState>()(
  persist(
    (set, get) => ({
      phase: "boot",
      resetViewCount: 0,
      cameraHeadingRadians: 0,
      compassSnapDirection: null,
      compassSnapCount: 0,
      panSpeed: 1,
      rotateSpeed: 1,
      dampingFactor: 0.25,
      isAngleLocked: false,
      setPhase: (phase) => {
        if (canTransition(get().phase, phase)) {
          set({ phase });
        }
      },
      setCameraHeading: (cameraHeadingRadians) => set({ cameraHeadingRadians }),
      snapCompassDirection: (compassSnapDirection) => set((state) => ({
        compassSnapDirection,
        compassSnapCount: state.compassSnapCount + 1,
      })),
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
      reset: () => set({ phase: "boot", resetViewCount: 0, cameraHeadingRadians: 0, compassSnapDirection: null, compassSnapCount: 0, isAngleLocked: false }),
    }),
    {
      // Only the editor Settings menu's pan/rotate sensitivity survive a
      // reload — phase, camera heading, and everything else here must
      // always start fresh each session.
      name: "portfolio-experience-preferences.v1",
      partialize: (state) => ({ panSpeed: state.panSpeed, rotateSpeed: state.rotateSpeed }),
    },
  ),
);

export function isInteractivePhase(phase: ExperiencePhase) {
  return phase === "explore";
}
