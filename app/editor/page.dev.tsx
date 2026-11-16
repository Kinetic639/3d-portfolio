import type { Metadata } from "next";
import EditorApp from "@/components/editor/EditorApp";
// The editor's look, from the original project. Global on purpose: the class names are the original's.
import "@/components/editor/editor-shell.css";
import { mapExists, readMapIndex } from "@/lib/maps/map-store";

export const metadata: Metadata = { title: "Map editor", robots: { index: false } };

/**
 * /editor and /editor?map=<id>. The `.dev.tsx` extension makes this a route
 * only outside production (see next.config.ts), so neither the page nor the
 * editor code it imports exists in a production build.
 */
export default async function EditorPage({ searchParams }: { searchParams: Promise<{ map?: string | string[] }> }) {
  const { map } = await searchParams;
  const requested = typeof map === "string" ? map : null;
  const found = requested !== null && mapExists(requested);
  const mapId = found ? requested : readMapIndex().defaultMapId;
  return <EditorApp key={mapId} mapId={mapId} notice={requested && !found ? `Map "${requested}" does not exist; opened the default map.` : undefined} />;
}
