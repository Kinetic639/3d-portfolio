"use client";

import { useWorldBridge } from "@/lib/bridge/use-world-bridge";
import styles from "./WorldView.module.css";

/** Loading and failure feedback. Renders nothing once the world is running. */
export default function WorldStatus() {
  const phase = useWorldBridge((state) => state.phase);
  // Rounded so progress updates re-render at most ~20 times, not once per chunk.
  const percent = useWorldBridge((state) => Math.round(state.progress * 20) * 5);
  const error = useWorldBridge((state) => state.error);

  if (phase === "unavailable") {
    return <p className={styles.status} role="alert">{error ?? "The 3D world is unavailable in this browser."}</p>;
  }
  if (phase === "loading" || phase === "warming") {
    return <p className={styles.status} role="status">{phase === "loading" ? `Building world ${percent}%` : "Preparing graphics"}</p>;
  }
  return null;
}
