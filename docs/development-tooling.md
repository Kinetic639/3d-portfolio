# Development tooling

Installed for the portfolio rebuild on 2026-09-06. Tool installation does not mark a product roadmap phase complete.

## Agent skills and plugins

- Game Studio 0.1.2 is installed and enabled in the local Codex profile from the official marketplace. It includes all six requested specialist skills, plus its entry skill, Phaser and sprite skills. Installation does not select a renderer or add any game framework to the workspace.
- Vercel React Best Practices and Web Design Guidelines are installed in the user's Codex skills directory.
- Repository skills live in `.agents/skills/portfolio-change-workflow`, `.agents/skills/performance-experiment`, and `.agents/skills/runtime-lifecycle-verification`. Their procedures reference the approved architecture and roadmap.
- Existing Context7, Chrome DevTools, Blender and browser capabilities are reused. No duplicate MCP servers were added. A Playwright MCP configuration already existed in `.codex/config.toml` before this installation.

The new skills become available on the next turn. Apply only the skills relevant to a task. Existing architecture, the user's scope, and version-accurate documentation take precedence over generic plugin workflows.

## Workspace development dependencies

These are pinned in the root manifest and lockfile, not application dependencies:

| Package                | Version | Purpose                                  |
| ---------------------- | ------- | ---------------------------------------- |
| `@playwright/test`     | 1.63.0  | Browser tests and automation             |
| `@axe-core/playwright` | 4.13.0  | Automated accessibility checks           |
| `@gltf-transform/cli`  | 4.5.0   | Inspect and process original glTF assets |
| `spectorjs`            | 0.9.30  | Opt-in WebGL frame inspection            |

Use `pnpm exec playwright --help` and `pnpm exec gltf-transform --help` for the installed CLIs. Spector's browser bundle is available through `node_modules/spectorjs/dist`; inject it only in an explicitly requested local profiling session. It is not imported by either application, and no browser extension was installed.

Browser tests, axe checks, asset processing recipes and profiling integration remain future roadmap work. No empty passing test task or automatic asset transformation was introduced. Spector captures WebGL, not WebGPU, and automated accessibility scans do not replace manual review.

## Local browser storage

The default browser installation ran out of space on C:. The browser binaries are instead installed at `D:\dev\.cache\playwright-browsers`, outside the repository. On this machine use:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = 'D:\dev\.cache\playwright-browsers'
```

Set this before launching Playwright from an existing terminal. Other machines and CI can use the default location and install browsers with `pnpm exec playwright install chromium firefox webkit`; the D: path is a local workstation setting, not a portable project requirement.
