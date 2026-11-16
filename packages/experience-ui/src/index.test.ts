import { expect, expectTypeOf, test } from "vitest";
import * as integration from "./index.js";
import type { WorldRuntime } from "@portfolio/contracts";
import type { ExperienceHost } from "./index.js";
test("experience host exposes the production facade and has no eager runtime side effects", () => {
  expectTypeOf<ExperienceHost["world"]>().toEqualTypeOf<WorldRuntime>();
  expect(Object.keys(integration)).toEqual([]);
});
