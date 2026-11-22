"use client";

import { LockKeyhole, RotateCcw, UnlockKeyhole } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import ContentArticle from "@/components/content/ContentArticle";
import SectionArticle from "@/components/content/SectionArticle";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { useWorldBridge } from "@/lib/bridge/use-world-bridge";
import { worldBridge, type WorldPhase, type ZoneInfo } from "@/lib/bridge/world-bridge";
import { getSectionPath, sectionByKind } from "@/lib/content/places";
import {
  CONTENT_SECTIONS,
  findContentByPath,
  getContentPath,
  listContentByKind,
  resolveContentReference,
  toContentReference,
  type ContentItem,
} from "@/lib/content/content";
import { isWorldHistoryEntry, useContentRoute, worldHistoryState } from "./use-content-route";
import { useWorldBoot } from "./use-world-boot";
import PerfHud from "./PerfHud";
import WorldMinimap from "./WorldMinimap";
import SkySwitch from "./SkySwitch";
import { registerWorldEntry, WORLD_DOOR_ID } from "./entry-control";
import type { MinimapData } from "@/lib/minimap/minimap";
import { useUiWork } from "@/lib/perf/ui-work";
import styles from "./WorldLayer.module.css";

const MOBILE_QUERY = "(max-width: 720px)";
const MAP_PATH = /^\/map\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** How the canvas layer shows: the loader over the landing page (the engine draws nothing else), or the whole world. */
function layerView(phase: WorldPhase) {
  if (phase === "warming" || phase === "ready") return "loader";
  if (phase === "entering" || phase === "world") return "world";
  if (phase === "leaving") return "leaving";
  return undefined;
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Space the content panel takes from the viewport, so the camera can centre objects in what is left. */
function panelInset() {
  if (window.matchMedia(MOBILE_QUERY).matches) {
    return { bottom: Math.round(window.innerHeight * 0.55) };
  }
  return { right: Math.min(460, Math.round(window.innerWidth * 0.42)) };
}

/**
 * The world and everything the page shows around it. Mounted once in the
 * site layout, so it survives navigation between landing pages: the world
 * keeps loading (or stays warm) while the visitor reads.
 *
 * This is where bridge state meets the DOM and the router. The engine knows
 * nothing about URLs, history or the landing page.
 */
export default function WorldLayer({ defaultMapId, bakes, serveBakes, minimaps }: {
  defaultMapId: string;
  bakes: Record<string, string>;
  serveBakes: boolean;
  /** Each map's minimap data, drawn at build time; a map without one has no corner map. */
  minimaps: Record<string, MinimapData>;
}) {
  useUiWork();
  const pathname = usePathname();
  const previewMapId = MAP_PATH.exec(pathname)?.[1];
  // A map preview URL switches the map; other pages keep whichever map is loaded.
  const [mapId, setMapId] = useState(previewMapId ?? defaultMapId);
  if (previewMapId && previewMapId !== mapId) setMapId(previewMapId);
  const worldPath = mapId === defaultMapId ? "/" : `/map/${mapId}`;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startLoading = useWorldBoot(mapId, canvasRef, bakes[mapId], serveBakes);
  const phase = useWorldBridge((state) => state.phase);
  const shown = phase === "entering" || phase === "world" || phase === "leaving";
  const { item, section, open, openPath, close } = useContentRoute(worldPath);
  const openItem = shown ? item : null;
  const openSection = shown && !item ? section : null;
  const panelOpen = openItem !== null || openSection !== null;
  const zones = useWorldBridge((state) => state.zones);
  const headingId = useId();
  const panelRef = useRef<HTMLElement>(null);

  const requestEnter = useCallback(() => {
    const target = findContentByPath(PORTFOLIO_CONTENT, window.location.pathname);
    worldBridge.commands.emit({
      type: "enter",
      focus: target ? toContentReference(target) : undefined,
      inset: target ? panelInset() : undefined,
      reducedMotion: prefersReducedMotion(),
    });
  }, []);

  const enter = useCallback(() => {
    // A new entry for the world, at the same URL: Back returns to the page the visitor was reading.
    window.history.pushState(worldHistoryState(), "", window.location.pathname);
    // The router reacts to the new entry synchronously. Start the transition on the
    // next frame so that work is finished before anything begins to move.
    requestAnimationFrame(requestEnter);
  }, [requestEnter]);

  const exit = useCallback(() => {
    window.history.pushState(null, "", window.location.pathname);
    worldBridge.commands.emit({ type: "exit", reducedMotion: prefersReducedMotion() });
  }, []);

  // The door on the page is the way in (components/site/Door.tsx).
  useEffect(() => registerWorldEntry({ enter, load: startLoading }), [enter, startLoading]);

  // Back and Forward move between landing entries and world entries.
  useEffect(() => {
    const onPopState = () => {
      const current = worldBridge.store.getState().phase;
      if (isWorldHistoryEntry()) {
        if (current === "ready") requestEnter();
      } else if (current === "world" || current === "entering") {
        worldBridge.commands.emit({ type: "exit", reducedMotion: prefersReducedMotion() });
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [requestEnter]);

  // Let CSS and assistive technology follow the phase: the landing page fades
  // and becomes inert while the world is in front, and scrolling is locked.
  // Attributes are written only when they change: removing and re-adding
  // them (as a cleanup on every URL change would) re-styles the whole
  // document, which the focus move of a newly opened panel then pays for.
  useEffect(() => {
    if (document.documentElement.dataset.world !== phase) document.documentElement.dataset.world = phase;
    const landing = document.getElementById("landing");
    const inert = phase === "entering" || phase === "world";
    if (landing && landing.inert !== inert) landing.inert = inert;
  }, [phase, pathname]);
  useEffect(() => () => {
    delete document.documentElement.dataset.world;
    const landing = document.getElementById("landing");
    if (landing) landing.inert = false;
  }, []);

  // Keyboard focus follows the visitor between page and world.
  const previousPhase = useRef(phase);
  useEffect(() => {
    if (phase === "world" && previousPhase.current === "entering" && !panelOpen) {
      canvasRef.current?.focus({ preventScroll: true });
    }
    if (phase === "ready" && previousPhase.current === "leaving") {
      document.getElementById(WORLD_DOOR_ID)?.focus({ preventScroll: true });
    }
    previousPhase.current = phase;
  }, [phase, panelOpen]);

  // World -> UI: a clicked interactable opens its content; a clicked zone name opens its section.
  const goToZone = useCallback((zone: ZoneInfo) => {
    const target = zone.kind ? sectionByKind(zone.kind) : null;
    if (!target) {
      // A zone that is no section of the site (a mini-game): just go there.
      worldBridge.commands.emit({ type: "fly-to-zone", zoneId: zone.id, reducedMotion: prefersReducedMotion() });
      return;
    }
    const single = target.singleton ? listContentByKind(PORTFOLIO_CONTENT, target.kind)[0] : null;
    openPath(single ? getContentPath(single) : getSectionPath(target));
  }, [openPath]);
  useEffect(() => worldBridge.events.subscribe((event) => {
    if (event.type === "content-activated") {
      const target = resolveContentReference(PORTFOLIO_CONTENT, event.content);
      if (target) open(target);
    } else if (event.type === "zone-activated") {
      const zone = worldBridge.store.getState().zones.find((candidate) => candidate.id === event.zoneId);
      if (zone) goToZone(zone);
    }
  }), [open, goToZone]);

  // UI -> world: whatever the URL says is open is what the camera looks at:
  // an item's object, or the whole zone of a section.
  const sectionZone = section ? zones.find((zone) => zone.kind === section.kind) ?? null : null;
  useEffect(() => {
    if (phase !== "world") return;
    if (item) {
      worldBridge.commands.emit({ type: "focus-content", content: toContentReference(item), inset: panelInset() });
    } else if (sectionZone) {
      worldBridge.commands.emit({ type: "fly-to-zone", zoneId: sectionZone.id, inset: panelInset(), reducedMotion: prefersReducedMotion() });
    } else {
      worldBridge.commands.emit({ type: "clear-focus" });
    }
  }, [item, sectionZone, phase]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelOpen, close]);

  // Move keyboard focus with the panel: into its heading on open, back to the world on close.
  const hadPanel = useRef(false);
  const panelKey = openItem ? `${openItem.kind}:${openItem.id}` : openSection?.kind ?? null;
  useEffect(() => {
    if (panelKey) {
      panelRef.current?.querySelector<HTMLElement>(`[id="${headingId}"]`)?.focus({ preventScroll: true });
    } else if (hadPanel.current && worldBridge.store.getState().phase === "world") {
      canvasRef.current?.focus({ preventScroll: true });
    }
    hadPanel.current = panelKey !== null;
  }, [panelKey, headingId]);

  const onNavigate = useCallback((event: React.MouseEvent<HTMLAnchorElement>, target: ContentItem) => {
    // Modified clicks keep their browser meaning (new tab, download...).
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    open(target);
    event.currentTarget.closest("details")?.removeAttribute("open");
  }, [open]);
  const onNavigatePath = useCallback((event: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    openPath(path);
    event.currentTarget.closest("details")?.removeAttribute("open");
  }, [openPath]);

  return (
    <>
      <div
        className={styles.layer}
        data-view={layerView(phase)}
        inert={!shown}
        aria-hidden={!shown}      >
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          data-world
          tabIndex={0}
          aria-label="Interactive 3D world. Drag or use arrow keys to move, scroll or use plus and minus to zoom. Use the menu to open content with the keyboard."
        />

        <div className={styles.hudTop}>
          <details className={styles.menu}>
            <summary>Menu</summary>
            <nav aria-label="Portfolio sections">
              {CONTENT_SECTIONS.map((entrySection) => (
                <section key={entrySection.kind}>
                  <h2>
                    {entrySection.singleton ? entrySection.label : (
                      <a
                        href={getSectionPath(entrySection)}
                        aria-current={openSection?.kind === entrySection.kind ? "page" : undefined}
                        onClick={(event) => onNavigatePath(event, getSectionPath(entrySection))}
                      >
                        {entrySection.label}
                      </a>
                    )}
                  </h2>
                  <ul>
                    {listContentByKind(PORTFOLIO_CONTENT, entrySection.kind).map((entry) => (
                      <li key={entry.id}>
                        <a
                          href={getContentPath(entry)}
                          aria-current={openItem?.id === entry.id && openItem.kind === entry.kind ? "page" : undefined}
                          onClick={(event) => onNavigate(event, entry)}
                        >
                          {entry.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>
          </details>
          <button type="button" className={styles.exit} onClick={exit}>Back to page</button>
        </div>

        <ViewButtons hidden={panelOpen} />
        <PlaceIndicator onGo={goToZone} hidden={panelOpen} />
        <HoverLabel />
        <MinigameHud />
        <ActorHud />
        <SkySwitch />
        <PerfHud active={phase === "world"} />
        {minimaps[mapId] ? (
          <WorldMinimap
            data={minimaps[mapId]}
            hidden={panelOpen}
            onPlace={(target) => {
              const zone = zones.find((candidate) => candidate.id === target.zone.id);
              if (zone) goToZone(zone);
            }}
            onPin={openPath}
          />
        ) : null}

        {layerView(phase) === "loader" && PORTFOLIO_CONTENT.items[0] ? (
          <div className={styles.panel} aria-hidden="true">
            <div className={styles.panelBody}><ContentArticle item={PORTFOLIO_CONTENT.items[0]} headingId={`${headingId}-warm`} /></div>
          </div>
        ) : null}
        {openSection && !openItem ? (
          <aside ref={panelRef} className={styles.panel} role="dialog" aria-modal="false" aria-labelledby={headingId}>
            <button type="button" className={styles.close} onClick={close} aria-label="Close and return to the world">
              Close
            </button>
            <div className={styles.panelBody}>
              <SectionArticle section={openSection} items={listContentByKind(PORTFOLIO_CONTENT, openSection.kind)} headingId={headingId} onOpen={onNavigate} />
            </div>
          </aside>
        ) : null}
        {openItem ? (
          <aside ref={panelRef} className={styles.panel} role="dialog" aria-modal="false" aria-labelledby={headingId}>
            <button type="button" className={styles.close} onClick={close} aria-label="Close and return to the world">
              Close
            </button>
            <div className={styles.panelBody}>
              <ContentArticle item={openItem} headingId={headingId} />
            </div>
          </aside>
        ) : null}
      </div>

    </>
  );
}

/**
 * Where the visitor is: the zone under the camera, top centre. A zone that
 * is a section of the site is a button to it. Re-renders only when the
 * camera crosses a zone's edge.
 */
function PlaceIndicator({ onGo, hidden }: { onGo: (zone: ZoneInfo) => void; hidden: boolean }) {
  useUiWork();
  const place = useWorldBridge((state) => state.place);
  const zones = useWorldBridge((state) => state.zones);
  const playing = useWorldBridge((state) => state.minigame !== null);
  const zone = zones.find((candidate) => candidate.id === place) ?? null;
  if (hidden || playing || !zone) return null;
  return (
    <p className={styles.place} aria-live="polite">
      <span className={styles.placeLead}>You are in</span>
      <button type="button" className={styles.placeName} onClick={() => onGo(zone)}>
        <span className={styles.placeDot} style={{ background: zone.color }} aria-hidden="true" />
        {zone.label}
      </button>
    </p>
  );
}

/** Names what the pointer is over. Re-renders only when the hovered interactable changes. */
function HoverLabel() {
  useUiWork();
  const label = useWorldBridge((state) => state.hovered?.label ?? null);
  const action = useWorldBridge((state) => state.hovered?.action ?? null);
  if (!label) return null;
  return <p className={styles.hover} aria-hidden="true">{label} <span>{action === "play" ? "Click to play" : "Click to open"}</span></p>;
}

/** The original's view controls, top right: lock the camera's tilt, and go back to the start view. */
function ViewButtons({ hidden }: { hidden: boolean }) {
  useUiWork();
  const locked = useWorldBridge((state) => state.angleLocked);
  if (hidden) return null;
  return (
    <div className={styles.viewButtons}>
      <button type="button" className={styles.iconButton} aria-pressed={locked} aria-label={locked ? "Unlock camera angle" : "Lock camera angle"} title={locked ? "Unlock camera angle" : "Lock camera angle"}
        onClick={() => worldBridge.commands.emit({ type: "set-angle-lock", locked: !locked })}>
        {locked ? <UnlockKeyhole aria-hidden="true" size={16} /> : <LockKeyhole aria-hidden="true" size={16} />}
      </button>
      <button type="button" className={styles.iconButton} aria-label="Reset view" title="Reset view" onClick={() => worldBridge.commands.emit({ type: "reset-view" })}>
        <RotateCcw aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

const ACTOR_STATES: Record<string, string> = {
  idle: "waiting", walking: "walking", running: "running", "taking-off": "taking off", flying: "flying", landing: "landing", preview: "showing a move",
};
const MOVEMENTS = [["auto", "Auto"], ["walk", "Walk"], ["run", "Run"], ["flight", "Fly"]] as const;

/**
 * The chosen creature: what it is doing, how a click on the ground sends it
 * (the style lab's movement mode, plus Auto), whether the camera follows it,
 * and the way to let it go (the button or Escape).
 */
function ActorHud() {
  useUiWork();
  const actor = useWorldBridge((state) => state.actor);
  const chosen = actor !== null;
  useEffect(() => {
    if (!chosen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") worldBridge.commands.emit({ type: "release-actor" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chosen]);
  if (!actor) return null;
  return (
    <section className={styles.minigame} aria-label={`${actor.name}`}>
      <header>
        <strong>{actor.name}</strong>
        <button type="button" onClick={() => worldBridge.commands.emit({ type: "release-actor" })}>Let go <kbd>Esc</kbd></button>
      </header>
      <p role="status" aria-live="polite">{ACTOR_STATES[actor.state] ?? actor.state}. Click the ground to send it there.</p>
      <div className={styles.actorModes} role="group" aria-label="How it moves">
        {MOVEMENTS.map(([movement, label]) => (
          <button key={movement} type="button" aria-pressed={actor.movement === movement} onClick={() => worldBridge.commands.emit({ type: "set-actor-movement", movement })}>{label}</button>
        ))}
        <button type="button" aria-pressed={actor.following} disabled={actor.following} onClick={() => worldBridge.commands.emit({ type: "follow-actor" })}>{actor.following ? "Following" : "Follow"}</button>
      </div>
    </section>
  );
}

/**
 * The HUD of a running mini-game: what it is, its counters, what to do, and
 * the way out (the button or Escape). Re-renders only when a counter changes.
 */
function MinigameHud() {
  useUiWork();
  const hud = useWorldBridge((state) => state.minigame);
  const playing = hud !== null;
  useEffect(() => {
    if (!playing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") worldBridge.commands.emit({ type: "leave-minigame" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playing]);
  if (!hud) return null;
  return (
    <section className={styles.minigame} aria-label={`${hud.title} mini-game`}>
      <header>
        <strong>{hud.title}</strong>
        <button type="button" onClick={() => worldBridge.commands.emit({ type: "leave-minigame" })}>Leave <kbd>Esc</kbd></button>
      </header>
      <dl role="status" aria-live="polite">
        {Object.entries(hud.counters).map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      {hud.hint ? <p>{hud.hint}</p> : null}
    </section>
  );
}

