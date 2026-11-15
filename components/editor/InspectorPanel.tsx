"use client";

import type { MapBounds, MapZoneDefinition } from "@/lib/maps/map-definition";
import type { PlacedMapEntity } from "@/lib/maps/map-entities";
import {
  addZone,
  assignContentToSelection,
  contentKey,
  deleteSelection,
  deleteZone,
  duplicateSelection,
  groundSelection,
  MINIGAME_OPTIONS,
  rotateSelection,
  scaleSelection,
  updateZone,
  validateSession,
} from "./editor-actions";
import { setSelection, updateSettings, useEditor, useEditorState } from "./editor-store";
import { ContentSelect, NumberField, Row, TextField } from "./fields";
import styles from "./Editor.module.css";

type Tab = "object" | "zones" | "map";
const TABS: Array<[Tab, string]> = [["object", "Objects"], ["zones", "Zones"], ["map", "Map"]];
const QUARTER_TURN = Math.PI / 2;

export default function InspectorPanel() {
  const { store } = useEditor();
  const tab = useEditorState((state) => state.inspectorTab);
  const setTab = (inspectorTab: Tab) => store.setState({ inspectorTab });

  return (
    <aside className={styles.right} aria-label="Inspector">
      <div className={styles.tabs} role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "object" ? <ObjectTab /> : tab === "zones" ? <ZonesTab /> : <MapTab />}
    </aside>
  );
}

function ObjectTab() {
  const editor = useEditor();
  const selection = useEditorState((state) => state.selection);
  useEditorState((state) => state.entitiesRevision);
  const { session } = editor;
  const all = session.getEntities();
  const selected = selection.map((id) => session.getEntity(id)).filter((entity): entity is PlacedMapEntity => entity !== null);
  const single = selected.length === 1 ? selected[0] : null;
  const update = (label: string, change: (entity: PlacedMapEntity) => void) =>
    session.updateEntities(label, selection, (entity) => {
      change(entity);
      return entity;
    });
  const keys = new Set(selected.map((entity) => contentKey(entity.contentReference)));

  return (
    <div className={styles.tabBody}>
      {selected.length === 0 ? <p className={styles.muted}>Nothing selected. Use the Select tool, or pick from the list below.</p> : null}

      {selected.length > 0 ? (
        <section className={styles.section}>
          <h3>{single ? single.name : `${selected.length} objects`}</h3>
          {single ? (
            <>
              <Row label="Name"><TextField label="Object name" value={single.name} onCommit={(name) => update("Rename object", (entity) => { entity.name = name.trim() || entity.id; })} /></Row>
              <Row label="Position">
                <span className={styles.triple}>
                  {(["x", "y", "z"] as const).map((axis) => (
                    <NumberField key={axis} label={`Position ${axis}`} step={0.5} value={single.transform.position[axis]} onCommit={(value) => update("Move object", (entity) => { entity.transform.position[axis] = value; })} />
                  ))}
                </span>
              </Row>
              <Row label="Rotation °">
                <NumberField label="Rotation in degrees" step={0.1} value={(single.transform.rotation.y * 180) / Math.PI} onCommit={(degrees) => update("Rotate", (entity) => { entity.transform.rotation.y = (degrees * Math.PI) / 180; })} />
              </Row>
              <Row label="Scale">
                <span className={styles.triple}>
                  {(["x", "y", "z"] as const).map((axis) => (
                    <NumberField key={axis} label={`Scale ${axis}`} step={0.1} min={0.1} max={20} value={single.transform.scale[axis]} onCommit={(value) => update("Scale", (entity) => { entity.transform.scale[axis] = value; })} />
                  ))}
                </span>
              </Row>
              <Row label="Locked">
                <input type="checkbox" aria-label="Locked" checked={single.locked} onChange={(event) => update(event.target.checked ? "Lock object" : "Unlock object", (entity) => { entity.locked = event.target.checked; })} />
              </Row>
            </>
          ) : null}
          <Row label="Content">
            <ContentSelect
              label="Content shown when a visitor clicks this"
              value={selected[0].contentReference}
              mixed={keys.size > 1}
              onChange={(reference) => assignContentToSelection(editor, reference)}
            />
          </Row>
          <div className={styles.buttons}>
            <button type="button" onClick={() => rotateSelection(editor, -QUARTER_TURN)} title="Rotate 90° (R)">Rotate 90°</button>
            <button type="button" onClick={() => scaleSelection(editor, 1.25)}>Scale +</button>
            <button type="button" onClick={() => scaleSelection(editor, 0.8)}>Scale −</button>
            <button type="button" onClick={() => groundSelection(editor)}>Drop to ground</button>
            <button type="button" onClick={() => duplicateSelection(editor)} title="Duplicate (Ctrl+D)">Duplicate</button>
            <button type="button" className={styles.danger} onClick={() => deleteSelection(editor)} title="Delete (Del)">Delete</button>
          </div>
        </section>
      ) : null}

      <section className={styles.section}>
        <h3>All objects ({all.length})</h3>
        <ul className={styles.list} role="listbox" aria-label="Objects on the map" aria-multiselectable>
          {all.map((entity) => (
            <li key={entity.id}>
              <button
                type="button"
                role="option"
                aria-selected={selection.includes(entity.id)}
                className={styles.listItem}
                onClick={(event) => setSelection(editor, event.shiftKey
                  ? selection.includes(entity.id) ? selection.filter((id) => id !== entity.id) : [...selection, entity.id]
                  : [entity.id])}
                onDoubleClick={() => editor.viewport.focusEntity(entity.id)}
              >
                {entity.name}
                {entity.contentReference ? <small> → {entity.contentReference.contentId}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ZonesTab() {
  const editor = useEditor();
  const activeId = useEditorState((state) => state.settings.zoneId);
  useEditorState((state) => state.metaRevision);
  const zones = editor.session.getMeta().zones;
  const active = zones.find((zone) => zone.numericId === activeId) ?? null;
  const patch = (change: Partial<MapZoneDefinition>) => active && updateZone(editor, active.numericId, change);

  return (
    <div className={styles.tabBody}>
      <section className={styles.section}>
        <h3>Zones ({zones.length})</h3>
        <ul className={styles.list} role="listbox" aria-label="Zones">
          {zones.map((zone) => (
            <li key={zone.numericId}>
              <button type="button" role="option" aria-selected={zone.numericId === activeId} className={styles.listItem} onClick={() => updateSettings(editor, { zoneId: zone.numericId })}>
                <i className={styles.dot} style={{ background: zone.color }} />
                {zone.label}
                <small>{zone.kind === "minigame" ? " · mini-game" : zone.contentReference ? ` → ${zone.contentReference.contentId}` : ""}</small>
              </button>
            </li>
          ))}
        </ul>
        <div className={styles.buttons}>
          <button
            type="button"
            onClick={() => {
              const zone = addZone(editor);
              if (zone) updateSettings(editor, { zoneId: zone.numericId, tool: "zone" });
            }}
          >
            Add zone
          </button>
        </div>
      </section>

      {active ? (
        <section className={styles.section}>
          <h3>{active.label}</h3>
          <Row label="Label"><TextField label="Zone label" value={active.label} onCommit={(label) => patch({ label: label.trim() || active.label })} /></Row>
          <Row label="Colour"><input type="color" aria-label="Zone colour" value={active.color} onChange={(event) => patch({ color: event.target.value })} /></Row>
          <Row label="Kind">
            <select
              className={styles.input}
              aria-label="Zone kind"
              value={active.kind ?? "area"}
              onChange={(event) => patch(event.target.value === "minigame"
                ? { kind: "minigame", minigame: active.minigame ?? { gameId: MINIGAME_OPTIONS[0].id }, contentReference: undefined }
                : { kind: "area", minigame: undefined })}
            >
              <option value="area">Area</option>
              <option value="minigame">Mini-game</option>
            </select>
          </Row>
          {active.kind === "minigame" ? (
            <>
              <Row label="Game">
                <select className={styles.input} aria-label="Mini-game" value={active.minigame?.gameId ?? ""} onChange={(event) => patch({ minigame: { ...active.minigame, gameId: event.target.value } })}>
                  {MINIGAME_OPTIONS.map((game) => (
                    <option key={game.id} value={game.id}>{game.label}</option>
                  ))}
                </select>
              </Row>
              <p className={styles.muted}>Mini-game zones stay voxel-based after baking, so their terrain can change during play.</p>
            </>
          ) : (
            <Row label="Content">
              <ContentSelect label="Content opened from this zone" value={active.contentReference} onChange={(reference) => patch({ contentReference: reference ?? undefined })} />
            </Row>
          )}
          <div className={styles.buttons}>
            <button type="button" onClick={() => updateSettings(editor, { tool: "zone", zoneMode: "paint" })}>Paint this zone</button>
            <button type="button" className={styles.danger} onClick={() => deleteZone(editor, active.numericId)}>Delete zone</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function MapTab() {
  const editor = useEditor();
  useEditorState((state) => state.metaRevision);
  const validation = useEditorState((state) => state.validation);
  const { session } = editor;
  const meta = session.getMeta();
  const { width, depth, height } = meta.dimensions;
  const setBound = (key: keyof MapBounds, value: number) => session.updateMeta("Change playable area", { playableBounds: { ...meta.playableBounds, [key]: value } });
  const stats = session.world.getStats();

  return (
    <div className={styles.tabBody}>
      <section className={styles.section}>
        <h3>Map</h3>
        <Row label="Name"><TextField label="Map name" value={meta.name} onCommit={(name) => session.updateMeta("Rename map", { name: name.trim() || meta.name })} /></Row>
        <Row label="Description"><TextField label="Map description" value={meta.description ?? ""} onCommit={(description) => session.updateMeta("Describe map", { description })} /></Row>
        <p className={styles.muted}>{meta.id} · {width} × {depth} × {height} cells · {stats.nonAirBlocks.toLocaleString("en")} blocks</p>
      </section>

      <section className={styles.section}>
        <h3>Playable area</h3>
        <p className={styles.muted}>Cells a visitor can reach (orange outline). Everything outside is backdrop.</p>
        <Row label="X from / to">
          <span className={styles.pair}>
            <NumberField label="Playable min X" min={0} max={meta.playableBounds.maxX} value={meta.playableBounds.minX} onCommit={(value) => setBound("minX", value)} />
            <NumberField label="Playable max X" min={meta.playableBounds.minX} max={width - 1} value={meta.playableBounds.maxX} onCommit={(value) => setBound("maxX", value)} />
          </span>
        </Row>
        <Row label="Z from / to">
          <span className={styles.pair}>
            <NumberField label="Playable min Z" min={0} max={meta.playableBounds.maxZ} value={meta.playableBounds.minZ} onCommit={(value) => setBound("minZ", value)} />
            <NumberField label="Playable max Z" min={meta.playableBounds.minZ} max={depth - 1} value={meta.playableBounds.maxZ} onCommit={(value) => setBound("maxZ", value)} />
          </span>
        </Row>
      </section>

      <section className={styles.section}>
        <h3>Environment</h3>
        <Row label="Hour"><NumberField label="Time of day" step={0.5} min={0} max={24} value={meta.environment.timeOfDay} onCommit={(timeOfDay) => session.updateMeta("Change time of day", { environment: { ...meta.environment, timeOfDay } })} /></Row>
        <Row label="Wind °"><NumberField label="Wind direction" min={0} max={359} value={meta.environment.wind.direction} onCommit={(direction) => session.updateMeta("Change wind", { environment: { ...meta.environment, wind: { ...meta.environment.wind, direction } } })} /></Row>
        <Row label="Wind strength"><NumberField label="Wind strength" step={0.05} min={0} max={1} value={meta.environment.wind.strength} onCommit={(strength) => session.updateMeta("Change wind", { environment: { ...meta.environment, wind: { ...meta.environment.wind, strength } } })} /></Row>
      </section>

      <section className={styles.section}>
        <h3>Validation</h3>
        <div className={styles.buttons}>
          <button type="button" onClick={() => validateSession(editor)}>Validate map</button>
        </div>
        {validation === null ? <p className={styles.muted}>Runs automatically before every save.</p> : null}
        {validation?.length === 0 ? <p className={styles.ok} role="status">No problems found.</p> : null}
        {validation && validation.length > 0 ? (
          <ul className={styles.errors} role="alert">
            {validation.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
