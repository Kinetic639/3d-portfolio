import { DIG } from "./dig";
import type { MinigameDefinition } from "./minigame-types";

/**
 * Every mini-game, by id. A zone of kind "minigame" names one of these in
 * `minigame.gameId`; the editor offers exactly this list. To add a game,
 * write its definition (see dig.ts) and add it here.
 */
export const MINIGAMES: Record<string, MinigameDefinition> = {
  [DIG.id]: DIG,
};

export function getMinigame(id: string | undefined | null): MinigameDefinition | null {
  return id ? MINIGAMES[id] ?? null : null;
}

/** For the editor's zone panel. */
export const MINIGAME_OPTIONS = Object.values(MINIGAMES).map((game) => ({ id: game.id, label: game.description }));
