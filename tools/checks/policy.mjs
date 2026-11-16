import path from "node:path";

export const members = {
  "apps/portfolio": ["contracts", "experience-ui", "portfolio-content"],
  "apps/editor": [
    "contracts",
    "world-authoring",
    "world-build",
    "runtime",
    "experience-ui",
    "portfolio-content",
    "diagnostics",
  ],
  "packages/contracts": [],
  "packages/world-authoring": ["contracts"],
  "packages/world-build": ["contracts", "world-authoring"],
  "packages/runtime": ["contracts"],
  "packages/experience-ui": ["contracts", "runtime", "portfolio-content"],
  "packages/portfolio-content": ["contracts"],
  "packages/diagnostics": ["contracts"],
};
export const normalize = (value) => value.replaceAll("\\", "/");
export const owner = (file) =>
  Object.keys(members).find((member) =>
    normalize(file).startsWith(`${member}/`),
  );
export const isReference = (value) =>
  /(^|\/)(reference|portfolio-prototype|old-new-portfolio)(\/|$)/i.test(
    normalize(value),
  );

export function inspectImport(file, specifier) {
  file = normalize(file);
  specifier = normalize(specifier);
  const from = owner(file);
  if (!from) return "Importer is outside active workspace";
  if (isReference(specifier))
    return "Imports into reference applications are forbidden";
  if (
    specifier.startsWith("/") ||
    /^[a-z]:/i.test(specifier) ||
    /^(file|https?):/.test(specifier)
  )
    return "Absolute and remote source imports are forbidden";
  if (specifier.startsWith(".")) {
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), specifier),
    );
    if (isReference(target))
      return "Imports into reference applications are forbidden";
    if (owner(target) !== from)
      return "Relative cross-package imports are forbidden; use package exports";
    if (
      from === "apps/editor" &&
      !file.startsWith("apps/editor/src/server/") &&
      target.startsWith("apps/editor/src/server/")
    )
      return "Only server adapters may consume editor server modules";
    if (
      /^packages\/world-authoring\/src\/(schema|validation)\.ts$/.test(file) &&
      !/^packages\/world-authoring\/src\/(schema|validation)\.(js|ts)$/.test(
        target,
      )
    )
      return "Source schema/validation must not depend on editor implementation";
    return null;
  }
  if (specifier.startsWith("@portfolio/")) {
    const [name, ...parts] = specifier.slice("@portfolio/".length).split("/");
    if (!members[from].includes(name))
      return `Forbidden dependency from ${from} to ${name}`;
    if (
      name === "world-authoring" &&
      from === "packages/world-build" &&
      !["schema", "validation"].includes(parts.join("/"))
    )
      return "Compiler may consume only authoring schema/validation exports";
    if (
      name === "world-build" &&
      from === "apps/editor" &&
      !file.startsWith("apps/editor/src/server/")
    )
      return "Compiler is allowed only in editor server adapters";
    if (name === "runtime" && parts.length)
      return "Production runtime is accessible only through its facade";
    return null;
  }
  if (
    [
      "packages/runtime",
      "packages/contracts",
      "packages/world-authoring",
      "packages/world-build",
    ].includes(from) &&
    /^(react|react-dom|next)(\/|$)/.test(specifier)
  )
    return "Framework dependency crosses a domain boundary";
  if (
    specifier.startsWith("node:") &&
    !file.includes(".test.") &&
    from !== "packages/world-build" &&
    !file.startsWith("apps/editor/src/server/")
  )
    return "Node APIs are allowed only in build/server code";
  return null;
}

export function checkCycles(graph) {
  const active = new Set();
  const visited = new Set();
  const errors = [];
  function visit(node, chain) {
    if (active.has(node)) {
      errors.push([...chain, node].join(" -> "));
      return;
    }
    if (visited.has(node)) return;
    active.add(node);
    for (const dependency of graph[node] ?? [])
      visit(dependency, [...chain, node]);
    active.delete(node);
    visited.add(node);
  }
  for (const node of Object.keys(graph)) visit(node, []);
  return errors;
}
