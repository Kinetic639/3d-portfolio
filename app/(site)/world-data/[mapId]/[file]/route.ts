import { getBakeStatus, listFreshBakes, readBakedFile } from "@/lib/bake/bake-records";

/**
 * Serves a map's baked world at /world-data/<mapId>/<hash>.bin. The hash is
 * the file's own, so the response never changes and can be cached forever.
 * Responses are generated at build time for every map with a current bake;
 * other addresses are answered on request (a map baked after the build, or 404).
 */

export function generateStaticParams() {
  return Object.entries(listFreshBakes()).map(([mapId, hash]) => ({ mapId, file: `${hash}.bin` }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ mapId: string; file: string }> }) {
  const { mapId, file } = await params;
  const status = getBakeStatus(mapId);
  if (status.state !== "fresh" || file !== `${status.record.hash}.bin`) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(readBakedFile(mapId)), {
    headers: { "content-type": "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" },
  });
}
