import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { getContentPath, listContentByKind, resolveContentReference } from "@/lib/content/content";
import { getSectionPath, zoneSection } from "@/lib/content/places";
import type { MinimapData, MinimapZone } from "@/lib/minimap/minimap";
import styles from "./PortfolioMap.module.css";

export type MapPlace = {
  zone: MinimapZone;
  /** Its name: the section's when it stands for one. */
  label: string;
  /** The section's URL (or its one item's), or null for a zone that is no section. */
  href: string | null;
};

/** Zones that are sections of the site (or mini-games), with where they lead. */
export function mapPlaces(data: MinimapData): MapPlace[] {
  return data.zones.flatMap((zone) => {
    const section = zoneSection(zone);
    if (!section) return [];
    const single = section.singleton ? listContentByKind(PORTFOLIO_CONTENT, section.kind)[0] : null;
    return [{ zone, label: section.label, href: single ? getContentPath(single) : getSectionPath(section) }];
  });
}

/**
 * The portfolio as a map: the world from above (drawn at build time), its
 * zones as links to their sections, and the things placed in it as links to
 * their pages. Pure markup with no hooks, so the landing page renders it on
 * the server (every link works without JavaScript or WebGL) and the world
 * reuses it as its corner map, where `onPlace` and `onPin` keep the visitor
 * in the world.
 */
export default function PortfolioMap({ data, current, compact = false, label = "Map of the portfolio", onPlace, onPin, markerRef }: {
  data: MinimapData;
  /** Id of the zone to mark as the one shown. */
  current?: string | null;
  compact?: boolean;
  label?: string;
  onPlace?: (event: React.MouseEvent<Element>, place: MapPlace) => void;
  onPin?: (event: React.MouseEvent<Element>, href: string) => void;
  /** The world writes the camera's position into this element, without React. */
  markerRef?: React.Ref<SVGGElement>;
}) {
  const places = mapPlaces(data);
  const pins = data.pins.flatMap((pin) => {
    const item = resolveContentReference(PORTFOLIO_CONTENT, pin.contentReference);
    return item ? [{ ...pin, title: item.title, href: getContentPath(item) }] : [];
  });
  const { width, depth } = data;
  return (
    <figure className={compact ? `${styles.map} ${styles.compact}` : styles.map}>
      <svg className={styles.svg} viewBox={`0 0 ${width} ${depth}`} role="group" aria-label={label}>
        <image href={data.image} x={0} y={0} width={width} height={depth} preserveAspectRatio="none" aria-hidden="true" />
        {places.map((place) => {
          const { zone } = place;
          const content = (
            <>
              <path className={styles.area} d={zone.area} style={{ fill: zone.color }} />
              <path className={styles.outline} d={zone.outline} style={{ stroke: zone.color }} />
            </>
          );
          return place.href ? (
            <a
              key={zone.id}
              href={place.href}
              className={styles.zone}
              aria-label={place.label}
              aria-current={current === zone.id ? "location" : undefined}
              onClick={onPlace ? (event) => onPlace(event, place) : undefined}
            >
              {content}
            </a>
          ) : (
            <g key={zone.id} className={styles.zone}>{content}</g>
          );
        })}
        {pins.map((pin) => (
          <a key={pin.entityId} href={pin.href} className={styles.pin} aria-label={pin.title} onClick={onPin ? (event) => onPin(event, pin.href) : undefined}>
            <title>{pin.title}</title>
            <circle cx={pin.x} cy={pin.z} r={compact ? 1.6 : 1.25} />
            <text x={pin.x} y={pin.z} dy="0.36" aria-hidden="true">i</text>
          </a>
        ))}
        {/* Names over everything, and clickable too: a thin zone is easier to hit by its name. The zone's own link above is the one for keyboards and screen readers. */}
        {places.map((place) => {
          const text = <text className={styles.label} x={place.zone.labelX} y={place.zone.labelZ}>{place.label}</text>;
          return place.href ? (
            <a key={place.zone.id} href={place.href} className={styles.labelLink} tabIndex={-1} aria-hidden="true" onClick={onPlace ? (event) => onPlace(event, place) : undefined}>{text}</a>
          ) : <g key={place.zone.id} aria-hidden="true">{text}</g>;
        })}
        {markerRef ? (
          <g ref={markerRef} className={styles.marker} aria-hidden="true">
            <path d="M0 -3.2 L2.2 2.4 L0 1.2 L-2.2 2.4 Z" />
          </g>
        ) : null}
      </svg>
    </figure>
  );
}
