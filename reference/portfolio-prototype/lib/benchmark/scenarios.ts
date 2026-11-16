import type { BenchmarkCameraTransform } from "@/components/experience/PortfolioExperience";
import type { BenchmarkScenarioDefinition, BenchmarkScenarioId } from "./types";

export const BENCHMARK_SCENARIOS: BenchmarkScenarioDefinition[] = [
  {
    id: "idle-overview",
    name: "Idle overview",
    description: "Fixed overview camera with steady-state rendering.",
    supported: true,
  },
  {
    id: "scripted-camera",
    name: "Scripted camera tour",
    description: "Deterministic orbit and zoom path around the active map.",
    supported: true,
  },
  {
    id: "dense-closeup",
    name: "Dense-area close-up",
    description: "Fixed close camera near the densest available map area.",
    supported: true,
  },
  {
    id: "interaction-raycast",
    name: "Interaction/raycast test",
    description: "Reserved scenario interface; unsupported until the interaction layer exposes a deterministic adapter.",
    supported: false,
  },
  {
    id: "expansion-reveal",
    name: "Expansion reveal",
    description: "Measures the normal loader-to-expanded-map reveal animation.",
    supported: true,
  },
];

export function getBenchmarkScenario(id: BenchmarkScenarioId) {
  return BENCHMARK_SCENARIOS.find((scenario) => scenario.id === id) ?? BENCHMARK_SCENARIOS[0];
}

export function getScenarioCamera(id: BenchmarkScenarioId, progress: number): BenchmarkCameraTransform {
  if (id === "scripted-camera") {
    const angle = progress * Math.PI * 2;
    const radius = 64 - Math.sin(progress * Math.PI) * 20;
    return {
      position: { x: Math.cos(angle) * radius, y: 34 + Math.sin(progress * Math.PI * 2) * 8, z: Math.sin(angle) * radius },
      target: { x: 0, y: 0, z: 0 },
    };
  }

  if (id === "dense-closeup") {
    return {
      position: { x: 18, y: 18, z: 24 },
      target: { x: 0, y: 1, z: 0 },
    };
  }

  return {
    position: { x: 42, y: 52, z: 62 },
    target: { x: 0, y: 0, z: 0 },
  };
}
