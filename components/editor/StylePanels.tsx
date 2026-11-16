"use client";

import type { MapLighting, MapShadows, MapSurfaceStyle, ModelStyleSettings } from "@/lib/maps/map-definition";
import { DEFAULT_LIGHTING, resolveLighting, resolveShadows, resolveSurfaceStyle, STYLE_LAB_LIGHTING, type ModelStyle } from "@/lib/engine/surface-style";
import { Slider, type GroupHandler } from "./WindPanels";

/**
 * The style lab's Lighting, Surface and "Edges and depth" panels, in the
 * Map workspace, and a model's style in its inspector. Same controls and
 * ranges as the lab; the outline adds a screen-pixel mode (the default),
 * and shadows gain on/off, strength and map size.
 */
type Change<T> = (patch: Partial<T>) => void;

function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="editor-color-row">
      <span>{label}</span>
      <input type="color" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
      <code>{value}</code>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="editor-checkbox"><input type="checkbox" aria-label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}</label>;
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void }) {
  return (
    <div className="editor-preset-row" role="group" aria-label={label}>
      {options.map(([option, text]) => <button key={option} type="button" className={value === option ? "active" : ""} aria-pressed={value === option} onClick={() => onChange(option)}>{text}</button>)}
    </div>
  );
}

export function LightingSection({ lighting, onChange, onGroup }: { lighting: MapLighting | undefined; onChange: Change<MapLighting>; onGroup: GroupHandler }) {
  const state = resolveLighting(lighting);
  const isLab = JSON.stringify(state) === JSON.stringify(STYLE_LAB_LIGHTING);
  const isOriginal = JSON.stringify(state) === JSON.stringify(DEFAULT_LIGHTING);
  const sun = (axis: "x" | "y" | "z", min: number, max: number) => (
    <Slider label={`Sun ${axis.toUpperCase()}`} value={state.sunPosition[axis]} min={min} max={max} step={0.1} digits={1} onGroup={onGroup} groupLabel="Move sun"
      onChange={(value) => onChange({ sunPosition: { ...state.sunPosition, [axis]: value } })} />
  );
  return (
    <details open className="editor-inspector-section" aria-label="Lighting">
      <summary>Lighting</summary>
      <div className="editor-preset-row" role="group" aria-label="Lighting presets">
        <button type="button" className={isOriginal ? "active" : ""} aria-pressed={isOriginal} onClick={() => onChange(DEFAULT_LIGHTING)}>Original</button>
        <button type="button" className={isLab ? "active" : ""} aria-pressed={isLab} onClick={() => onChange(STYLE_LAB_LIGHTING)}>Style lab</button>
      </div>
      <Slider label="Sun" value={state.sunIntensity} min={0} max={5} step={0.05} onGroup={onGroup} groupLabel="Sun intensity" onChange={(sunIntensity) => onChange({ sunIntensity })} />
      <Color label="Sun colour" value={state.sunColor} onChange={(sunColor) => onChange({ sunColor })} />
      {sun("x", -60, 60)}
      {sun("y", 1, 80)}
      {sun("z", -60, 60)}
      <Slider label="Sky light" value={state.skyIntensity} min={0} max={3} step={0.05} onGroup={onGroup} groupLabel="Sky light" onChange={(skyIntensity) => onChange({ skyIntensity })} />
      <Color label="Sky colour" value={state.skyColor} onChange={(skyColor) => onChange({ skyColor })} />
      <Color label="Ground colour" value={state.groundColor} onChange={(groundColor) => onChange({ groundColor })} />
      <p className="editor-muted">Lights models; the terrain keeps the original&apos;s own light. Only the sun&apos;s direction matters.</p>
    </details>
  );
}

export function SurfaceSection({ style, onChange, onGroup }: { style: MapSurfaceStyle | undefined; onChange: Change<MapSurfaceStyle>; onGroup: GroupHandler }) {
  const state = resolveSurfaceStyle(style);
  return (
    <details open className="editor-inspector-section" aria-label="Surface">
      <summary>Surface</summary>
      <Slider label="Toon bands" value={state.toonBands} min={2} max={6} step={1} digits={0} onGroup={onGroup} groupLabel="Toon bands" onChange={(toonBands) => onChange({ toonBands })} />
      <Slider label="Hatch power" value={state.hatchStrength} min={0} max={1} step={0.01} onGroup={onGroup} groupLabel="Hatch power" onChange={(hatchStrength) => onChange({ hatchStrength })} />
      <Slider label="Hatch scale" value={state.hatchScale} min={0.5} max={5} step={0.05} onGroup={onGroup} groupLabel="Hatch scale" onChange={(hatchScale) => onChange({ hatchScale })} />
      <Choice label="Hatching coordinates" value={state.hatchMode} options={[["uv", "UV stable"], ["screen", "Screen"]]} onChange={(hatchMode) => onChange({ hatchMode })} />
      <p className="editor-muted">For models with toon shading. The crosshatch is generated in the shader (no hatch texture).</p>
    </details>
  );
}

export function EdgesSection({ style, shadows, onStyleChange, onShadowsChange, onGroup }: {
  style: MapSurfaceStyle | undefined; shadows: MapShadows | undefined;
  onStyleChange: Change<MapSurfaceStyle>; onShadowsChange: Change<MapShadows>; onGroup: GroupHandler;
}) {
  const surface = resolveSurfaceStyle(style);
  const shadow = resolveShadows(shadows);
  const screen = surface.outlineMode === "screen";
  return (
    <details open className="editor-inspector-section" aria-label="Edges and depth">
      <summary>Edges and depth</summary>
      <Choice label="Outline size" value={surface.outlineMode} options={[["screen", "Pixels"], ["world", "World units"]]}
        onChange={(outlineMode) => onStyleChange({ outlineMode, outlineThickness: outlineMode === "screen" ? 1.5 : 0.012 })} />
      <Slider label="Outline" value={surface.outlineThickness} min={0} max={screen ? 6 : 0.04} step={screen ? 0.1 : 0.001} digits={screen ? 1 : 3} unit={screen ? " px" : ""}
        onGroup={onGroup} groupLabel="Outline thickness" onChange={(outlineThickness) => onStyleChange({ outlineThickness })} />
      <Color label="Edge colour" value={surface.outlineColor} onChange={(outlineColor) => onStyleChange({ outlineColor })} />
      <Slider label="Contact AO" value={surface.contactShadow} min={0} max={0.7} step={0.01} onGroup={onGroup} groupLabel="Contact AO" onChange={(contactShadow) => onStyleChange({ contactShadow })} />
      <Toggle label="Shadows" checked={shadow.enabled} onChange={(enabled) => onShadowsChange({ enabled })} />
      <Slider label="Shadow strength" value={shadow.strength} min={0} max={1} step={0.01} onGroup={onGroup} groupLabel="Shadow strength" onChange={(strength) => onShadowsChange({ strength })} />
      <Slider label="Bias" value={shadow.bias} min={-0.003} max={0.003} step={0.0001} digits={4} onGroup={onGroup} groupLabel="Shadow bias" onChange={(bias) => onShadowsChange({ bias })} />
      <Slider label="Normal bias" value={shadow.normalBias} min={0} max={0.15} step={0.001} digits={3} onGroup={onGroup} groupLabel="Shadow normal bias" onChange={(normalBias) => onShadowsChange({ normalBias })} />
      <label>Shadow map<select aria-label="Shadow map size" value={shadow.mapSize} onChange={(event) => onShadowsChange({ mapSize: Number(event.target.value) as 1024 | 2048 | 4096 })}>
        {[1024, 2048, 4096].map((size) => <option key={size} value={size}>{size} px</option>)}
      </select></label>
      <p className="editor-muted">Shadows follow the view; visitors on the lowest quality get none (Contact AO still shows).</p>
    </details>
  );
}

export function ModelStyleSection({ name, style, overridden, hasOutlineData, onChange, onGroup }: {
  name: string; style: ModelStyle; overridden: boolean; hasOutlineData: boolean;
  /** A patch to the map's style for this model; null removes it (back to the model's defaults). */
  onChange: (patch: ModelStyleSettings | null) => void; onGroup: GroupHandler;
}) {
  return (
    <details open className="editor-inspector-section" aria-label="Model style">
      <summary>Style · all {name}</summary>
      <Choice label="Shading" value={style.shading} options={[["toon", "Toon"], ["standard", "Model's own"]]} onChange={(shading) => onChange({ shading })} />
      <Toggle label="Outline" checked={style.outline && hasOutlineData} onChange={(outline) => onChange({ outline })} />
      {!hasOutlineData ? <p className="editor-muted">No outline data: set &quot;style&quot;: {"{"} &quot;outline&quot;: true {"}"} in its asset.json and run pnpm assets.</p> : null}
      <Slider label="Outline scale" value={style.outlineScale} min={0} max={3} step={0.01} onGroup={onGroup} groupLabel={`${name} outline scale`} onChange={(outlineScale) => onChange({ outlineScale })} />
      <Toggle label="Contact AO patch" checked={style.contactShadow} onChange={(contactShadow) => onChange({ contactShadow })} />
      <Toggle label="Casts shadow" checked={style.castShadow} onChange={(castShadow) => onChange({ castShadow })} />
      <button type="button" disabled={!overridden} onClick={() => onChange(null)}>Reset to model defaults</button>
    </details>
  );
}
