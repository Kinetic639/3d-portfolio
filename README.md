# Portfolio

Michał Stępień's portfolio: a Next.js site whose centrepiece is an interactive 3D world built from voxels in a local editor and baked into static geometry for production.

The project was rebuilt in stages on a new core (map format and content model, engine and its bridge to the page UI, clickable objects with a content panel and a URL per item, landing page with background loading, warm-up and the entry, the map editor, baking, the model pipeline), and the original look was brought back on top of it: textured voxel terrain, the low rotatable camera, the loader with its entry wave and object pop-up, the original editor, an exact bake, a dig mini-game, the FPS badge and a performance regression test.

## Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. The page is the portfolio as plain HTML; the loader (a gold platform with a floating crystal) sits at the bottom; once the world is ready, click it to enter. Inside, drag or use the arrow keys to move, scroll or press + and - to zoom, Ctrl + right drag or Q and E to turn, and click the icons to open content, or the play icon on the stone hill to dig in the mine.

## Edit maps

With `pnpm dev` running, open http://localhost:3000/editor. The editor saves straight to `maps/<id>/map.json` and is not part of a production build. See `docs/developer-guide.md`.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
pnpm perf          # production build, real GPU, about 1.5 min
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
| `lib/minigames/`, `lib/engine/minigame-host.ts` | Mini-games: one file per game, the shared host in the engine |
| `lib/perf/`, `perf/` | Frame and UI-cost meters behind the FPS badge; the performance regression test and its budgets |
| `lib/bake/` | Baking voxels into the world visitors load (`pnpm bake`) |
| `assets/models/`, `lib/assets/` | Model sources and the pipeline that optimises them (`pnpm assets`) |
| `lib/maps/`, `lib/world/` | Map format and voxel world |
| `docs/architecture.md` | How it works and why, with measurements |
| `docs/developer-guide.md` | Step-by-step recipes |

## Stack

Next.js 16 (App Router), React 19, three.js, zustand, Tailwind CSS 4, Vitest, Playwright. Hosted on Vercel.
