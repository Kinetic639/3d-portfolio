"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import ContentArticle from "@/components/content/ContentArticle";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { useWorldBridge } from "@/lib/bridge/use-world-bridge";
import { worldBridge } from "@/lib/bridge/world-bridge";
import {
  CONTENT_SECTIONS,
  getContentPath,
  listContentByKind,
  resolveContentReference,
  toContentReference,
  type ContentItem,
} from "@/lib/content/content";
import { useContentRoute } from "./use-content-route";
import WorldView from "./WorldView";
import styles from "./WorldExperience.module.css";

const MOBILE_QUERY = "(max-width: 720px)";

/** Space the content panel takes from the viewport, so the camera can centre objects in what is left. */
function panelInset() {
  if (window.matchMedia(MOBILE_QUERY).matches) {
    return { bottom: Math.round(window.innerHeight * 0.55) };
  }
  return { right: Math.min(460, Math.round(window.innerWidth * 0.42)) };
}

/**
 * The world plus the page UI around it: HUD, navigation and the content panel.
 * This is where bridge events meet the router; the engine itself knows nothing
 * about URLs.
 */
export default function WorldExperience({ mapId, worldPath }: { mapId: string; worldPath: string }) {
  const { item, open, close } = useContentRoute(worldPath);
  const phase = useWorldBridge((state) => state.phase);
  const headingId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

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
    if (!item) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [item, close]);

  // Move keyboard focus with the panel: into its heading on open, back to the world on close.
  useEffect(() => {
    if (item) {
      panelRef.current?.querySelector<HTMLElement>(`[id="${headingId}"]`)?.focus({ preventScroll: true });
    } else if (wasOpen.current) {
      document.querySelector<HTMLCanvasElement>("canvas[data-world]")?.focus({ preventScroll: true });
    }
    wasOpen.current = item !== null;
  }, [item, headingId]);

  const onNavigate = useCallback((event: React.MouseEvent<HTMLAnchorElement>, target: ContentItem) => {
    // Modified clicks keep their browser meaning (new tab, download...).
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    open(target);
    event.currentTarget.closest("details")?.removeAttribute("open");
  }, [open]);

  return (
    <div className={styles.root}>
      <WorldView mapId={mapId} />

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
                      aria-current={item?.id === entry.id && item.kind === entry.kind ? "page" : undefined}
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

      <HoverLabel />

      {item ? (
        <aside ref={panelRef} className={styles.panel} role="dialog" aria-modal="false" aria-labelledby={headingId}>
          <button type="button" className={styles.close} onClick={close} aria-label="Close and return to the world">
            Close
          </button>
          <div className={styles.panelBody}>
            <ContentArticle item={item} headingId={headingId} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}

/** Names what the pointer is over. Re-renders only when the hovered interactable changes. */
function HoverLabel() {
  const label = useWorldBridge((state) => state.hovered?.label ?? null);
  if (!label) return null;
  return <p className={styles.hover} aria-hidden="true">{label} <span>Click to open</span></p>;
}
