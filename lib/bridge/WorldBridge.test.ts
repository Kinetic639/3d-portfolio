import { describe, expect, it, vi } from "vitest";
import { canTransitionPhase, createWorldBridge } from "./world-bridge";

describe("world bridge", () => {
  it("publishes only real changes", () => {
    const bridge = createWorldBridge();
    const listener = vi.fn();
    bridge.store.subscribe(listener);

    bridge.set({ phase: "loading", progress: 0 });
    bridge.set({ phase: "loading", progress: 0 });
    bridge.set({ hovered: { id: "a", label: "A", content: null, action: "open" as const } });
    // A structurally equal hover object from the next engine tick must not re-render the UI.
    bridge.set({ hovered: { id: "a", label: "A", content: null, action: "open" as const } });
    bridge.set({ hovered: null });

    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("enforces the phase state machine", () => {
    const bridge = createWorldBridge();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    bridge.set({ phase: "world", progress: 0.5 });
    expect(bridge.store.getState().phase).toBe("idle");
    // The rest of an update with an illegal phase still applies.
    expect(bridge.store.getState().progress).toBe(0.5);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();

    for (const phase of ["loading", "warming", "ready", "entering", "world", "leaving", "ready"] as const) {
      bridge.set({ phase });
      expect(bridge.store.getState().phase).toBe(phase);
    }
    expect(canTransitionPhase("unavailable", "loading")).toBe(false);
  });

  it("delivers commands and events to subscribers until they unsubscribe", () => {
    const bridge = createWorldBridge();
    const commands = vi.fn();
    const stop = bridge.commands.subscribe(commands);
    bridge.commands.emit({ type: "enter" });
    stop();
    bridge.commands.emit({ type: "exit" });
    expect(commands.mock.calls).toEqual([[{ type: "enter" }]]);

    const events = vi.fn();
    bridge.events.subscribe(events);
    bridge.events.emit({ type: "content-activated", interactableId: "x", content: { contentType: "about", contentId: "about" } });
    expect(events).toHaveBeenCalledOnce();
  });

  it("resets to the initial state regardless of phase", () => {
    const bridge = createWorldBridge();
    bridge.set({ phase: "loading" });
    bridge.set({ phase: "unavailable", error: "boom" });
    bridge.reset();
    expect(bridge.store.getState()).toMatchObject({ phase: "idle", error: null, progress: 0 });
  });
});
