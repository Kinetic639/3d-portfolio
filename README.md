# Portfolio

Michał Stępień's portfolio: a Next.js site whose centrepiece is an interactive 3D world built from voxels in a local editor and baked into static geometry for production.

The project is being rebuilt in stages on the `rebuild/base` branch. Stages 1–5 are done: the map format and content model, the engine and its bridge to the page UI, clickable objects with a content panel and a URL per item, the landing page with background loading, warm-up and the entry transition, the map editor, and baking of voxel maps into smooth static geometry. The asset pipeline and the mini-game follow.

## Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. The page is the portfolio as plain HTML; once the world behind it is ready, an "Enter the world" button appears at the bottom. Inside, drag or use the arrow keys to move, scroll or press + and - to zoom, and click the icons to open content.

## Edit maps

With `pnpm dev` running, open http://localhost:3000/editor. The editor saves straight to `maps/<id>/map.json` and is not part of a production build. See `docs/developer-guide.md`.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
pnpm bake --check
pnpm build
```

## Where things are

| Path | What |
|---|---|
| `content/portfolio.ts` | All portfolio copy |
| `maps/` | Map files and the default-map index |
| `lib/engine/` | 3D runtime (three.js, no React) |
| `lib/bridge/` | The single channel between the engine and the UI |
| `lib/editor/`, `components/editor/` | Map editor (development only) |
| `lib/bake/` | Baking voxels into the world visitors load (`pnpm bake`) |
| `lib/maps/`, `lib/world/` | Map format and voxel world |
| `docs/architecture.md` | How it works and why, with measurements |
| `docs/developer-guide.md` | Step-by-step recipes |

## Stack

Next.js 16 (App Router), React 19, three.js, zustand, Tailwind CSS 4, Vitest, Playwright. Hosted on Vercel.
