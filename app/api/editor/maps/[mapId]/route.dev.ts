import { respond } from "@/lib/editor/server/editor-api";
import type { MapDefinition } from "@/lib/maps/map-definition";
import { deleteMap, readMap, renameMap, writeMap } from "@/lib/maps/map-store";

type Context = { params: Promise<{ mapId: string }> };

/** The map file, upgraded to the current schema. */
export async function GET(_request: Request, { params }: Context) {
  const { mapId } = await params;
  return respond(() => readMap(mapId));
}

/** Saves the map to maps/<id>/map.json. Structurally invalid maps are rejected. */
export async function PUT(request: Request, { params }: Context) {
  const { mapId } = await params;
  return respond(async () => {
    const map = (await request.json()) as MapDefinition;
    if (map.id !== mapId) throw new Error(`Map id ${String(map.id)} does not match the URL (${mapId}).`);
    const saved = writeMap(map);
    return { id: saved.id, updatedAt: saved.metadata.updatedAt };
  });
}

/** Renames the map and optionally changes its id (which moves its directory). */
export async function PATCH(request: Request, { params }: Context) {
  const { mapId } = await params;
  return respond(async () => {
    const body = (await request.json()) as { id?: string; name?: string };
    const map = renameMap(mapId, { id: body.id, name: body.name });
    return { id: map.id, name: map.name };
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { mapId } = await params;
  return respond(() => {
    deleteMap(mapId);
    return { deleted: mapId };
  });
}
