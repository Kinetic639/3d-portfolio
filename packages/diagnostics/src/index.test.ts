import { expectTypeOf, test } from "vitest";
import type { DiagnosticSource } from "./index.js";
import type { Unsubscribe } from "@portfolio/contracts";
test("diagnostics is observation-only and subscriptions can be released", () => {
  expectTypeOf<keyof DiagnosticSource>().toEqualTypeOf<"subscribe">();
  expectTypeOf<
    ReturnType<DiagnosticSource["subscribe"]>
  >().toEqualTypeOf<Unsubscribe>();
});
