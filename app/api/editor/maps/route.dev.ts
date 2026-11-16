import { respond } from "@/lib/editor/server/editor-api";
import { createBlankMapDefinition } from "@/lib/maps/map-definition";
import { duplicateMap, isValidMapId, listMaps, mapExists, readMapIndex, writeMap } from "@/lib/maps/map-store";

/** Lists the maps in the repository and names the default one. */
export function GET() {
  return respond(() => ({ maps: listMaps(), defaultMapId: readMapIndex().defaultMapId }));
}

type CreateBody =
  | { action: "create"; id: string; name: string; width?: number; depth?: number }
  | { action: "duplicate"; sourceId: string; id: string; name: string };

/** Creates a blank map or duplicates an existing one. */
export async function POST(request: Request) {
  return respond(async () => {
    const body = (await request.json()) as CreateBody;
    if (!isValidMapId(body.id)) throw new Error("Map id must be lowercase letters, digits and dashes.");
    if (typeof body.name !== "string" || body.name.trim() === "") throw new Error("Map name is required.");
    if (mapExists(body.id)) throw new Error(`A map with id ${body.id} already exists.`);

    const map = body.action === "duplicate"
      ? duplicateMap(body.sourceId, body.id, body.name.trim())
      : writeMap(createBlankMapDefinition({ id: body.id, name: body.name.trim(), width: body.width, depth: body.depth }));
    return { id: map.id, name: map.name };
  });
}
