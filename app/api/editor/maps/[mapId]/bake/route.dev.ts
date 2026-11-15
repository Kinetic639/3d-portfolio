import { bakeMapToDisk, getBakeStatus } from "@/lib/bake/bake-store";
import { respond } from "@/lib/editor/server/editor-api";

type Context = { params: Promise<{ mapId: string }> };

/** Whether the map's bake exists and matches the saved map. */
export async function GET(_request: Request, { params }: Context) {
  const { mapId } = await params;
  return respond(() => getBakeStatus(mapId));
}

/** Bakes the saved map into maps/<id>/baked. Same code as `pnpm bake <id>`. */
export async function POST(_request: Request, { params }: Context) {
  const { mapId } = await params;
  return respond(async () => ({ state: "fresh", record: await bakeMapToDisk(mapId) }));
}
