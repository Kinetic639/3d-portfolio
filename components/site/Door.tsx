"use client";

import { useEffect, useState } from "react";
import { enterWorld, loadWorld, WORLD_DOOR_ID } from "@/components/world/entry-control";
import { useWorldBridge } from "@/lib/bridge/use-world-bridge";
import { useUiWork } from "@/lib/perf/ui-work";
import { messages } from "@/lib/i18n/messages";
import { useLocale } from "./locale-context";
import styles from "./Door.module.css";

/**
 * The way into the 3D world: a door in its frame (a placeholder drawing until
 * B4). While the world loads, light grows in the gap under it; when the world
 * is ready the door opens a little and light spills out, and a click (or
 * Enter) goes in. Without WebGL there is no world, so no door.
 */
export default function Door() {
  useUiWork();
  const text = messages(useLocale()).door;
  const phase = useWorldBridge((state) => state.phase);
  // Whole percents: at most a hundred renders over the entire load.
  const percent = useWorldBridge((state) => Math.round(state.progress * 100));
  const [heldBack, setHeldBack] = useState(false);

  useEffect(() => {
    // Read after mount: the preference is not known during server rendering.
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const timer = window.setTimeout(() => setHeldBack(connection?.saveData === true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (phase === "unavailable") return null;
  const ready = phase === "ready";
  const loading = phase === "loading" || phase === "warming";
  const state = ready ? "ready" : loading ? "loading" : phase === "idle" && heldBack ? "held" : "closed";
  const label = ready ? text.enter : state === "held" ? text.load : text.loading;

  return (
    <div className={styles.door} data-state={state} style={{ "--progress": percent / 100 } as React.CSSProperties}>
      <button
        id={WORLD_DOOR_ID}
        type="button"
        className={styles.button}
        aria-label={label}
        aria-disabled={!ready && state !== "held"}
        title={label}
        onClick={() => {
          if (ready) enterWorld();
          else if (state === "held") loadWorld();
        }}
      >
        <span className={styles.frame} aria-hidden="true">
          <span className={styles.light} />
          <span className={styles.leaf}>
            <span className={styles.knob} />
          </span>
        </span>
      </button>
      <p className={styles.caption} aria-hidden="true">
        {ready ? text.enter : state === "held" ? text.loadShort : loading ? text.progress(percent) : " "}
      </p>
      {ready ? <p className={styles.srOnly} role="status">{text.ready}</p> : null}
    </div>
  );
}
