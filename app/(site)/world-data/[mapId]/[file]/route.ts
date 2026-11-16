import { getBakeStatus, readBakedFile } from "@/lib/bake/bake-records";

/**
 * Serves a map's baked world at /world-data/<mapId>/<hash>.bin. The hash is
 * the file's own, so a response never changes: it is marked immutable and
 * the CDN and the browser keep it.
 *
 * Deliberately a plain request-time handler. Generating the responses at
 * build time (generateStaticParams) made the development server fail the
 * first parallel requests to this route.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ mapId: string; file: string }> }) {
  const { mapId, file } = await params;
  let status: ReturnType<typeof getBakeStatus>;
  try {
    status = getBakeStatus(mapId);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (status.state !== "fresh" || file !== `${status.record.hash}.bin`) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(readBakedFile(mapId)), {
    headers: { "content-type": "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" },
  });
}
