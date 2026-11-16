"use client";

import { useStore } from "zustand";
import { worldBridge, type WorldBridgeState } from "./world-bridge";

/**
 * Subscribes a component to one slice of bridge state. Always pass a selector
 * that returns a primitive or a stable reference, so the component re-renders
 * only when that slice changes.
 */
export function useWorldBridge<T>(selector: (state: WorldBridgeState) => T): T {
  return useStore(worldBridge.store, selector);
}
