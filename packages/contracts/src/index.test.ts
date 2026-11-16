import { expectTypeOf, test } from "vitest";
import type { WorldRuntime, WorldCommand, WorldSnapshot } from "./index.js";
test("public runtime surface has no scene, renderer, or arbitrary mutation access", () => {
  expectTypeOf<keyof WorldRuntime>().toEqualTypeOf<
    | "getSnapshot"
    | "subscribe"
    | "onEvent"
    | "prepare"
    | "start"
    | "pause"
    | "resume"
    | "execute"
    | "dispose"
  >();
  expectTypeOf<WorldCommand["type"]>().toEqualTypeOf<
    | "activate-interaction"
    | "equip-item"
    | "travel"
    | "set-input-mode"
    | "set-quality"
  >();
  expectTypeOf<ReturnType<WorldRuntime["dispose"]>>().toEqualTypeOf<
    Promise<void>
  >();
  expectTypeOf<
    ReturnType<WorldRuntime["getSnapshot"]>
  >().toEqualTypeOf<WorldSnapshot>();
});
