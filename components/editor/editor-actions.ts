import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { resolveContentReference } from "@/lib/content/content";
import { groundIfAttached } from "@/lib/editor/editor-viewport";
import type { ZoneColumnChange } from "@/lib/editor/zone-tools";
import { validateMapDefinition, type MapContentReference, type MapZoneDefinition } from "@/lib/maps/map-definition";
import { clonePlacedEntity } from "@/lib/maps/map-entities";
import { createDefaultZone } from "@/lib/maps/zone-authoring";
import { setSelection, type EditorContextValue } from "./editor-store";

/** Editor operations shared by panels and keyboard shortcuts. Each is one undo step. */

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status}).`);
  return body;
}

export function validateSession(editor: EditorContextValue) {
  const result = validateMapDefinition(editor.session.toDefinition(), {
    hasContent: (reference) => resolveContentReference(PORTFOLIO_CONTENT, reference) !== null,
  });
  const errors = result.ok ? [] : result.errors;
  editor.store.setState({ validation: errors });
  return errors;
}

export async function saveMap(editor: EditorContextValue) {
  const { session, store, mapId } = editor;
  const errors = validateSession(editor);
  if (errors.length > 0) {
    store.setState({ message: { type: "error", text: `Not saved: ${errors.length} validation ${errors.length === 1 ? "error" : "errors"} (see Map panel).` } });
    return false;
  }
  try {
    const definition = session.toDefinition();
    await api(`/api/editor/maps/${mapId}`, { method: "PUT", body: JSON.stringify(definition) });
    session.markSaved();
    store.setState({ blockEdits: definition.blocks.edits.length });
    store.setState({ message: { type: "info", text: `Saved to maps/${mapId}/map.json at ${new Date().toLocaleTimeString()}.` } });
    void refreshBakeStatus(editor);
    return true;
  } catch (error) {
    store.setState({ message: { type: "error", text: `Not saved: ${error instanceof Error ? error.message : String(error)}` } });
    return false;
  }
}

type BakeStatusResponse = { state: "missing" | "stale" | "fresh"; record?: { fileBytes: number; stats: { playableTriangles: number; backdropTriangles: number; bytes: number; bakeMs: number } } };

export async function refreshBakeStatus(editor: EditorContextValue) {
  try {
    const status = await api<BakeStatusResponse>(`/api/editor/maps/${editor.mapId}/bake`);
    editor.store.setState({ bake: status.state });
  } catch {
    editor.store.setState({ bake: "unknown" });
  }
}

/** Saves if needed, then bakes the saved map into maps/<id>/baked. */
export async function bakeSavedMap(editor: EditorContextValue) {
  const { store, session, mapId } = editor;
  if (session.isDirty && !(await saveMap(editor))) return false;
  store.setState({ message: { type: "info", text: "Baking…" } });
  try {
    const { record } = await api<Required<BakeStatusResponse>>(`/api/editor/maps/${mapId}/bake`, { method: "POST" });
    const { stats } = record;
    store.setState({
      bake: "fresh",
      message: { type: "info", text: `Baked to maps/${mapId}/baked: ${(stats.playableTriangles + stats.backdropTriangles).toLocaleString("en")} triangles, ${Math.round(record.fileBytes / 1024)} KB, ${stats.bakeMs} ms.` },
    });
    return true;
  } catch (error) {
    store.setState({ message: { type: "error", text: `Bake failed: ${error instanceof Error ? error.message : String(error)}` } });
    return false;
  }
}

/**
 * Switches the viewport between the voxels and a bake of the map as it is
 * now, unsaved edits included. The bake runs in a worker and writes nothing.
 */
export function setTerrainView(editor: EditorContextValue, view: "voxels" | "baked") {
  const { store, viewport, session } = editor;
  if (view === "voxels") {
    viewport.setBakedView(null);
    store.setState({ terrainView: "voxels" });
    return;
  }
  if (store.getState().terrainView !== "voxels") return;
  store.setState({ terrainView: "baking" });
  const worker = new Worker(new URL("../../lib/editor/bake.worker.ts", import.meta.url), { type: "module" });
  const finish = (file: ArrayBuffer | null, error?: string) => {
    worker.terminate();
    // The user may have gone back to voxels while the bake was running.
    if (store.getState().terrainView !== "baking") return;
    if (file) {
      viewport.setBakedView(file);
      store.setState({ terrainView: "baked" });
    } else {
      store.setState({ terrainView: "voxels", message: { type: "error", text: `Bake preview failed: ${error ?? "unknown error"}` } });
    }
  };
  worker.onmessage = (event: MessageEvent<{ file?: ArrayBuffer; error?: string }>) => finish(event.data.file ?? null, event.data.error);
  worker.onerror = (event) => finish(null, event.message);
  worker.postMessage(session.toDefinition());
}

export function deleteSelection(editor: EditorContextValue) {
  const ids = editor.store.getState().selection.filter((id) => !editor.session.getEntity(id)?.locked);
  if (ids.length === 0) return;
  editor.session.removeEntities(ids.length > 1 ? "Delete objects" : "Delete object", ids);
}

export function duplicateSelection(editor: EditorContextValue) {
  const { session } = editor;
  const taken = new Set(session.getEntities().map((entity) => entity.id));
  const copies = editor.store.getState().selection.flatMap((id) => {
    const source = session.getEntity(id);
    if (!source) return [];
    let suffix = 2;
    while (taken.has(`${id}-${suffix}`)) suffix += 1;
    const copy = clonePlacedEntity(source);
    copy.id = `${id}-${suffix}`;
    copy.transform.position.x += 1;
    copy.transform.position.z += 1;
    taken.add(copy.id);
    return [groundIfAttached(session, copy)];
  });
  if (copies.length === 0) return;
  session.addEntities(copies.length > 1 ? "Duplicate objects" : "Duplicate object", copies);
  setSelection(editor, copies.map((copy) => copy.id));
}

export function rotateSelection(editor: EditorContextValue, radians: number) {
  const ids = unlockedSelection(editor);
  editor.session.updateEntities("Rotate", ids, (entity) => {
    entity.transform.rotation.y = normalizeAngle(entity.transform.rotation.y + radians);
    return entity;
  });
}

export function scaleSelection(editor: EditorContextValue, factor: number) {
  editor.session.updateEntities("Scale", unlockedSelection(editor), (entity) => {
    const { scale } = entity.transform;
    entity.transform.scale = { x: clampScale(scale.x * factor), y: clampScale(scale.y * factor), z: clampScale(scale.z * factor) };
    return groundIfAttached(editor.session, entity);
  });
}

export function groundSelection(editor: EditorContextValue) {
  editor.session.updateEntities("Drop to ground", unlockedSelection(editor), (entity) => groundIfAttached(editor.session, { ...entity, placement: { ...entity.placement, surfaceAttached: true } }));
}

export function assignContentToSelection(editor: EditorContextValue, reference: MapContentReference | null) {
  editor.session.updateEntities(reference ? "Assign content" : "Clear content", editor.store.getState().selection, (entity) => {
    if (reference) entity.contentReference = { ...reference };
    else delete entity.contentReference;
    return entity;
  });
}

export function addZone(editor: EditorContextValue) {
  const zones = editor.session.getMeta().zones;
  let numericId = 1;
  while (zones.some((zone) => zone.numericId === numericId)) numericId += 1;
  if (numericId > 255) return null;
  const zone = createDefaultZone(numericId);
  editor.session.updateMeta("Add zone", { zones: [...zones, zone] });
  return zone;
}

export function updateZone(editor: EditorContextValue, numericId: number, patch: Partial<MapZoneDefinition>) {
  const zones = editor.session.getMeta().zones.map((zone) => {
    if (zone.numericId !== numericId) return zone;
    const next: MapZoneDefinition = { ...zone, ...patch };
    // Absent, not undefined: the map file should not carry empty keys.
    for (const key of Object.keys(patch) as Array<keyof MapZoneDefinition>) if (patch[key] === undefined) delete next[key];
    return next;
  });
  editor.session.updateMeta("Edit zone", { zones });
}

/** Removes a zone definition and clears every column painted with it. */
export function deleteZone(editor: EditorContextValue, numericId: number) {
  const { session } = editor;
  const world = session.world;
  const changes: ZoneColumnChange[] = [];
  for (let index = 0; index < world.zones.length; index += 1) {
    if (world.zones[index] !== numericId) continue;
    const column = world.getZoneCoordinates(index);
    if (column) changes.push({ coordinate: { x: column.x, y: 0, z: column.z }, before: numericId, after: 0 });
  }
  session.beginGroup("Delete zone");
  session.applyZoneChanges("Clear zone", changes);
  session.updateMeta("Delete zone", { zones: session.getMeta().zones.filter((zone) => zone.numericId !== numericId) });
  session.endGroup();
}

function unlockedSelection(editor: EditorContextValue) {
  return editor.store.getState().selection.filter((id) => !editor.session.getEntity(id)?.locked);
}

function clampScale(value: number) {
  return Math.min(20, Math.max(0.1, Number(value.toFixed(3))));
}

function normalizeAngle(radians: number) {
  const turn = Math.PI * 2;
  return Number((((radians % turn) + turn) % turn).toFixed(6));
}

export const contentKey = (reference: MapContentReference | undefined | null) => (reference ? `${reference.contentType}:${reference.contentId}` : "");

export function parseContentKey(key: string): MapContentReference | null {
  const item = PORTFOLIO_CONTENT.items.find((candidate) => `${candidate.kind}:${candidate.id}` === key);
  return item ? { contentType: item.kind, contentId: item.id } : null;
}

/** Mini-games a zone can host. The dig game arrives with the mini-game stage; the id is reserved here. */
export const MINIGAME_OPTIONS = [{ id: "dig", label: "Dig (terrain destruction)" }];
