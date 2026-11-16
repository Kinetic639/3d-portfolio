"use client";

import { useEffect, useMemo, useState } from "react";
import { listLibraryItems, type LibraryItem } from "@/lib/assets/library";
import { MAX_BRUSH_SIZE, type EditorTool } from "@/lib/editor/editor-viewport";
import { ROTATIONS, type CellRotation, type ShapeId } from "@/lib/voxel-shapes/shape-ids";
import { SHAPE_DEFINITIONS } from "@/lib/voxel-shapes/shape-registry";
import { RENDERABLE_BLOCK_DEFINITIONS } from "@/lib/world/block-registry";
import { api } from "./editor-actions";
import { updateSettings, useEditor, useEditorState } from "./editor-store";
import { Row } from "./fields";
import styles from "./Editor.module.css";

export const TOOLS: Array<{ id: EditorTool; label: string; key: string; hint: string }> = [
  { id: "select", label: "Select", key: "1", hint: "Click an object to select it, Shift-click to add. Drag a selected object to move it (Alt: no snapping)." },
  { id: "block", label: "Place", key: "2", hint: "Click a face to place blocks against it. Drag to continue in the same layer." },
  { id: "erase", label: "Remove", key: "3", hint: "Click blocks to remove them. Drag to continue in the same layer." },
  { id: "paint", label: "Paint", key: "4", hint: "Changes the material of existing blocks." },
  { id: "raise", label: "Raise", key: "5", hint: "Adds one block on top of each column under the brush." },
  { id: "lower", label: "Lower", key: "6", hint: "Removes the top block of each column under the brush." },
  { id: "zone", label: "Zone", key: "7", hint: "Paints the active zone onto columns. Choose and configure zones in the Zones tab." },
  { id: "object", label: "Object", key: "8", hint: "Click the ground to place the chosen object." },
];

const ROTATION_LABELS: Array<[CellRotation, string]> = [[ROTATIONS.NORTH, "N"], [ROTATIONS.EAST, "E"], [ROTATIONS.SOUTH, "S"], [ROTATIONS.WEST, "W"]];
const BRUSH_TOOLS: EditorTool[] = ["block", "erase", "paint", "raise", "lower", "zone"];

export default function ToolPanel() {
  const editor = useEditor();
  const settings = useEditorState((state) => state.settings);
  const set = (patch: Parameters<typeof updateSettings>[1]) => updateSettings(editor, patch);
  const tool = TOOLS.find((candidate) => candidate.id === settings.tool)!;

  return (
    <aside className={styles.left} aria-label="Tools">
      <div className={styles.toolGrid} role="radiogroup" aria-label="Tool">
        {TOOLS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="radio"
            aria-checked={settings.tool === candidate.id}
            className={styles.tool}
            title={`${candidate.label} (${candidate.key})`}
            onClick={() => set({ tool: candidate.id })}
          >
            <kbd>{candidate.key}</kbd>
            {candidate.label}
          </button>
        ))}
      </div>
      <p className={styles.hint}>{tool.hint}</p>

      {BRUSH_TOOLS.includes(settings.tool) ? (
        <section className={styles.section}>
          <h3>Brush</h3>
          <Row label={`Size ${settings.brushSize}`}>
            <input
              type="range"
              min={1}
              max={MAX_BRUSH_SIZE}
              step={2}
              value={settings.brushSize}
              aria-label="Brush size"
              onChange={(event) => set({ brushSize: Number(event.target.value) })}
            />
          </Row>
          <Row label="Shape">
            <select className={styles.input} aria-label="Brush shape" value={settings.brushShape} onChange={(event) => set({ brushShape: event.target.value as "square" | "circle" })}>
              <option value="square">Square</option>
              <option value="circle">Circle</option>
            </select>
          </Row>
        </section>
      ) : null}

      {settings.tool === "block" || settings.tool === "paint" ? (
        <section className={styles.section}>
          <h3>Material</h3>
          <div className={styles.palette} role="radiogroup" aria-label="Block material">
            {RENDERABLE_BLOCK_DEFINITIONS.map((block) => (
              <button
                key={block.id}
                type="button"
                role="radio"
                aria-checked={settings.blockId === block.id}
                aria-label={block.displayName}
                title={block.displayName}
                className={styles.swatch}
                style={{ background: block.developmentColor }}
                onClick={() => set({ blockId: block.id })}
              />
            ))}
          </div>
          <p className={styles.muted}>{RENDERABLE_BLOCK_DEFINITIONS.find((block) => block.id === settings.blockId)?.displayName}</p>
        </section>
      ) : null}

      {settings.tool === "block" ? (
        <section className={styles.section}>
          <h3>Shape</h3>
          <Row label="Shape">
            <select className={styles.input} aria-label="Block shape" value={settings.shapeId} onChange={(event) => set({ shapeId: Number(event.target.value) as ShapeId })}>
              {SHAPE_DEFINITIONS.map((shape) => (
                <option key={shape.id} value={shape.id}>{shape.name}</option>
              ))}
            </select>
          </Row>
          <Row label="Facing (R)">
            <span className={styles.segmented} role="radiogroup" aria-label="Block rotation">
              {ROTATION_LABELS.map(([rotation, label]) => (
                <button key={rotation} type="button" role="radio" aria-checked={settings.rotation === rotation} onClick={() => set({ rotation })}>{label}</button>
              ))}
            </span>
          </Row>
        </section>
      ) : null}

      {settings.tool === "zone" ? (
        <section className={styles.section}>
          <h3>Zone brush</h3>
          <Row label="Mode">
            <span className={styles.segmented} role="radiogroup" aria-label="Zone mode">
              <button type="button" role="radio" aria-checked={settings.zoneMode === "paint"} onClick={() => set({ zoneMode: "paint" })}>Paint</button>
              <button type="button" role="radio" aria-checked={settings.zoneMode === "erase"} onClick={() => set({ zoneMode: "erase" })}>Erase</button>
            </span>
          </Row>
          <ActiveZone />
        </section>
      ) : null}

      {settings.tool === "object" ? <LibraryPicker /> : null}
    </aside>
  );
}

function ActiveZone() {
  const editor = useEditor();
  const zoneId = useEditorState((state) => state.settings.zoneId);
  useEditorState((state) => state.metaRevision);
  const zones = editor.session.getMeta().zones;
  if (zones.length === 0) return <p className={styles.muted}>This map has no zones yet. Add one in the Zones tab.</p>;
  return (
    <Row label="Zone">
      <select className={styles.input} aria-label="Active zone" value={zoneId} onChange={(event) => updateSettings(editor, { zoneId: Number(event.target.value) })}>
        {zones.map((zone) => (
          <option key={zone.numericId} value={zone.numericId}>{zone.label}</option>
        ))}
      </select>
    </Row>
  );
}

const kb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function Thumbnail({ item }: { item: LibraryItem }) {
  const { thumbnails } = useEditor();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    thumbnails.render(item).then((result) => {
      if (current) setUrl(result);
    }, () => undefined);
    return () => {
      current = false;
    };
  }, [thumbnails, item]);
  // Decorative: the name is next to it.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className={styles.thumb} src={url} alt="" width={56} height={56} /> : <span className={styles.thumb} />;
}

/** Models from assets/models and the procedural prefabs, in one list. */
function LibraryPicker() {
  const editor = useEditor();
  const prefabId = useEditorState((state) => state.settings.prefabId);
  const modelId = useEditorState((state) => state.settings.modelId);
  const variantId = useEditorState((state) => state.settings.variantId);
  const dirty = useEditorState((state) => state.dirty);
  const items = useMemo(() => listLibraryItems(editor.models.manifest), [editor.models]);
  const models = items.filter((item) => item.kind === "model");
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))], [items]);
  const [category, setCategory] = useState(models.length > 0 ? "models" : categories[0]);
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? items.filter((item) => item.name.toLowerCase().includes(needle))
    : category === "models" ? models : items.filter((item) => item.category === category);
  const selectedKey = modelId ? `model:${modelId}` : prefabId ? `prefab:${prefabId}` : null;
  const selected = items.find((item) => item.key === selectedKey) ?? null;
  const totalBytes = models.reduce((sum, item) => sum + (item.bytes ?? 0), 0);

  const rescan = async () => {
    setScanning(true);
    try {
      const result = await api<{ errors: string[] }>("/api/editor/assets", { method: "POST" });
      if (result.errors.length > 0) {
        editor.store.setState({ notice: { kind: "error", text: `Models: ${result.errors.join(" ")}` } });
      } else if (dirty) {
        editor.store.setState({ notice: { kind: "info", text: "Models rescanned. Save, then reload the editor to see the changes." } });
      } else {
        window.location.reload();
      }
    } catch (error) {
      editor.store.setState({ notice: { kind: "error", text: `Rescan failed: ${error instanceof Error ? error.message : String(error)}` } });
    }
    setScanning(false);
  };

  return (
    <section className={styles.section}>
      <h3>Object</h3>
      <input className={styles.input} type="search" placeholder="Search objects" aria-label="Search objects" value={query} onChange={(event) => setQuery(event.target.value)} />
      {needle ? null : (
        <select className={styles.input} aria-label="Object category" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="models">Models ({models.length})</option>
          {categories.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      )}
      <ul className={styles.library} role="listbox" aria-label="Objects">
        {shown.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              role="option"
              aria-selected={item.key === selectedKey}
              className={styles.libraryItem}
              onClick={() => updateSettings(editor, item.kind === "model"
                ? { modelId: item.id, prefabId: null, variantId: item.defaultVariantId }
                : { prefabId: item.id, modelId: null, variantId: item.defaultVariantId })}
            >
              <Thumbnail item={item} />
              <span>
                {item.name}
                <small>
                  {item.kind === "model"
                    ? `model · ${kb(item.bytes ?? 0)} · ${(item.triangles ?? 0).toLocaleString("en")} tris${item.animated ? " · animated" : ""}`
                    : item.replacedBy ? `drawn as model ${item.replacedBy}` : "placeholder"}
                </small>
              </span>
            </button>
          </li>
        ))}
        {shown.length === 0 ? <li className={styles.muted}>{category === "models" && !needle ? "No models yet. Add a folder to assets/models and rescan." : "Nothing matches."}</li> : null}
      </ul>
      {selected && selected.variants.length > 1 ? (
        <Row label="Variant">
          <select className={styles.input} aria-label="Object variant" value={variantId ?? selected.defaultVariantId ?? ""} onChange={(event) => updateSettings(editor, { variantId: event.target.value })}>
            {selected.variants.map((variant) => (
              <option key={variant.id} value={variant.id}>{variant.label}</option>
            ))}
          </select>
        </Row>
      ) : null}
      {selected ? null : <p className={styles.muted}>Choose an object, then click the ground.</p>}
      <div className={styles.buttons}>
        <button type="button" onClick={rescan} disabled={scanning} title="Runs the model pipeline again, like pnpm assets">{scanning ? "Scanning…" : "Rescan models"}</button>
        <span className={styles.muted}>{models.length} models, {kb(totalBytes)}</span>
      </div>
    </section>
  );
}
