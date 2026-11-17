"use client";

import { useEffect } from "react";
import { getTheme, subscribeTheme } from "@/components/site/theme";
import { useWorldBridge } from "@/lib/bridge/use-world-bridge";
import { worldBridge } from "@/lib/bridge/world-bridge";

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Day and night in the world. The theme on <html> is the source; this tells
 * the engine: at once on load and while the world is not shown (the engine
 * decides), animated (the sun setting, the moon rising) while it is. Renders
 * nothing.
 */
export default function SkySwitch() {
  const phase = useWorldBridge((state) => state.phase);

  // Whenever the engine may be new (it is created while loading), it learns the theme at once.
  useEffect(() => {
    if (phase === "idle" || phase === "unavailable") return;
    worldBridge.commands.emit({ type: "set-night", night: getTheme() === "dark", immediate: true });
  }, [phase]);

  useEffect(() => subscribeTheme(() => {
    worldBridge.commands.emit({ type: "set-night", night: getTheme() === "dark", immediate: prefersReducedMotion() });
  }), []);

  return null;
}
