"use client";

import { useEffect, useRef, useState } from "react";
import { worldBridge } from "@/lib/bridge/world-bridge";
import { uiWork, useUiWork } from "@/lib/perf/ui-work";
import styles from "./PerfHud.module.css";

const REFRESH_MS = 500;
const UI_WINDOW_MS = 5000;

type Field = "fps" | "median" | "p95" | "worst" | "cpu" | "calls" | "triangles" | "ui" | "uiWorst";

const ms = (value: number | null) => (value === null ? "–" : `${value.toFixed(1)} ms`);

/**
 * 47052 -> "47,052". Not toLocaleString: its first call loads the browser's
 * locale data, 20-70 ms, which landed on the last frame of the entry.
 */
export const thousands = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** The text of every field, from what the engine and the UI meter recorded. */
export function readPerf(now: number): Record<Field, string> {
  const engine = worldBridge.diagnostics.engine;
  const frames = engine?.frames.window(now, 1000);
  const ui = uiWork.window(now, UI_WINDOW_MS);
  const idle = !frames || frames.frames === 0;
  return {
    fps: idle ? "idle" : String(frames.fps),
    median: ms(frames?.intervalP50 ?? null),
    p95: ms(frames?.intervalP95 ?? null),
    worst: ms(frames?.intervalMax ?? null),
    cpu: frames?.cpuMean == null ? "–" : `${frames.cpuMean.toFixed(1)} / ${(frames.cpuMax ?? 0).toFixed(1)} ms`,
    calls: engine ? String(engine.stats.drawCalls) : "–",
    triangles: engine ? thousands(engine.stats.triangles) : "–",
    ui: `${ui.updates} · ${ui.totalMs.toFixed(1)} ms`,
    uiWorst: ms(ui.updates === 0 ? null : ui.maxMs),
  };
}

/**
 * Rendering performance, bottom left, as in the original: FPS and the median
 * frame time, opening into the details on click.
 *
 * - FPS counts frames the engine drew in the last second. The world renders
 *   on demand, so it reads "idle" when nothing moves; that is the point, not
 *   a fault.
 * - Frame times are intervals between consecutive frames (what the visitor
 *   sees); engine CPU is the update and render work inside one frame.
 * - Draw calls and triangles are those of the last frame drawn.
 * - UI is the world's React work over the last 5 s: updates and their total
 *   time (render + commit), and the slowest one.
 *
 * The numbers are written into the DOM twice a second without React, so the
 * HUD adds nothing to what it measures except two short text updates.
 * It refreshes only while `active` (the visitor is in the world); it stays
 * mounted on the landing page so it is already rasterized when they enter.
 */
export default function PerfHud({ active }: { active: boolean }) {
  useUiWork();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element || !active) return;
    const cells = new Map<string, HTMLElement>();
    element.querySelectorAll<HTMLElement>("[data-perf]").forEach((cell) => cells.set(cell.dataset.perf!, cell));
    const refresh = () => {
      const values = readPerf(performance.now());
      for (const [field, cell] of cells) {
        const text = values[field as Field];
        if (cell.textContent !== text) cell.textContent = text;
      }
    };
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [open, active]);

  return (
    <aside ref={root} className={styles.hud} data-open={open || undefined} aria-label="Rendering performance">
      <button type="button" className={styles.badge} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>FPS</span>
        <strong data-perf="fps">–</strong>
        <span data-perf="median">–</span>
      </button>
      {open ? (
        <dl className={styles.details}>
          <div><dt>Frame p95</dt><dd data-perf="p95">–</dd></div>
          <div><dt>Worst frame</dt><dd data-perf="worst">–</dd></div>
          <div><dt>Engine CPU</dt><dd data-perf="cpu">–</dd></div>
          <div><dt>Draw calls</dt><dd data-perf="calls">–</dd></div>
          <div><dt>Triangles</dt><dd data-perf="triangles">–</dd></div>
          <div><dt>UI (5 s)</dt><dd data-perf="ui">–</dd></div>
          <div><dt>UI worst</dt><dd data-perf="uiWorst">–</dd></div>
        </dl>
      ) : null}
    </aside>
  );
}
