import { describe, expect, it } from "vitest";
import { createPortfolioPhase4MapDefinition, createTinyExampleMapDefinition } from "@/lib/maps/bundled-maps";
import { PORTFOLIO_CONTENT } from "./content";
import { validatePortfolioContentReferences } from "./content-validation";

describe("portfolio content validation", () => {
  it("validates all placeholder content map references", () => {
    expect(validatePortfolioContentReferences([
      createPortfolioPhase4MapDefinition(),
      createTinyExampleMapDefinition(),
    ], PORTFOLIO_CONTENT)).toEqual({ ok: true });
  });

  it("fails clearly for unresolved map references", () => {
    const content = {
      ...PORTFOLIO_CONTENT,
      projects: [{
        ...PORTFOLIO_CONTENT.projects[0],
        id: "broken-project",
        slug: "broken-project",
        mapLocation: { mapId: "missing-map", zoneId: "projects" },
      }],
    };

    const result = validatePortfolioContentReferences([createPortfolioPhase4MapDefinition()], content);
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors[0]).toContain("unknown map");
  });
});
