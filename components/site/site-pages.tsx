import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { portfolioContent } from "@/content/localized";
import { CONTENT_SECTIONS, findContentByPath, getContentPath } from "@/lib/content/content";
import { findSectionByPath, getSectionPath } from "@/lib/content/places";
import { LOCALES, DEFAULT_LOCALE, localizePath, type Locale } from "@/lib/i18n/locale";
import { messages } from "@/lib/i18n/messages";
import LandingPage from "./LandingPage";

/**
 * The portfolio's pages, the same in every language: each language's routes
 * (app/(site) for English, app/(pl)/pl for Polish) are thin files that call
 * these with their locale.
 */

export type ContentPathParams = { contentPath: string[] };

const segments = (path: string) => path.split("/").filter(Boolean);

/** Every content item and every list section has exactly one URL per language. */
export function contentPathParams(): ContentPathParams[] {
  const content = portfolioContent(DEFAULT_LOCALE);
  return [
    ...content.items.map((item) => ({ contentPath: segments(getContentPath(item)) })),
    ...CONTENT_SECTIONS.filter((section) => !section.singleton).map((section) => ({ contentPath: segments(getSectionPath(section)) })),
  ];
}

/** The page's own URL in its language, and the same page in every language for search engines (hreflang). */
export function alternates(path: string, locale: Locale): Metadata["alternates"] {
  return {
    canonical: localizePath(path, locale),
    languages: {
      ...Object.fromEntries(LOCALES.map((candidate) => [candidate, localizePath(path, candidate)])),
      "x-default": localizePath(path, DEFAULT_LOCALE),
    },
  };
}

export function homeMetadata(locale: Locale): Metadata {
  const text = messages(locale).meta;
  return { title: text.title, description: text.description, alternates: alternates("/", locale) };
}

export function contentMetadata(locale: Locale, contentPath: string[]): Metadata {
  const path = `/${contentPath.join("/")}`;
  const content = portfolioContent(locale);
  const section = findSectionByPath(path);
  if (section) return { title: `${messages(locale).sections[section.kind]} - ${content.owner.name}`, alternates: alternates(path, locale) };
  const item = findContentByPath(content, path);
  if (!item) return {};
  return { title: `${item.title} - ${content.owner.name}`, description: item.summary, alternates: alternates(path, locale) };
}

/**
 * An item's own page, or a section's (/projects): the landing page with that
 * item or section first. Entering the world from here goes straight to it
 * (a section is a zone: the camera flies to it).
 */
export function ContentPage({ locale, contentPath }: { locale: Locale; contentPath: string[] }) {
  const path = `/${contentPath.join("/")}`;
  const section = findSectionByPath(path);
  if (section) return <LandingPage locale={locale} featuredSection={section} />;
  const item = findContentByPath(portfolioContent(locale), path);
  if (!item) notFound();
  return <LandingPage locale={locale} featured={item} />;
}
