import { processAssets } from "@/lib/assets/asset-pipeline";
import { respond } from "@/lib/editor/server/editor-api";

/** Runs the model pipeline again (same as `pnpm assets`), so models added while the editor is open show up. */
export async function POST() {
  return respond(async () => {
    const report = await processAssets();
    return {
      models: report.rows.map((row) => ({ id: row.id, status: row.status, bytes: row.bytes, triangles: row.triangles, warnings: row.warnings })),
      errors: report.errors,
    };
  });
}
