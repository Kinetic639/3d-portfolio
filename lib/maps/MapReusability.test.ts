import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("map reusability constraints", () => {
  it("does not branch runtime code on the Phase 4 map id", () => {
    const runtimeFiles = [
      "components/experience/PortfolioExperience.tsx",
      "components/experience/MapEditorToolbar.tsx",
    ];

    for (const file of runtimeFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/mapId\s*={2,3}\s*["']portfolio-phase4["']/);
      expect(source).not.toMatch(/activeMapId\s*={2,3}\s*["']portfolio-phase4["']/);
      expect(source).not.toMatch(/currentMap\.id\s*={2,3}\s*["']portfolio-phase4["']/);
    }
  });
});
