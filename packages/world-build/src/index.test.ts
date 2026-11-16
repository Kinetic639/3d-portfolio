import { expect, expectTypeOf, test } from "vitest";
import { isSourceWorld } from "@portfolio/world-authoring/validation";
import type { SourceWorld } from "@portfolio/world-authoring/schema";
import type { WorldBuildRequest } from "./index.js";
test("build input is a source snapshot, not an editor session", () => {
  expectTypeOf<WorldBuildRequest["source"]>().toEqualTypeOf<SourceWorld>();
  expectTypeOf<keyof WorldBuildRequest>().toEqualTypeOf<"source" | "target">();
  expect(isSourceWorld({ schemaVersion: 1, id: "entry", revision: "r1" })).toBe(
    true,
  );
  expect(isSourceWorld({ commands: [], history: [] })).toBe(false);
});
