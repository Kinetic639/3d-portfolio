"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { MapSummary } from "@/lib/maps/map-store";
import { api } from "./editor-actions";
import styles from "./Editor.module.css";

type Form =
  | { mode: "create"; id: string; name: string; size: number }
  | { mode: "duplicate"; sourceId: string; id: string; name: string }
  | { mode: "rename"; sourceId: string; id: string; name: string };

const SIZES = [64, 128, 192, 256];
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Map manager: every map in `maps/`, with create, duplicate, rename, delete
 * and the default-map choice. All actions write to the repository at once;
 * they are not part of the open map's undo history.
 */
export default function MapsDialog({ currentId, dirty, onClose }: { currentId: string; dirty: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [maps, setMaps] = useState<MapSummary[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await api<{ maps: MapSummary[] }>("/api/editor/maps");
    setMaps(result.maps);
  }, []);

  useEffect(() => {
    dialogRef.current?.showModal();
    api<{ maps: MapSummary[] }>("/api/editor/maps").then((result) => setMaps(result.maps), (reason: unknown) => setError(String(reason)));
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const open = (id: string) => {
    window.location.assign(`/editor?map=${encodeURIComponent(id)}`);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    void run(async () => {
      if (form.mode === "create") {
        await api("/api/editor/maps", { method: "POST", body: JSON.stringify({ action: "create", id: form.id, name: form.name, width: form.size, depth: form.size }) });
        open(form.id);
        return;
      }
      if (form.mode === "duplicate") {
        await api("/api/editor/maps", { method: "POST", body: JSON.stringify({ action: "duplicate", sourceId: form.sourceId, id: form.id, name: form.name }) });
      } else {
        await api(`/api/editor/maps/${form.sourceId}`, { method: "PATCH", body: JSON.stringify({ id: form.id, name: form.name }) });
        // The open map's file moved or changed under it: reload it from disk.
        if (form.sourceId === currentId) {
          open(form.id);
          return;
        }
      }
      setForm(null);
      await refresh();
    });
  };

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-label="Maps" onClose={onClose}>
      <header>
        <h2>Maps</h2>
        <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close">✕</button>
      </header>
      {dirty ? <p className={styles.warning}>The open map has unsaved changes. Duplicating or renaming it uses the last saved version; opening another map discards them.</p> : null}
      {error ? <p className={styles.errors} role="alert">{error}</p> : null}

      {maps === null ? <p className={styles.muted}>Loading…</p> : (
        <ul className={styles.maps}>
          {maps.map((map) => (
            <li key={map.id} data-map={map.id}>
              <div>
                <strong>{map.name}</strong>
                <small>{map.id}{map.id === currentId ? " · open" : ""}{map.isDefault ? " · default" : ""}</small>
              </div>
              {confirmDelete === map.id ? (
                <span className={styles.buttons}>
                  Delete {map.id}?
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={busy}
                    onClick={() => run(async () => {
                      await api(`/api/editor/maps/${map.id}`, { method: "DELETE" });
                      setConfirmDelete(null);
                      await refresh();
                    })}
                  >
                    Yes, delete
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(null)}>Cancel</button>
                </span>
              ) : (
                <span className={styles.buttons}>
                  {map.id === currentId ? null : <button type="button" onClick={() => open(map.id)}>Open</button>}
                  <button type="button" onClick={() => setForm({ mode: "duplicate", sourceId: map.id, id: `${map.id}-copy`, name: `${map.name} copy` })}>Duplicate</button>
                  <button type="button" onClick={() => setForm({ mode: "rename", sourceId: map.id, id: map.id, name: map.name })}>Rename</button>
                  <button
                    type="button"
                    disabled={map.isDefault || busy}
                    title={map.isDefault ? "This is the map visitors see" : "Visitors see this map after the next deploy"}
                    onClick={() => run(async () => {
                      await api("/api/editor/default-map", { method: "PUT", body: JSON.stringify({ id: map.id }) });
                      await refresh();
                    })}
                  >
                    Make default
                  </button>
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={map.isDefault || map.id === currentId}
                    title={map.isDefault ? "The default map cannot be deleted" : map.id === currentId ? "Open another map first" : undefined}
                    onClick={() => setConfirmDelete(map.id)}
                  >
                    Delete
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {form ? (
        <form className={styles.mapForm} onSubmit={submit}>
          <h3>{form.mode === "create" ? "New map" : form.mode === "duplicate" ? `Duplicate ${form.sourceId}` : `Rename ${form.sourceId}`}</h3>
          <label>
            Name
            <input
              className={styles.input}
              required
              autoFocus
              value={form.name}
              onChange={(event) => setForm(form.mode === "create" ? { ...form, name: event.target.value, id: slug(event.target.value) } : { ...form, name: event.target.value })}
            />
          </label>
          <label>
            Id (folder name)
            <input className={styles.input} required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} />
          </label>
          {form.mode === "create" ? (
            <label>
              Size
              <select className={styles.input} value={form.size} onChange={(event) => setForm({ ...form, size: Number(event.target.value) })}>
                {SIZES.map((size) => (
                  <option key={size} value={size}>{size} × {size}</option>
                ))}
              </select>
            </label>
          ) : null}
          <span className={styles.buttons}>
            <button type="submit" className={styles.primary} disabled={busy}>{form.mode === "create" ? "Create and open" : form.mode === "duplicate" ? "Duplicate" : "Rename"}</button>
            <button type="button" onClick={() => setForm(null)}>Cancel</button>
          </span>
        </form>
      ) : (
        <div className={styles.buttons}>
          <button type="button" className={styles.primary} onClick={() => setForm({ mode: "create", id: "", name: "", size: 64 })}>New map</button>
        </div>
      )}
    </dialog>
  );
}
