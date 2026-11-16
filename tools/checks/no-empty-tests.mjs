import { spawnSync } from "node:child_process";
import { members } from "./policy.mjs";

// Execute the actual required package test commands, with a deliberately unmatched filter.
for (const member of Object.keys(members)) {
  if (!process.env.npm_execpath)
    throw new Error("Run this check through pnpm check:no-empty-tests");
  const result = spawnSync(
    process.execPath,
    [
      process.env.npm_execpath,
      "--dir",
      member,
      "test",
      "__no_such_test_9f98cbb8__",
    ],
    { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
  );
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== 1 || !/No test files found/i.test(output))
    throw new Error(
      `${member}: empty-suite failure was not verified\n${output}`,
    );
  console.log(`${member}: empty test selection correctly exits 1`);
}
