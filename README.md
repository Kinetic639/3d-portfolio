# Portfolio workspace

A fresh pnpm/Turborepo foundation for an accessible Next.js portfolio, an optional production 3D experience, and an isolated development editor. Neither reference application is the foundation of this workspace.

**Start here:** [How to understand and extend the architecture](docs/architecture-guide.md) explains each app/package in plain language, with examples of where future features belong and how the parts communicate.

**Planning:** Open the [progress tracker](docs/progress-tracker.md) for current status and next work, and the [production roadmap](docs/production-roadmap.md) for the dependency-ordered path to release.

## Requirements

- Node 24.18.0 (see `.node-version`).
- pnpm 10.34.5 (pinned in `package.json`). If your global pnpm is older, use `npx --yes pnpm@10.34.5 <command>` or activate the pinned version with your package-manager tooling.

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm dev:portfolio
pnpm dev:editor
```

Portfolio uses port 3000; editor uses 3001. Dev scripts build required library output first and then watch the selected app/dependencies. Stop conflicting historical servers before using those ports.

## Workspace

```text
apps/
  portfolio/             Public Next.js DOM shell
  editor/                Separate Next.js editor shell + EditorSession types
packages/
  contracts/             WorldRuntime/data/observation interfaces
  world-authoring/       Source schema/validation and editing interface subpaths
  world-build/           Offline build contract (no compiler yet)
  runtime/               WorldRuntime facade export (no renderer yet)
  experience-ui/         Production host contract
  portfolio-content/     Independent portfolio identity/content
  diagnostics/           Development-only observation contract
tools/
  config/                Shared TypeScript/Vitest and production-input config
  checks/                Import, dependency, artifact, test and HTTP guards
worlds/                  Future editable production worlds
assets/source/           Future original approved asset sources
assets/catalog/          Future production asset metadata
artifacts/               Generated local reports/outputs (gitignored)
tests/                   Future cross-app parity/performance scenarios
docs/                    Current architecture, ADRs and next-phase scope
reference/
  portfolio-prototype/   Preserved proof of concept
  old-new-portfolio/     Preserved former standalone application
  project-docs/          Historical plans; not current decisions
```

The explicit nine-member workspace list excludes reference, tools, assets and worlds. No reference packages are installed, checked or built by normal workspace tasks. Sources and reference assets have not been copied into active packages.

## Commands

| Command                                                    | Purpose                                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                              | Formatting, lint, types, real tests, empty-suite rejection, graph/build artifact checks and production HTTP smoke |
| `pnpm build`                                               | Build all nine members in dependency order and inspect application traces                                         |
| `pnpm build:portfolio`                                     | Build only portfolio and its dependency closure, then inspect its traces                                          |
| `pnpm build:editor`                                        | Build only editor and its dependency closure, then inspect its traces                                             |
| `pnpm exec turbo run build --filter=@portfolio/runtime...` | Build one package and its dependencies                                                                            |
| `pnpm check:boundaries`                                    | Import/manifest/export checks plus source dependency cycles                                                       |
| `pnpm test`                                                | Negative architecture checks and each member's Vitest tests                                                       |
| `pnpm check:no-empty-tests`                                | Run each actual test task with an unmatched filter; require exit 1                                                |
| `pnpm test:smoke`                                          | Start built apps temporarily on 3197/3198, check HTTP/DOM/script delivery, stop them                              |
| `pnpm format`                                              | Format active files only; reference is excluded                                                                   |

`typecheck` checks the compile-time contract assertions in tests. Vitest executes the corresponding test suites. A test-only invocation does not replace the typecheck gate.

## Important root configuration

| File                                   | Responsibility                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `package.json`                         | Private root, pinned toolchain, development/verification orchestration          |
| `pnpm-workspace.yaml`                  | Explicit app/package allowlist and native dependency-build policy               |
| `pnpm-lock.yaml`                       | Reproducible active dependency resolution; reference lockfiles are separate     |
| `.npmrc`                               | Exact dependency saves, strict peer dependency and Node engine checks           |
| `.node-version`                        | Required Node release                                                           |
| `turbo.json`                           | Task ordering and cache outputs; persistent dev tasks are not cached            |
| `tsconfig.json`                        | Empty root solution; no reference projects; member configurations own checking  |
| `eslint.config.mjs`                    | Shared TypeScript linting and restricted import patterns; apps add Next rules   |
| `.dependency-cruiser.cjs`              | Dependency cycles and production/development separation rules                   |
| `.prettierrc.json` / `.prettierignore` | Formatting style and exclusion of reference/generated files                     |
| `.gitignore`                           | Dependency/build/test artifacts remain untracked; references remain inspectable |
| `.dockerignore` / `.vercelignore`      | Exclude reference and local agent material from deployment contexts             |
| `AGENTS.md` / `CLAUDE.md`              | Existing repository agent guidance; preserved                                   |
| `.mcp.json`                            | Existing local tool integration configuration; preserved, not an app dependency |

`.github/workflows/verify.yml` runs the full gate with a frozen lockfile. Shared compiler settings live in `tools/config/tsconfig.base.json`; test discovery with `passWithNoTests: false` lives in `tools/config/vitest.mjs`. `tools/config/production-inputs.json` names the only future world/asset input roots.

## Builds and deployment

Libraries build ESM and declarations into `dist/` with explicit exports. Each app owns a Next.js standalone build. Only deploy its traced standalone output plus its own `.next/static` and any approved `public` assets; do not deploy the repository root. The editor is a separate development app and is not production-authenticated yet. `robots: noindex` is not access control.

The reference trace exclusion is defense in depth, not permission to import reference code. Source checks must pass first. Build trace checks reject reference paths and development packages in portfolio output. Future asset/baking tasks must consume only the configured input roots. No fake successful compiler or baking task is present.

## What is deliberately unfinished

The WorldRuntime, ExperienceHost and EditorSession interfaces are declarations only. No renderer, gameplay, runtime bridge, Play iframe, terrain, weather, characters, shaders, compiler or asset processing is implemented. Imperative Three.js versus R3F-managed Three.js remains an experiment for the first tiny vertical slice. Neither is installed.

Read [architecture](docs/architecture.md), [decisions](docs/decisions/) and [next phase](docs/first-vertical-slice.md) before implementing those systems.
