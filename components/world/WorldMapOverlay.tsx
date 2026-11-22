"use client";

import { useEffect, useRef } from "react";
import PortfolioMap, { type MapPlace } from "@/components/content/PortfolioMap";
import { useLocale } from "@/components/site/locale-context";
import { messages } from "@/lib/i18n/messages";
import type { MinimapData } from "@/lib/minimap/minimap";
import styles from "./WorldLayer.module.css";

/**
 * The world's map over the whole screen, at the end of the door's entry
 * (prototype, ?entry=door): the world first, alone, then the map of it.
 * A zone flies there and opens its section, a pin opens its item, and the
 * close button (or Escape) leaves the visitor in the world with its controls.
 */
export default function WorldMapOverlay({ data, onClose, onPlace, onPin }: {
  data: MinimapData;
  onClose: () => void;
  onPlace: (place: MapPlace) => void;
  onPin: (href: string) => void;
}) {
  const locale = useLocale();
  const text = messages(locale).world;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const plain = (event: React.MouseEvent<Element>) => !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);

  return (
    <div className={styles.worldMap} role="dialog" aria-modal="true" aria-labelledby="world-map-title">
      <div className={styles.worldMapCard}>
        <h2 id="world-map-title">{text.mapTitle}</h2>
        <p>{text.mapHint}</p>
        <PortfolioMap
          data={data}
          locale={locale}
          label={text.mapLabel}
          onPlace={(event, place) => {
            if (!plain(event)) return;
            event.preventDefault();
            onPlace(place);
          }}
          onPin={(event, href) => {
            if (!plain(event)) return;
            event.preventDefault();
            onPin(href);
          }}
        />
        <button ref={closeRef} type="button" className={styles.worldMapClose} onClick={onClose}>{text.explore}</button>
      </div>
    </div>
  );
}
