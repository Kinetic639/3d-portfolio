# Architecture

This document describes how the portfolio is built and why. It is updated at the end of every stage of the rebuild; sections marked *planned* describe decisions that are made but not implemented yet.

Status: **stage 3 of 9 complete** (landing page, background loading, warm-up, entry). See [Stage log](#stage-log).

## Overview

```
content/portfolio.ts        Portfolio copy (data only)
maps/<id>/map.json          Map files (v5), maps/index.json names the default map
lib/content/                Content model, URL mapping, validation
lib/maps/                   Map format, migration, validation, file store (Node)
lib/world/                  Voxel world storage (typed arrays, chunks)
lib/voxel-shapes/           Block shapes
lib/terrain/                Voxel surface mesher, zone overlay
lib/prefabs/                Procedural placeholder objects
lib/engine/                 3D runtime: plain TypeScript on three.js, no React
lib/bridge/                 The only channel between engine and UI
components/site/            Landing page (server components)
components/world/           World layer: boot, entry prompt, HUD, content panel
components/content/         Content rendering shared by pages and the panel
components/ui/              DOM UI primitives (design tokens)
lib/editor/                 Pure editing logic kept for the editor rebuild (stage 4)
scripts/                    CLI tools (map migration; baking in stage 5)
```

## World and UI: how they exchange state and events

The engine and the React UI are separate programs that share one small object, the **world bridge** (`lib/bridge/world-bridge.ts`).

- **State** (`bridge.store`, a vanilla zustand store) holds low-frequency, semantic facts only: the phase (`idle → loading → warming → ready → entering → world → leaving`), load progress, quality tier, the hovered interactable, mini-game HUD data, an error. Phase changes go through a state machine; illegal transitions are ignored and logged.
- **Commands** (`bridge.commands`) go UI → engine: `enter`, `exit`, `focus-content`, `set-quality`, `leave-minigame`.
- **Events** (`bridge.events`) go engine → UI: `content-activated`, `entered`, `exited`.
- `bridge.set()` publishes only when a value actually changed (structural compare), so the engine may call it every tick without causing renders.

Per-frame data never crosses the bridge. Pointer position, camera transform, the cell under the cursor and frame times stay inside the engine. React components subscribe with `useWorldBridge(selector)` and re-render only when their slice changes.

**Why.** The previous implementation kept all world and editor state as React state inside one component rendered in the WebGL canvas. Every pointer move re-rendered that component, serialised roughly a hundred fields, and re-rendered the editor panel. Making the boundary a module with a deliberately narrow vocabulary means the UI cannot depend on high-frequency data even by accident.

**Open content and the URL.** The open content item is not stored in the bridge. The URL is its source of truth:

1. A click on an interactable makes the engine emit `content-activated`.
2. `useContentRoute` (`components/world/use-content-route.ts`) pushes the item's canonical URL with `history.pushState`. The Next.js router observes this without navigating, so the world is not remounted (an e2e test tags the engine instance and checks that it survives).
3. The panel renders from `usePathname()`, and an effect sends `focus-content` (or `clear-focus`) to the engine, which moves the camera and remembers the previous view.

Consequences: the close button, Escape and browser Back are the same operation; Forward reopens; a direct link (`/projects/<slug>`) is a statically generated page whose HTML already contains the content, and the world focuses the matching object once it is running. Opening a second item while the panel is open replaces the history entry, so one Back always returns to the world.

## Interaction

`lib/engine/interactables.ts` builds the list of clickable things once per map: entities, markers and zones whose `contentReference` resolves to existing content.

- **Signal.** Every interactable has an icon sprite floating above it. Icons ignore depth, so they are visible and clickable even behind other objects. On hover the icon grows and brightens, the cursor becomes a pointer and the HUD names the item.
- **Picking.** Icons are tested first (ray against sphere), then object bounding boxes (ray against box, rejected when terrain is closer), then terrain: a voxel ray march (`lib/world/voxel-raycast.ts`) finds the cell under the pointer and its zone. No render geometry is involved. Measured cost: 0.02 ms per pick.
- **Frequency.** Pointer moves are coalesced to at most one pick per animation frame. A frame is rendered and the bridge is updated only when the hovered item changes. Touch has no hover; a tap picks directly.
- **Occlusion.** Objects whose bounds lie between the camera and the hovered or focused interactable are drawn with an ordered-dither fade (a per-instance attribute in `entity-meshes.ts`), which needs no transparency sorting. Terrain is not faded; the fixed camera angle and the always-visible icons cover that case.
- **Keyboard and screen readers.** A canvas cannot expose its objects to assistive technology, so the HUD menu lists every content item as a real link; activating one is the same as clicking the object.

## How the world is built

A map file (`maps/<id>/map.json`, schema v5) stores:

- `dimensions`: width and depth in cells (multiples of the 16-cell chunk), fixed vertical range;
- `playableBounds`: the rectangle a visitor can reach. Cells outside it are **backdrop**: authored in the same editor, never reachable, and (from stage 5) baked at reduced detail;
- `blocks.edits`: differences from the flat generator baseline, one per line in the file so diffs stay small;
- zones (per-column ids plus definitions; a zone may reference content or declare a mini-game), entities, markers, spawn points, camera presets, `environment` (time of day, wind).

`createLoadedMapState` turns a definition into a `VoxelWorld`: five typed arrays (block, shape, rotation, state per cell; zone per column). World statistics are counters maintained by the mutators, so `getStats()` is O(1).

The engine (`lib/engine/world-engine.ts`) renders a world through a `TerrainSource`. Today the only implementation is the voxel one (`terrain-meshes.ts`): one mesh per chunk from the surface mesher, vertex-coloured. For visitors the meshing runs in a worker (`world-builder.worker.ts`); a time-sliced main-thread path remains for tools and as a fallback. After an edit only dirty chunks are rebuilt (`rebuildChunks`), so cost follows the size of the change. The baked world (stage 5) will be a second `TerrainSource`.

Objects are instanced per (shape, colour) in `entity-meshes.ts`; each instance maps back to its entity id for picking.

Rendering is **on demand**: `engine.invalidate()` schedules one frame, and the loop continues only while the camera is moving or an animation runs. An idle world draws nothing.

The camera (`camera-rig.ts`) has a fixed 55° pitch and no rotation. Mouse drag, touch drag, pinch, wheel, arrow/WASD and +/- move a goal that is clamped to the playable bounds and a zoom range; the camera eases towards it.

`Environment` (`environment.ts`) owns sun, ambient light, fog and shared uniforms (`uTime`, `uWind`, `uDaylight`). Time of day and wind change light parameters and uniform values only, never shader variants, so they cannot trigger a shader compile mid-session.

## Baking (*planned, stage 5*)

`pnpm bake [map]` will convert everything outside mini-game zones into static geometry stored next to the map and committed with it:

- organic terrain: density field from voxels → blur → Surface Nets → simplification → smooth normals, so the result has no visible blocks;
- hard materials (planks, structures): merged boxes with chamfered edges;
- materials as per-vertex weights blended by a triplanar shader; ambient occlusion baked per vertex (direct light stays dynamic so time of day keeps working);
- backdrop outside `playableBounds`: aggressive simplification, no collision, no shadows;
- mini-game zones are cut out and stay voxel-based at runtime, meshed with the same algorithm and shader so they match the baked surroundings.

## Landing page, background loading and entry

Every portfolio URL (`/`, an item's URL, `/map/<id>`) renders `LandingPage` (`components/site/LandingPage.tsx`): a server component containing the whole portfolio as static HTML. It needs no JavaScript to be read. On an item's URL that item comes first, as the page's `h1`.

`WorldLayer` (`components/world/WorldLayer.tsx`) is mounted once in the layout of the `(site)` route group, not in the pages. Navigating between landing pages therefore never restarts the world behind them.

Sequence (`components/world/use-world-boot.ts`):

1. Nothing happens until the `load` event and then an idle callback. With the Save-Data preference nothing loads until the visitor asks.
2. A worker creates a throwaway WebGL 2 context (`webgl-probe.worker.ts`). The first context a page creates starts the browser's GPU machinery; on the main thread that measured 173 ms of blocking, in the worker the later real context takes 7 ms.
3. The engine chunk and the map are fetched with dynamic imports. They are not part of the page's initial JavaScript.
4. `world-builder.worker.ts` validates the map, fills the voxel arrays and meshes all chunks, transferring buffers back. The main thread only wraps them in geometries.
5. Warm-up (below), then phase `ready`.
6. Only now does the entry button exist. Before that there is a 3 px progress line.

Entering and leaving are commands. The engine owns the phases: `entering` while the camera flies in (a timed 1.6 s ease-out from far inside the fog), `world` when it lands, `leaving` for 450 ms while the page fades the canvas out, then `ready` again with the engine still warm. With `prefers-reduced-motion` both are immediate. The page reacts through CSS keyed on `html[data-world]`: the landing page fades, becomes `inert` and stops scrolling; the world layer is `inert` and hidden from assistive technology while the landing page is in front. The click handler pushes the history entry first and starts the transition on the next frame, so the router's reaction to the new entry is over before anything moves.

**History.** Entries created inside the world carry `{ world: true }` in `history.state`. Entering pushes one at the current URL, so Back returns to the page the visitor was reading and Forward re-enters. The state object must be a fresh object every time: the Next.js router adds its own fields to the object it is given and then treats an object that already has them as its own entry, skipping the pathname update.

**Direct links.** An item's URL shows the landing page with that item. Entering from there sends `enter` with the item as focus, so the approach ends on the matching object with its panel open.

**Without WebGL** the phase becomes `unavailable`: no button, no warning, the landing page is the site.

## Warm-up

`WorldEngine.warmUp()` makes "ready" a measured fact. While it runs, the canvas is laid out at full size behind the landing page but hidden, and the engine draws nothing on its own.

1. **Compile** every shader program in the scene (`compileAsync`).
2. **Upload** every vertex buffer and texture by drawing each object once into a one-pixel scissor on the real canvas. Using the real framebuffer keeps the shader programs identical to those of real frames; the scissor removes the fill cost. Objects are drawn in batches sized so that a batch takes at most 6 ms, one batch per animation frame.
3. **Rehearse** the entry: render the views the approach passes through (ten along the curve, three at the destination), twice, each followed by `gl.finish()` so the time includes GPU work. The first pass absorbs one-off costs. The second is measured: it passes when the slowest frame is within 10 ms and no program, geometry or texture was created during it. If it is too slow and a lower quality tier exists, the tier drops (fewer pixels) and the rehearsal repeats.

The result is kept as `engine.warmUpReport`. Measured on the reference machine: 630 ms in total, 9 upload frames, median rehearsal frame 1.7 ms, slowest 3.9 ms, 0 new resources.

How it is checked: the e2e test `entering loads nothing, compiles nothing and runs smoothly` compares GPU resource counts before and after entering, records network requests during the transition and samples frame intervals. A second test asserts the report itself and that no frame was drawn for the visitor before entering.

**Quality tiers.** The starting tier is a guess from device hints (coarse pointer, memory, cores); warm-up lowers it from measurement. Today a tier only caps the device pixel ratio (1.5 / 1.25 / 1). Shadows and post-processing will hang off the same value.

## Editor separation (*planned, stage 4*)

The editor will be a development-only route with its own store, saving through development-only endpoints to `maps/`. The production build is checked for editor code. `lib/maps/map-store.ts` (file storage, default-map index) already exists and is Node-only.

Since stage 1 the production bundle contains no editor code (verified by searching the build output); the old editor was removed and the new one does not exist yet.

## Performance: findings and results

Measured in Chromium with a real GPU (RTX 2060), 1440×900. "Before" is commit `e438235`.

| Finding | Before | After stage 1 |
|---|---|---|
| World state lived in React: 80 pointer moves over the scene (editor) | 45 panel publishes, 52 toolbar renders, 3 828 ms script | not applicable (editor returns in stage 4) |
| 80 pointer moves over the scene (visitor) | 1 486 ms script (dev) | 9 ms script, 0 frames, 0 layouts (dev) |
| `getStats()` scanned all 1.18 M cells several times per render | 1 462 ms of the 3 828 ms above | O(1) counters |
| Idle scene kept rendering | ~270–340 ms script per second (visitor) | 0 frames, 0 ms script in 3 s |
| Time until the world is explorable (production) | 8.3 s to "ready", then a 7 s intro | 2.7 s |
| Main-thread blocking during load (production) | ~5 960 ms | ~280 ms (one 323 ms task) |
| JavaScript loaded on `/` (production, uncompressed) | 2 431 KB | 1 500 KB |
| JS heap (visitor, production) | 284 MB | 37 MB |
| Frame pacing while panning (visitor) | p95 33 ms (production, idle camera) | median 16.7 ms, p95 16.8 ms, max 67 ms (dev) |
| Draw calls / triangles in view | 53 / 66 k | 32–35 / 30–37 k |
| Click on an object to content panel in the DOM | no working path on the main map | 30 ms (dev build, stage 2) |
| 80 pointer moves crossing zones and objects | not applicable | 91 ms script, 80 picks, 4 frames (dev build, stage 2) |
| Unit test suite | 57 s, 1–3 flaky timeouts | 6 s, 124 tests, stable |
| `pnpm lint` | 5 errors, 41 warnings | 0 errors, 0 warnings |

### Landing page and entry (stage 3, production build)

| Measure | Result |
|---|---|
| LCP / CLS, desktop | 0.1–0.7 s / 0 |
| LCP / CLS, phone viewport with 4× CPU throttling | 0.35 s / 0 |
| Total blocking time while the world loads in the background | 16–18 ms (one 66 ms task) |
| Landing page frame intervals while scrolling during the load | median 16.7 ms, p95 16.7 ms, one frame of ~165 ms |
| JavaScript before the `load` event / fetched later for the world | 602 KB / 937 KB (uncompressed) |
| World ready after navigation start | 3.1–3.9 s (4.9–5.3 s with 4× CPU throttling) |
| Entry transition: frames, median, p95, slowest | 95, 16.7 ms, 16.7 ms, 16.8 ms |
| Long tasks / scripts fetched / GPU resources created during entry | 0 / 0 / 0 |
| Same with 4× CPU throttling | 95 frames, slowest 16.8 ms, 0 / 0 / 0 |
| JS heap after entering | 33 MB |

Findings fixed during this stage:

- The WebGL support check created the page's first WebGL context on the main thread: a 173 ms block. Moved to a worker.
- Building the voxel world blocked for ~320 ms. Moved to a worker.
- The entry approach used an exponential ease with a fixed settle threshold and took 4 s instead of 1.6 s. Replaced by a timed curve.
- The router's reaction to `pushState` (50–70 ms in development) landed inside the transition. The transition now starts one frame after the history update.
- Chunk buffers were uploaded on first draw, causing a 67 ms frame when panning into new terrain. Everything is uploaded during warm-up; panning across the whole map creates no GPU resource.

Remaining known costs:

- One frame of about 165 ms on the landing page when the browser initialises its GPU process for the first WebGL context. No script is running at that moment (the long-animation-frame entry reports 0 ms of blocking), so it cannot be sliced from page code; it happens once, about half a second after load, and only shows if the visitor is scrolling at that instant.
- One task of about 66 ms when the engine chunk (three.js, 570 KB) is evaluated. On a 4×-throttled CPU this becomes about 270 ms. The remedy would be to run the renderer in a worker with `OffscreenCanvas`, which is a larger change not planned here.
- The map JSON (344 KB chunk) is still downloaded by visitors; stage 5 replaces it with baked assets.
- Lighthouse itself was not run; the numbers above come from `PerformanceObserver` in headless Chromium.

## Stage log

### Stage 0–1: clean-up and foundation

- Removed: old scene component and its unused copy, editor panel, water simulation, character controller, 3×3 region manifest, code-generated maps, npm lockfile, logs, template assets, React Three Fiber and other unused dependencies.
- Map format v5 with migration from v1–v4 (`pnpm migrate:map`), maps as files, default map index. The previous default map was migrated to `maps/portfolio-main` with a 64-cell backdrop on each side (same 192×192 extent as the old 3×3 world).
- Content model with one canonical URL per item.
- World bridge, engine skeleton (on-demand rendering, fixed camera with mouse, touch and keyboard, environment uniforms), thin React mount.
- Not in this stage: clicking objects, content panels, landing page, editor, baking.

### Stage 2: world, camera, interaction

- Interactables with always-visible icons, hover signal, voxel-ray zone picking and occluder fade.
- Content panel driven by the URL: close, Escape, Back and Forward; a statically generated page per content item; camera focus that accounts for the panel and restores the previous view.
- HUD menu as the keyboard and screen-reader path to all content.
- The default map's two objects and four of its zones are linked to placeholder content (`scripts/assign-placeholder-content.ts`).
- e2e (11 tests): hover, click, URL, Escape, close, Back/Forward, zone click, direct link, keyboard only, touch tap and drag.
- Not in this stage: a zone highlight on the ground (waits for the baked look) and leaving the world (there is no landing page yet).

### Stage 3: landing page, background loading, warm-up, entry

- Landing page as static HTML on every portfolio URL; world layer mounted once in the `(site)` layout.
- Background loading after `load` and idle; world build and the WebGL probe in workers.
- Measured warm-up with automatic quality tiers; entry button only when it passed.
- Entry and exit transitions, Back and Forward between page and world, direct links, reduced motion, no-WebGL fallback, Save-Data opt-in.
- Global stylesheet pruned from 3 118 to about 490 lines (dead rules of the old interface removed).
- e2e: 19 tests (9 new for the landing page and entry).
- Not in this stage: a styled design; the landing page is a plain placeholder layout on the existing tokens.
