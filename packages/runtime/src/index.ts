import type { WorldRuntime } from "@portfolio/contracts";
export type { WorldRuntime } from "@portfolio/contracts";
/** Factory contract only. Renderer choice and execution are deferred to the vertical slice. */
export type WorldRuntimeFactory = (surface: HTMLCanvasElement) => WorldRuntime;
