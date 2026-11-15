"use client";

import { useEffect, useRef, useState } from "react";
import { EditorSession } from "@/lib/editor/editor-session";
import { EditorViewport, MAX_BRUSH_SIZE, type HoverInfo } from "@/lib/editor/editor-viewport";
import { buildWorldForMap } from "@/lib/engine/terrain-meshes";
import { migrateMapDefinition } from "@/lib/maps/map-definition";
import { ROTATION_VALUES } from "@/lib/voxel-shapes/shape-ids";
import { api, bakeSavedMap, deleteSelection, duplicateSelection, refreshBakeStatus, rotateSelection, saveMap, setTerrainView } from "./editor-actions";
import { createEditorStore, EditorContext, setSelection, updateSettings, useEditor, useEditorState, type EditorContextValue } from "./editor-store";
import InspectorPanel from "./InspectorPanel";
import MapsDialog from "./MapsDialog";
import ToolPanel, { TOOLS } from "./ToolPanel";
import styles from "./Editor.module.css";

/**
 * The map editor. Development only: this component is reachable solely from
 * `app/editor/page.dev.tsx`, which is not a route in a production build.
 */
export default function EditorApp({ mapId, notice }: { mapId: string; notice?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<HTMLSpanElement>(null);
  const [editor, setEditor] = useState<EditorContextValue | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    let viewport: EditorViewport | null = null;

    const load = async () => {
      const definition = migrateMapDefinition(await api<unknown>(`/api/editor/maps/${mapId}`, { signal: controller.signal }));
      const { world, terrain } = await buildWorldForMap(definition, { signal: controller.signal, onProgress: setProgress });
      if (controller.signal.aborted) {
        terrain.dispose();
        return;
      }
      const session = new EditorSession(definition, world);
      const store = createEditorStore();
      const firstZone = session.getMeta().zones[0]?.numericId;
      if (firstZone !== undefined) store.setState({ settings: { ...store.getState().settings, zoneId: firstZone } });

      viewport = new EditorViewport(canvas, session, terrain, store.getState().settings, {
        onSelectionChange: (ids) => store.setState(ids.length > 0 ? { selection: ids, inspectorTab: "object" } : { selection: ids }),
        // Hover changes with every pointer move: written straight to the DOM, never through React.
        onHover: (info) => {
          if (hoverRef.current) hoverRef.current.textContent = describeHover(session, info);
        },
      });
      session.subscribe((change) => {
        const state = store.getState();
        // The baked view shows a bake of an earlier state; an edit sends the view back to the voxels.
        if (state.terrainView !== "voxels" && (change.terrainChunks.length > 0 || change.zoneChunks.length > 0 || change.meta || change.entitiesStructural)) {
          viewport?.setBakedView(null);
          store.setState({ terrainView: "voxels" });
        }
        store.setState({
          canUndo: session.canUndo,
          canRedo: session.canRedo,
          undoLabel: session.undoLabel,
          redoLabel: session.redoLabel,
          dirty: session.isDirty,
          metaRevision: state.metaRevision + (change.meta ? 1 : 0),
          entitiesRevision: state.entitiesRevision + (change.entitiesStructural || change.entitiesUpdated.length > 0 ? 1 : 0),
        });
      });
      const value = { mapId, session, viewport, store };
      void refreshBakeStatus(value);
      (window as unknown as { __editor?: EditorContextValue }).__editor = value;
      setEditor(value);
    };

    load().catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    });

    return () => {
      controller.abort();
      viewport?.dispose();
      setEditor(null);
    };
  }, [mapId]);

  return (
    <div className={`dsd-scope ${styles.editor}`} data-editor={editor ? "ready" : error ? "error" : "loading"}>
      <canvas ref={canvasRef} className={styles.canvas} tabIndex={0} aria-label="Map viewport" />
      {editor ? (
        <EditorContext.Provider value={editor}>
          <Chrome hoverRef={hoverRef} notice={notice} />
        </EditorContext.Provider>
      ) : (
        <div className={styles.loading} role="status">
          {error ? `Could not open ${mapId}: ${error}` : `Opening ${mapId}… ${Math.round(progress * 100)}%`}
        </div>
      )}
    </div>
  );
}

function describeHover(session: EditorSession, info: HoverInfo | null) {
  if (!info) return "";
  if (info.entityId) return session.getEntity(info.entityId)?.name ?? info.entityId;
  if (!info.cell) return "";
  const zone = info.zoneId ? session.getMeta().zones.find((candidate) => candidate.numericId === info.zoneId)?.label ?? `zone ${info.zoneId}` : null;
  return [`${info.cell.x}, ${info.cell.y}, ${info.cell.z}`, info.blockName, zone].filter(Boolean).join(" · ");
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function Chrome({ hoverRef, notice }: { hoverRef: React.RefObject<HTMLSpanElement | null>; notice?: string }) {
  const editor = useEditor();
  const { session, viewport, store, mapId } = editor;
  const preview = useEditorState((state) => state.preview);
  const zonesVisible = useEditorState((state) => state.zonesVisible);
  const dirty = useEditorState((state) => state.dirty);
  const canUndo = useEditorState((state) => state.canUndo);
  const canRedo = useEditorState((state) => state.canRedo);
  const undoLabel = useEditorState((state) => state.undoLabel);
  const redoLabel = useEditorState((state) => state.redoLabel);
  const message = useEditorState((state) => state.notice);
  const bake = useEditorState((state) => state.bake);
  const terrainView = useEditorState((state) => state.terrainView);
  const [baking, setBaking] = useState(false);
  useEditorState((state) => state.metaRevision);
  const [mapsOpen, setMapsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const statsRef = useRef<HTMLSpanElement>(null);

  const setPreview = (next: boolean) => {
    store.setState({ preview: next });
    viewport.setPreview(next);
  };
  const save = async () => {
    setSaving(true);
    await saveMap(editor);
    setSaving(false);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isTyping(event.target);
      const command = event.ctrlKey || event.metaKey;
      const state = store.getState();
      if (command && event.code === "KeyS") {
        event.preventDefault();
        void saveMap(editor);
        return;
      }
      if (typing || document.querySelector("dialog[open]")) return;
      if (command && event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) session.redo();
        else session.undo();
      } else if (command && event.code === "KeyY") {
        event.preventDefault();
        session.redo();
      } else if (command && event.code === "KeyD") {
        event.preventDefault();
        duplicateSelection(editor);
      } else if (command || event.altKey) {
        return;
      } else if (event.code === "Escape") {
        if (state.preview) setPreview(false);
        else setSelection(editor, []);
      } else if (state.preview) {
        return;
      } else if (event.code === "Delete" || event.code === "Backspace") {
        deleteSelection(editor);
      } else if (event.code === "KeyR") {
        if (state.settings.tool === "block") {
          const index = ROTATION_VALUES.indexOf(state.settings.rotation);
          updateSettings(editor, { rotation: ROTATION_VALUES[(index + 1) % ROTATION_VALUES.length] });
        } else {
          rotateSelection(editor, event.shiftKey ? Math.PI / 2 : -Math.PI / 2);
        }
      } else if (event.code === "BracketLeft") {
        updateSettings(editor, { brushSize: Math.max(1, state.settings.brushSize - 2) });
      } else if (event.code === "BracketRight") {
        updateSettings(editor, { brushSize: Math.min(MAX_BRUSH_SIZE, state.settings.brushSize + 2) });
      } else if (event.code === "KeyF") {
        viewport.frameAll();
      } else {
        const tool = TOOLS.find((candidate) => candidate.key === event.key);
        if (tool) updateSettings(editor, { tool: tool.id });
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (session.isDirty) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    // Frame cost for the status bar, written to the DOM directly.
    const timer = window.setInterval(() => {
      if (statsRef.current) statsRef.current.textContent = `frame ${viewport.stats.lastFrameMs.toFixed(1)} ms · worst ${viewport.stats.worstFrameMs.toFixed(1)} ms`;
    }, 500);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.clearInterval(timer);
    };
    // setPreview only closes over stable values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (preview) {
    return (
      <div className={styles.previewBar}>
        Visitor preview: camera limits, fog and no editor overlays.
        <button type="button" onClick={() => setPreview(false)}>Back to editing (Esc)</button>
      </div>
    );
  }

  return (
    <>
      <header className={styles.top}>
        <button type="button" onClick={() => setMapsOpen(true)}>Maps</button>
        <strong className={styles.title}>
          {session.getMeta().name}
          {dirty ? <span title="Unsaved changes" aria-label="Unsaved changes"> ●</span> : null}
        </strong>
        <button type="button" className={styles.primary} onClick={save} disabled={saving || !dirty} title="Save (Ctrl+S)">{saving ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => session.undo()} disabled={!canUndo} title={undoLabel ? `Undo ${undoLabel} (Ctrl+Z)` : "Nothing to undo"}>Undo</button>
        <button type="button" onClick={() => session.redo()} disabled={!canRedo} title={redoLabel ? `Redo ${redoLabel} (Ctrl+Y)` : "Nothing to redo"}>Redo</button>
        <button
          type="button"
          disabled={baking}
          title="Saves if needed, then writes maps/<id>/baked. Same as pnpm bake."
          onClick={async () => {
            setBaking(true);
            await bakeSavedMap(editor);
            setBaking(false);
          }}
        >
          {baking ? "Baking…" : "Bake"}
        </button>
        <span className={styles.bakeState} data-bake={dirty && bake === "fresh" ? "stale" : bake} title="Whether maps/<id>/baked matches this map">
          {dirty && bake === "fresh" ? "bake out of date" : bake === "fresh" ? "bake up to date" : bake === "stale" ? "bake out of date" : bake === "missing" ? "not baked" : ""}
        </span>
        <span className={styles.spacer} />
        <span className={styles.segmented} role="radiogroup" aria-label="Terrain view">
          <button type="button" role="radio" aria-checked={terrainView === "voxels"} onClick={() => setTerrainView(editor, "voxels")}>Voxels</button>
          <button type="button" role="radio" aria-checked={terrainView !== "voxels"} onClick={() => setTerrainView(editor, "baked")} title="Bakes the map as it is now and shows the result. Editing is off in this view.">
            {terrainView === "baking" ? "Baking…" : "Baked"}
          </button>
        </span>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={zonesVisible}
            onChange={(event) => {
              store.setState({ zonesVisible: event.target.checked });
              viewport.setZonesVisible(event.target.checked);
            }}
          />
          Zones
        </label>
        <button type="button" onClick={() => viewport.frameAll()} title="Frame playable area (F)">Frame</button>
        <button type="button" onClick={() => setPreview(true)}>Preview as visitor</button>
        <a href={`/map/${mapId}`} target="_blank" rel="noreferrer" title="Opens the last saved version in the real site">Open saved map in site ↗</a>
      </header>
      <ToolPanel />
      <InspectorPanel />
      <footer className={styles.status}>
        <span ref={hoverRef} data-testid="editor-hover" />
        <span className={styles.spacer} />
        {message ?? notice ? (
          <span className={message?.kind === "error" ? styles.statusError : undefined} role="status">{message?.text ?? notice}</span>
        ) : null}
        <span ref={statsRef} />
        <span>Pan: right or middle drag · Zoom: wheel</span>
      </footer>
      {mapsOpen ? <MapsDialog currentId={mapId} dirty={dirty} onClose={() => setMapsOpen(false)} /> : null}
    </>
  );
}
