"use client";

import type { MapWind, ModelWindSettings } from "@/lib/maps/map-definition";
import { matchWindPreset, resolveWind, WIND_PRESET_LABELS, WIND_PRESETS, type WindPreset, type WindResponse } from "@/lib/engine/wind";
import type { WindDebugView } from "@/lib/editor/wind-debug";

/**
 * The style lab's environment and tree controls, in the editor:
 * - Weather · Wind (Map workspace): presets and every global wind value.
 * - Model (inspector, when a model is selected): its wind response, which
 *   applies to every instance of that model in this map, the debug views
 *   for choosing a weight source, and the mesh data the lab listed.
 *
 * A slider drag is one undo step: `onGroup(label)` on press, `onGroup(null)` on release.
 */
export type SelectedModelInfo = {
  id: string;
  name: string;
  attributes: string[];
  triangles: number;
  vertices: number;
  meshes: number;
  materials: number;
  textures: number;
  bytes: number;
  animations: string[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
  /** Resolved response in this map, or null when the model does not react to wind. */
  wind: WindResponse | null;
  /** Whether the map overrides any of the model's defaults. */
  windOverridden: boolean;
  windSources: string[];
  debugViews: WindDebugView[];
};

type GroupHandler = (label: string | null) => void;

function Slider({ label, value, min, max, step, digits = 2, unit = "", onChange, onGroup, groupLabel }: {
  label: string; value: number; min: number; max: number; step: number; digits?: number; unit?: string;
  onChange: (value: number) => void; onGroup: GroupHandler; groupLabel: string;
}) {
  return (
    <label className="editor-slider">
      <span>{label} <strong>{value.toFixed(digits)}{unit}</strong></span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => onGroup(groupLabel)}
        onPointerUp={() => onGroup(null)}
        onPointerCancel={() => onGroup(null)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function WindSection({ wind, onChange, onGroup }: { wind: MapWind; onChange: (patch: Partial<MapWind>) => void; onGroup: GroupHandler }) {
  const state = resolveWind(wind);
  const preset = matchWindPreset(wind);
  const slider = (key: Exclude<keyof MapWind, "enabled">, label: string, min: number, max: number, step: number, digits = 2, unit = "") => (
    <Slider label={label} value={state[key]} min={min} max={max} step={step} digits={digits} unit={unit} onChange={(value) => onChange({ [key]: value })} onGroup={onGroup} groupLabel={`Wind ${label.toLowerCase()}`} />
  );
  return (
    <details open className="editor-inspector-section" aria-label="Weather and wind">
      <summary>Weather · Wind</summary>
      <div className="editor-preset-row" role="group" aria-label="Wind presets">
        {(Object.keys(WIND_PRESETS) as WindPreset[]).map((name) => (
          <button key={name} type="button" className={preset === name ? "active" : ""} aria-pressed={preset === name} onClick={() => onChange(WIND_PRESETS[name])}>{WIND_PRESET_LABELS[name]}</button>
        ))}
      </div>
      <label className="editor-checkbox"><input type="checkbox" checked={state.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} /> Wind enabled</label>
      {slider("direction", "Direction", 0, 359, 1, 0, "°")}
      {slider("strength", "Strength", 0, 2, 0.01)}
      {slider("speed", "Speed", 0, 3, 0.01)}
      {slider("gustStrength", "Gust strength", 0, 1, 0.01)}
      {slider("gustFrequency", "Gust frequency", 0, 1, 0.01)}
      {slider("turbulence", "Turbulence", 0, 1, 0.01)}
      <p className="editor-muted">Direction is where the wind blows to: 0° north, 90° east.</p>
    </details>
  );
}

const debugLabel = (view: WindDebugView) => {
  if (view === "normal") return "Normal";
  if (view === "weight") return "Wind weight";
  if (view === "height") return "Height";
  return view.replace("-", " · ").replace("color_1", "COLOR_1").replace("color", "COLOR_0").replace(/^uv(\d?)$/, (_, index: string) => `UV${index || "0"} checker`);
};

export function ModelSection({ model, debugView, onWindChange, onDebugViewChange, onGroup }: {
  model: SelectedModelInfo;
  debugView: WindDebugView;
  /** A patch to the map's settings for this model; null removes them (back to the model's defaults). */
  onWindChange: (patch: ModelWindSettings | null) => void;
  onDebugViewChange: (view: WindDebugView) => void;
  onGroup: GroupHandler;
}) {
  const wind = model.wind;
  const slider = (key: "sway" | "branches" | "leaves" | "stiffness", label: string, min: number, max: number) => (
    <Slider label={label} value={wind![key]} min={min} max={max} step={0.01} onChange={(value) => onWindChange({ [key]: value })} onGroup={onGroup} groupLabel={`${model.name} ${label.toLowerCase()}`} />
  );
  const size = model.bounds.max.map((value, axis) => value - model.bounds.min[axis]);
  return (
    <>
      {wind ? (
        <details open className="editor-inspector-section" aria-label="Wind response">
          <summary>Wind response · all {model.name}</summary>
          {slider("sway", "Tree sway", 0, 2)}
          {slider("branches", "Branches", 0, 2)}
          {slider("leaves", "Leaf flutter", 0, 2)}
          {slider("stiffness", "Stiffness", 0.1, 4)}
          <label>Weight source<select aria-label="Wind weight source" value={wind.weightSource} onChange={(event) => onWindChange({ weightSource: event.target.value })}>
            {model.windSources.map((source) => <option key={source} value={source}>{source}</option>)}
          </select></label>
          <button type="button" disabled={!model.windOverridden} onClick={() => onWindChange(null)}>Reset to model defaults</button>
        </details>
      ) : null}
      <details open className="editor-inspector-section" aria-label="Model data">
        <summary>Model data</summary>
        <label>Debug view<select aria-label="Model debug view" value={debugView} onChange={(event) => onDebugViewChange(event.target.value as WindDebugView)}>
          {model.debugViews.map((view) => <option key={view} value={view}>{debugLabel(view)}</option>)}
        </select></label>
        <div className="editor-kv"><dt>Triangles</dt><dd className="mono">{model.triangles.toLocaleString("en")}</dd></div>
        <div className="editor-kv"><dt>Vertices</dt><dd className="mono">{model.vertices.toLocaleString("en")}</dd></div>
        <div className="editor-kv"><dt>Meshes · materials</dt><dd className="mono">{model.meshes} · {model.materials}</dd></div>
        <div className="editor-kv"><dt>Textures</dt><dd className="mono">{model.textures}</dd></div>
        <div className="editor-kv"><dt>File</dt><dd className="mono">{(model.bytes / 1024).toFixed(0)} KB</dd></div>
        <div className="editor-kv"><dt>Attributes</dt><dd className="mono">{model.attributes.join(", ")}</dd></div>
        <div className="editor-kv"><dt>Source size</dt><dd className="mono">{size.map((value) => value.toFixed(2)).join(" × ")}</dd></div>
        {model.animations.length > 0 ? <div className="editor-kv"><dt>Clips</dt><dd className="mono">{model.animations.join(", ")}</dd></div> : null}
      </details>
    </>
  );
}
