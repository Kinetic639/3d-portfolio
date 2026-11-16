import { expect, expectTypeOf, test } from "vitest";
import * as runtime from "./index.js";
import type { WorldRuntime } from "@portfolio/contracts";
import type { WorldRuntimeFactory } from "./index.js";
test("foundation import creates no runtime and exposes only the agreed facade types", () => {
  expect(Object.keys(runtime)).toEqual([]);
  expectTypeOf<ReturnType<WorldRuntimeFactory>>().toEqualTypeOf<WorldRuntime>();
});
