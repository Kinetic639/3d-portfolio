# Developer guide

Step-by-step recipes. Each section is filled in when the feature it describes exists; sections marked *not available yet* name the stage that delivers them. For the reasoning behind the structure see [architecture.md](architecture.md).

## Everyday commands

```bash
pnpm dev          # development server
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm test         # unit tests (Vitest, node environment)
pnpm e2e          # end-to-end tests (Playwright, starts a dev server)
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

   `scale` converts the model's units to blocks. `anchor` is the point that sits at an instance's position: the centre of the base (`bottom`) or the centre of the model. `animation` names a clip to loop. `replacesPrefabs` draws every placed instance of those procedural prefabs with this model.
3. Run `pnpm assets` (or restart `pnpm dev`, or press **Rescan models** in the editor). The table it prints shows the size before and after, triangles and textures; errors name the asset and the problem.
4. In the editor, choose the Object tool: the model is under **Models** with its picture and size. Place it like any object.

To replace a model, overwrite its file and run `pnpm assets`: every placed instance changes. Do not rename the folder once maps use it; the folder name is the id maps store.

To add an object type that is not a model, add a procedural prefab to `lib/prefabs/prefab-library.ts`; it appears in the same picker.

## Bake a map

```bash
pnpm bake            # the default map
pnpm bake my-map     # one or more maps by id
pnpm bake --all
pnpm bake --check    # bakes nothing; exits 1 if a bake is missing or out of date
```

Or press **Bake** in the editor. Either way the result is `maps/<id>/baked/` (`world.bin`, `bake.json`); commit it with the map. The site uses a bake only while it matches the map file; after any saved change, bake again. `pnpm test` fails if the default map's bake is out of date.

To look at the result before saving anything, use the **Voxels / Baked** switch in the editor.

To change how baked terrain looks:

- shape: `DEFAULT_BAKE_OPTIONS` in `lib/bake/bake-map.ts` (`smoothing`, allowed simplification error for the playable area and the backdrop, width of the full-quality ring);
- shading and material: the one material in `lib/engine/baked-terrain.ts`;
- colours: block colours in `lib/world/block-registry.ts`.

Changing the file layout means raising `BAKE_FORMAT_VERSION` in `lib/bake/baked-format.ts`; older bakes then count as out of date and are re-baked.

## Use the editor

`pnpm dev`, then open http://localhost:3000/editor (or `/editor?map=<id>`). It is not part of a production build. The interface is the original editor's: a menu bar, workspaces as tabs (Map, Terrain, Objects, Zones, Navigation, Review), the tools of the active workspace in the rail on the left, their settings in the left dock, the scene outliner and inspector on the right, reports at the bottom, a status bar.

| Action | How |
|---|---|
| Move the view | Right or middle drag pans, Ctrl + right drag turns and tilts, wheel zooms; the compass faces a direction, the lock keeps the tilt, the arrow resets the view |
| Terrain | **Terrain** tab. Paint, Add Block (the block's ghost shows where it goes, in its real shape), Erase, Raise, Lower, Flatten (green columns rise, red ones drop), Clear. Brush shape and size in the left dock. Add and Erase act on click; hold **Ctrl** to repeat them while dragging. **Q** / **E** turn the shape, **R** / **Shift+R** tilt it, **F** flips a slab |
| Objects | **Objects** tab. Pick a prefab or a model (models from `assets/models`, with a picture rendered from the model); Place shows a translucent copy where it will stand. **Select** to pick, Shift adds, drag moves (Alt: no snapping); **Rotate** in the left dock turns by dragging. **Ctrl+D** duplicates, **Del** deletes. The inspector sets which content an object opens |
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

## Add an engine system (wind, weather, time of day)

1. Put shared values in `Environment.uniforms` (`lib/engine/environment.ts`) and update them in `Environment.update` or a setter.
2. In a custom material, spread `environment.uniforms` into the material's uniforms and read them in the shader.
3. Drive effects through uniform values and light parameters, not through shader `#define` variants, so changing the weather never compiles a shader during play.
4. If the effect animates continuously, the engine must keep rendering while it is active; request frames with `engine.invalidate()`.

## Not available yet

| Recipe | Stage |
|---|---|
| Replace or add a material, shader or post-processing effect | 6 |
| Add a mini-game | 8 |
