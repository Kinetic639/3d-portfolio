import { BLOCK_IDS, getBlockDefinition } from "@/lib/world/block-registry";
import type { MinigameDefinition } from "./minigame-types";

/** Stone and mossy stone hide ore in about one cell in six, always the same cells. */
const ORE_EVERY = 6;

export function hidesOre(x: number, y: number, z: number, blockId: number) {
  if (blockId !== BLOCK_IDS.Stone && blockId !== BLOCK_IDS.MossyStone) return false;
  const hash = (Math.imul(x + 1, 73_856_093) ^ Math.imul(y + 1, 19_349_663) ^ Math.imul(z + 1, 83_492_791)) >>> 0;
  return hash % ORE_EVERY === 0;
}

/**
 * Dig: click a block in the zone to break it. Anything solid can be dug
 * except the world's lowest layer; stone sometimes holds ore. The holes stay
 * until the page is reloaded.
 */
export const DIG: MinigameDefinition = {
  id: "dig",
  title: "Mine",
  hint: "Click a block to dig it out. Stone sometimes hides ore.",
  description: "Dig (terrain destruction)",
  start({ inZone, terrain }) {
    let dug = 0;
    let ore = 0;
    const diggable = (x: number, y: number, z: number) => {
      if (!inZone(x, z) || y <= terrain.floorY) return false;
      const definition = getBlockDefinition(terrain.getBlock(x, y, z));
      return definition.renderable && definition.solid;
    };
    return {
      target: (cell) => (diggable(cell.x, cell.y, cell.z) ? cell : null),
      act(cell) {
        if (!diggable(cell.x, cell.y, cell.z)) return;
        const blockId = terrain.getBlock(cell.x, cell.y, cell.z);
        if (!terrain.removeBlock(cell.x, cell.y, cell.z)) return;
        dug += 1;
        if (hidesOre(cell.x, cell.y, cell.z, blockId)) ore += 1;
      },
      counters: () => ({ "Blocks dug": dug, "Ore found": ore }),
    };
  },
};
