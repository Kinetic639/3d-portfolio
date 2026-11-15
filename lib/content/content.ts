import type { MapContentReference, MapContentType } from "@/lib/maps/map-definition";

/**
 * Portfolio content model. One flat list of items, discriminated by `kind`.
 * The same items render as HTML pages and as in-world panels, and every item
 * has exactly one canonical URL (see `getContentPath`).
 *
 * To add a kind: extend `MapContentType`, add a variant below, add a section
 * entry, and (optionally) a dedicated renderer in the content panel.
 */
export type ContentKind = MapContentType;

export type ContentLink = {
  label: string;
  url: string;
};

type ContentBase = {
  /** Stable identifier referenced by maps. */
  id: string;
  /** URL segment. Unique within its kind. */
  slug: string;
  title: string;
  summary: string;
  /** Paragraphs of long-form copy. */
  body: string[];
  tags?: string[];
  links?: ContentLink[];
  image?: string;
};

export type ProjectContent = ContentBase & { kind: "project"; role?: string; featured: boolean };
export type ExperienceContent = ContentBase & { kind: "experience"; company: string; dateRange: string };
export type AboutContent = ContentBase & { kind: "about" };
export type SkillGroupContent = ContentBase & { kind: "skillGroup" };
export type ContactContent = ContentBase & { kind: "contact"; email: string };

export type ContentItem = ProjectContent | ExperienceContent | AboutContent | SkillGroupContent | ContactContent;

export type PortfolioContent = {
  owner: {
    name: string;
    role: string;
    tagline: string;
  };
  items: ContentItem[];
};

export type ContentSection = {
  kind: ContentKind;
  /** First URL segment, e.g. "projects" in /projects/my-project. */
  segment: string;
  label: string;
  /** Singleton sections hold one item and live at /segment with no slug. */
  singleton: boolean;
};

/** Order here is the order sections appear on the landing page. */
export const CONTENT_SECTIONS: ContentSection[] = [
  { kind: "about", segment: "about", label: "About", singleton: true },
  { kind: "project", segment: "projects", label: "Projects", singleton: false },
  { kind: "experience", segment: "experience", label: "Experience", singleton: false },
  { kind: "skillGroup", segment: "skills", label: "Skills", singleton: false },
  { kind: "contact", segment: "contact", label: "Contact", singleton: true },
];

export function getContentSection(kind: ContentKind): ContentSection {
  const section = CONTENT_SECTIONS.find((candidate) => candidate.kind === kind);
  if (!section) {
    throw new Error(`No content section is registered for kind ${kind}.`);
  }
  return section;
}

export function listContentByKind<K extends ContentKind>(content: PortfolioContent, kind: K) {
  return content.items.filter((item): item is Extract<ContentItem, { kind: K }> => item.kind === kind);
}

export function resolveContentReference(content: PortfolioContent, reference: MapContentReference): ContentItem | null {
  return content.items.find((item) => item.kind === reference.contentType && item.id === reference.contentId) ?? null;
}

export function toContentReference(item: ContentItem): MapContentReference {
  return { contentType: item.kind, contentId: item.id };
}

/** Canonical URL path of an item. */
export function getContentPath(item: ContentItem): string {
  const section = getContentSection(item.kind);
  return section.singleton ? `/${section.segment}` : `/${section.segment}/${item.slug}`;
}

/** Resolves a URL path to the item it addresses, or null when it addresses none. */
export function findContentByPath(content: PortfolioContent, pathname: string): ContentItem | null {
  const [segment, slug, ...rest] = pathname.split("/").filter(Boolean);
  if (!segment || rest.length > 0) return null;
  const section = CONTENT_SECTIONS.find((candidate) => candidate.segment === segment);
  if (!section) return null;
  if (section.singleton) {
    return slug ? null : content.items.find((item) => item.kind === section.kind) ?? null;
  }
  return slug ? content.items.find((item) => item.kind === section.kind && item.slug === slug) ?? null : null;
}

/** Structural checks for the content file itself. Run in tests and by the editor. */
export function validatePortfolioContent(content: PortfolioContent): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();

  for (const item of content.items) {
    const section = CONTENT_SECTIONS.find((candidate) => candidate.kind === item.kind);
    if (!section) {
      errors.push(`Content ${item.id} has unknown kind ${String(item.kind)}.`);
      continue;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)) errors.push(`Content id must be lowercase-kebab: ${item.id}.`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) errors.push(`Content slug must be lowercase-kebab: ${item.slug}.`);
    const idKey = `${item.kind}:${item.id}`;
    if (ids.has(idKey)) errors.push(`Duplicate content id: ${idKey}.`);
    ids.add(idKey);
    const path = getContentPath(item);
    if (paths.has(path)) errors.push(`Duplicate content URL: ${path}.`);
    paths.add(path);
    if (item.title.trim().length === 0) errors.push(`Content ${idKey} needs a title.`);
  }

  for (const section of CONTENT_SECTIONS) {
    if (section.singleton && content.items.filter((item) => item.kind === section.kind).length > 1) {
      errors.push(`Section ${section.segment} is a singleton but has several items.`);
    }
  }

  return errors;
}
