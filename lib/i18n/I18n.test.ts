import { describe, expect, it } from "vitest";
import { LOCALIZED_CONTENT } from "@/content/localized";
import { CONTENT_SECTIONS, validatePortfolioContent } from "@/lib/content/content";
import { LOCALES, localizePath, preferredLocale, splitLocale } from "./locale";
import { MESSAGES } from "./messages";

describe("language URLs", () => {
  it("keeps English on the bare paths and puts Polish under /pl", () => {
    expect(localizePath("/", "en")).toBe("/");
    expect(localizePath("/projects/x", "en")).toBe("/projects/x");
    expect(localizePath("/", "pl")).toBe("/pl");
    expect(localizePath("/projects/x", "pl")).toBe("/pl/projects/x");
    expect(localizePath("/#contact", "pl")).toBe("/pl#contact");
  });

  it("reads the language back from a path", () => {
    expect(splitLocale("/")).toEqual({ locale: "en", path: "/" });
    expect(splitLocale("/projects")).toEqual({ locale: "en", path: "/projects" });
    expect(splitLocale("/pl")).toEqual({ locale: "pl", path: "/" });
    expect(splitLocale("/pl/projects/x")).toEqual({ locale: "pl", path: "/projects/x" });
    // Only a whole segment is a prefix.
    expect(splitLocale("/platform")).toEqual({ locale: "en", path: "/platform" });
  });

  it("round-trips every content path in every language", () => {
    for (const locale of LOCALES) {
      for (const path of ["/", "/about", "/projects", "/projects/project-placeholder-one"]) {
        expect(splitLocale(localizePath(path, locale))).toEqual({ locale, path });
      }
    }
  });

  it("picks the first of the browser's languages the site has", () => {
    expect(preferredLocale(["pl-PL", "en"])).toBe("pl");
    expect(preferredLocale(["de-DE", "pl"])).toBe("pl");
    expect(preferredLocale(["en-GB"])).toBe("en");
    expect(preferredLocale(["de", "fr"])).toBeNull();
  });
});

describe("translations", () => {
  it("has the same items in every language: kind, id and slug match the English file", () => {
    const shape = (locale: keyof typeof LOCALIZED_CONTENT) => LOCALIZED_CONTENT[locale].items.map(({ kind, id, slug }) => ({ kind, id, slug }));
    for (const locale of LOCALES) {
      expect(validatePortfolioContent(LOCALIZED_CONTENT[locale])).toEqual([]);
      expect(shape(locale)).toEqual(shape("en"));
    }
  });

  it("names every section in every language", () => {
    for (const locale of LOCALES) {
      for (const section of CONTENT_SECTIONS) expect(MESSAGES[locale].sections[section.kind]).toBeTruthy();
    }
  });

  it("counts items in Polish with the right word", () => {
    expect([1, 2, 5, 12, 22, 25].map(MESSAGES.pl.page.items)).toEqual(["1 pozycja", "2 pozycje", "5 pozycji", "12 pozycji", "22 pozycje", "25 pozycji"]);
  });
});
