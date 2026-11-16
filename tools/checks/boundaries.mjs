import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  members,
  inspectImport,
  checkCycles,
  normalize,
  isReference,
} from "./policy.mjs";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const json = async (file) =>
  JSON.parse(await readFile(path.join(root, file), "utf8"));
export async function checkBoundaries() {
  const errors = [];
  const manifests = {};
  const graph = {};
  const inputs = await json("tools/config/production-inputs.json");
  if (
    JSON.stringify(inputs) !==
    JSON.stringify({
      worldRoots: ["worlds"],
      assetRoots: ["assets/source"],
      assetCatalog: "assets/catalog",
      outputRoot: "artifacts",
    })
  )
    errors.push("Production input roots must remain explicitly allowlisted");
  for (const input of [
    ...inputs.worldRoots,
    ...inputs.assetRoots,
    inputs.assetCatalog,
  ]) {
    const resolved = normalize(await realpath(path.join(root, input)));
    if (resolved !== normalize(path.join(root, input)))
      errors.push(`Production input root may not be a symlink: ${input}`);
  }
  for (const member of Object.keys(members))
    manifests[member] = await json(`${member}/package.json`);
  const workspace = await readFile(
    path.join(root, "pnpm-workspace.yaml"),
    "utf8",
  );
  const listed = [...workspace.matchAll(/^  - ([\w/-]+)$/gm)]
    .map((match) => match[1])
    .sort();
  if (JSON.stringify(listed) !== JSON.stringify(Object.keys(members).sort()))
    errors.push(
      "Workspace membership must match the explicit nine-member allowlist",
    );
  for (const parent of ["apps", "packages"]) {
    for (const entry of await readdir(path.join(root, parent), {
      withFileTypes: true,
    })) {
      if (entry.isDirectory() && !members[`${parent}/${entry.name}`])
        errors.push(`Unregistered active directory: ${parent}/${entry.name}`);
    }
  }
  for (const [member, manifest] of Object.entries(manifests)) {
    if (manifest.name !== `@portfolio/${member.split("/")[1]}`)
      errors.push(`${member}: unexpected package identity`);
    const deps = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    };
    graph[manifest.name] = [];
    for (const [name, version] of Object.entries(deps)) {
      if (/^(file:|link:)/.test(version) || isReference(version))
        errors.push(`${member}: local file/reference dependency ${name}`);
      if (name.startsWith("@portfolio/")) {
        if (
          !members[member].includes(name.slice("@portfolio/".length)) ||
          version !== "workspace:*"
        )
          errors.push(`${member}: invalid workspace dependency ${name}`);
        graph[manifest.name].push(name);
      }
    }
    for (const task of ["build", "lint", "typecheck", "test"])
      if (!manifest.scripts?.[task])
        errors.push(`${member}: missing required ${task} task`);
    if (/pass.?with.?no.?tests/i.test(manifest.scripts.test))
      errors.push(`${member}: tests may not permit empty suites`);
    for (const [entry, target] of Object.entries(manifest.exports ?? {})) {
      if (
        entry.includes("*") ||
        !target.types?.startsWith("./dist/") ||
        !target.import?.startsWith("./dist/")
      )
        errors.push(`${member}: exports must explicitly name dist files`);
    }
    const config = JSON.stringify(await json(`${member}/tsconfig.json`));
    if (
      config.includes('"paths"') ||
      config.includes('"references"') ||
      config.includes("reference/")
    )
      errors.push(
        `${member}: TypeScript aliases/project references require explicit architectural review`,
      );
    async function walk(directory) {
      for (const entry of await readdir(path.join(root, directory), {
        withFileTypes: true,
      })) {
        const file = `${directory}/${entry.name}`;
        if (entry.isSymbolicLink()) {
          errors.push(`${file}: source symlinks are forbidden`);
          continue;
        }
        if (entry.isDirectory()) {
          await walk(file);
          continue;
        }
        if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
        const resolved = normalize(await realpath(path.join(root, file)));
        if (
          !resolved.startsWith(normalize(root) + "/") ||
          isReference(resolved)
        )
          errors.push(`${file}: source resolves outside active workspace`);
        const source = ts.createSourceFile(
          file,
          await readFile(path.join(root, file), "utf8"),
          ts.ScriptTarget.Latest,
          true,
        );
        function validate(specifier) {
          const issue = inspectImport(file, specifier);
          if (issue) errors.push(`${file}: ${issue} (${specifier})`);
          if (specifier.startsWith(".") || specifier.startsWith("node:"))
            return;
          const name = specifier.startsWith("@")
            ? specifier.split("/").slice(0, 2).join("/")
            : specifier.split("/")[0];
          if (!deps[name])
            errors.push(`${file}: undeclared dependency ${name}`);
          if (specifier.startsWith("@portfolio/")) {
            const target = Object.values(manifests).find(
              (item) => item.name === name,
            );
            const suffix = specifier.slice(name.length);
            if (!target?.exports?.[suffix ? `.${suffix}` : "."])
              errors.push(`${file}: unexported package entry ${specifier}`);
          }
        }
        function visit(node) {
          if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
          )
            validate(node.moduleSpecifier.text);
          if (
            ts.isImportTypeNode(node) &&
            ts.isLiteralTypeNode(node.argument) &&
            ts.isStringLiteral(node.argument.literal)
          )
            validate(node.argument.literal.text);
          if (
            ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
              (ts.isIdentifier(node.expression) &&
                node.expression.text === "require"))
          ) {
            const argument = node.arguments[0];
            if (argument && ts.isStringLiteral(argument))
              validate(argument.text);
            else
              errors.push(
                `${file}: computed module loading is forbidden; use explicit imports`,
              );
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
    await walk(`${member}/src`);
  }
  errors.push(
    ...checkCycles(graph).map((cycle) => `Dependency cycle: ${cycle}`),
  );
  return { errors, graph };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { errors, graph } = await checkBoundaries();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      `Boundary checks passed: ${Object.keys(graph).length} active members; no reference dependency paths.`,
    );
}
