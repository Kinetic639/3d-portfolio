import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectImport, checkCycles } from "./policy.mjs";
import { writeFile, unlink } from "node:fs/promises";
import { checkBoundaries } from "./boundaries.mjs";

test("reference imports are rejected from every active layer", () => {
  for (const file of [
    "apps/portfolio/src/app/page.tsx",
    "apps/editor/src/server/build.ts",
    "packages/runtime/src/index.ts",
  ]) {
    assert.match(
      inspectImport(
        file,
        "../../../reference/portfolio-prototype/lib/world.ts",
      ) ?? "",
      /reference/,
    );
  }
});
test("public dependencies cannot reach editor-only packages", () => {
  for (const name of ["world-authoring/schema", "world-build", "diagnostics"]) {
    assert.ok(
      inspectImport("packages/runtime/src/index.ts", `@portfolio/${name}`),
    );
    assert.ok(
      inspectImport("apps/portfolio/src/app/page.tsx", `@portfolio/${name}`),
    );
  }
});
test("compiler can consume source schema and validation only", () => {
  for (const part of ["schema", "validation"])
    assert.equal(
      inspectImport(
        "packages/world-build/src/index.ts",
        `@portfolio/world-authoring/${part}`,
      ),
      null,
    );
  for (const part of ["commands", "history", "transactions", "", "src/schema"])
    assert.ok(
      inspectImport(
        "packages/world-build/src/index.ts",
        `@portfolio/world-authoring${part ? "/" + part : ""}`,
      ),
    );
});
test("source validation cannot indirectly pull editing commands", () => {
  assert.ok(
    inspectImport(
      "packages/world-authoring/src/validation.ts",
      "./commands.js",
    ),
  );
});
test("runtime imports are facade-only except a reserved editor viewport adapter", () => {
  assert.ok(
    inspectImport(
      "packages/experience-ui/src/index.ts",
      "@portfolio/runtime/internal",
    ),
  );
  assert.equal(
    inspectImport("packages/experience-ui/src/index.ts", "@portfolio/runtime"),
    null,
  );
});
test("editor build tooling stays in the explicit server directory", () => {
  assert.ok(
    inspectImport("apps/editor/src/app/page.tsx", "@portfolio/world-build"),
  );
  assert.equal(
    inspectImport("apps/editor/src/server/build.ts", "@portfolio/world-build"),
    null,
  );
  assert.ok(
    inspectImport("apps/editor/src/features/panel.ts", "../server/build.js"),
  );
});
test("relative cross-package imports and framework imports into runtime fail", () => {
  assert.ok(
    inspectImport(
      "packages/runtime/src/index.ts",
      "../../contracts/src/index.js",
    ),
  );
  assert.ok(inspectImport("packages/runtime/src/index.ts", "react"));
  assert.ok(inspectImport("packages/runtime/src/index.ts", "next/navigation"));
});
test("package cycle detection catches transitive cycles", () => {
  assert.deepEqual(checkCycles({ a: ["b"], b: [] }), []);
  assert.equal(checkCycles({ a: ["b"], b: ["c"], c: ["a"] }).length, 1);
});

test("real source scanning rejects static, type, re-export and dynamic reference imports", async () => {
  const file = "apps/portfolio/src/boundary-probe.ts";
  for (const source of [
    'import "../../../reference/old-new-portfolio/app/page";',
    'export { default } from "../../../reference/old-new-portfolio/app/page";',
    'type T = import("../../../reference/old-new-portfolio/app/page");',
    'import("../../../reference/old-new-portfolio/app/page");',
    'const path = "hidden"; import(path);',
  ]) {
    let created = false;
    try {
      await writeFile(file, source, { flag: "wx" });
      created = true;
      const { errors } = await checkBoundaries();
      assert.ok(errors.some((error) => error.includes("boundary-probe.ts")));
    } finally {
      if (created) await unlink(file);
    }
  }
});
