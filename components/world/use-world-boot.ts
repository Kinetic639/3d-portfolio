"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { worldBridge, type QualityTier } from "@/lib/bridge/world-bridge";
import { resolveContentReference } from "@/lib/content/content";
import { migrateMapDefinition, type MapContentReference } from "@/lib/maps/map-definition";

type Disposable = { dispose: () => void };

/**
 * Warms the browser's GPU process from a worker (see webgl-probe.worker.ts).
 * Resolves false only when the worker positively reports no WebGL 2; if the
 * probe itself cannot run, the main-thread context creation decides.
 */
function probeWebGL2(signal: AbortSignal): Promise<boolean> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../../lib/engine/webgl-probe.worker.ts", import.meta.url), { type: "module" });
    } catch {
      resolve(true);
      return;
    }
    const finish = (supported: boolean) => {
      window.clearTimeout(timer);
      worker.terminate();
      resolve(supported);
    };
    const timer = window.setTimeout(() => finish(true), 4000);
    signal.addEventListener("abort", () => finish(true), { once: true });
    worker.onmessage = (event: MessageEvent<boolean>) => finish(event.data);
    worker.onerror = () => finish(true);
    worker.postMessage(null);
  });
}

/** A starting guess from cheap device hints. Warm-up measures real frames and lowers it if needed. */
function guessQuality(): QualityTier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if ((nav.deviceMemory ?? 8) <= 2 || (nav.hardwareConcurrency ?? 8) <= 2) return "low";
  if (coarse || (nav.deviceMemory ?? 8) <= 4 || (nav.hardwareConcurrency ?? 8) <= 4) return "medium";
  return "high";
}

function prefersSavingData() {
  return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
}

/**
 * Loads and warms the world behind the landing page.
 *
 * Nothing starts until the page has finished loading and the browser is
 * idle, so the landing page's own rendering is never in competition with it.
 * The engine and map are separate chunks fetched here, not part of the page's
 * initial JavaScript. With the Save-Data preference, loading waits for the
 * visitor to ask for it (the returned `start`).
 */
export function useWorldBoot(mapId: string, canvasRef: RefObject<HTMLCanvasElement | null>, bakeHash?: string) {
  const startRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    const { signal } = controller;
    let engine: Disposable | null = null;
    let started = false;

    const boot = async () => {
      // Not an error for the visitor: without WebGL the landing page is the whole site.
      const unavailable = () => worldBridge.set({ phase: "unavailable" });
      if (!(await probeWebGL2(signal))) return unavailable();
      if (signal.aborted) return;
      // The same attributes the engine would ask for; null means WebGL 2 is not usable here.
      const context = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
      if (!context) return unavailable();
      worldBridge.set({ phase: "loading", progress: 0, quality: guessQuality() });
      // A baked world is one binary file. Without a current bake, or if the file
      // cannot be fetched, the voxel map is the fallback: slower, but the world still opens.
      const voxelMap = () => import(`@/maps/${mapId}/map.json`).then((module: { default: unknown }) => module.default);
      const bakedWorld = (hash: string) =>
        fetch(`/world-data/${mapId}/${hash}.bin`, { signal })
          .then((response) => {
            if (!response.ok) throw new Error(`Baked world request failed (${response.status}).`);
            // The file is stored gzip-compressed; decompression runs off the main thread.
            return new Response(response.body!.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
          })
          .catch((error: unknown) => {
            if (signal.aborted) throw error;
            console.warn("Falling back to the voxel map:", error);
            return voxelMap();
          });
      const [{ WorldEngine }, source] = await Promise.all([
        import("@/lib/engine/world-engine"),
        bakeHash ? bakedWorld(bakeHash) : voxelMap(),
      ]);
      if (signal.aborted) return;

      const instance = new WorldEngine(canvas, worldBridge, context);
      engine = instance;
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __worldEngine?: unknown }).__worldEngine = instance;
      }

      const loadOptions = {
        signal,
        describeContent: (reference: MapContentReference) => resolveContentReference(PORTFOLIO_CONTENT, reference)?.title ?? null,
        onProgress: (fraction: number) => worldBridge.set({ progress: fraction * 0.6 }),
      };
      if (source instanceof ArrayBuffer) instance.loadBaked(source, loadOptions);
      else await instance.loadMap(migrateMapDefinition(source), loadOptions);
      if (signal.aborted) return;

      worldBridge.set({ phase: "warming", progress: 0.6 });
      const report = await instance.warmUp({
        signal,
        onProgress: (fraction) => worldBridge.set({ progress: 0.6 + fraction * 0.4 }),
      });
      if (signal.aborted || !report) return;
      worldBridge.set({ phase: "ready", progress: 1 });
    };

    const start = () => {
      if (started || signal.aborted) return;
      started = true;
      boot().catch((error: unknown) => {
        if (signal.aborted) return;
        console.error(error);
        worldBridge.set({ phase: "unavailable", error: "The 3D world failed to start." });
      });
    };
    startRef.current = start;

    let idleHandle = 0;
    const whenIdle = () => {
      if (prefersSavingData()) return;
      // Safari has no requestIdleCallback; a short delay after load is the closest substitute.
      idleHandle = typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(start, { timeout: 3000 })
        : window.setTimeout(start, 600);
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true, signal });

    return () => {
      controller.abort();
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleHandle);
      window.clearTimeout(idleHandle);
      engine?.dispose();
      worldBridge.reset();
    };
  }, [mapId, canvasRef, bakeHash]);

  /** Starts loading now. Only needed when automatic loading was held back. */
  return useCallback(() => startRef.current(), []);
}
