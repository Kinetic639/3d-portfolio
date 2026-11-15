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

`pnpm dev`, then open http://localhost:3000/editor (or `/editor?map=<id>`). It is not part of a production build.

| Action | How |
|---|---|
| Move the view | Right or middle drag, wheel to zoom, arrows / WASD when the viewport has focus, **F** frames the playable area |
| Choose a tool | Keys **1–8** or the tool buttons |
| Brush size | **[** and **]** |
| Place / remove blocks | Tool 2 / 3. Click a face; drag to continue in the same layer. **R** turns the shape |
| Paint, raise, lower | Tools 4–6. One stroke changes each column once |
| Zones | Tool 7. Add and configure zones (label, colour, content or mini-game) in the **Zones** tab |
| Objects | Tool 8 to place; tool 1 to select (Shift adds), drag to move (Alt: no snapping), **R** rotates, **Ctrl+D** duplicates, **Del** deletes; exact values in the inspector |
| Undo / redo | **Ctrl+Z**, **Ctrl+Y** or **Ctrl+Shift+Z**: one history for everything |
| Save | **Ctrl+S** writes `maps/<id>/map.json`. Validation runs first; errors are listed in the **Map** tab |
| Maps | **Maps** button: create, duplicate, rename, delete, make default |
| Bake | **Bake** writes `maps/<id>/baked`; **Voxels / Baked** previews a bake of the current state |
| See it as a visitor | **Preview as visitor** (camera limits and fog), or **Open saved map in site** for the real runtime |

## Add a tool to the editor

1. Add its id to `EditorTool` in `lib/editor/editor-viewport.ts`.
2. Terrain or zone tool: add a case to `applyTerrainTool` that turns the target cell into mutations (`createTerrainMutations`, `createZoneColumnChanges`) and passes them to the session. Strokes are already grouped into one undo step. If the tool should stay in one layer while dragging, add it where `layerY` is set for `block` and `erase`.
3. Other tools: handle them in the `pointerdown` listener the way `object` is handled, and change the map only through `EditorSession` methods so undo works.
4. Decide what the brush preview shows in `updateHover`.
5. Add the button, shortcut and hint to `TOOLS` in `components/editor/ToolPanel.tsx`, and any options the tool needs to `ToolSettings` and that panel.
6. Add a test to `e2e/editor.spec.ts`.

A new kind of edit that the session cannot express yet (not terrain cells, zone columns, entities or map fields) needs a new command kind in `EditorSession`: store what changed, apply it in both directions in `execute`, and report it in `SessionChange`.

## Add an engine system (wind, weather, time of day)

1. Put shared values in `Environment.uniforms` (`lib/engine/environment.ts`) and update them in `Environment.update` or a setter.
2. In a custom material, spread `environment.uniforms` into the material's uniforms and read them in the shader.
3. Drive effects through uniform values and light parameters, not through shader `#define` variants, so changing the weather never compiles a shader during play.
4. If the effect animates continuously, the engine must keep rendering while it is active; request frames with `engine.invalidate()`.

## Not available yet

| Recipe | Stage |
|---|---|
| Add a model or object type | 6 |
| Replace or add a material, shader or post-processing effect | 6 |
| Add a mini-game | 8 |
