# Portfolio

Michał Stępień's portfolio: a Next.js site whose centrepiece is an interactive 3D world built from voxels in a local editor and baked into static geometry for production.

The project is being rebuilt in stages on the `rebuild/base` branch. Stage 1 (foundation) is done: map format, content model, the engine skeleton and the bridge between the 3D world and the page UI. The landing page, the editor, baking, the asset pipeline and the mini-game follow.

## Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. Drag or use the arrow keys to move, scroll or press + and - to zoom.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Where things are

| Path | What |
|---|---|
| `content/portfolio.ts` | All portfolio copy |
| `maps/` | Map files and the default-map index |
| `lib/engine/` | 3D runtime (three.js, no React) |
| `lib/bridge/` | The single channel between the engine and the UI |
| `lib/maps/`, `lib/world/` | Map format and voxel world |
| `docs/architecture.md` | How it works and why, with measurements |
| `docs/developer-guide.md` | Step-by-step recipes |

## Stack

Next.js 16 (App Router), React 19, three.js, zustand, Tailwind CSS 4, Vitest, Playwright. Hosted on Vercel.
