"use client";

import { useEffect, useRef } from "react";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { worldBridge } from "@/lib/bridge/world-bridge";
import { resolveContentReference } from "@/lib/content/content";
import { migrateMapDefinition } from "@/lib/maps/map-definition";
import WorldStatus from "./WorldStatus";
import styles from "./WorldView.module.css";

/**
 * Mounts the engine on a canvas. This component renders once: everything the
 * engine does afterwards happens outside React. The engine module is loaded
 * with a dynamic import so three.js stays out of the page's initial bundle.
 */
export default function WorldView({ mapId }: { mapId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    const { signal } = controller;
    let dispose: (() => void) | null = null;

    const boot = async () => {
      worldBridge.set({ phase: "loading", progress: 0 });
      const [{ WorldEngine }, { default: rawMap }] = await Promise.all([
        import("@/lib/engine/world-engine"),
        import(`@/maps/${mapId}/map.json`),
      ]);
      if (signal.aborted) return;
      if (!WorldEngine.isSupported()) {
        worldBridge.set({ phase: "unavailable", error: "This browser cannot display the 3D world (WebGL 2 is unavailable)." });
        return;
      }

      const engine = new WorldEngine(canvas, worldBridge);
      dispose = () => engine.dispose();
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __worldEngine?: unknown }).__worldEngine = engine;
      }

      await engine.loadMap(migrateMapDefinition(rawMap), {
        signal,
        describeContent: (reference) => resolveContentReference(PORTFOLIO_CONTENT, reference)?.title ?? null,
        onProgress: (fraction) => worldBridge.set({ progress: fraction * 0.9 }),
      });
      if (signal.aborted) return;
      worldBridge.set({ phase: "warming", progress: 0.9 });
      await engine.compile();
      if (signal.aborted) return;

      // Until the landing page exists the world is entered straight away.
      worldBridge.set({ phase: "ready", progress: 1 });
      worldBridge.set({ phase: "entering" });
      worldBridge.set({ phase: "world" });
      engine.invalidate();
    };

    boot().catch((error: unknown) => {
      if (signal.aborted) return;
      console.error(error);
      worldBridge.set({ phase: "unavailable", error: "The 3D world failed to start." });
    });

    return () => {
      controller.abort();
      dispose?.();
      worldBridge.reset();
    };
  }, [mapId]);

  return (
    <div className={styles.root}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        data-world
        tabIndex={0}
        aria-label="Interactive 3D world. Drag or use arrow keys to move, scroll or use plus and minus to zoom. Use the menu to open content with the keyboard."
      />
      <WorldStatus />
    </div>
  );
}
