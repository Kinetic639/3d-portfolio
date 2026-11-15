# Architecture

This document describes how the portfolio is built and why. It is updated at the end of every stage of the rebuild; sections marked *planned* describe decisions that are made but not implemented yet.

Status: **stage 2 of 9 complete** (world, camera, interaction). See [Stage log](#stage-log).

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
components/world/           Thin React mount for the engine
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

The engine (`lib/engine/world-engine.ts`) renders a world through a `TerrainSource`. Today the only implementation is the voxel one (`terrain-meshes.ts`): one mesh per chunk from the surface mesher, vertex-coloured, built in time slices of at most 8 ms so the main thread stays responsive. After an edit only dirty chunks are rebuilt (`rebuildChunks`), so cost follows the size of the change. The baked world (stage 5) will be a second `TerrainSource`.

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

## Warm-up (*planned, stage 3*)

"Ready" will mean: assets downloaded and decoded, every shader compiled, every buffer and texture uploaded, and a run of test frames along the entry path rendered within budget with no new GPU resource appearing. The engine already exposes the pieces this needs (`loadMap`, `compile`, `stats.programs/geometries/textures`).

Known gap today: chunk geometry is uploaded to the GPU the first time a chunk is drawn, so panning into a new area uploads buffers on demand (measured: one 67 ms frame in a 150-frame pan). Stage 3 uploads everything during warm-up.

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

Remaining known costs, with the stage that addresses them:

- one ~320 ms long task while loading (building the voxel world from the map file on the main thread): stage 3 moves it to a worker, stage 5 removes it for visitors because they load baked geometry;
- the map JSON (412 KB) is a client chunk: stage 5 replaces it with baked assets in production;
- no HTML content yet: the page is still only the canvas. Stage 3 adds the landing page.

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
