import { describe, expect, it } from "vitest";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import {
  CONTENT_SECTIONS,
  findContentByPath,
  getContentPath,
  listContentByKind,
  resolveContentReference,
  toContentReference,
  validatePortfolioContent,
} from "./content";

describe("portfolio content", () => {
  it("ships structurally valid content", () => {
    expect(validatePortfolioContent(PORTFOLIO_CONTENT)).toEqual([]);
  });

  it("gives every item a unique URL that resolves back to it", () => {
    const paths = PORTFOLIO_CONTENT.items.map(getContentPath);
    expect(new Set(paths).size).toBe(paths.length);
    for (const item of PORTFOLIO_CONTENT.items) {
      expect(findContentByPath(PORTFOLIO_CONTENT, getContentPath(item))).toBe(item);
    }
  });

  it("uses bare segments for singletons and slugs for collections", () => {
    const [project] = listContentByKind(PORTFOLIO_CONTENT, "project");
    expect(getContentPath(project)).toBe(`/projects/${project.slug}`);
    expect(getContentPath(listContentByKind(PORTFOLIO_CONTENT, "about")[0])).toBe("/about");
  });

  it("returns null for paths that address no item", () => {
    for (const path of ["/", "/projects", "/projects/nope", "/about/extra", "/unknown/thing", "/projects/a/b"]) {
      expect(findContentByPath(PORTFOLIO_CONTENT, path)).toBeNull();
    }
  });

  it("resolves map references", () => {
    const item = PORTFOLIO_CONTENT.items[1];
    expect(resolveContentReference(PORTFOLIO_CONTENT, toContentReference(item))).toBe(item);
    expect(resolveContentReference(PORTFOLIO_CONTENT, { contentType: "project", contentId: "missing" })).toBeNull();
  });

  it("detects duplicates and bad slugs", () => {
    const [first] = PORTFOLIO_CONTENT.items;
    const errors = validatePortfolioContent({
      ...PORTFOLIO_CONTENT,
      items: [first, { ...first }, { ...PORTFOLIO_CONTENT.items[1], slug: "Bad Slug" }],
    });
    expect(errors.some((error) => error.startsWith("Duplicate content id"))).toBe(true);
    expect(errors.some((error) => error.includes("singleton"))).toBe(true);
    expect(errors.some((error) => error.includes("lowercase-kebab"))).toBe(true);
  });

  it("registers a section for every kind in use", () => {
    const kinds = new Set(CONTENT_SECTIONS.map((section) => section.kind));
    expect(PORTFOLIO_CONTENT.items.every((item) => kinds.has(item.kind))).toBe(true);
  });
});
