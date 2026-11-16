import { respond } from "@/lib/editor/server/editor-api";
import { setDefaultMapId } from "@/lib/maps/map-store";

/** Records the default map in maps/index.json. It takes effect for visitors after commit and deploy. */
export async function PUT(request: Request) {
  return respond(async () => {
    const { id } = (await request.json()) as { id: string };
    return setDefaultMapId(id);
  });
}
