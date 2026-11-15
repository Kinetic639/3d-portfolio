"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { findContentByPath, getContentPath, type ContentItem } from "@/lib/content/content";

/**
 * The URL is the source of truth for which content item is open.
 *
 * Opening pushes the item's canonical URL with the native History API, which
 * the Next.js router observes without navigating, so the world stays mounted.
 * Closing goes back when this session pushed the entry (so Back and the close
 * button agree) and otherwise pushes the world's own URL, which is what
 * happens after arriving through a direct link.
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
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
      ownsEntry.current = true;
    }
  }, []);

  const close = useCallback(() => {
    if (ownsEntry.current) {
      window.history.back();
    } else {
      window.history.pushState(null, "", worldPath);
    }
  }, [worldPath]);

  return { item, open, close };
}
