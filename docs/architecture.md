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
lib/editor/                 Editor document, history, tools and 3D viewport (no React)
components/editor/          Editor UI (development only)
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

## Mini-games

A zone of kind `minigame` names a game in `minigame.gameId`. The zones are drawn in the editor (Zones tab, Kind "Mini-game: …"); outside them a visitor changes nothing.

- **Split of work.** A game (`lib/minigames/<id>.ts`) is a `MinigameDefinition`: a title, a hint, and `start(context)` returning a session with `target(cell)` (what a click would act on), `act(cell)` and `counters()`. The engine's `MinigameHost` (`lib/engine/minigame-host.ts`) does everything games share: picking, the outline on the target cell, the burst when a block breaks, remeshing, the camera, entering and leaving, and the HUD data. `lib/minigames/registry.ts` lists the games; the editor's zone panel and the interactables read that list, so a new game needs no change anywhere else.
- **Entering and leaving.** Each playable zone gets a play icon ("Click to play"). A click tilts the camera to look down into the zone (52°, distance 26) and shows the HUD at the top centre: the game's title, its counters (a live region), the hint and a Leave button; Escape does the same. Leaving restores the view the visitor had.
- **Changing the terrain.** A removed cell is written to the voxels and only what shows it is remeshed, once, right after the click: the chunk (and a neighbour when the cell is on its edge) for a voxel world; for a baked world, the zone's own mesh, built from the voxels the bake keeps for mini-game zones. Nothing is saved; a reload restores the map.
- **No first-dig stall.** Warm-up compiles the outline and burst materials and runs the dig remesh four times without keeping the result, so the first real dig runs warm code.
- **Measured** (dev build, 12 digs, RTX 2060): no long tasks and a worst frame of 16.8 ms at full speed, voxels and baked. With the CPU slowed 4× (a mid-range phone): baked 6–17 ms per dig, worst frame 33 ms, no long tasks; voxels 12–25 ms per dig, one 65 ms long task.

## How the world is built

A map file (`maps/<id>/map.json`, schema v5) stores:

- `dimensions`: width and depth in cells (multiples of the 16-cell chunk), fixed vertical range;
- `playableBounds`: the rectangle a visitor can reach. Cells outside it are **backdrop**: authored in the same editor, never reachable;
- `blocks.edits`: differences from the flat generator baseline, one per line in the file so diffs stay small;
- zones (per-column ids plus definitions; a zone may reference content or declare a mini-game), entities, markers, spawn points, camera presets, `environment` (time of day, wind).

`createLoadedMapState` turns a definition into a `VoxelWorld`: five typed arrays (block, shape, rotation, state per cell; zone per column). World statistics are counters maintained by the mutators, so `getStats()` is O(1).

The engine (`lib/engine/world-engine.ts`) renders a world through a `TerrainSource`. Today the only implementation is the voxel one (`terrain-meshes.ts`): one mesh per chunk from the surface mesher, vertex-coloured. For visitors the meshing runs in a worker (`world-builder.worker.ts`); a time-sliced main-thread path remains for tools and as a fallback. After an edit only dirty chunks are rebuilt (`rebuildChunks`), so cost follows the size of the change. A bake is the other source: one mesh per tile, written in the same worker from the bake's list of visible faces (see Baking). Both produce the same vertex data for the same material.

The mesher never draws the underside of the world's lowest layer: no camera goes below the ground. On the default map that was 36 864 of 87 656 faces (42 % of the vertices and of the terrain's GPU memory, 16.4 MB down to 9.5 MB); every other face is unchanged (checked face by face against the previous mesher).

Objects are instanced per (shape, colour) in `entity-meshes.ts`; each instance maps back to its entity id for picking.

Rendering is **on demand**: `engine.invalidate()` schedules one frame, and the loop continues only while the camera is moving or an animation runs. An idle world draws nothing.

The camera (`camera-rig.ts`) orbits a point on the ground. For visitors it starts as the original did: looking across the terrain from 14° above the horizon, 23 units away, from the south-east (`VISITOR_CAMERA`), free to turn, tilting between 8° and 70°, zooming between 22 and 98 units. Mouse: drag pans, wheel zooms, Ctrl + right drag turns and tilts. Touch: one finger pans, two fingers zoom and turn. Keys: arrows or WASD pan, + and - zoom, Q and E turn. All input moves a goal that is clamped to the playable bounds and the limits; the camera eases towards it, and frames are drawn only while it moves. The editor uses the same rig with wider limits and exact panning.

`Environment` (`environment.ts`) owns sun, ambient light, fog and shared uniforms (`uTime`, `uWind`, `uDaylight`). Time of day and wind change light parameters and uniform values only, never shader variants, so they cannot trigger a shader compile mid-session.

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

Entering and leaving are commands. The engine owns the phases: `entering` while the original entry plays (5.4 s, see Entry below), `world` when the camera arrives, `leaving` for 450 ms while the page fades the canvas out, then `ready` again with the engine still warm. With `prefers-reduced-motion` both are immediate. The page reacts through CSS keyed on `html[data-world]`: the landing page fades, becomes `inert` and stops scrolling; the world layer is `inert` and hidden from assistive technology while the landing page is in front. The click handler pushes the history entry first and starts the transition on the next frame, so the router's reaction to the new entry is over before anything moves.

**History.** Entries created inside the world carry `{ world: true }` in `history.state`. Entering pushes one at the current URL, so Back returns to the page the visitor was reading and Forward re-enters. The state object must be a fresh object every time: the Next.js router adds its own fields to the object it is given and then treats an object that already has them as its own entry, skipping the pathname update.

**Direct links.** An item's URL shows the landing page with that item. Entering from there sends `enter` with the item as focus, so the entry ends by moving to the matching object with its panel open.

**Without WebGL** the phase becomes `unavailable`: no button, no warning, the landing page is the site.

## Warm-up

`WorldEngine.warmUp()` makes "ready" a measured fact. While it runs, the canvas is laid out at full size behind the landing page but hidden, and the engine draws nothing on its own.

1. **Compile** every shader program in the scene (`compileAsync`).
2. **Upload** every vertex buffer and texture by drawing each object once into a one-pixel scissor on the real canvas. Using the real framebuffer keeps the shader programs identical to those of real frames; the scissor removes the fill cost. Objects are drawn in batches sized so that a batch takes at most 6 ms, one batch per animation frame.
3. **Rehearse** the entry: render twelve moments of it (camera, terrain wave and object pop as they will be) and the resting view twice, twice, each followed by `gl.finish()` so the time includes GPU work. The first pass absorbs one-off costs. The second is measured: it passes when the slowest frame is within 10 ms and no program, geometry or texture was created during it. If it is too slow and a lower quality tier exists, the tier drops (fewer pixels) and the rehearsal repeats.

The result is kept as `engine.warmUpReport`. Measured on the reference machine: 630 ms in total, 9 upload frames, median rehearsal frame 1.7 ms, slowest 3.9 ms, 0 new resources.

How it is checked: the e2e test `entering loads nothing, compiles nothing and runs smoothly` compares GPU resource counts before and after entering, records network requests during the transition and samples frame intervals. A second test asserts the report itself and that no frame was drawn for the visitor before entering.

**Quality tiers.** The starting tier is a guess from device hints (coarse pointer, memory, cores); warm-up lowers it from measurement. Today a tier only caps the device pixel ratio (1.5 / 1.25 / 1). Shadows and post-processing will hang off the same value.

## Terrain look

Voxel terrain is drawn by one material (`lib/engine/terrain-material.ts`) that carries the project's original look: textured blocks (grass top and side, dirt, stone, mossy stone, path, planks, sand, riverbed, each with variants, rotations and mirroring chosen per cell), one fixed light, and the reveal that grows each cell out of the loader platform. The shading is the original shader's, unchanged where it decides a pixel's colour. Placed procedural objects are unlit flat colours, the scene has an ambient and a directional light for models, and the background is `#edf1ed`, all as in the original.

What changed is how the data reaches the GPU:

| | Original | Now |
|---|---|---|
| Textures | 9 strips, no mipmaps | 1 array texture, a layer per tile, with mipmaps: crisp texels up close, no shimmer far away |
| Vertex data | 12 attributes, 84 bytes per vertex | 6 attributes, 46 bytes: normals and colours as bytes, texture parameters in one byte vector, cell origin and reveal delay in one float vector |
| Meshing | on the main thread, in React | in a worker at load; on the main thread only for edited chunks |
| Chunk rebuild after an edit | 13–25 ms | 3–4 ms (the centre chunk about 10 ms) |

The reveal uniforms (`uExpansionProgress`, `uTime`, `uLoaderMotion`) are on the terrain source and drive the entry below.

Measured after this change (production, default map): world ready 2.0 s after navigation start (3.9 s with 4× CPU throttling), total blocking time 26–33 ms, entry transition slowest frame 16.8 ms with no long task and no script fetched, JS heap 34 MB.

## Entry: loader, wave and pop

The way into the world is the original's, on the new engine (`lib/engine/entry-sequence.ts` holds the path and timings, `world-engine.ts` plays them).

- **Loader.** On the landing page the engine draws only the loader: the platform at the centre of the map (the cells the mesher marks with a negative reveal delay) and the crystal over it (`loader-beacon.ts`), seen by the original's landing camera, so they sit at the bottom centre of the screen. The canvas is transparent everywhere else and lets clicks through; a round button over the platform is the way in ("Enter the world", for keyboard and screen readers too). While the world warms up the platform ripples; when it is ready the ripple settles and the crystal pops in.
- **Focus** (1.43 s): the camera glides from the landing view to a high three-quarter view of the platform. The page fades out under a canvas that has no sky yet, so nothing has to animate a clip or a mask.
- **Wave and settle** (4 s): the terrain grows out of the platform, cell by cell, each cell's real shape rising from its own centre (the original's shader, unchanged), while the camera swings out wide and settles low over the ground on the original's curves. The end of the path is exactly the visitor camera's resting pose, so free movement starts without a jump. When the wave has covered the original 64-cell area, the placed objects pop up, nearest first, with the original's overshoot and tilt. Far backdrop terrain keeps growing for about a second after the camera has arrived.
- **No swap, no build.** The wave and the pop are uniforms over geometry that is already on the GPU: the terrain shader reads each vertex's cell origin and delay, and the object shader reads each instance's pivot and delay (one draw call per batch, as before). Warm-up compiles and uploads everything and rehearses twelve moments of the entry, so entering creates no GPU resource. A future baked world only has to carry the same per-vertex reveal data to play the same wave.
- **Cheap where it runs longest.** The loader draws only the loader layer (the four chunks holding the platform, the crystal, the lights), scissored to a 260 × 200 px box: about 0.1 ms of CPU per frame. It starts only after warm-up has compiled the shaders, and while warm-up runs only warm-up draws it. The platform's centre, top and the length of the wave come from per-chunk summaries the world-builder worker computes while packing chunks, so nothing scans vertices on the main thread.
- **Leaving** fades the world out, puts the terrain and objects back to hidden and the camera back to the spawn, and shows the loader again. Entering again replays the entry. With `prefers-reduced-motion` the entry is a cut.

Measured (production build, default map, 1440 × 900):

| | Step 2 build | This step |
|---|---|---|
| Entry: frames, p95, slowest | 95, 16.8 ms, 16.8 ms (1.6 s zoom) | 324, 16.7 ms, 16.8 ms (5.5 s entry); 4× CPU throttling: p95 16.7 ms, slowest 16.8 ms |
| Long tasks / scripts fetched while entering | 0 / 0 | 0 / 0 |
| Landing page scrolled while loading: p95 | 16.8 ms | 16.8 ms |
| Landing page scrolled with the loader live: p95, slowest | n/a | 16.8 ms, 16.8 ms |
| Total blocking time while loading (3 runs) | 34–36 ms | 21–51 ms |
| World ready after navigation | 2.16–2.18 s | 2.34–2.75 s (the loader draws during warm-up) |
| JS heap | 34 MB | 36 MB |

Two things measured along the way and fixed: changing `clip-path` on the canvas layer at the start of the entry cost the browser a 50–150 ms frame (so the canvas is never clipped), and drawing the loader before warm-up had compiled the shaders compiled them synchronously, an 80 ms task.

## Baking

A bake keeps the terrain exactly as authored, every cell, shape, material and texture, and saves the browser work. `pnpm bake` (or **Bake Map** in the editor) writes it next to the map, and it is committed with the map:

```
maps/<id>/map.json           the voxel map (source)
maps/<id>/baked/world.bin    what visitors download (gzip)
maps/<id>/baked/bake.json    which map content it was baked from, sizes, counts
```

**What it stores.** Meshing a voxel world is two steps: deciding which faces of which cells are visible (that needs the whole world and tests every face against its neighbour), and writing those faces out as vertices. The bake does the first step and stores its result: for every cell with a visible face, its position, block, shape, rotation, state, two flags (loader platform, grass covered by a block above) and the indices of its visible faces in its shape's face list (`lib/bake/bake-map.ts`, format in `baked-format.ts`). The browser does only the second step, with the same code the live mesher uses (`lib/terrain/surface-faces.ts`), so the result is the same vertex data, byte for byte: positions, normals, colours, texture parameters, and each vertex's cell centre and reveal delay. The entry wave therefore plays over baked terrain exactly as over voxels, and nothing is swapped when it ends.

**What changes for the renderer.** Faces are grouped into tiles of 4 × 4 chunks, one mesh each, instead of one mesh per chunk. The loader platform's cells form a mesh of their own, so the landing page's loader draws a few dozen vertices.

**Mini-game zones stay voxels.** The columns of zones with `kind: "minigame"`, plus one column all round, are left out of the baked faces. Their voxels are stored, with one more ring for neighbours, and meshed in the browser by the live mesher (`baked-decode.ts`), so they can be remeshed when a mini-game changes them. Tested: baked faces plus the zone's live faces equal the whole world's live faces.

**Picking.** A height and a zone id per column replace the voxel world (`createHeightfieldQuery`); the heightfield knows one height per column, so picking ignores overhangs.

**What the visitor loads.** The site layout lists every map whose bake is *fresh* (its `sourceHash` matches the map file, ignoring the save timestamp). Visitors get the bake only when the build has `SERVE_BAKED_WORLDS=1`; until the bake is approved it is off, and development builds load it with `?world=baked` (`?world=voxels` forces the voxels). The bake is fetched from `/world-data/<id>/<hash>.bin` (the hash in the address makes it immutable for the CDN and the browser); the voxel map is not downloaded. A map without a fresh bake falls back to the voxel path, and so does a visitor whose download fails. `pnpm bake --check` reports bakes that no longer match their map.

Measured on the default map (192 × 192):

| | Voxels | Bake |
|---|---|---|
| Downloaded for the terrain | 28 KB map (gzip) | 12 KB (628 KB after decompression) |
| CPU to build the terrain (Node, this machine) | 311–489 ms: parse, build the voxel world, mesh 144 chunks | 115–122 ms: decompress, write 50 792 faces |
| Terrain meshes / GPU geometries after warm-up | 144 / 156 | 10 / 22 |
| Draw calls in the resting view | 51 | 15 |
| Triangles drawn in the resting view | 30 080 | 47 546 (larger tiles cull less) |
| World ready after navigation (production, 2 runs) | 1.80–2.04 s | 1.46–1.84 s |
| Same with 4× CPU throttling | 4.27–4.88 s | 3.11–4.32 s |
| JS heap after entering | 27–30 MB | 23 MB |
| Resting view compared with the voxel view | – | 317 of 1 296 000 pixels differ: edges where neighbouring faces overlap by design and draw order decides |
| Bake time | – | 0.7 s |

## Models

Models are glTF files with a small metadata file, kept in one place and referenced from maps by id only.

```
assets/models/<id>/model.glb     source (committed); model.gltf also works
assets/models/<id>/asset.json    name, category, scale, anchor, collision, variants, animation, replacesPrefabs
public/assets/models/            generated by `pnpm assets`, not committed
  <id>-<hash>.glb                optimised model
  manifest.json                  every model with its sizes, counts, bounds and file name
```

**Pipeline** (`lib/assets/asset-pipeline.ts`, `pnpm assets`). Runs before `next dev` and `next build`. For each folder it checks the metadata, merges duplicate data, removes what is unused, welds vertices and applies meshopt compression, then writes the model under a name that contains a hash of its source and metadata. Unchanged models are skipped. It prints a size table (source size, output size, triangles, textures, animations), warns above a budget (1.5 MB or 60 000 triangles per model) and exits with an error when a model or its metadata is broken, so a bad asset stops the build. Textures are copied as they are; recompressing them needs an image library that is not installed.

**Runtime** (`lib/engine/model-library.ts`, `lib/engine/entity-meshes.ts`). The manifest is fetched once. A map's models are loaded before the map is shown, so warm-up compiles and uploads them like everything else. Placed objects are drawn by one function for all kinds:

| Kind | How it is drawn |
|---|---|
| Static model | Instanced: one draw call per model part and variant, however many are placed |
| Animated model (metadata names a clip) | A clone per instance with its own mixer; the world keeps drawing frames while any is shown |
| Procedural prefab or primitive | Instanced boxes, cylinders and spheres, as before |
| Model that is missing or not loaded yet | A magenta box of the object's footprint |

**Swapping a model.** A map entity stores only `assetReference: "<id>"`. Replacing `model.glb` and running `pnpm assets` gives the output a new hash, and every placed instance, in every map, uses it. Baked worlds carry entities by id too, so they need no re-bake for a model change.

**Procedural prefabs** stay, as placeholders, in the same library the editor shows. A model can take one over: `"replacesPrefabs": ["conifer"]` in its metadata draws every placed conifer with that model, without touching any map.

**Thumbnails** are not files. The editor draws each library item (model or prefab) into a small image in the browser, with the same code that draws it in the world, one per frame, cached per item and content hash.

Measured: the sample crate is 3 KB and 24 triangles; three placed crates cost two draw calls (two parts). The animated test model goes from 2 110 KB to 1 067 KB (11 376 triangles). With both on a test map, warm-up still passes with no GPU resource created during the measured pass.

Known limits: a mesh with several materials is drawn with its first; animated models are not instanced and are not faded when they hide something; the occluder fade and tinting assume the model's materials have a base colour.

### Wind (from the style lab)

Ported from the style-lab branch (`environment-controller.ts`, `tree-wind.ts`) with the same presets, gust curve and per-vertex motion (pendulum sway, branches at their own phase, leaf flutter), fitted to the engine:

- **Global wind** (`lib/engine/wind.ts`, `Wind`): the map's `environment.wind` (direction, strength, enabled, speed, gust strength and frequency, turbulence) as one set of uniforms shared by every wind-reactive material. Changing the weather changes values, never shaders.
- **Per model** (`lib/engine/model-wind.ts`): defaults in `asset.json` `wind`, overrides in the map's `modelSettings[modelId].wind`; one uniform block per model, shared by all its instanced batches, so the editor's sliders change it live.
- **Shader**: the wind code is added to the instanced batches' existing hook (pop-up and occlusion fade) and gets its own program cache key, because three.js keys programs by the hook's source text. The weight source is compiled in (the lab chose it per vertex through eleven branches); changing it in the editor rebuilds that model's material. Rotated and scaled instances bend with the wind, not with their own axes.
- **Frames**: wind needs continuous frames only while it blows and a wind-reactive batch intersects the view frustum (`EntityLayer.windInView`); otherwise the world stays still and draws nothing. `prefers-reduced-motion` stills it.
- **Measured** (production, RTX 2060, 60 pines in view while panning): frame p95 16.8 ms with and without wind, engine CPU 1.4-1.6 ms per frame either way, no extra draw calls; 60 frames per second when idle with trees in view and wind, 0 without wind.
- **Editor**: Weather · Wind in the Map workspace; Wind response, Model data and Debug view (weight, height, vertex colours, UV sets) in the inspector of a selected model. The lab's mask and detail texture views are not ported: those textures are not part of the model.

### Style: toon shading, outlines, lighting, shadows (from the style lab)

Ported from the style-lab branch (`stylized-rock-material.ts` and the lab's Lighting, Surface and "Edges and depth" panels), fitted to the engine:

- **Toon + hatching** (`lib/engine/surface-style.ts`): three.js's toon material with the lab's procedural crosshatch in the shade. Bands, hatch power, scale and mode are shared uniforms and one 6-texel gradient whose data changes with the band count: changing them never compiles anything. The material's hook is chained with the instance effects (pop, fade, wind) and keyed by both, since three.js keys programs by the hook's text.
- **Outlines**: the lab's inverted hull, as an instanced batch next to each model batch (one draw call per model part), with the same pop, fade and wind, and with the skeleton for animated models. The smoothed outline normals are computed by the model pipeline (`lib/assets/outline-normals.ts`, attribute `_OUTLINE_NORMAL`), not in the browser. Thickness is in screen pixels by default (the lab's 0.012 world units is under a pixel from the visitor's camera); "world" mode is the lab's.
- **Contact patch** (the lab's "contact AO"): a soft disc under each instance of models that use it, all in one batch.
- **Lighting** (`Environment`): sun intensity, colour and direction; a hemisphere sky light replaces the ambient light (white over white is identical). Defaults are the original look; the "Style lab" preset is the lab's. The terrain keeps the original's own light.
- **Shadows**: three.js shadow maps (PCF), cast by models and prefabs, received by the terrain (its shader includes three.js's shadow chunks) and by lit models. The shadow camera follows the view, sized to the view distance, and moves in whole texels so shadows do not shimmer. Off by default and on the lowest quality tier; decided before warm-up so its programs compile there (`warmUpReport.newResourcesDuringTest` stays 0).
- **Per model**: asset.json `style` defaults, map `modelSettings[id].style` overrides; outline scale is a shared uniform (live), the rest decides batches (the editor rebuilds).
- **Measured** (production, 45 pines and 15 rocks in view while panning): frame p95 16.7 ms in both looks; engine CPU 1.4-1.5 ms per frame with toon and outlines, 1.7-2.0 ms with shadows and wind; 64 / 76 draw calls.
- Perf test: on-demand scenarios run with the wind held still; a wind scenario records `wind.*` when something sways at the arrival view.

### Creatures (the style lab's crow)

`lib/engine/actor.ts` is the lab's crow controller without React or its own materials (toon and outline come from the entity layer): idle, walking, running, taking off, a quadratic flight arc at `flightHeight`, landing (take-off reversed when there is no landing clip) and clip preview, with crossfades and eased turning. Clips are matched by name; long ambient loops are passed over. Root motion is removed by the model pipeline, not at load.

- **Placement**: the entity layer gives every placed instance of a model with `actor` settings an `Actor`, which owns a position and a heading; the layer turns them into the model's matrix after the pop-up.
- **World**: a click on a creature chooses it (`bridge.actor`, a HUD with its state and the movement modes Auto, Walk, Run, Fly), a click on the ground sends it (the ground height comes from the world query, voxels or bake), Esc or the button lets it go. The camera follows it until the visitor pans (`CameraRig.onUserPan`).
- **Frames**: skeletons out of view are not animated and do not ask for frames; a travelling creature keeps frames coming. This also fixes every animated model drawing frames while off screen.
- **Settings**: asset.json `actor` defaults, map `modelSettings[id].actor` overrides, applied live in the editor.

## Editor

The editor is at `/editor` (`/editor?map=<id>`) and exists only in development.

**Kept out of production by construction.** Its page is `app/editor/page.dev.tsx` and its endpoints are `app/api/editor/**/route.dev.ts`. `next.config.ts` adds `dev.tsx` and `dev.ts` to `pageExtensions` only when `NODE_ENV` is not `production`, so in a production build those files are not routes, and nothing else imports `components/editor` or `lib/editor/editor-viewport.ts`. Checked after `pnpm build`: the route list has no `/editor` or `/api/editor`, and the compiled output contains no editor strings. The endpoints also refuse to run in a production process (`devOnly` in `lib/editor/server/editor-api.ts`).

**Three parts, same separation as the visitor runtime.**

| Part | File | Role |
|---|---|---|
| Document and history | `lib/editor/editor-session.ts` | Owns the voxel world, entities and map fields. Every edit is a command that stores only what it changed; one undo stack for everything; strokes and drags are grouped into one step. Emits which chunks and entities changed. |
| Tools | `lib/editor/editor-tools.ts` | The original editor's tools as pure functions: what each targets, which cells a brush changes, the flatten preview, the surface plates. Unit-tested. |
| Viewport | `lib/editor/editor-viewport.ts` | three.js, no React. Picks, shows the original's previews, applies tools to the session, rebuilds only what the session reported, once per frame. Renders on demand. |
| UI | `components/editor/MapEditorToolbar.tsx`, `editor-shell.css` | The original editor's interface and styles, carried over: menu bar, workspaces, tool rail, palettes with shape and prefab previews, outliner, inspector, bottom dock, status bar, command search, shortcuts, resizable docks. Presentational: `EditorApp.tsx` hands it state and actions. |

**Previews, as in the original.** Add shows the block's ghost in its real shape, rotation and material colour. Brush tools outline the top faces of the cells they act on, following slopes and slabs (one translucent mesh and one line mesh for the whole brush, coloured per tool). Flatten colours each column by what will happen to it. Erase and Clear show whole-cell boxes. Place shows a translucent copy of the object. Area fill shows its rectangle while the button is held. Grid lines and the neutral terrain colour are a define in the terrain shader, compiled only for the editor, instead of the original's extra line geometry per chunk.

**What does not touch React.** Pointer moves never do: the viewport recomputes the preview only when the hovered cell changes, and reports that cell to a small store read only by the status bar and two readouts. A brush stroke re-renders nothing after its first step: the selected cell is reported when the stroke ends, history state only when it changes. The compass is written to the DOM from the viewport.

**Saving.** `PUT /api/editor/maps/<id>` validates and writes `maps/<id>/map.json` through `lib/maps/map-store.ts`. The editor validates first (including content references) and refuses to save an invalid map. New Map and Duplicate Map write to disk at once and open the new map; they are not part of the undo history.

**Baking from the editor.** **Bake Map** saves if needed and writes `maps/<id>/baked` through `POST /api/editor/maps/<id>/bake` (the same code as `pnpm bake`); the status next to it says whether the bake matches the map. **Show Baked** bakes the map as it is in the editor, unsaved edits included, in a worker, and shows the result without writing anything; tools are off in that view, and any edit returns to the voxels.

**Cost of an edit** (development build, the 192×192 default map, RTX 2060, camera from above; brushes up to 9 as in the original):

| Operation | Result |
|---|---|
| Hover across 24 columns (120 pointer moves) | 24 preview rebuilds, 28 small React commits (status bar), 0 long tasks |
| Raise stroke across 24 columns, brush 1 / 5 / 9 | median frame 1.2–2.2 ms, slowest 14–31 ms (one 79 ms first-stroke frame in one run), 0 long tasks |
| Paint stroke, brush 9 | median 2.2 ms, slowest 29 ms |
| Flatten stroke, brush 9 | median 2.6 ms, slowest 33 ms |
| Zone paint stroke, brush 9 | no terrain rebuilds, median 1.8 ms, slowest 39 ms |
| Undo of any of the above | 0.2–1.3 ms |

Before the stroke fixes in this step, every brush step re-rendered the whole interface (56–73 commits per stroke, up to 13 long tasks).

Rebuilding one terrain chunk costs 2–4 ms. It was 13–25 ms when the editor was first measured: the mesher rebuilt each shape's face list for every cell and neighbour, looked shape ids up with a linear search, and filled twelve vertex attributes nobody reads. It now caches faces per (shape, rotation, state), reads the world's arrays directly and has a `renderOnly` mode. The same change shortens the visitor's world build.

Known limits: entities are re-instanced as a whole when any entity changes (fine for hundreds, not for tens of thousands); there is no on-canvas transform gizmo (the original's TransformControls): objects move and turn by dragging with Select, in the mode chosen in the left dock.

## Performance: findings and results

Measured in Chromium with a real GPU (RTX 2060), 1440×900. "Before" is commit `e438235`.

| Finding | Before | After stage 1 |
|---|---|---|
| World state lived in React: 80 pointer moves over the scene (editor) | 45 panel publishes, 52 toolbar renders, 3 828 ms script | 0 React renders; hover text is written to the DOM directly (stage 4) |
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

### Built-in measurement: the perf badge

The world shows the original's FPS badge at the bottom left (`components/world/PerfHud.tsx`); a click opens the details. It is there in production too, as in the original.

| Field | What it is | Source |
|---|---|---|
| FPS | Frames the engine drew in the last second. Rendering is on demand, so a still world reads **idle**, not 60 | `FrameRecorder` (`lib/perf/frame-recorder.ts`), filled by the engine every frame |
| Median / p95 / worst frame | Intervals between consecutive frames in the last second: what the visitor sees | same |
| Engine CPU | Mean / worst time of the engine's update + render inside a frame | same |
| Draw calls, triangles | Of the last frame drawn | `renderer.info` |
| UI (5 s), UI worst | Updates of the world's React UI in the last 5 s, their total time from render to committed DOM, and the slowest | `useUiWork()` (`lib/perf/ui-work.ts`) in every component that reads the bridge |

- **Cost.** Recording a frame is three typed-array writes. The badge reads twice a second on a timer (0.015 ms per read) and writes text into the DOM without React; it never asks the engine for a frame (tested: 0 frames drawn while it refreshes over an idle world).
- **Bridge rule 3 holds.** Per-frame data never enters the bridge's state; the engine puts its recorder in `bridge.diagnostics`, a plain slot that readers poll.
- **UI time** is measured from the start of a component's render to its layout effect, which works in production builds (React's Profiler does not). The browser's own style and layout work afterwards is not included.
- The Next.js development indicator moved to the bottom right to make room.
- The badge is mounted on the landing page too (at 1 % opacity like the rest of the world's controls, see below) and only refreshes in the world. Numbers are formatted without `toLocaleString`: its first call loads the browser's locale data, 20-70 ms.

### Performance regression test

`pnpm perf` (`scripts/production-tests.ts`, `perf/world.perf.ts`) builds for production with `NEXT_PUBLIC_WORLD_PROBE=1` (the only difference: the test may read the engine's counters), serves it on port 3218, measures it in Chromium with the real GPU and compares every number with `perf/budgets.json`. One run takes about 1.5 minutes. It skips itself on a software renderer, where frame times mean nothing.

| Scenario | What is checked |
|---|---|
| Load (3 fresh pages) | time to a warmed-up world, main-thread blocking, warm-up created nothing afterwards |
| Entry (3 runs, median) | worst frame, p95, frames over 33 ms, long tasks, shaders compiled (must be 0) |
| Pan, 3 s | p95 and worst frame, long tasks, engine CPU per frame, draw calls, triangles |
| Idle, 2 s | frames drawn (must be 0) |
| Hover across an object | frames, picks and React updates per 80 pointer moves |
| Dig, CPU slowed 4× | blocks dug, worst frame, frames over 50 ms, long tasks, shaders compiled |

- **Two kinds of budget.** Counts that do not depend on the machine (draw calls, shaders compiled, idle frames, React updates per interaction) are exact. Times were set from runs on the reference machine (RTX 2060) with about one dropped frame of headroom; `pnpm perf --update` prints the measurements without failing, for other hardware.
- **Frame times are what the visitor sees**: intervals between `requestAnimationFrame` callbacks in the page, so React, style and layout work counts as well as the engine's.
- **The server is started and stopped by the script**, not by Playwright: on Windows a server started through a shell and pnpm outlived the run and kept the port.
- **Proof it works.** Putting the `toLocaleString` back into the badge fails the run: `entry.maxFrameMs` 50.1 (budget 34) and `entry.longTasks` 1 (budget 0).
- Kept from the original benchmark: `lib/perf/frame-statistics.ts` (percentiles, slow-frame counts). Its run comparison, renderer sampling and environment code belonged to the removed in-app benchmark page and were deleted.

### Entry without a hitch (step 6c)

The test found four causes of the 50-220 ms frames at the start and end of the entry, all fixed:

| Cause | Fix |
|---|---|
| Entering hides the page's scrollbar; on Windows the canvas widened (1425 → 1440 px) and reallocated its drawing buffer | The world layer is always `100vw` wide |
| The loader's bottom padding was removed when entering, laying out the whole landing page again | The padding stays while the world is up |
| The first raster of the world's controls (blurred shadows) cost 55-180 ms in the GPU process | They are drawn at 1 % opacity on the landing page instead of `visibility: hidden` (which skips raster); the layer stays inert, aria-hidden and ignores the pointer. The landing page has `will-change` for its fade while the loader waits |
| The perf badge's first `toLocaleString` at the end of the entry, 20-70 ms | A plain formatter |

Result on the production build: worst entry frame 16.8 ms (median of 3; was 33-200 ms), no long tasks, no shaders compiled.


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
- (Resolved in stage 5: visitors download the 91 KB baked world instead of the 344 KB map chunk.)
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

### Stage 4: editor

- `/editor`: development-only page and endpoints (`.dev.tsx` / `.dev.ts` page extensions), absent from the production build.
- Session with one diff-based undo stack; viewport with tools for placing, removing and painting blocks (material, shape, facing), raising and lowering terrain with a sized brush, painting zones, and placing, selecting (multi), moving, rotating, scaling, duplicating and deleting objects.
- Inspector: object fields and content assignment; zones with content or a mini-game; map name, playable area, environment; validation.
- Map manager: create, duplicate, rename, delete, default map. Saving writes `maps/<id>/map.json`.
- Surface mesher made 3–6× faster (see Editor above).
- Removed unused pre-rebuild editor modules (command palette, layout store, counters, map presets, navigation authoring).
- e2e (8 tests) on scratch maps that are created and deleted through the editor's API; they run after the site tests because saving a map reloads site pages in development.
- Not in this stage: baking and its preview toggle (stage 5), model library with thumbnails (stage 6).
- Later fix: saving, renaming or baking writes under `maps/`, which reloads site pages in development.

### Stage 5: baking

The first bake smoothed the terrain (density, blur, Surface Nets, simplification); restoration step 5 replaced it with a bake that keeps the terrain exactly (see below).

### Stage 6: model pipeline

- `assets/models/<id>/` as the single source for models; `pnpm assets` (run by `dev` and `build`) optimises them and writes a manifest with sizes.
- Runtime model library; static models instanced, animated ones cloned; placeholder for missing models; `replacesPrefabs`.
- Map entity type `model` (`assetReference` names the model); validation requires the reference.
- Editor: one object picker for models and prefabs with browser-rendered thumbnails, sizes and triangle counts, variants, "Rescan models".
- Two sample assets: a static crate and the animated test model (moved from `public/models`).
- `/map/<id>` now resolves maps created after the server started.
- Tests: 5 unit tests (metadata, pipeline on a temporary folder, library), 1 editor e2e test.
- New dev dependencies: @gltf-transform/core, functions, extensions (replacing the unused CLI package).

### Restoration, step 2: the original look on the new engine

- Terrain textures, the original terrain shader, lighting, background and flat-coloured placeholders are back, on the worker-built, on-demand renderer.
- Texture array with mipmaps and packed vertex data (see Terrain look).
- Visitors get voxels again; the smoothing bake is no longer used live and its committed output is gone.
- The editor shows the same textured terrain; the main-thread mesher is warmed while the editor is idle so the first stroke does not hitch.
- Environment: lights and background are fixed to the original look; time of day only drives a uniform for now.
- Checked against the original running from `main`: the same textures and shading at the same zoom. Still different: the zone legend, the animated character and water.
- The visitor's camera is the original's again: low angle, close, free to turn and tilt (see Engine). Heaviest view (lowest angle, farthest): 98 draw calls, 99 000 triangles, no frame over 16.8 ms while turning in the measured run.

### Restoration, step 3: loader, wave and pop

- The loader is back at the bottom of the landing page, live: the platform at the centre of the world and its crystal, drawn by the engine over the page.
- A click plays the original entry: focus on the platform, terrain growing out of it in a wave while the camera swings out and settles, objects popping up. Same paths, timings and curves as the original.
- My button and zoom-in approach are gone.
- Kept from the new engine: no geometry built or swapped during the entry (uniforms only), everything compiled and rehearsed in warm-up, on-demand rendering once the camera has arrived, one draw call per object batch.

### Restoration, step 4: the original editor on the new core

- The original editor's interface is back, carried over with its styles: menu bar, workspaces, tool rail, palettes with shape and prefab previews, outliner, inspector, reports, status bar, command search, shortcuts, resizable and collapsible docks, clean preview, compass with angle lock and view reset.
- The original's tools (Paint, Add Block, Erase, Raise, Lower, Flatten, Clear, zone Paint / Replace / Erase / Area Fill, Place, Marker, navigation nodes) and previews (block ghost, surface plates, flatten colours, translucent objects, grid lines).
- Removed with water: the Liquid workspace. Removed as obsolete: the renderer switch. Replaced: local drafts by map files.
- Kept from the new core: one diff-based undo history, saving to map files, rebuilds in proportion to the edit, previews rebuilt per hovered cell rather than per pointer move, no React work during a stroke, the editor absent from production, models from the asset pipeline (now in the object palette), content and mini-game settings for objects and zones (now in the original's inspector and zone panel), bake controls (now in the Map workspace).
- My editor interface (`ToolPanel`, `InspectorPanel`, `MapsDialog`) is gone.

### Restoration, step 5: a bake that keeps the terrain

- The bake stores which faces of which cells are visible; the browser writes exactly those faces with the live mesher's own code. Same shapes, textures and reveal data, byte for byte (tested), so the entry wave plays over baked terrain with no swap.
- Tiles of 4 × 4 chunks (10 meshes instead of 144), the loader platform as its own small mesh, mini-game zones as live voxels.
- The mesher no longer draws the underside of the world's lowest layer: 42 % fewer vertices on the default map, for voxels and bakes alike.
- Removed: the smoothing mesher, the simplifier step and the flat-shaded baked material.
- Visitors still get voxels until the bake is approved (`SERVE_BAKED_WORLDS=1`); `?world=baked` shows it in development.

### Restoration, step 6a: the dig mini-game

- Mini-game framework: `MinigameDefinition` + registry (`lib/minigames/`), engine host (`lib/engine/minigame-host.ts`), HUD in `WorldLayer.tsx`, `leave-minigame` command.
- One game, Dig ("Mine", zone 11 on the default map): click a block to break it; stone sometimes hides ore. Works on voxels and on the bake (the zone stays voxels there).
- Tests: unit tests for the game and registry; e2e for entering from the icon, digging, Escape and the Leave button, on voxels and on the bake.

### Restoration, step 6b: the perf badge

- The original's bottom-left FPS badge, now with details: frame time median / p95 / worst, engine CPU per frame, draw calls, triangles, and the cost of the world's React UI.
- Engine `FrameRecorder` (ring buffer) and `useUiWork()` meter (`lib/perf/`); readers poll `bridge.diagnostics`.
- Tests: unit tests for the recorder and the meter; e2e for idle, panning and the details.

### Restoration, step 6c: performance regression test

- `pnpm perf`: production build, real GPU, 25 budgets in `perf/budgets.json` covering load, entry, pan, idle, hover and digging with the CPU slowed 4×. Shown to fail when a known regression is put back.
- The entry-start and entry-end hitches are gone (worst entry frame 16.8 ms).
- `lib/benchmark` reduced to the frame statistics the test uses (`lib/perf/frame-statistics.ts`).

### Style-lab port, point 2: wind

- Global wind with presets in the map, per-model response in `asset.json` and the map, GPU sway on instanced batches, frames only while wind blows in view, reduced motion respected. Editor panels for all of it, debug views included.
- The model pipeline now keeps the attributes asset.json asks for: gltf-transform's `prune` dropped `COLOR_1` before.

### Style-lab port, point 3: toon, outlines, lighting, shadows

- Toon shading with hatching, pipeline-computed outlines (pixels or world units, scale per model), contact patches, sun and sky light with the lab preset, view-following shadow maps received by the terrain. Every lab control in the editor, plus shadow on/off, strength and map size.
- The perf test holds the wind still for its on-demand checks and measures wind separately.

### Style-lab port, point 4: scatter

- The Scene Lab's "Multiple" placement as a mode of the Place tool (`lib/editor/scatter.ts`): count, radius, minimum spacing, seed (same seed, same scatter), random rotation and scale range, ground only, one undo step; a ring previews the area; Clear all removes every instance of the chosen object. The lab's individual-versus-instanced choice does not apply: the engine always instances models.

### Style-lab port, point 5: the crow as a creature

- The lab's crow controller on the engine (`Actor`), chosen and sent in the world with a following camera, its motion and clip preview in the editor. Animated models animate only in view.
- Editor shortcuts (Ctrl+S, Ctrl+Z) work after using a slider: both copies of the "is the visitor typing" check now leave sliders and checkboxes out.

### Style-lab port, point 6: the engine stays free of React

- `eslint.config.mjs` forbids React, Next.js, zustand's React entry, `@/components/*` and the two React hooks in `lib/` (the hooks themselves and the design system's fonts excepted). `lib/engine/EngineBoundary.test.ts` checks that the rule is there and bites. The monorepo plan's package-boundary checks are not ported: this repository is one app.
