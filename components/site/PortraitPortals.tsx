"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PortraitLive from "./PortraitLive";

/**
 * Puts the living guide into each portrait frame on the page
 * (`[data-portrait-slot]`, rendered by Portrait). Mounted by the world layer,
 * so the portrait's scene loads with the world's three.js instead of a copy
 * of its own. Frames are looked up again whenever the page changes.
 */
export default function PortraitPortals({ modelUrl }: { modelUrl: string }) {
  const pathname = usePathname();
  const [slots, setSlots] = useState<HTMLElement[]>([]);

  useEffect(() => {
    // Read after the page has committed its frames (the DOM is the source here, not React state).
    const timer = window.setTimeout(() => {
      const found = [...document.querySelectorAll<HTMLElement>("[data-portrait-slot]")];
      // Only a different set of frames re-renders (the world changes the URL without changing the page).
      setSlots((current) => (current.length === found.length && current.every((slot, index) => slot === found[index]) ? current : found));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return slots.map((slot) => createPortal(<PortraitLive modelUrl={modelUrl} placement={slot.dataset.portraitSlot ?? "sidebar"} />, slot, slot.dataset.portraitSlot));
}
