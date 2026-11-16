import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { DIG, hidesOre } from "./dig";
import type { MinigameContext } from "./minigame-types";
import { getMinigame, MINIGAME_OPTIONS, MINIGAMES } from "./registry";

/** A column of stone from y=0 (the floor) to y=4 at x 0-3, z 0-3; the zone is x < 2. */
function fakeContext() {
  const blocks = new Map<string, number>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  for (let x = 0; x < 4; x += 1) for (let z = 0; z < 4; z += 1) for (let y = 0; y <= 4; y += 1) blocks.set(key(x, y, z), BLOCK_IDS.Stone);
  const inZone = (x: number, z: number) => x < 2 && z >= 0 && z < 4;
  const removed: string[] = [];
  const context: MinigameContext = {
    zoneId: 1,
    inZone,
    terrain: {
      floorY: 0,
      getBlock: (x, y, z) => blocks.get(key(x, y, z)) ?? BLOCK_IDS.Air,
      removeBlock: (x, y, z) => {
        if (!inZone(x, z) || (blocks.get(key(x, y, z)) ?? BLOCK_IDS.Air) === BLOCK_IDS.Air) return false;
        blocks.set(key(x, y, z), BLOCK_IDS.Air);
        removed.push(key(x, y, z));
        return true;
      },
    },
  };
  return { context, blocks, removed, key };
}

describe("mini-game registry", () => {
  it("knows the dig game and nothing it was not given", () => {
    expect(getMinigame("dig")).toBe(DIG);
    expect(getMinigame("missing")).toBeNull();
    expect(getMinigame(undefined)).toBeNull();
    expect(MINIGAME_OPTIONS).toEqual(Object.values(MINIGAMES).map((game) => ({ id: game.id, label: game.description })));
  });

  it("gives every game the fields the HUD and editor show", () => {
    for (const game of Object.values(MINIGAMES)) {
      expect(game.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(game.title.length).toBeGreaterThan(0);
      expect(game.hint.length).toBeGreaterThan(0);
      expect(game.description.length).toBeGreaterThan(0);
    }
  });
});

describe("dig", () => {
  it("targets solid cells in the zone above the floor only", () => {
    const { context, blocks, key } = fakeContext();
    const session = DIG.start(context);
    expect(session.target({ x: 1, y: 4, z: 1 })).toEqual({ x: 1, y: 4, z: 1 });
    expect(session.target({ x: 1, y: 0, z: 1 })).toBeNull(); // the floor
    expect(session.target({ x: 3, y: 4, z: 1 })).toBeNull(); // outside the zone
    blocks.set(key(1, 4, 1), BLOCK_IDS.Air);
    expect(session.target({ x: 1, y: 4, z: 1 })).toBeNull(); // air
  });

  it("removes what it digs and counts it", () => {
    const { context, removed } = fakeContext();
    const session = DIG.start(context);
    expect(session.counters()).toEqual({ "Blocks dug": 0, "Ore found": 0 });
    session.act({ x: 0, y: 4, z: 0 });
    session.act({ x: 0, y: 3, z: 0 });
    expect(removed).toEqual(["0,4,0", "0,3,0"]);
    expect(session.counters()["Blocks dug"]).toBe(2);
  });

  it("ignores clicks that change nothing", () => {
    const { context, removed } = fakeContext();
    const session = DIG.start(context);
    session.act({ x: 0, y: 4, z: 0 });
    session.act({ x: 0, y: 4, z: 0 }); // already air
    session.act({ x: 3, y: 4, z: 0 }); // outside
    session.act({ x: 0, y: 0, z: 0 }); // floor
    expect(removed).toEqual(["0,4,0"]);
    expect(session.counters()["Blocks dug"]).toBe(1);
  });

  it("counts ore where stone hides it, the same cells every time", () => {
    const { context } = fakeContext();
    const session = DIG.start(context);
    let expected = 0;
    for (let x = 0; x < 2; x += 1) for (let z = 0; z < 4; z += 1) for (let y = 4; y >= 1; y -= 1) {
      if (hidesOre(x, y, z, BLOCK_IDS.Stone)) expected += 1;
      session.act({ x, y, z });
    }
    expect(session.counters()).toEqual({ "Blocks dug": 32, "Ore found": expected });
    expect(hidesOre(5, 5, 5, BLOCK_IDS.Ground)).toBe(false);
  });

  it("hides ore in roughly one stone in six", () => {
    let ore = 0;
    for (let x = 0; x < 30; x += 1) for (let z = 0; z < 30; z += 1) for (let y = 0; y < 10; y += 1) if (hidesOre(x, y, z, BLOCK_IDS.Stone)) ore += 1;
    expect(ore / 9000).toBeGreaterThan(0.12);
    expect(ore / 9000).toBeLessThan(0.22);
  });

  it("keeps separate sessions apart", () => {
    const first = DIG.start(fakeContext().context);
    const second = DIG.start(fakeContext().context);
    first.act({ x: 0, y: 4, z: 0 });
    expect(second.counters()["Blocks dug"]).toBe(0);
  });
});
