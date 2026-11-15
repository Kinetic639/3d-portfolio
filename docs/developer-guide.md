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

Attaching content to an object or zone: set `contentReference: { contentType, contentId }` on a map entity, marker or zone. Editor support arrives in stage 4; until then edit the map file.

Anything with a resolvable `contentReference` becomes clickable automatically: it gets an icon, a hover label and opens the item at its URL. A reference to content that does not exist is ignored at runtime and reported by map validation.

To change how a kind looks in the panel and on its page, edit `components/content/ContentArticle.tsx`.

## Migrate an old map file

```bash
pnpm migrate:map path/to/old-map.json --id my-map --name "My map" --backdrop 64
```

Accepts schema v1–v4, writes `maps/my-map/map.json` in v5. `--backdrop N` adds N cells of flat scenery on every side and keeps the original extent as the playable area. Dropped on migration: the fluid layer, `runtimeMode`, `blockSize`.

## Preview a map and choose the default

- Any map in `maps/` is reachable at `/map/<id>`.
- The default map shown on `/` is `defaultMapId` in `maps/index.json`. Commit and deploy to change it for visitors. Editor support arrives in stage 7.

## Add an engine system (wind, weather, time of day)

1. Put shared values in `Environment.uniforms` (`lib/engine/environment.ts`) and update them in `Environment.update` or a setter.
2. In a custom material, spread `environment.uniforms` into the material's uniforms and read them in the shader.
3. Drive effects through uniform values and light parameters, not through shader `#define` variants, so changing the weather never compiles a shader during play.
4. If the effect animates continuously, the engine must keep rendering while it is active; request frames with `engine.invalidate()`.

## Not available yet

| Recipe | Stage |
|---|---|
| Add a tool to the editor | 4 |
| Bake a map | 5 |
| Add a model or object type | 6 |
| Replace or add a material, shader or post-processing effect | 5–6 |
| Set the default map from the editor | 7 |
| Add a mini-game | 8 |
