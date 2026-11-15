"use client";

import { useMemo, useState } from "react";
import { MAX_BRUSH_SIZE, type EditorTool } from "@/lib/editor/editor-viewport";
import { BUILT_IN_PREFABS, getPrefabDefinition, listPrefabCategories } from "@/lib/prefabs/prefab-library";
import { ROTATIONS, type CellRotation, type ShapeId } from "@/lib/voxel-shapes/shape-ids";
import { SHAPE_DEFINITIONS } from "@/lib/voxel-shapes/shape-registry";
import { RENDERABLE_BLOCK_DEFINITIONS } from "@/lib/world/block-registry";
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

      {settings.tool === "object" ? <PrefabPicker /> : null}
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

function PrefabPicker() {
  const editor = useEditor();
  const prefabId = useEditorState((state) => state.settings.prefabId);
  const variantId = useEditorState((state) => state.settings.variantId);
  const categories = useMemo(() => listPrefabCategories(), []);
  const [category, setCategory] = useState(categories[0]);
  const [query, setQuery] = useState("");
  const prefab = prefabId ? getPrefabDefinition(prefabId) : null;
  const needle = query.trim().toLowerCase();
  const prefabs = BUILT_IN_PREFABS.filter((candidate) => (needle ? candidate.name.toLowerCase().includes(needle) : candidate.category === category));

  return (
    <section className={styles.section}>
      <h3>Object</h3>
      <input className={styles.input} type="search" placeholder="Search objects" aria-label="Search objects" value={query} onChange={(event) => setQuery(event.target.value)} />
      {needle ? null : (
        <select className={styles.input} aria-label="Object category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
          {categories.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      )}
      <ul className={styles.list} role="listbox" aria-label="Objects">
        {prefabs.map((candidate) => (
          <li key={candidate.id}>
            <button
              type="button"
              role="option"
              aria-selected={candidate.id === prefabId}
              className={styles.listItem}
              onClick={() => updateSettings(editor, { prefabId: candidate.id, variantId: candidate.defaultVariantId })}
            >
              {candidate.name}
            </button>
          </li>
        ))}
        {prefabs.length === 0 ? <li className={styles.muted}>Nothing matches.</li> : null}
      </ul>
      {prefab && prefab.variants.length > 1 ? (
        <Row label="Variant">
          <select className={styles.input} aria-label="Object variant" value={variantId ?? prefab.defaultVariantId} onChange={(event) => updateSettings(editor, { variantId: event.target.value })}>
            {prefab.variants.map((variant) => (
              <option key={variant.id} value={variant.id}>{variant.label}</option>
            ))}
          </select>
        </Row>
      ) : null}
      {prefab ? null : <p className={styles.muted}>Choose an object, then click the ground.</p>}
    </section>
  );
}
