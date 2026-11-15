"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import ContentArticle from "@/components/content/ContentArticle";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { useWorldBridge } from "@/lib/bridge/use-world-bridge";
import { worldBridge } from "@/lib/bridge/world-bridge";
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
import styles from "./WorldLayer.module.css";

const MOBILE_QUERY = "(max-width: 720px)";
const MAP_PATH = /^\/map\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

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
export default function WorldLayer({ defaultMapId }: { defaultMapId: string }) {
  const pathname = usePathname();
  const previewMapId = MAP_PATH.exec(pathname)?.[1];
  // A map preview URL switches the map; other pages keep whichever map is loaded.
  const [mapId, setMapId] = useState(previewMapId ?? defaultMapId);
  if (previewMapId && previewMapId !== mapId) setMapId(previewMapId);
  const worldPath = mapId === defaultMapId ? "/" : `/map/${mapId}`;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const enterButtonRef = useRef<HTMLButtonElement>(null);
  const startLoading = useWorldBoot(mapId, canvasRef);
  const phase = useWorldBridge((state) => state.phase);
  const shown = phase === "entering" || phase === "world" || phase === "leaving";
  const { item, open, close } = useContentRoute(worldPath);
  const openItem = shown ? item : null;
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
  useEffect(() => {
    document.documentElement.dataset.world = phase;
    const landing = document.getElementById("landing");
    if (landing) landing.inert = phase === "entering" || phase === "world";
    return () => {
      delete document.documentElement.dataset.world;
      if (landing) landing.inert = false;
    };
  }, [phase, pathname]);

  // Keyboard focus follows the visitor between page and world.
  const previousPhase = useRef(phase);
  useEffect(() => {
    if (phase === "world" && previousPhase.current === "entering" && !openItem) {
      canvasRef.current?.focus({ preventScroll: true });
    }
    if (phase === "ready" && previousPhase.current === "leaving") {
      enterButtonRef.current?.focus({ preventScroll: true });
    }
    previousPhase.current = phase;
  }, [phase, openItem]);

  // World -> UI: a clicked interactable opens its content.
  useEffect(() => worldBridge.events.subscribe((event) => {
    if (event.type !== "content-activated") return;
    const target = resolveContentReference(PORTFOLIO_CONTENT, event.content);
    if (target) open(target);
  }), [open]);

  // UI -> world: whatever the URL says is open is what the camera looks at.
  useEffect(() => {
    if (phase !== "world") return;
    if (item) {
      worldBridge.commands.emit({ type: "focus-content", content: toContentReference(item), inset: panelInset() });
    } else {
      worldBridge.commands.emit({ type: "clear-focus" });
    }
  }, [item, phase]);

  useEffect(() => {
    if (!openItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openItem, close]);

  // Move keyboard focus with the panel: into its heading on open, back to the world on close.
  const hadPanel = useRef(false);
  useEffect(() => {
    if (openItem) {
      panelRef.current?.querySelector<HTMLElement>(`[id="${headingId}"]`)?.focus({ preventScroll: true });
    } else if (hadPanel.current && worldBridge.store.getState().phase === "world") {
      canvasRef.current?.focus({ preventScroll: true });
    }
    hadPanel.current = openItem !== null;
  }, [openItem, headingId]);

  const onNavigate = useCallback((event: React.MouseEvent<HTMLAnchorElement>, target: ContentItem) => {
    // Modified clicks keep their browser meaning (new tab, download...).
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    open(target);
    event.currentTarget.closest("details")?.removeAttribute("open");
  }, [open]);

  return (
    <>
      <div className={styles.layer} data-shown={shown ? "" : undefined} inert={!shown} aria-hidden={!shown}>
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
              {CONTENT_SECTIONS.map((section) => (
                <section key={section.kind}>
                  <h2>{section.label}</h2>
                  <ul>
                    {listContentByKind(PORTFOLIO_CONTENT, section.kind).map((entry) => (
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

        <HoverLabel />

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

      <EnterPrompt buttonRef={enterButtonRef} onEnter={enter} onLoad={startLoading} />
    </>
  );
}

/** Names what the pointer is over. Re-renders only when the hovered interactable changes. */
function HoverLabel() {
  const label = useWorldBridge((state) => state.hovered?.label ?? null);
  if (!label) return null;
  return <p className={styles.hover} aria-hidden="true">{label} <span>Click to open</span></p>;
}

/**
 * The invitation at the bottom of the landing page. It exists only once the
 * world is warmed up; before that there is at most a thin progress line.
 */
function EnterPrompt({ buttonRef, onEnter, onLoad }: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onEnter: () => void;
  onLoad: () => void;
}) {
  const phase = useWorldBridge((state) => state.phase);
  // Whole percents: at most a hundred renders over the entire load.
  const percent = useWorldBridge((state) => Math.round(state.progress * 100));
  const [heldBack, setHeldBack] = useState(false);

  useEffect(() => {
    // Read after mount: the preference is not known during server rendering.
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const timer = window.setTimeout(() => setHeldBack(connection?.saveData === true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (phase === "loading" || phase === "warming") {
    return (
      <div className={styles.progress} aria-hidden="true">
        <div className={styles.progressBar} style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
    );
  }

  if (phase === "idle" && heldBack) {
    return (
      <div className={styles.prompt}>
        <button type="button" className={styles.enter} onClick={onLoad}>
          Load the interactive world
          <span>Data saver is on, so it was not loaded automatically</span>
        </button>
      </div>
    );
  }

  if (phase !== "ready") return null;

  return (
    <div className={styles.prompt}>
      <p className={styles.srOnly} role="status">The interactive 3D world is ready.</p>
      <button ref={buttonRef} type="button" className={styles.enter} onClick={onEnter}>
        Enter the world
        <span>Explore this portfolio as a place</span>
      </button>
    </div>
  );
}
