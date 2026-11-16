"use client";

import type { ScatterSettings } from "@/lib/editor/scatter";
import { Slider } from "./WindPanels";

/** The style lab's Scene Lab "Multiple" controls, for the Place tool. */
export function ScatterSection({ scatter, objectName, onChange, onClear }: {
  scatter: ScatterSettings;
  /** The chosen object, or null when nothing is chosen. */
  objectName: string | null;
  onChange: (patch: Partial<ScatterSettings>) => void;
  onClear: () => void;
}) {
  // Settings are tool options, not map edits: no undo grouping.
  const noGroup = () => undefined;
  const slider = (key: "count" | "radius" | "spacing" | "scaleMin" | "scaleMax", label: string, min: number, max: number, step: number, digits: number) => (
    <Slider label={label} value={scatter[key]} min={min} max={max} step={step} digits={digits} onGroup={noGroup} groupLabel={label} onChange={(value) => onChange({ [key]: value })} />
  );
  return (
    <details open className="editor-inspector-section" aria-label="Scatter">
      <summary>Scatter</summary>
      <label className="editor-checkbox"><input type="checkbox" aria-label="Scatter on click" checked={scatter.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} /> Scatter on click</label>
      {slider("count", "Count", 1, 200, 1, 0)}
      {slider("radius", "Radius", 1, 40, 0.5, 1)}
      {slider("spacing", "Spacing", 0, 10, 0.1, 1)}
      <div className="editor-seed-row">
        <label>Seed<input type="number" aria-label="Scatter seed" value={scatter.seed} onChange={(event) => onChange({ seed: Math.trunc(Number(event.target.value) || 0) })} /></label>
        <button type="button" onClick={() => onChange({ seed: Math.floor(Math.random() * 1_000_000) })}>New seed</button>
      </div>
      <label className="editor-checkbox"><input type="checkbox" aria-label="Random rotation" checked={scatter.randomRotation} onChange={(event) => onChange({ randomRotation: event.target.checked })} /> Random rotation</label>
      <label className="editor-checkbox"><input type="checkbox" aria-label="Random scale" checked={scatter.randomScale} onChange={(event) => onChange({ randomScale: event.target.checked })} /> Random scale</label>
      {scatter.randomScale ? (
        <>
          {slider("scaleMin", "Scale min", 0.1, 3, 0.05, 2)}
          {slider("scaleMax", "Scale max", 0.1, 3, 0.05, 2)}
        </>
      ) : null}
      <button type="button" disabled={!objectName} onClick={onClear}>{objectName ? `Clear all ${objectName}` : "Clear all of the chosen object"}</button>
      <p className="editor-muted">Each click places up to Count objects within Radius, at least Spacing apart, on the ground. The same seed scatters the same way. One undo step per click.</p>
    </details>
  );
}
