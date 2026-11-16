import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { isReference, normalize } from "./policy.mjs";

const requested = process.argv.slice(2);
const applications = requested.length ? requested : ["portfolio", "editor"];
let traceCount = 0;
async function walk(directory, application) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["cache", "dev", "standalone"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(file, application);
      continue;
    }
    if (!entry.name.endsWith(".nft.json")) continue;
    traceCount++;
    const trace = JSON.parse(await readFile(file, "utf8"));
    for (const dependency of trace.files) {
      const target = normalize(path.resolve(path.dirname(file), dependency));
      if (isReference(target))
        throw new Error(`Reference file in production trace: ${target}`);
      if (
        application === "portfolio" &&
        /\/(packages|@portfolio)\/(diagnostics|world-authoring|world-build)(\/|$)/.test(
          target,
        )
      )
        throw new Error(`Editor-only dependency in public trace: ${target}`);
    }
  }
}
for (const application of applications) {
  if (!["portfolio", "editor"].includes(application))
    throw new Error("Unknown application");
  const directory = `apps/${application}/.next`;
  await readFile(`${directory}/BUILD_ID`, "utf8");
  await walk(directory, application);
}
if (!traceCount)
  throw new Error("No Next.js output traces found; cannot verify artifacts");
console.log(
  `Verified ${traceCount} build traces across ${applications.join(", ")}: no reference files or forbidden public dependencies.`,
);
