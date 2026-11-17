"use client";

import { useEffect, useRef, useState } from "react";
import PortfolioMap, { type MapPlace } from "@/components/content/PortfolioMap";
import ThemeToggle from "@/components/site/ThemeToggle";
import { useWorldBridge } from "@/lib/bridge/use-world-bridge";
import { worldBridge } from "@/lib/bridge/world-bridge";
import type { MinimapData } from "@/lib/minimap/minimap";
import { useUiWork } from "@/lib/perf/ui-work";
import styles from "./WorldLayer.module.css";

/** How often the marker follows the camera. It reads the engine only after it drew a frame. */
const MARKER_MS = 100;

/**
 * The corner map in the world: the same map as on the landing page. Zones
 * fly the camera there (and open their section), pins open their item, and
 * a marker shows where the camera is and which way it looks. The marker is
 * moved by writing its transform, never through React, and only after the
 * engine drew a frame (rule 3 of the bridge).
 */
export default function WorldMinimap({ data, hidden, onPlace, onPin }: {
  data: MinimapData;
  hidden: boolean;
  onPlace: (place: MapPlace) => void;
  onPin: (href: string) => void;
}) {
  useUiWork();
  const phase = useWorldBridge((state) => state.phase);
  const place = useWorldBridge((state) => state.place);
  const [open, setOpen] = useState(true);
  const markerRef = useRef<SVGGElement>(null);
  const active = phase === "world" && !hidden && open;

  useEffect(() => {
    if (!active) return;
    let lastFrames = -1;
    const move = () => {
      const engine = worldBridge.diagnostics.engine;
      const marker = markerRef.current;
      if (!engine || !marker || engine.stats.frames === lastFrames) return;
      lastFrames = engine.stats.frames;
      const view = engine.view();
      // Map columns from world units; the arrow points where the camera looks (yaw 0 looks north, up the map).
      marker.setAttribute("transform", `translate(${(view.x - data.offsetX).toFixed(2)} ${(view.z - data.offsetZ).toFixed(2)}) rotate(${(-view.yawDegrees).toFixed(1)})`);
    };
    move();
    const timer = window.setInterval(move, MARKER_MS);
    return () => window.clearInterval(timer);
  }, [active, data]);

  if (hidden) return null;
  return (
    <div className={styles.minimap} data-open={open}>
      <div className={styles.minimapBar}>
        <ThemeToggle />
        <button type="button" className={styles.minimapToggle} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Hide map" : "Map"}
        </button>
      </div>
      {open ? (
        <PortfolioMap
          data={data}
          compact
          current={place}
          label="Map of the world: go to a zone or open an item"
          markerRef={markerRef}
          onPlace={(event, target) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onPlace(target);
          }}
          onPin={(event, href) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onPin(href);
          }}
        />
      ) : null}
    </div>
  );
}
