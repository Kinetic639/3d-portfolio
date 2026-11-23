"use client";

import { useState } from "react";
import type { ActorConfig } from "@/lib/engine/actor";
import type { ModelActorSettings } from "@/lib/maps/map-definition";
import { Slider, type GroupHandler } from "./WindPanels";

/**
 * The style lab's crow controls for a creature model: its motion (applies
 * to every instance in this map) and its clips, which play on every
 * instance in the editor. Sending it somewhere happens in the world: click
 * it, then click the ground.
 */
export function ActorSection({ name, actor, overridden, clips, onChange, onPreview, onGroup }: {
  name: string;
  actor: ActorConfig;
  overridden: boolean;
  clips: string[];
  /** A patch to the map's motion for this model; null removes it (back to the model's defaults). */
  onChange: (patch: ModelActorSettings | null) => void;
  onPreview: (clip: string | null) => void;
  onGroup: GroupHandler;
}) {
  const [clip, setClip] = useState("");
  const slider = (key: keyof ActorConfig, label: string, min: number, max: number, step: number, digits = 2, unit = "") => (
    <Slider label={label} value={actor[key]} min={min} max={max} step={step} digits={digits} unit={unit} onGroup={onGroup} groupLabel={`${name} ${label.toLowerCase()}`} onChange={(value) => onChange({ [key]: value })} />
  );
  return (
    <details open className="editor-inspector-section" aria-label="Actor">
      <summary>Actor · all {name}</summary>
      {slider("walkSpeed", "Walk speed", 0, 6, 0.05)}
      {slider("runSpeed", "Run speed", 0, 12, 0.05)}
      {slider("sprintSpeed", "Sprint speed", 0, 16, 0.05)}
      {slider("acceleration", "Acceleration", 0, 30, 0.5)}
      {slider("flightSpeed", "Flight speed", 0.5, 16, 0.1)}
      {slider("flightHeight", "Flight height", 0.2, 16, 0.1)}
      {slider("turnSpeed", "Turn speed", 0.5, 20, 0.1)}
      {slider("crossfade", "Crossfade", 0, 1, 0.01, 2, " s")}
      {slider("groundOffset", "Ground offset", -1, 1, 0.01)}
      {slider("forwardYaw", "Forward", -180, 180, 1, 0, "°")}
      <label>Clip<select aria-label="Preview clip" value={clip} onChange={(event) => {
        setClip(event.target.value);
        onPreview(event.target.value || null);
      }}>
        <option value="">Idle (no preview)</option>
        {clips.map((name) => <option key={name} value={name}>{name}</option>)}
      </select></label>
      <button type="button" disabled={!overridden} onClick={() => onChange(null)}>Reset to model defaults</button>
      <p className="editor-muted">In the world, click it to choose it (the camera follows), then click the ground to send it: walk, run, fly or Auto by distance.</p>
    </details>
  );
}
