# Developer guide

Step-by-step recipes. Each section is filled in when the feature it describes exists; sections marked *not available yet* name the stage that delivers them. For the reasoning behind the structure see [architecture.md](architecture.md).

## Everyday commands

```bash
pnpm dev          # development server
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm test         # unit tests (Vitest, node environment)
pnpm e2e          # end-to-end tests (Playwright, starts a dev server)
pnpm perf         # performance regression test on a production build (about 1.5 min, needs a GPU)
pnpm build        # production build
```

Use the pnpm version that created `node_modules` (pnpm 11). An older global pnpm can run scripts but cannot add packages.

## Change portfolio content

All copy is in `content/portfolio.ts`.

1. Edit or add an item in `items`. Keep `id` stable once a map references it and `slug` stable once the URL is public.
2. Run `pnpm test`. `lib/content/Content.test.ts` checks ids, slugs and URL uniqueness; `lib/maps/MapDefinition.test.ts` checks that the default map references only existing content.

## Add a content kind

1. Add the kind to `MapContentType` in `lib/maps/map-definition.ts`.
2. Add a variant to `ContentItem` in `lib/content/content.ts` (extend `ContentBase`).
3. Add a row to `CONTENT_SECTIONS` with its URL segment; set `singleton: true` if there is exactly one item.
4. Add items to `content/portfolio.ts`.

Attaching content to an object or zone: set `contentReference: { contentType, contentId }` on a map entity, marker or zone. In the editor: select objects and choose **Content** in the inspector, or pick a zone in the **Zones** tab.

Anything with a resolvable `contentReference` becomes clickable automatically: it gets an icon, a hover label and opens the item at its URL. A reference to content that does not exist is ignored at runtime and reported by map validation.

To change how a kind looks in the panel and on its page, edit `components/content/ContentArticle.tsx`.

## Migrate an old map file

```bash
pnpm migrate:map path/to/old-map.json --id my-map --name "My map" --backdrop 64
```

Accepts schema v1–v4, writes `maps/my-map/map.json` in v5. `--backdrop N` adds N cells of flat scenery on every side and keeps the original extent as the playable area. Dropped on migration: the fluid layer, `runtimeMode`, `blockSize`.

## Preview a map and choose the default

- Any map in `maps/` is reachable at `/map/<id>`.
- The default map shown on `/` is `defaultMapId` in `maps/index.json`. Commit and deploy to change it for visitors. In the editor: **Maps → Make default**.

## Add a model

1. Create `assets/models/<id>/` (lowercase letters, digits, dashes). Put the model there as `model.glb` (or `model.gltf` with its files).
2. Add `asset.json` next to it. Only `name` and `category` are required:

   ```json
   {
     "name": "Oak",
     "category": "nature",
     "scale": 1,
     "rotationY": 0,
     "anchor": "bottom",
     "collision": "blocking",
     "variants": [
       { "id": "standard", "label": "Standard" },
       { "id": "large", "label": "Large", "scale": 1.5 },
       { "id": "autumn", "label": "Autumn", "tint": "#d98a3a" }
     ],
     "animation": "Idle",
     "replacesPrefabs": ["deciduous-tree"]
   }
   ```

   `scale` converts the model's units to blocks. `anchor` is the point that sits at an instance's position: the centre of the base (`bottom`) or the centre of the model. `animation` names a clip to loop. `replacesPrefabs` draws every placed instance of those procedural prefabs with this model. `category` `creatures` is for animals and animated characters (shown as **animals & characters**).

   Optional fields that make the file smaller or the model cheaper to draw:

   | Field | Use |
   |---|---|
   | `attributes` | Extra vertex attributes to keep, e.g. `["COLOR_0", "COLOR_1"]` when a shader reads them (the pine's wind weights). Only position, normal, the first UV set, joints and weights are kept otherwise; exported models often carry several unused UV and colour sets. |
   | `alpha` | `"cutout"` draws transparent materials alpha-tested (opaque, no sorting): right for leaves and feathers. `alphaCutoff` sets the threshold (default 0.5). `"opaque"` ignores alpha. |
   | `animations` | Clips to keep. Long baked clips are usually most of a rigged model's size (the crow: 5.6 MB with its three 20-70 s flight loops, 311 KB without). |
   | `rootMotionNode` | Node whose translation is removed from every clip, so the model moves only where the game moves it. |

   Every model's animations are also resampled (redundant keyframes dropped).
3. Run `pnpm assets` (or restart `pnpm dev`, or press **Rescan models** in the editor). The table it prints shows the size before and after, triangles and textures; errors name the asset and the problem.
4. In the editor, choose the Object tool: the model is listed first under its category (and under **Models**) with its picture and size. Place it like any object.

To replace a model, overwrite its file and run `pnpm assets`: every placed instance changes. Do not rename the folder once maps use it; the folder name is the id maps store.

To add an object type that is not a model, add a procedural prefab to `lib/prefabs/prefab-library.ts`; it appears in the same picker.

## Bake a map

```bash
pnpm bake            # the default map
pnpm bake my-map     # one or more maps by id
pnpm bake --all
pnpm bake --check    # bakes nothing; exits 1 if a bake is missing or out of date
```

Or **Bake Map** in the editor's Map workspace. Either way the result is `maps/<id>/baked/` (`world.bin`, `bake.json`); commit it with the map. A bake is used only while it matches the map file; after any saved change, bake again.

The bake changes nothing about how the terrain looks: it is the same faces as the voxels. To compare, **Show Baked** in the editor bakes the current state and shows it, and in development `/?world=baked` loads the committed bake on the site (`/?world=voxels` the voxels).

Visitors get bakes when the site is built with `SERVE_BAKED_WORLDS=1` (set it in the hosting environment); without it they get the voxels.

Changing the file layout means raising `BAKE_FORMAT_VERSION` in `lib/bake/baked-format.ts`; older bakes then count as out of date.

## Use the editor

`pnpm dev`, then open http://localhost:3000/editor (or `/editor?map=<id>`). It is not part of a production build. The interface is the original editor's: a menu bar, workspaces as tabs (Map, Terrain, Objects, Zones, Navigation, Review), the tools of the active workspace in the rail on the left, their settings in the left dock, the scene outliner and inspector on the right, reports at the bottom, a status bar.

| Action | How |
|---|---|
| Move the view | Right or middle drag pans, Ctrl + right drag turns and tilts, wheel zooms; the compass faces a direction, the lock keeps the tilt, the arrow resets the view |
| Terrain | **Terrain** tab. Paint, Add Block (the block's ghost shows where it goes, in its real shape), Erase, Raise, Lower, Flatten (green columns rise, red ones drop), Clear. Brush shape and size in the left dock. Add and Erase act on click; hold **Ctrl** to repeat them while dragging. **Q** / **E** turn the shape, **R** / **Shift+R** tilt it, **F** flips a slab |
| Objects | **Objects** tab. Pick a prefab or a model (models from `assets/models`, with a picture rendered from the model); Place shows a translucent copy where it will stand. **Select** to pick, Shift adds, drag moves (Alt: no snapping); **Rotate** in the left dock turns by dragging. **Ctrl+D** duplicates, **Del** deletes. The inspector sets which content an object opens |
| Scatter | **Objects** tab, choose an object, **Scatter** section: **Scatter on click**, then count, radius, spacing, seed, random rotation and scale (min, max). Each click scatters on the ground, one undo step; **Clear all** removes every instance of the chosen object |
| Zones | **Zones** tab. New Zone, then Paint, Replace or Erase with the brush, or Area Fill (drag a rectangle). Name, colour, kind (area or mini-game) and content in the left dock |
| Navigation | **Navigation** tab. Select a cell, Place Node; Connect Latest; Create Route |
| Undo / redo | **Ctrl+Z**, **Ctrl+Y** or **Ctrl+Shift+Z**: one history for everything |
| Save | **Ctrl+S** (or the save button) writes `maps/<id>/map.json`. Validation runs first; issues are listed under Reports → Validation |
| Maps | **Map** tab: load, New Map, Duplicate Map, Import, Export, Revert; File menu: Rename |
| Bake | **Map** tab → Bake: Bake Map writes `maps/<id>/baked`; Show Baked previews a bake of the current state |
| Clean view | **Preview** (or **Shift+Space**) hides the editor and its overlays; Restore Editor brings them back. **Ctrl+P** searches commands |

View options (grid lines and their colour, hiding terrain materials, hiding objects, background colour, closest zoom) are in the View menu; mouse sensitivity in Settings. They, the dock sizes and the layers persist in the browser.

## Add a tool to the editor

1. Add its id to `EditorTool` in `lib/editor/editor-tools.ts`, with its preview colour in `TOOL_COLORS`, and say whether it acts on click (`isSingleShot`), which terrain operation it is (`brushOperation`) and which layer it edits (`toolLayer`).
2. Terrain tools need nothing else in the viewport: `applyTerrain` turns the hovered cell into mutations and passes them to the session; strokes are one undo step. Other tools: handle them in `applyClick` in `lib/editor/editor-viewport.ts`, and change the map only through `EditorSession` so undo works.
3. The preview comes from `previewCells` and `previewStyle` (cube or surface plate); add a case to `buildPreview` only for something new.
4. Add the tool to `WORKSPACE_TOOLS` and `TOOL_LABELS` in `components/editor/MapEditorToolbar.tsx`, and its settings to the palette there.
5. Add a test to `lib/editor/EditorTools.test.ts` and `e2e/editor.spec.ts`.

## Add a mini-game

1. Create `lib/minigames/<id>.ts` exporting a `MinigameDefinition` (types and comments in `lib/minigames/minigame-types.ts`; `dig.ts` is the example):
   - `id`, `title` (icon and HUD), `hint` (one line in the HUD), `description` (the editor's list).
   - `start(context)` returns a session: `target(cell)` returns the cell a click would act on, or null (the engine outlines it); `act(cell)` does the click, changing terrain only through `context.terrain.removeBlock`; `counters()` returns the HUD's numbers by label.
   - Keep the session's state inside `start`: every visit starts fresh and nothing is saved.
2. Add it to `MINIGAMES` in `lib/minigames/registry.ts`.
3. In the editor's **Zones** tab, paint a zone and set **Kind** to "Mini-game: <description>". Save, and re-bake the map (`pnpm bake`) so the bake keeps the zone as voxels.
4. Test the game's rules with a fake `MinigameContext` (see `lib/minigames/Minigames.test.ts`), and copy one case of `e2e/minigame.spec.ts` for entering and leaving.

The engine handles picking, the outline, remeshing, the burst, the camera, the HUD and Escape; a game needs none of it. A game that must add cells, not only remove them, needs a matching `placeBlock` in `MinigameTerrain` and `MinigameHost`.

## Measure performance

- In the world, click the **FPS** badge (bottom left) for frame times, engine CPU, draw calls, triangles and the UI's cost. "idle" means nothing is being drawn, which is how a still world should read.
- A new component in the world UI that reads the bridge calls `useUiWork()` (`lib/perf/ui-work.ts`) as its first hook, so its updates count in "UI".
- `pnpm perf` before merging anything that touches the engine, the world UI or the landing page. A failure names the metric and its budget; if the change is intended, re-measure with `pnpm perf --update` and edit `perf/budgets.json` with the reason.
- Something the engine animates must still show up as frames in the badge only while it moves; if it reads a number while nothing moves, it is asking for frames it does not need.

## Make a model sway in the wind

1. The model needs vertex data that says how much each vertex moves (0 at the base, 1 at the tips). Exported vegetation usually has it in a colour set (the pine: `COLOR_1` red), otherwise use `"height"`.
2. In its `asset.json`, keep that data and give the default response:

   ```json
   "attributes": ["COLOR_1"],
   "wind": { "sway": 0.7, "branches": 0.55, "leaves": 0.32, "stiffness": 1, "weightSource": "color_1-r" }
   ```

   `weightSource` is `color_1-r|g|b|a`, `uv-x|y`, `uv1-x|y`, `uv2-x|y` or `height`. The pipeline refuses a source the model does not have.
3. Run `pnpm assets`. Every instance of the model now sways.
4. In the editor, select an instance: **Wind response** changes the response for all instances of that model in this map (stored in the map's `modelSettings`; **Reset to model defaults** removes it). **Debug view** shows the weight, height, vertex colours or UV sets, to pick the source by eye.

The wind itself is a map setting: **Map** workspace, **Weather · Wind**: presets (calm, light breeze, windy, strong wind, storm), on/off, direction (where it blows to), strength, speed, gust strength and frequency, turbulence. A slider drag is one undo step.

Wind costs almost no CPU (the motion is in the vertex shader), but it needs continuous frames: the world redraws every frame while the wind blows and a wind-reactive model is in view, and is still otherwise. Visitors who prefer reduced motion see no wind.

## Style a model (toon, outline, contact patch, shadows)

1. In its `asset.json`, set how it is drawn by default:

   ```json
   "style": { "shading": "toon", "outline": true, "outlineScale": 0.55, "contactShadow": true, "castShadow": true }
   ```

   `shading` `"toon"` is the style lab's banded, hatched look; `"standard"` keeps the model's own material. `outline: true` makes `pnpm assets` compute the model's outline normals (about 8 KB); without them a model cannot get an outline. `outlineScale` multiplies the map's outline thickness for this model.
2. In the editor, select an instance: **Style · all <model>** overrides these for this map (shading, outline, outline scale, contact patch, shadow casting); **Reset to model defaults** removes the override.
3. The map's look is in the **Map** workspace:
   - **Lighting**: sun strength, colour and position (only the direction matters), sky light with sky and ground colours; presets **Original** and **Style lab**. Lights models; the terrain keeps its own light.
   - **Surface**: toon bands, hatch power and scale, hatching on the surface (UV) or the screen.
   - **Edges and depth**: outline thickness in pixels (default) or world units (the lab's), edge colour, contact patch darkness, and shadows: on/off, strength, bias, normal bias, map size.

Shadows are off by default (a map turns them on), follow the view, and are off for visitors on the lowest quality; the contact patch is the cheap stand-in. With 60 trees and rocks in view (RTX 2060), shadows cost about 0.3-0.5 ms of CPU per frame; the frame stays at 16.7 ms.

## Add a creature (a model you can send places)

1. The model needs clips whose names say what they are: `idle`, `walk`, `run`, `takeoff`, `fly` (and optionally `land`; without it, landing plays take-off backwards). Keep only those with `animations`, remove root motion with `rootMotionNode`, and use category `creatures`.
2. Give it motion in `asset.json` (the crow's, from the style lab):

   ```json
   "actor": { "walkSpeed": 0.75, "runSpeed": 1.65, "flightSpeed": 2.8, "flightHeight": 3, "turnSpeed": 7, "crossfade": 0.2, "groundOffset": 0, "forwardYaw": 0 }
   ```

3. In the editor, select an instance: **Actor · all <model>** changes the motion for this map and previews any clip on every instance.
4. In the world, a visitor clicks it to choose it (the camera follows), clicks the ground to send it, picks **Auto** (walk close, run further, fly far or up a step), **Walk**, **Run** or **Fly**, and lets it go with the button or Esc. Moving the view by hand stops following; **Follow** resumes.

Animated models animate, and ask for frames, only while they are in view (or travelling).

## Add an engine system (wind, weather, time of day)

Everything in `lib/` stays free of React and Next.js (`pnpm lint` enforces it): the engine runs outside React and talks to the page only through `lib/bridge`. A React hook that reads engine state belongs next to `lib/bridge/use-world-bridge.ts`.


1. Put shared values in `Environment.uniforms` (`lib/engine/environment.ts`) and update them in `Environment.update` or a setter.
2. In a custom material, spread `environment.uniforms` into the material's uniforms and read them in the shader.
3. Drive effects through uniform values and light parameters, not through shader `#define` variants, so changing the weather never compiles a shader during play.
4. If the effect animates continuously, the engine must keep rendering while it is active; request frames with `engine.invalidate()`.

## Change a material or shader, or add a post-processing effect

The rule for all three: **every shader program exists before the visitor enters.** Warm-up (`WorldEngine.warmUp`) compiles whatever is in the scene and checks that the rehearsed entry creates nothing new; a program compiled later stalls a frame for 20-100 ms.

**Terrain** (`lib/engine/terrain-material.ts`, one `ShaderMaterial` for all voxel terrain):

1. Edit `VERTEX_SHADER` / `FRAGMENT_SHADER`. Per-vertex data comes from `SurfaceEmitter` (`lib/terrain/surface-faces.ts`), which both the live mesher and the bake decoder use; a new attribute goes there, in `TerrainChunkBuffers` and in `createTerrainGeometry`. Bakes store which faces of which cells are visible, not vertices, so neither a shader nor an emitter change needs a re-bake; a change to which faces are visible (shapes, culling) does (`pnpm bake`).
2. A new uniform goes in `TerrainUniforms` and `createTerrainUniforms`; the engine sets its value in its frame (as `uTime`). Never switch `defines` at run time: each set of defines is a separate program. Editor-only drawing goes behind `EDITOR_VIEW`, which only the editor's material defines.
3. Values that change continuously need frames: call `engine.invalidate()` while they change, nothing when they do not.

**Objects** (`lib/engine/entity-meshes.ts`): model and procedural materials are three.js standard materials extended in `addInstanceEffects` through `onBeforeCompile` (pop-up and occlusion fade). Add to those string replacements rather than replacing the material. three.js caches programs by the source text of `onBeforeCompile` (its default `customProgramCacheKey`), so two materials whose hook has the same text but injects different code (through closure values) need their own `customProgramCacheKey`, or one reuses the other's program.

**A new material** (a new kind of object or effect): create it while the map loads, not on first use, and make sure the object using it is in the scene during warm-up. If it is hidden on the landing page, show it for warm-up the way `MinigameHost.showForWarmUp` does and add its objects to the upload list in `warmUpSteps`.

**Post-processing**: there is none today; the world is drawn by `this.renderer.render(this.scene, this.rig.camera)` in `WorldEngine.frame`. To add a pass:

1. Create its render target and full-screen material when the engine is constructed, size the target in `resize()`, and replace that one render call with "render the scene into the target, then draw the pass to the screen". Leave `drawLoader` alone: the landing page's loader is drawn into a scissored box on a transparent canvas.
2. Draw the pass once in `renderSync` during warm-up so its program is compiled there.
3. The world renders on demand, so the pass costs nothing while the world is still. It adds at least one draw call per drawn frame and a full-screen fill: budget it.

**Check** a change with `pnpm perf`: `entry.programsCompiled` and `dig4x.programsCompiled` must stay 0, and the frame-time and draw-call budgets show what it costs. For a visible change, compare screenshots before and after (`?world=voxels` and `?world=baked` in development).
