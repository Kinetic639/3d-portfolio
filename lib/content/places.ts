import type { MapContentReference } from "@/lib/maps/map-definition";
import { CONTENT_SECTIONS, type ContentKind, type ContentSection } from "./content";

/**
 * Zones of the map as sections of the site. A zone stands for a section
 * when its content reference names the section's kind, or (for zones made
 * before references existed) when its label is the section's name. The
 * section's URL is then the zone's URL: /projects is both the list of
 * projects and the flight to the projects zone.
 */

type ZoneLike = { label: string; contentReference?: MapContentReference };

const normalise = (text: string) => text.trim().toLowerCase();

export function zoneSection(zone: ZoneLike): ContentSection | null {
  if (zone.contentReference) {
    return CONTENT_SECTIONS.find((section) => section.kind === zone.contentReference!.contentType) ?? null;
  }
  const label = normalise(zone.label);
  return CONTENT_SECTIONS.find((section) => normalise(section.label) === label || section.segment === label || section.kind.toLowerCase() === label) ?? null;
}

/** URL of a section: its first segment. Singleton sections share it with their one item. */
export function getSectionPath(section: ContentSection) {
  return `/${section.segment}`;
}

/** The list section a path addresses (/projects), or null. Singletons resolve as items instead. */
export function findSectionByPath(pathname: string): ContentSection | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return null;
  return CONTENT_SECTIONS.find((section) => !section.singleton && section.segment === segments[0]) ?? null;
}

export function sectionByKind(kind: ContentKind) {
  return CONTENT_SECTIONS.find((section) => section.kind === kind) ?? null;
}
