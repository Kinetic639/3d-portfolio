import type { GridCoordinate } from "@/lib/world/world-config";

/**
 * What a mini-game is given and what it must provide.
 *
 * A mini-game runs inside one zone of kind "minigame". The engine owns
 * everything around it: entering and leaving, the camera, picking, the
 * outline under the pointer, remeshing the terrain it changes, effects and
 * the HUD. A mini-game only decides what a click does and what the HUD
 * counts. Adding one is a new file and an entry in registry.ts; nothing
 * else changes.
 */
export type MinigameTerrain = {
  /** Block id of a cell; 0 for air. */
  getBlock: (x: number, y: number, z: number) => number;
  /** The world's lowest layer; mini-games leave it alone so the map keeps a floor. */
  readonly floorY: number;
  /**
   * Removes a cell. The engine remeshes what changed before the next frame
   * and shows a burst in the block's colour. Only cells in the zone's
   * columns can change; returns false for any other.
   */
  removeBlock: (x: number, y: number, z: number) => boolean;
};

export type MinigameContext = {
  /** Numeric id of the zone the game runs in. */
  zoneId: number;
  /** Whether a column belongs to the zone. */
  inZone: (x: number, z: number) => boolean;
  terrain: MinigameTerrain;
};

export type MinigameSession = {
  /** The cell a click would act on, given the cell the pointer is over; null when a click would do nothing. */
  target: (cell: GridCoordinate) => GridCoordinate | null;
  /** A click or tap on a target cell. */
  act: (cell: GridCoordinate) => void;
  /** Counters shown in the HUD, in order, by label. */
  counters: () => Record<string, number>;
};

export type MinigameDefinition = {
  id: string;
  /** Shown on the zone's icon and in the HUD. */
  title: string;
  /** One line in the HUD telling the visitor what to do. */
  hint: string;
  /** For the editor's zone panel. */
  description: string;
  start: (context: MinigameContext) => MinigameSession;
};
