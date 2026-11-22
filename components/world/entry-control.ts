"use client";

/**
 * How controls outside the world layer (the door on the landing page) start
 * the world. The world layer registers what entering and loading mean (a new
 * history entry, then the engine's entry); the door only asks for them.
 */
type Handlers = { enter: () => void; load: () => void };

let handlers: Handlers | null = null;

export function registerWorldEntry(next: Handlers) {
  handlers = next;
  return () => {
    if (handlers === next) handlers = null;
  };
}

/** Enters the world (the door's click). Ignored until the world layer is mounted. */
export function enterWorld() {
  handlers?.enter();
}

/** Starts loading the world when it was held back (data saver). */
export function loadWorld() {
  handlers?.load();
}

/** The door's element id: keyboard focus returns to it when the visitor leaves the world. */
export const WORLD_DOOR_ID = "world-door";
