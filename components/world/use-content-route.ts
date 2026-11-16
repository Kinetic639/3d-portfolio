"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { findContentByPath, getContentPath, type ContentItem } from "@/lib/content/content";

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
 * The URL is the source of truth for which content item is open.
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
  /** True while the current history entry is one this hook pushed. */
  const ownsEntry = useRef(false);

  useEffect(() => {
    // Any back/forward move lands on an entry we can no longer vouch for.
    const onPopState = () => {
      ownsEntry.current = false;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const open = useCallback((next: ContentItem) => {
    const path = getContentPath(next);
    if (path === window.location.pathname) return;
    if (ownsEntry.current) {
      // Switching items while the panel is open keeps a single entry, so one Back always returns to the world.
      window.history.replaceState(worldHistoryState(), "", path);
    } else {
      window.history.pushState(worldHistoryState(), "", path);
      ownsEntry.current = true;
    }
  }, []);

  const close = useCallback(() => {
    if (ownsEntry.current) {
      window.history.back();
    } else {
      window.history.pushState(worldHistoryState(), "", worldPath);
    }
  }, [worldPath]);

  return { item, open, close };
}
