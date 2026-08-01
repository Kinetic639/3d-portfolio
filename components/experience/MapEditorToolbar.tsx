"use client";

import { useRef, useState } from "react";
import { RENDERABLE_BLOCK_DEFINITIONS, getBlockDefinition, type BlockId } from "@/lib/world/block-registry";
import type { EditorMessage, EditorTool } from "@/lib/editor/map-editor";
import { MAP_PRESETS, type MapPresetId } from "@/lib/editor/map-presets";
import type { GridCoordinate, WorldPosition } from "@/lib/world/world-config";

export type TerrainRenderMode = "instanced" | "surface";

export type EditorInspectorState = {
  available: boolean;
  tool: EditorTool;
  paintBlockId: BlockId;
  presetId: MapPresetId;
  renderMode: TerrainRenderMode;
  zoneId: number;
  hovered: GridCoordinate | null;
  selected: GridCoordinate | null;
  selectedBlockId: BlockId | null;
  selectedZoneId: number;
  selectedWorldPosition: WorldPosition | null;
  selectedChunk: { chunkX: number; chunkZ: number } | null;
  selectedLocal: { localX: number; localZ: number } | null;
  dirtyChunks: number;
  lastRebuiltChunks: string[];
  blockEditCount: number;
  zoneAssignmentCount: number;
  entityAnchorCount: number;
  undoDepth: number;
  redoDepth: number;
  hasUnsavedChanges: boolean;
  autosaveStatus: string;
  message: EditorMessage | null;
  selectedMarkerId: string | null;
};

export type MapEditorToolbarProps = EditorInspectorState & {
  onToolChange: (tool: EditorTool) => void;
  onPaintBlockChange: (blockId: BlockId) => void;
  onPresetChange: (presetId: MapPresetId) => void;
  onRenderModeChange: (mode: TerrainRenderMode) => void;
  onZoneChange: (zoneId: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onResetUnsaved: () => void;
  onResetFlat: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClearDraft: () => void;
  onClose: () => void;
  onRemoveMarker: () => void;
};

const TOOLS: Array<{ id: EditorTool; label: string }> = [
  { id: "select", label: "Select" },
  { id: "paint", label: "Paint" },
  { id: "add", label: "Add Block" },
  { id: "erase", label: "Erase" },
  { id: "raise", label: "Raise" },
  { id: "lower", label: "Lower" },
  { id: "zone", label: "Assign Zone" },
  { id: "marker", label: "Place Marker" },
];

export default function MapEditorToolbar(props: MapEditorToolbarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!props.available) {
    return null;
  }

  if (collapsed) {
    return (
      <aside className="map-editor-toolbar map-editor-toolbar--collapsed" aria-label="Map editor">
        <button type="button" onClick={() => setCollapsed(false)}>
          Editor
          {props.hasUnsavedChanges ? <span>*</span> : null}
        </button>
      </aside>
    );
  }

  return (
    <aside className="map-editor-toolbar" aria-label="Development map editor">
      <div className="map-editor-header">
        <div>
          <strong>Map Editor</strong>
          <span>{props.hasUnsavedChanges ? "unsaved" : props.autosaveStatus}</span>
        </div>
        <div>
          <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse editor">-</button>
          <button type="button" onClick={props.onClose}>Close editor</button>
        </div>
      </div>

      <div className="map-editor-tools" role="toolbar" aria-label="Editor tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={props.tool === tool.id ? "active" : ""}
            onClick={() => props.onToolChange(tool.id)}
          >
            {tool.label}
          </button>
        ))}
      </div>

      <div className="map-editor-controls">
        <label>
          <span>Preset</span>
          <select value={props.presetId} onChange={(event) => props.onPresetChange(event.target.value as MapPresetId)}>
            {MAP_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Block</span>
          <select value={props.paintBlockId} onChange={(event) => props.onPaintBlockChange(Number(event.target.value) as BlockId)}>
            {RENDERABLE_BLOCK_DEFINITIONS.map((block) => (
              <option key={block.id} value={block.id}>{block.displayName}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Renderer</span>
          <select value={props.renderMode} onChange={(event) => props.onRenderModeChange(event.target.value as TerrainRenderMode)}>
            <option value="instanced">Instanced full cubes</option>
            <option value="surface">Exposed-face chunk meshes</option>
          </select>
        </label>
        <label>
          <span>Zone</span>
          <select value={props.zoneId} onChange={(event) => props.onZoneChange(Number(event.target.value))}>
            {[0, 1, 2, 3, 4, 5].map((zoneId) => (
              <option key={zoneId} value={zoneId}>{zoneId === 0 ? "Clear zone" : `Zone ${zoneId}`}</option>
            ))}
          </select>
        </label>
      </div>

      <dl className="map-editor-inspector">
        <div><dt>Active</dt><dd>{props.tool}</dd></div>
        <div><dt>Hovered</dt><dd>{formatCoordinate(props.hovered)}</dd></div>
        <div><dt>Selected</dt><dd>{formatCoordinate(props.selected)}</dd></div>
        <div><dt>Block</dt><dd>{props.selectedBlockId === null ? "-" : getBlockDefinition(props.selectedBlockId).displayName}</dd></div>
        <div><dt>Zone</dt><dd>{props.selectedZoneId}</dd></div>
        <div><dt>World</dt><dd>{formatWorld(props.selectedWorldPosition)}</dd></div>
        <div><dt>Chunk</dt><dd>{props.selectedChunk ? `${props.selectedChunk.chunkX},${props.selectedChunk.chunkZ}` : "-"}</dd></div>
        <div><dt>Local</dt><dd>{props.selectedLocal ? `${props.selectedLocal.localX},${props.selectedLocal.localZ}` : "-"}</dd></div>
        <div><dt>Dirty</dt><dd>{props.dirtyChunks}</dd></div>
        <div><dt>Rebuilt</dt><dd>{props.lastRebuiltChunks.join(", ") || "-"}</dd></div>
        <div><dt>Edits</dt><dd>{props.blockEditCount}</dd></div>
        <div><dt>Zones</dt><dd>{props.zoneAssignmentCount}</dd></div>
        <div><dt>Markers</dt><dd>{props.entityAnchorCount}</dd></div>
        <div><dt>Undo</dt><dd>{props.undoDepth}</dd></div>
        <div><dt>Redo</dt><dd>{props.redoDepth}</dd></div>
      </dl>

      {props.message ? <p className={`map-editor-message ${props.message.type}`}>{props.message.text}</p> : null}

      <div className="map-editor-actions">
        <button type="button" onClick={props.onUndo} disabled={props.undoDepth === 0}>Undo</button>
        <button type="button" onClick={props.onRedo} disabled={props.redoDepth === 0}>Redo</button>
        <button type="button" onClick={props.onResetUnsaved}>Reset unsaved</button>
        <button type="button" onClick={props.onResetFlat}>Reset flat</button>
        <button type="button" onClick={props.onExport}>Export</button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>Import</button>
        <button type="button" onClick={props.onClearDraft}>Clear draft</button>
        <button type="button" onClick={props.onRemoveMarker} disabled={!props.selectedMarkerId}>Remove marker</button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            props.onImport(file);
          }
        }}
      />
      <p className="map-editor-hint">
        {MAP_PRESETS.find((preset) => preset.id === props.presetId)?.description}
      </p>
      <p className="map-editor-hint">Paint changes blocks. Add places on the clicked face. Drag still pans or rotates.</p>
    </aside>
  );
}

function formatCoordinate(coordinate: GridCoordinate | null) {
  return coordinate ? `${coordinate.x},${coordinate.y},${coordinate.z}` : "-";
}

function formatWorld(position: WorldPosition | null) {
  return position ? `${position.x.toFixed(1)},${position.y.toFixed(1)},${position.z.toFixed(1)}` : "-";
}
