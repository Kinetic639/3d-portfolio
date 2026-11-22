"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useWorldBridge } from "@/lib/bridge/use-world-bridge";
import { worldBridge } from "@/lib/bridge/world-bridge";
import { useUiWork } from "@/lib/perf/ui-work";
import type { PortraitScene } from "@/lib/portrait/portrait-scene";
import styles from "./Portrait.module.css";

/**
 * Whether the entry screen with the door covers the page (decided in <head>, then kept by the screen):
 * the page is hidden under it, though still "on screen" for an IntersectionObserver.
 */
const entryCovers = () => {
  const data = document.documentElement.dataset;
  return "entryScreen" in data || "entryOpen" in data;
};
function subscribeEntry(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-entry-screen", "data-entry-open"] });
  return () => observer.disconnect();
}

/** How long the page has to be quiet (world ready, portrait on screen) before the living portrait loads. */
const QUIET_MS = 2000;

/**
 * The living portrait over its poster (docs/roadmap.md, B3).
 *
 * Starts only when it can cost the page nothing it needs: after the world is
 * ready (the page and the world have loaded), when this portrait is on screen
 * (the sidebar's on wide screens, the content's on phones), and not for
 * visitors who prefer reduced motion or save data: they keep the poster,
 * which is the same picture standing still. It draws only while it is on
 * screen, the tab is shown and the world is not in front.
 */
export default function PortraitLive({ modelUrl, placement }: { modelUrl: string; placement: string }) {
  useUiWork();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PortraitScene | null>(null);
  const phase = useWorldBridge((state) => state.phase);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const covered = useSyncExternalStore(subscribeEntry, entryCovers, () => false);
  // Free: the world is ready (not in front) and no entry screen hides the page.
  const worldFree = phase === "ready" && !covered;
  const wanted = useRef(false);
  const unmounted = useRef(false);

  // On screen at all? (The other placement's portrait is not displayed, so never is.)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Load once: the world is ready, this portrait is on screen, and motion is welcome.
  // Not at the very moment the world is ready, but after a quiet moment on the page:
  // a visitor who goes straight through the door gets an entry that loads nothing.
  useEffect(() => {
    if (wanted.current || !worldFree || !visible) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    let idle = 0;
    const timer = window.setTimeout(() => {
      idle = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(start, { timeout: 2000 }) : window.setTimeout(start, 0);
    }, QUIET_MS);
    return () => {
      window.clearTimeout(timer);
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      window.clearTimeout(idle);
    };

    function start() {
      if (wanted.current || worldBridge.store.getState().phase !== "ready" || entryCovers()) return;
      wanted.current = true;
      load(canvasRef.current!);
    }
  }, [worldFree, visible]); // eslint-disable-line react-hooks/exhaustive-deps -- load reads the latest props through its closure; only these two decide when

  function load(canvas: HTMLCanvasElement) {
    void (async () => {
      const { PortraitScene } = await import("@/lib/engine/runtime");
      if (unmounted.current) return;
      const scene = new PortraitScene(canvas, { still: false });
      scene.resize(canvas.clientWidth, canvas.clientHeight);
      await scene.load(modelUrl);
      if (unmounted.current) {
        scene.dispose();
        return;
      }
      sceneRef.current = scene;
      if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_WORLD_PROBE === "1") {
        const probe = window as unknown as { __portrait?: Record<string, PortraitScene> };
        probe.__portrait = { ...probe.__portrait, [placement]: scene };
      }
      setLoaded(true);
    })().catch((error: unknown) => {
      // The poster stays: a portrait that cannot come alive is still a portrait.
      if (!unmounted.current) console.warn("The living portrait did not start:", error);
    });
  }

  useEffect(() => {
    // Mounted again (development mounts every component twice): loads may finish.
    unmounted.current = false;
    return () => {
      // An unmount mid-load disposes the scene when its load returns (above).
      unmounted.current = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Draw only while it shows something to someone.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!loaded || !scene) return;
    const update = () => scene.setRunning(visible && worldFree && document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      scene.setRunning(false);
    };
  }, [loaded, visible, worldFree]);

  // The head follows the pointer (where there is one) and the size follows the frame.
  useEffect(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!loaded || !scene || !canvas) return;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") scene.pointTo(event.clientX, event.clientY);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    const resize = new ResizeObserver(() => scene.resize(canvas.clientWidth, canvas.clientHeight));
    resize.observe(canvas);
    return () => {
      window.removeEventListener("pointermove", onMove);
      resize.disconnect();
    };
  }, [loaded]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.live}
      data-loaded={loaded}
      // A wave back when the portrait is clicked or tapped.
      onClick={() => sceneRef.current?.play("Call")}
    />
  );
}
