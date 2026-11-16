import { expectTypeOf, test } from "vitest";
import type { WorldRuntime } from "@portfolio/contracts";
import type { EditorSession, PlaySession } from "./editor-session.js";
test("Play exposes exactly the production runtime and asynchronous stop", () => {
  expectTypeOf<PlaySession["world"]>().toEqualTypeOf<WorldRuntime>();
  expectTypeOf<ReturnType<PlaySession["stop"]>>().toEqualTypeOf<
    Promise<void>
  >();
  expectTypeOf<ReturnType<EditorSession["play"]>>().toEqualTypeOf<
    Promise<PlaySession>
  >();
});
