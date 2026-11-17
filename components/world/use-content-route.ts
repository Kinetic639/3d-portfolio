"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { findContentByPath, getContentPath, type ContentItem } from "@/lib/content/content";
import { findSectionByPath } from "@/lib/content/places";

/**
 * History entries created while the visitor is inside the world carry this
 * marker. An entry without it is a landing-page entry, so Back and Forward
 * can tell which of the two the visitor should be looking at.
 *
 * Always a fresh object: the Next.js router adds its own bookkeeping fields to
 * the state object it is given, and treats an object that already has them as
 * one of its own entries (skipping the pathname update).
 */
export const worldHistoryState = () => ({ world: true });

export function isWorldHistoryEntry() {
  return (window.history.state as { world?: boolean } | null)?.world === true;
}

/**
 * The URL is the source of truth for which content item (or section: the
 * list at /projects, which is also the flight to the projects zone) is open.
 *
 * Opening pushes the item's canonical URL with the native History API, which
 * the Next.js router observes without navigating, so the world stays mounted.
 * Closing goes back when this session pushed the entry (so Back and the close
 * button agree) and otherwise pushes the world's own URL, which is what
 * happens after entering the world from an item's page.
 */
export function useContentRoute(worldPath: string) {
  const pathname = usePathname();
  const item = useMemo(() => findContentByPath(PORTFOLIO_CONTENT, pathname), [pathname]);
  const section = useMemo(() => findSectionByPath(pathname), [pathname]);
  /** How many of the entries up to the current one this hook pushed: a section, then an item opened from it, is two. */
  const ownedDepth = useRef(0);

  useEffect(() => {
    // Back leaves one of our entries. (Forward is counted as Back too: at worst, closing then pushes the world's URL.)
    const onPopState = () => {
      ownedDepth.current = Math.max(0, ownedDepth.current - 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openPath = useCallback((path: string) => {
    if (path === window.location.pathname) return;
    if (ownedDepth.current > 0 && !findSectionByPath(window.location.pathname)) {
      // Switching items while the panel is open keeps a single entry, so one Back returns to where the panel was opened from.
      window.history.replaceState(worldHistoryState(), "", path);
    } else {
      // From the world, or from a section's list (Back returns to the list, as on a website).
      window.history.pushState(worldHistoryState(), "", path);
      ownedDepth.current += 1;
    }
  }, []);
  const open = useCallback((next: ContentItem) => openPath(getContentPath(next)), [openPath]);

  const close = useCallback(() => {
    if (ownedDepth.current > 0) {
      window.history.back();
    } else {
      window.history.pushState(worldHistoryState(), "", worldPath);
    }
  }, [worldPath]);

  return { item, section, open, openPath, close };
}
