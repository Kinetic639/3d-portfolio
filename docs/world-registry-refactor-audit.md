# World Registry Refactor — Phase 1 Audit

**Status: Phase 1 (audit only). No migration has begun. No registries, persistence formats, renderers, or editor code have been changed.**

This document is the required Phase 1 deliverable: a complete per-identifier classification of every block, terrain shape, primitive, prefab archetype, prefab, and navigation/helper concept, based on tracing actual current usage (persistence, renderer, collision, editor palette, reveal, tests) rather than on how items currently happen to be grouped. All facts below were confirmed by reading the source directly or by executing the actual registries — not inferred from names.

---

## 0. Critical findings (read this before the tables)

These findings change the shape of the whole project and should inform how you sequence implementation.

1. **There is no runtime physics/collision/character-controller system in this codebase at all.** No `CharacterController`, no player rig, no proximity/trigger system. `collisionMode` (`none|blocking|walkable|trigger`) and `blocksMovement` are stored, validated, and shown in the editor, but **never read to drive any actual gameplay behavior**. The only real consumer is editor-time AABB overlap validation during placement, which treats `blocking`/`walkable`/`trigger` identically (only `none` is special-cased). This means the "collision audit" in this document is a **correctness-of-intent audit for a system that doesn't exist yet**, not a live-bug fix — nothing currently misbehaves at runtime because nothing currently reads this data at runtime. It's still worth fixing (so the data is correct when a real system is built), but it should not be prioritized as if it were fixing visible bugs today.

2. **`editor-helper`-tagged prefabs have zero enforcement today.** The string `"editor-helper"` is never checked anywhere in the render path. `EditorPlacedEntities`/`EditorPrefabEntities` — despite the `Editor*` name — are the **only** renderer for placed entities and run for every visitor once `phase === "explore"` (the normal state after the intro animation), not gated on any actual "is the map editor open" flag. Today, nothing in the shipped map data places a `navigation-anchor` or `person-scale-marker` prefab, so nothing leaks — but that's an accident of current map content, not a code guarantee. **This is a real, fixable gap, independent of the terrain/prefab reclassification**, and is one of the highest-value, lowest-risk items in this whole project.

3. **`navigation-anchor` prefabs and the real `NavigationNode` graph are two fully disconnected systems today**, exactly as suspected. Placing a "Walk Node" prefab creates only a `PlacedMapEntity` — it does not create, link to, or validate against any `NavigationNode`. There is no shared ID, no `markerId`-style foreign key, no proximity join. This confirms the duplication is real and confirms the fix direction (remove the visual-stand-in prefabs; render canonical nav data via editor-only visualization instead).

4. **The site's actual default homepage map (`portfolio-primary-flat`, `DEFAULT_AUTHORED_MAP_ID`) has zero placed entities.** Almost the entire 263-prefab catalog is currently dormant in production. The richer authored map (`portfolio-main-authored-v2`, ~51 distinct prefab ids, 120–360 instances) is only reachable via `/map/portfolio-main-authored-v2`, not the homepage — `docs/phase-5-portfolio-authored-v2.md` claims it's the default; that's doc/code drift, not current behavior. **Net effect: migration blast radius on shipped content is much smaller than the raw catalog size suggests.** The real persistence risk is user-authored draft maps saved to `localStorage` via `saveMapDraft`/`loadMapDraft`, which this audit cannot enumerate and which the migration must handle defensively.

5. **Prefab persistence has no functioning version-migration mechanism.** `prefabVersion` is stored and validated (rejects if a saved entity's version is newer than the current definition) but is **never used to select an older part-schema**. `resolvePrefabInstance` always resolves against whatever the *current* `getPrefabDefinition()` returns. Concretely: **if this refactor changes a kept archetype's parts (e.g. restructuring `board`/`zone-board` to add real text), every existing saved entity using that prefab silently re-renders under the new geometry** — there is no upgrade path today. Building a real version-gated resolution mechanism is a prerequisite for doing this refactor safely, not an optional nice-to-have.

6. **Zone data is already fully independent of the `zone-ground` block.** Confirmed: `VoxelWorld.zones` is a separate per-X/Z-column `Uint8Array`, structurally unrelated to `VoxelWorld.blocks`. `zone-tools.ts` never touches `blocks`. Removing the `zone-ground` block material loses **zero** zone-membership data — this is the one part of the user's proposed model that requires no data migration at all, only a visual-repaint of any cell currently using that block color.

7. **`boundary` and `special` blocks have no functional meaning today beyond their paint color.** No code anywhere branches on `blockId === Boundary` or `=== Special`. They're used in real bundled maps purely as decorative terrain colors (zone accent blocks, diagnostic geometry, general terrain variety). This means "move to boundary/interaction metadata" as literally specified can't preserve any *behavior* (there is none to preserve) — but it **would** change the visual color of every cell currently painted with these materials unless the new material registry keeps an equivalent color available. This needs an explicit decision (see §6).

8. **`terrain-corner` and `cut-corner` are confirmed geometrically distinct** — `cut-corner` is a full-height chamfered cube with a *constant* top surface; `terrain-corner` is a two-tier stepped block with a surface height that *varies by quadrant* (a genuine elevation transition piece). Both are correctly retained per your rule.

9. **`retaining-wall-low`, `terrain-raised-edge`, and `terrain-diagonal-bank` are not simple registry moves — they're architecture changes.** Today each of them fully *replaces* the cell's shape; `terrain-raised-edge` and `terrain-diagonal-bank` are the **sole source of that cell's walkable surface height** (which varies within the cell). Converting them into true edge-profile overlays that "attach to a cell side without replacing the underlying walkable terrain cell" (per your rule) requires the underlying cell to independently hold a normal terrain shape (e.g. `cube`) *and* a separate edge-profile attachment — that data model doesn't exist today and must be designed, not just relabeled.

10. **Signage prefabs (`board`/`zone-board` archetypes) currently render as blank colored boards with no text at all.** Text rendering is hardcoded to `primitiveType === "sign"` specifically — prefab parts never use that primitive type, and `PlacedPrefabInstance` has no `sign`-equivalent field. Every "Direction Sign"/"Noticeboard"/"Zone Entrance Sign" prefab in the catalog is, today, a mute colored panel. Your requested "shared modular sign geometry and configurable text/content data" isn't a refactor of existing behavior — it's a real feature fix.

11. **Marker rendering is a fixed, non-camera-facing cone mesh** (`THREE.ConeGeometry`, positioned/rotated from `MapMarkerDefinition.gridPosition`/`offset`/`rotationY`), not a billboard sprite. Correcting this from the earlier (incorrect) inventory-doc description.

12. **`portfolio-v2-loader-origin-surround` is placed at exact world center `(0,0)`**, spatially overlapping the four permanent loader terrain cells. `portfolio-v2-arrival-marker` is defined in the catalog but never actually placed anywhere — so today there's no *live* duplication of the loader cells, but the Loader Origin Surround prefab's placement should be re-verified once it moves to a terrain brush (see §12 in the matrix).

13. **The `platform` primitive and `sign` primitive are confirmed replaceable per your own rule.** `platform` has no behavior a scaled `box` (height 0.22, anchor offset = half-height) couldn't replicate. `sign` text-rendering is hardcoded to the primitive type rather than driven by the presence of a `sign` config object — exactly the coupling your rule asks to break.

---

## 1. Terrain shapes — 64 total

Source: `lib/voxel-shapes/shape-registry.ts:637-700`. Categories retained per your explicit list are marked "TerrainShapeRegistry (retained)"; every other row states the concrete architectural reason it can't be a pure relabel.

| ID | Key | Name | Current category | Proposed destination | Migration note |
|---|---|---|---|---|---|
| 0 | `cube` | Cube | terrain | TerrainShapeRegistry (retained) | — |
| 1 | `slab` | Slab | terrain | TerrainShapeRegistry (retained) | — |
| 2 | `stair` | Stair | transition | TerrainShapeRegistry (retained) | — |
| 3 | `slope-shallow` | Shallow Slope | transition | TerrainShapeRegistry (retained) | — |
| 4 | `slope-steep` | Steep Slope | transition | TerrainShapeRegistry (retained) | — |
| 5 | `outer-stair-corner` | Outer Stair Corner | transition | TerrainShapeRegistry (retained) | — |
| 6 | `inner-stair-corner` | Inner Stair Corner | transition | TerrainShapeRegistry (retained) | — |
| 7 | `cut-corner` | Cut Corner | terrain | TerrainShapeRegistry (retained) | — |
| 8 | `wall` | Wall | structure | StructurePieceRegistry | — |
| 9 | `beam` | Beam | structure | StructurePieceRegistry | — |
| 10 | `pillar-base` | Pillar Base | structure | StructurePieceRegistry | — |
| 11 | `pillar-middle` | Complete Pillar | structure | StructurePieceRegistry | — |
| 12 | `pillar-cap` | Pillar Cap | structure | StructurePieceRegistry | — |
| 13 | `roof-flat` | Flat Roof | roof | StructurePieceRegistry | — |
| 14 | `roof-shallow` | Shallow Roof | roof | StructurePieceRegistry | — |
| 15 | `roof-steep` | Steep Roof | roof | StructurePieceRegistry | — |
| 16 | `roof-outer-corner` | Outer Roof Corner | roof | StructurePieceRegistry | — |
| 17 | `roof-inner-corner` | Inner Roof Corner | roof | StructurePieceRegistry | — |
| 18 | `fence` | Fence | structure | Object registry (fence family) | Straight/post/corner/T/cross/gate all exist as terrain shapes today — becomes connection-aware modular fence OBJECT family; same cell-to-entity migration as above |
| 19 | `pipe-short` | Short Pipe | utility | Object/Prefab registry | Short/corner pipes: confirmed zero modular-connection logic exists today — DECISION NEEDED on pipe-short/pipe-corner vs pipe-long/pipe split |
| 20 | `pipe-long` | Long Pipe | utility | StructurePieceRegistry | Axis-spanning — editor already special-cases axis orientation UI for these (isAxisOrientedShape), suggesting modular-construction intent |
| 21 | `pipe-corner` | Pipe Corner | utility | Object/Prefab registry | Short/corner pipes: confirmed zero modular-connection logic exists today — DECISION NEEDED on pipe-short/pipe-corner vs pipe-long/pipe split |
| 22 | `water` | Water | fluid | Fluid system | Confirmed: already has a distinct render pass (materialFamily) at CHUNK granularity, not per-face — pre-existing bug risk (mixed water/land chunk misclassified) to fix during the move |
| 23 | `terrain-corner` | Terrain Corner | terrain | TerrainShapeRegistry (retained) | — |
| 24 | `roof-hollow` | Hollow Roof | roof | StructurePieceRegistry | — |
| 25 | `rubble-small` | Small Rubble | terrain | Object/Prefab registry | Architecture change: currently a single-voxel terrain SHAPE, not an entity — must become a terrain-anchored placed object (footprint/anchor/rotation), converting existing cell edits to entities during migration |
| 26 | `rubble-medium` | Medium Rubble | terrain | Object/Prefab registry | Architecture change: currently a single-voxel terrain SHAPE, not an entity — must become a terrain-anchored placed object (footprint/anchor/rotation), converting existing cell edits to entities during migration |
| 27 | `stalactite-small` | Small Stalactite | terrain | Object/Prefab registry | Architecture change: currently a single-voxel terrain SHAPE, not an entity — must become a terrain-anchored placed object (footprint/anchor/rotation), converting existing cell edits to entities during migration |
| 28 | `stalactite-large` | Large Stalactite | terrain | Object/Prefab registry | Architecture change: currently a single-voxel terrain SHAPE, not an entity — must become a terrain-anchored placed object (footprint/anchor/rotation), converting existing cell edits to entities during migration |
| 29 | `crystal-small` | Small Crystal | terrain | Object/Prefab registry | Architecture change: currently a single-voxel terrain SHAPE, not an entity — must become a terrain-anchored placed object (footprint/anchor/rotation), converting existing cell edits to entities during migration |
| 30 | `crystal-medium` | Medium Crystal | terrain | Object/Prefab registry | Architecture change: currently a single-voxel terrain SHAPE, not an entity — must become a terrain-anchored placed object (footprint/anchor/rotation), converting existing cell edits to entities during migration |
| 31 | `crystal-large` | Large Crystal | terrain | Object/Prefab registry | Architecture change: currently a single-voxel terrain SHAPE, not an entity — must become a terrain-anchored placed object (footprint/anchor/rotation), converting existing cell edits to entities during migration |
| 32 | `pipe` | Pipe | utility | StructurePieceRegistry | Axis-spanning — editor already special-cases axis orientation UI for these (isAxisOrientedShape), suggesting modular-construction intent |
| 33 | `roof` | Roof | roof | StructurePieceRegistry | — |
| 34 | `wooden-wall-full` | Wooden Wall - Full | structure | StructurePieceRegistry | — |
| 35 | `ice-chunks` | Ice Chunks | terrain | Object/Prefab registry | Architecture change: currently a single-voxel terrain SHAPE, not an entity — must become a terrain-anchored placed object (footprint/anchor/rotation), converting existing cell edits to entities during migration |
| 36 | `ice-chunks-medium` | Ice Chunks - Medium | terrain | Object/Prefab registry | Architecture change: currently a single-voxel terrain SHAPE, not an entity — must become a terrain-anchored placed object (footprint/anchor/rotation), converting existing cell edits to entities during migration |
| 37 | `icicles` | Icicles | terrain | Object/Prefab registry | Architecture change: currently a single-voxel terrain SHAPE, not an entity — must become a terrain-anchored placed object (footprint/anchor/rotation), converting existing cell edits to entities during migration |
| 38 | `icicles-large` | Large Icicles | terrain | Object/Prefab registry | Architecture change: currently a single-voxel terrain SHAPE, not an entity — must become a terrain-anchored placed object (footprint/anchor/rotation), converting existing cell edits to entities during migration |
| 39 | `stair-inverted` | Inverted Stair | transition | StructurePieceRegistry | — |
| 40 | `stair-low` | Low Terrain Steps | transition | TerrainShapeRegistry (retained) | — |
| 41 | `outer-stair-corner-inverted` | Inverted Outer Stair Corner | transition | StructurePieceRegistry | — |
| 42 | `inner-stair-corner-inverted` | Inverted Inner Stair Corner | transition | StructurePieceRegistry | — |
| 43 | `fence-post` | Fence Post | structure | Object registry (fence family) | Straight/post/corner/T/cross/gate all exist as terrain shapes today — becomes connection-aware modular fence OBJECT family; same cell-to-entity migration as above |
| 44 | `fence-corner` | Fence Corner | structure | Object registry (fence family) | Straight/post/corner/T/cross/gate all exist as terrain shapes today — becomes connection-aware modular fence OBJECT family; same cell-to-entity migration as above |
| 45 | `fence-t` | Fence T Junction | structure | Object registry (fence family) | Straight/post/corner/T/cross/gate all exist as terrain shapes today — becomes connection-aware modular fence OBJECT family; same cell-to-entity migration as above |
| 46 | `fence-cross` | Fence Cross Junction | structure | Object registry (fence family) | Straight/post/corner/T/cross/gate all exist as terrain shapes today — becomes connection-aware modular fence OBJECT family; same cell-to-entity migration as above |
| 47 | `fence-gate` | Fence Gate | structure | Object registry (fence family) | Straight/post/corner/T/cross/gate all exist as terrain shapes today — becomes connection-aware modular fence OBJECT family; same cell-to-entity migration as above |
| 48 | `retaining-wall-low` | Low Retaining Wall | structure | Terrain-edge/profile system | Confirmed: provides NO walkable surface today (EMPTY_SURFACE) — architecture change required so it attaches to a cell side without replacing the cell's own walkable shape |
| 49 | `terrain-raised-edge` | Raised Terrain Edge | terrain | Terrain-edge/profile system | Confirmed: today it IS the cell's sole shape and sole source of walkable height (varies 0/0.28 across the cell) — architecture change required to decouple from full-cell replacement |
| 50 | `terrain-diagonal-bank` | Diagonal Terrain Bank | terrain | TerrainShapeRegistry (retained) | — |
| 51 | `wooden-wall-end` | Wooden Wall - End Pole | structure | StructurePieceRegistry | — |
| 52 | `wooden-wall-corner` | Wooden Wall - Corner | structure | StructurePieceRegistry | — |
| 53 | `wooden-wall-t` | Wooden Wall - T Junction | structure | StructurePieceRegistry | — |
| 54 | `wooden-wall-cross` | Wooden Wall - Cross Junction | structure | StructurePieceRegistry | — |
| 55 | `wooden-wall-gate` | Wooden Wall - Gate | structure | StructurePieceRegistry | — |
| 56 | `stair-low-outer-corner` | Low Terrain Steps - Outer Corner | transition | TerrainShapeRegistry (retained) | — |
| 57 | `stair-low-inner-corner` | Low Terrain Steps - Inner Corner | transition | TerrainShapeRegistry (retained) | — |
| 58 | `solid-wooden-wall-full` | Solid Wooden Wall - Full | structure | StructurePieceRegistry | — |
| 59 | `solid-wooden-wall-end` | Solid Wooden Wall - End Pole | structure | StructurePieceRegistry | — |
| 60 | `solid-wooden-wall-corner` | Solid Wooden Wall - Corner | structure | StructurePieceRegistry | — |
| 61 | `solid-wooden-wall-t` | Solid Wooden Wall - T Junction | structure | StructurePieceRegistry | — |
| 62 | `solid-wooden-wall-cross` | Solid Wooden Wall - Cross Junction | structure | StructurePieceRegistry | — |
| 63 | `solid-wooden-wall-gate` | Solid Wooden Wall - Gate | structure | StructurePieceRegistry | — |

Notes on flagged rows above:

- **Pipes**: your spec gives two rules that conflict for this family ("pipes when they are modular construction/utility pieces" → StructurePieceRegistry, vs "standalone pipe pieces not belonging to a structure assembly" → Objects). The audit found **zero connection/assembly logic for any pipe shape today** — none of them snap to neighbors or form runs. The only signal distinguishing them is that the editor already shows an axis-orientation control for `pipe-long`/`pipe`/`beam` (`isAxisOrientedShape`), which is circumstantial evidence of modular-construction intent for the axis-spanning ones. Proposed split: `pipe-long`/`pipe` → StructurePieceRegistry, `pipe-short`/`pipe-corner` → Object registry. **Needs your confirmation** — this is a genuine judgment call, not a fact the code settles.
- **Fence family**: currently 6 terrain shapes (line/post/corner/T/cross/gate) map 1:1 onto exactly the 6 connection-aware variants your spec asks for as objects — this is a clean move, not a redesign.

---

## 2. Block materials — 7 total

Source: `lib/world/block-registry.ts:22-79`.

| ID | Key | Name | Proposed destination | Migration note |
|---|---|---|---|---|
| 0 | `air` | Air | Reserved empty-cell sentinel in `TerrainCell` | No data change; keep as the zero-value sentinel |
| 1 | `ground` | Ground | Semantic `terrainTypeId` | Straightforward rename/move; also becomes the fallback for removed materials (see below) |
| 2 | `path` | Path | Semantic `terrainTypeId` | Straightforward |
| 3 | `zone-ground` | Zone Ground | **Remove** | Confirmed safe — zone membership is already stored independently (`VoxelWorld.zones`, per-column). Cells currently painted with this material convert to `ground` (or the nearest real material once the material registry exists); no zone data is touched or lost |
| 4 | `boundary` | Boundary | World/editor boundary metadata **— decision needed** | No functional behavior exists to preserve (confirmed no code reads this block specially). Used today purely as a decorative color in bundled maps/presets. Options: (a) keep an equivalent-looking `materialId` in the new registry so painted maps look unchanged, or (b) accept the visual change and convert to pure metadata as literally specified. Recommend (a) for existing map compatibility, with the metadata concept layered on top as new, currently-unused capability |
| 5 | `special` | Special / Interactive | Interaction/trigger metadata **— decision needed** | Same situation as `boundary`: zero functional behavior today, purely a paint color. Same (a)/(b) choice applies |
| 6 | `water` | Water | Fluid system | Move shape+block pairing into dedicated fluid representation; preserve the 16-level `state` fill height. Fix the whole-chunk (not per-face) water/opaque classification bug as part of this move (`surface-mesher.ts:116-119` — a chunk mixing water and non-water faces is currently misclassified as fully opaque) |

### New material registry (appearance only)

A genuine `MaterialRegistry` needs to be created from scratch — no equivalent exists today (block `developmentColor` is the only "material" concept, and it's fused to the semantic block, exactly the bug your rule calls out). Proposed initial entries, informed by which dev-colors are actually used as terrain paint in bundled maps today: `grass` (replaces `ground`'s green-ish default use), `soil`, `rock`, `gravel`, `paving` (replaces `path`'s use), `sand`, `concrete`, `wood`, `metal`. Each `terrainTypeId` (`ground`, `path`, and any new semantic types) gets a **default** `materialId`, independently overridable per-cell via `TerrainCell.materialId` — this is the actual fix for "material fused to semantics."

---

## 3. Raw primitives — 6 total

Source: `lib/maps/map-entities.ts:3,77`.

| Primitive | Proposed destination | Migration note |
|---|---|---|
| `box` | Keep | — |
| `cylinder` | Keep | — |
| `sphere` | Keep | — |
| `plane` | Keep | — |
| `platform` | **Replace with scaled box** | Confirmed: no distinct behavior exists beyond a fixed-height (0.22) box with a matching half-height anchor offset (0.11) — both fully derivable from a `box` scaled `(1, 0.22, 1)`. The only thing lost is the ergonomic shorthand; can be reintroduced as an authoring-time preset, not a distinct `PrimitiveType` |
| `sign` | **Replace with box + sign/text component** | Confirmed: text rendering (`HtmlSignLabel`) is gated on `primitiveType === "sign"` specifically, not on the presence of a `sign` config object. Breaking this coupling is required groundwork for the signage-prefab text fix (§0.10) |

---

## 4. Prefab archetypes — 43 total

Source: `lib/prefabs/prefab-library.ts:126-418`. All 43 remain useful as internal geometry-composition templates; the change is which top-level registry consumes prefabs built from certain archetypes.

| Archetype | Proposed destination for prefabs built from it |
|---|---|
| `building`, `workshop-compound`, `studio-compound`, `communication-station`, `pavilion` | Prefab (complete structure) |
| `wall`, `wall-window`, `wall-door` | StructurePieceRegistry (modular wall / wall opening) |
| `gate` | StructurePieceRegistry for architectural gates/frames/wall-corners; **Object registry (fence family)** when the specific prefab is named a fence variant (the archetype is reused across both — see fence note above) |
| `platform` | Split by prefab category — architecture (foundations/roofs) → StructurePieceRegistry; roads-and-paths/infrastructure (outdoor ground platforms) → terrain brush; see full table in §6 |
| `path-section` | Terrain brush/profile |
| `round-platform` | Split by prefab — terrain brush for path junctions/plazas/lookouts; stays a kept Object for anything that's actually a prop (e.g. barrels) reusing this archetype for its geometry only |
| `steps` | Terrain brush/terrain assembly (freestanding outdoor stairs) |
| `bridge` | Prefab (multi-cell) |
| `fence` | Object registry (fence family) |
| `garden-bed` | Prefab (kept, object) — has real 3D edge geometry (4 box edges + soil platform), not flat paint; **flagged as a judgment call**, since your spec suggested terrain for "terrain-integrated garden surfaces" |
| `path-detail` | Decal system |
| `bench`, `post`, `container`, `mailbox-bank`, `tree`, `tree-wide`, `tree-columnar`, `bush`, `shrub-low`, `rock`, `rock-stack`, `desk`, `workbench-rich`, `monitor-desk`, `chair`, `screen`, `paper-stack`, `display-rack`, `landmark`, `timeline-arch`, `milestone-station`, `skill-garden-landmark` | Prefab (kept) |
| `board`, `zone-board` | Prefab (kept, signage) — internal geometry gets a shared modular sign-panel + configurable text/content data, fixing §0.10 |
| `orientation-monument` | Prefab (kept, landmark) |
| `person-scale-marker` | **Removed from runtime catalog.** Editor-only helper visualization only |
| `navigation-anchor` | **Removed from runtime catalog.** Replaced by editor-only visualization of canonical `NavigationNode`/interaction data; resolves the §0.3 duplication |


---

## 5. Full prefab catalog — 263 total, per-identifier classification

Verified by executing `BUILT_IN_PREFABS` against `CATALOG_SEEDS` directly (`npx tsx`), not by inspection. "Proposed destination" and "Migration note" apply the rules above plus your category-specific instructions; entries with no note follow the default rule for their archetype with no exception.

### architecture (40)

| ID | Name | Archetype | Collision | Proposed destination | Migration note |
|---|---|---|---|---|---|
| `portfolio-v2-foundation-square` | Portfolio V2 Foundation Square | platform | walkable | StructurePieceRegistry | StructurePieceRegistry — foundation/roof component |
| `portfolio-v2-foundation-rectangle` | Portfolio V2 Foundation Rectangle | platform | walkable | StructurePieceRegistry | StructurePieceRegistry — foundation/roof component |
| `portfolio-v2-raised-foundation` | Portfolio V2 Raised Foundation | platform | walkable | StructurePieceRegistry | StructurePieceRegistry — foundation/roof component |
| `portfolio-v2-wall-solid` | Portfolio V2 Wall Solid | wall | blocking | StructurePieceRegistry | StructurePieceRegistry — modular wall / wall opening |
| `portfolio-v2-wall-window` | Portfolio V2 Wall Window | wall-window | blocking | StructurePieceRegistry | StructurePieceRegistry — modular wall / wall opening |
| `portfolio-v2-wall-doorway` | Portfolio V2 Wall Doorway | wall-door | blocking | StructurePieceRegistry | StructurePieceRegistry — modular wall / wall opening |
| `portfolio-v2-wall-corner` | Portfolio V2 Wall Corner | gate | blocking | StructurePieceRegistry | StructurePieceRegistry — architectural gate/frame/wall-corner |
| `portfolio-v2-roof-flat` | Portfolio V2 Roof Flat | platform | walkable | StructurePieceRegistry | StructurePieceRegistry — foundation/roof component |
| `portfolio-v2-roof-stepped` | Portfolio V2 Roof Stepped | workshop-compound | blocking | Prefab (kept, architecture) | — |
| `portfolio-v2-porch` | Portfolio V2 Porch | pavilion | blocking | Prefab (kept, architecture) | — |
| `portfolio-v2-canopy` | Portfolio V2 Canopy | pavilion | blocking | Prefab (kept, architecture) | — |
| `portfolio-v2-developer-workshop` | Portfolio V2 Developer Workshop | workshop-compound | blocking | Prefab (kept, architecture) | — |
| `portfolio-v2-workshop-annex` | Portfolio V2 Workshop Annex | studio-compound | blocking | Prefab (kept, architecture) | — |
| `portfolio-v2-covered-workspace` | Portfolio V2 Covered Workspace | pavilion | blocking | Prefab (kept, architecture) | — |
| `portfolio-v2-personal-studio` | Portfolio V2 Personal Studio | studio-compound | blocking | Prefab (kept, architecture) | — |
| `portfolio-v2-studio-annex` | Portfolio V2 Studio Annex | building | blocking | Prefab (kept, architecture) | — |
| `portfolio-v2-maintenance-shelter` | Portfolio V2 Maintenance Shelter | pavilion | blocking | Prefab (kept, architecture) | — |
| `portfolio-v2-communication-building` | Portfolio V2 Communication Building | communication-station | blocking | Prefab (kept, architecture) | — |
| `portfolio-v2-contact-kiosk` | Portfolio V2 Contact Kiosk | building | blocking | Prefab (kept, architecture) | — |
| `portfolio-workshop-compound` | Portfolio Workshop Compound | workshop-compound | blocking | Prefab (kept, architecture) | — |
| `personal-studio-compound` | Personal Studio Compound | studio-compound | blocking | Prefab (kept, architecture) | — |
| `communication-station` | Communication Station | communication-station | blocking | Prefab (kept, architecture) | — |
| `wall-with-window` | Wall With Window | wall-window | blocking | StructurePieceRegistry | StructurePieceRegistry — modular wall / wall opening |
| `wall-with-doorway` | Wall With Doorway | wall-door | blocking | StructurePieceRegistry | StructurePieceRegistry — modular wall / wall opening |
| `building-mass` | Building Mass | building | blocking | Prefab (kept, architecture) | — |
| `workshop-shell` | Workshop Shell | building | blocking | Prefab (kept, architecture) | — |
| `open-pavilion` | Open Pavilion | pavilion | blocking | Prefab (kept, architecture) | — |
| `shed` | Shed | building | blocking | Prefab (kept, architecture) | — |
| `kiosk` | Kiosk | building | blocking | Prefab (kept, architecture) | — |
| `open-shelter` | Open Shelter | building | blocking | Prefab (kept, architecture) | — |
| `door-frame` | Door Frame | gate | blocking | StructurePieceRegistry | StructurePieceRegistry — architectural gate/frame/wall-corner |
| `window-frame` | Window Frame | gate | blocking | StructurePieceRegistry | StructurePieceRegistry — architectural gate/frame/wall-corner |
| `flat-roof` | Flat Roof | building | blocking | StructurePieceRegistry | StructurePieceRegistry — roof component, BUT currently built from generic 'building' box archetype, not real roof geometry (placeholder mislabeled as its final category) |
| `simple-sloped-roof` | Simple Sloped Roof | building | blocking | StructurePieceRegistry | StructurePieceRegistry — roof component, BUT currently built from generic 'building' box archetype, not real roof geometry (placeholder mislabeled as its final category) |
| `archway` | Archway | gate | blocking | StructurePieceRegistry | StructurePieceRegistry — architectural gate/frame/wall-corner |
| `entrance-gate` | Entrance Gate | gate | blocking | StructurePieceRegistry | StructurePieceRegistry — architectural gate/frame/wall-corner |
| `porch` | Porch | pavilion | blocking | Prefab (kept, architecture) | — |
| `awning` | Awning | pavilion | blocking | Prefab (kept, architecture) | — |
| `wall-segment` | Wall Segment | wall | blocking | StructurePieceRegistry | StructurePieceRegistry — modular wall / wall opening |
| `wall-corner` | Wall Corner | gate | blocking | StructurePieceRegistry | StructurePieceRegistry — architectural gate/frame/wall-corner |

### infrastructure (28)

| ID | Name | Archetype | Collision | Proposed destination | Migration note |
|---|---|---|---|---|---|
| `portfolio-v2-exterior-stair` | Portfolio V2 Exterior Stair | steps | walkable | Terrain brush/terrain assembly | Terrain brush/profile — outdoor ground surface, not an entity (freestanding outdoor stair) |
| `portfolio-v2-ramp` | Portfolio V2 Ramp | platform | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity |
| `portfolio-v2-handrail` | Portfolio V2 Handrail | fence | blocking | Prefab (kept) | — |
| `portfolio-v2-curb` | Portfolio V2 Curb | wall | blocking | StructurePieceRegistry | StructurePieceRegistry — modular wall / wall opening — DECISION NEEDED: overlaps conceptually with the terrain-edge-profile move of retaining-wall-low/terrain-raised-edge shapes; confirm whether freestanding retaining-wall/curb PREFABS stay structure pieces or fold into the terrain-edge system |
| `portfolio-v2-retaining-wall` | Portfolio V2 Retaining Wall | wall | blocking | StructurePieceRegistry | StructurePieceRegistry — modular wall / wall opening — DECISION NEEDED: overlaps conceptually with the terrain-edge-profile move of retaining-wall-low/terrain-raised-edge shapes; confirm whether freestanding retaining-wall/curb PREFABS stay structure pieces or fold into the terrain-edge system |
| `portfolio-v2-fence-straight` | Portfolio V2 Fence Straight | fence | blocking | Object registry (fence family) | Object registry — connection-aware modular fence (straight/post/corner/T/cross/gate) |
| `portfolio-v2-fence-gate` | Portfolio V2 Fence Gate | gate | blocking | Object registry (fence family) | Object registry — connection-aware modular fence (straight/post/corner/T/cross/gate) |
| `portfolio-v2-bridge-section` | Portfolio V2 Bridge Section | bridge | walkable | Prefab (kept, multi-cell) | — |
| `portfolio-v2-utility-cabinet` | Portfolio V2 Utility Cabinet | container | blocking | Prefab (kept, object) | — |
| `portfolio-v2-drainage-cover` | Portfolio V2 Drainage Cover | path-detail | none | Decal system | Decal — lightweight surface-attached visual detail |
| `portfolio-v2-cable-utility-box` | Portfolio V2 Cable Utility Box | container | blocking | Prefab (kept, object) | — |
| `portfolio-v2-timeline-railing` | Portfolio V2 Timeline Railing | fence | blocking | Prefab (kept) | — |
| `portfolio-v2-lookout-platform` | Portfolio V2 Lookout Platform | round-platform | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity |
| `portfolio-v2-radio-cabinet` | Portfolio V2 Radio Cabinet | container | blocking | Prefab (kept, object) | — |
| `square-platform` | Square Platform | platform | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity |
| `rectangular-platform` | Rectangular Platform | platform | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity |
| `circular-platform` | Circular Platform | round-platform | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity |
| `central-roundabout-base` | Central Roundabout Base | round-platform | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity |
| `bollard` | Bollard | post | blocking | Prefab (kept, street furniture) | — |
| `boundary-post` | Boundary Post | post | blocking | Prefab (kept, street furniture) | — |
| `retaining-wall` | Retaining Wall | wall | blocking | StructurePieceRegistry | StructurePieceRegistry — modular wall / wall opening — DECISION NEEDED: overlaps conceptually with the terrain-edge-profile move of retaining-wall-low/terrain-raised-edge shapes; confirm whether freestanding retaining-wall/curb PREFABS stay structure pieces or fold into the terrain-edge system |
| `steps` | Steps | steps | walkable | Terrain brush/terrain assembly | Terrain brush/profile — outdoor ground surface, not an entity (freestanding outdoor stair) |
| `ramp` | Ramp | platform | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity |
| `bridge` | Bridge | bridge | walkable | Prefab (kept, multi-cell) | — |
| `simple-footbridge` | Simple Footbridge | bridge | walkable | Prefab (kept, multi-cell) | — |
| `fence` | Fence | fence | blocking | Object registry (fence family) | Object registry — connection-aware modular fence (straight/post/corner/T/cross/gate) |
| `fence-corner` | Fence Corner | gate | blocking | Object registry (fence family) | Object registry — connection-aware modular fence (straight/post/corner/T/cross/gate) |
| `fence-gate` | Fence Gate | gate | blocking | Object registry (fence family) | Object registry — connection-aware modular fence (straight/post/corner/T/cross/gate) |

### nature (33)

| ID | Name | Archetype | Collision | Proposed destination | Migration note |
|---|---|---|---|---|---|
| `portfolio-v2-raised-garden-bed` | Portfolio V2 Raised Garden Bed | garden-bed | blocking | Prefab (kept, object) | JUDGMENT CALL: has real box-edge geometry (not flat paint) — classified as object not terrain brush; flagged for confirmation |
| `portfolio-v2-technology-garden-bed` | Portfolio V2 Technology Garden Bed | garden-bed | blocking | Prefab (kept, object) | JUDGMENT CALL: has real box-edge geometry (not flat paint) — classified as object not terrain brush; flagged for confirmation |
| `portfolio-v2-broad-canopy-tree` | Portfolio V2 Broad Canopy Tree | tree-wide | blocking | Prefab (kept, nature) | — |
| `portfolio-v2-tall-narrow-tree` | Portfolio V2 Tall Narrow Tree | tree-columnar | blocking | Prefab (kept, nature) | — |
| `portfolio-v2-ornamental-tree` | Portfolio V2 Ornamental Tree | tree | blocking | Prefab (kept, nature) | — |
| `portfolio-v2-large-shrub` | Portfolio V2 Large Shrub | bush | blocking | Prefab (kept, nature) | Collision correction: should be non-blocking (grass/flower/low shrub) |
| `portfolio-v2-low-shrub` | Portfolio V2 Low Shrub | shrub-low | blocking | Prefab (kept, nature) | Collision correction: should be non-blocking (grass/flower/low shrub) |
| `portfolio-v2-grass-cluster` | Portfolio V2 Grass Cluster | shrub-low | blocking | Prefab (kept, nature) | Collision correction: should be non-blocking (grass/flower/low shrub) |
| `portfolio-v2-flower-cluster` | Portfolio V2 Flower Cluster | shrub-low | blocking | Prefab (kept, nature) | Collision correction: should be non-blocking (grass/flower/low shrub) |
| `portfolio-v2-large-rock` | Portfolio V2 Large Rock | rock-stack | blocking | Prefab (kept, nature) | — |
| `portfolio-v2-medium-rock` | Portfolio V2 Medium Rock | rock | blocking | Prefab (kept, nature) | Collision correction: should be non-blocking (small decorative rock) |
| `portfolio-v2-small-rock-cluster` | Portfolio V2 Small Rock Cluster | rock-stack | blocking | Prefab (kept, nature) | Collision correction: should be non-blocking (small decorative rock) |
| `portfolio-v2-fallen-log` | Portfolio V2 Fallen Log | tree | blocking | Prefab (kept, nature) | — |
| `portfolio-v2-timber-stack` | Portfolio V2 Timber Stack | container | blocking | Prefab (kept, object) | — |
| `raised-garden-bed` | Raised Garden Bed | garden-bed | blocking | Prefab (kept, object) | JUDGMENT CALL: has real box-edge geometry (not flat paint) — classified as object not terrain brush; flagged for confirmation |
| `wide-canopy-tree` | Wide Canopy Tree | tree-wide | blocking | Prefab (kept, nature) | — |
| `columnar-tree` | Columnar Tree | tree-columnar | blocking | Prefab (kept, nature) | — |
| `low-shrub-cluster` | Low Shrub Cluster | shrub-low | blocking | Prefab (kept, nature) | Collision correction: should be non-blocking (grass/flower/low shrub) |
| `stacked-rock-cluster` | Stacked Rock Cluster | rock-stack | blocking | Prefab (kept, nature) | Collision correction: should be non-blocking (small decorative rock) |
| `deciduous-tree` | Deciduous Tree | tree | blocking | Prefab (kept, nature) | — |
| `conifer` | Conifer | tree | blocking | Prefab (kept, nature) | — |
| `orchard-tree` | Orchard Tree | tree | blocking | Prefab (kept, nature) | — |
| `skill-tree-placeholder` | Skill Tree Placeholder | tree | blocking | Prefab (kept, nature) | — |
| `narrow-tree` | Narrow Tree | tree | blocking | Prefab (kept, nature) | — |
| `young-tree` | Young Tree | tree | blocking | Prefab (kept, nature) | — |
| `tree-stump` | Tree Stump | tree | blocking | Prefab (kept, nature) | Geometry fix: needs stump geometry (currently upright tree composition) |
| `fallen-log` | Fallen Log | tree | blocking | Prefab (kept, nature) | Geometry fix: needs horizontal log geometry (currently upright tree composition) |
| `bush` | Bush | bush | blocking | Prefab (kept, nature) | — |
| `hedge` | Hedge | bush | blocking | Prefab (kept, nature) | — |
| `rock` | Rock | rock | blocking | Prefab (kept, nature) | Collision correction: should be non-blocking (small decorative rock) |
| `boulder-cluster` | Boulder Cluster | rock | blocking | Prefab (kept, nature) | Geometry fix: needs cluster composition (currently single rock) |
| `grass-clump` | Grass Clump | bush | blocking | Prefab (kept, nature) | Collision correction: should be non-blocking (grass/flower/low shrub) |
| `flower-patch-marker` | Flower Patch Marker | bush | blocking | Prefab (kept, nature) | Collision correction: should be non-blocking (grass/flower/low shrub) |

### navigation (12)

| ID | Name | Archetype | Collision | Proposed destination | Migration note |
|---|---|---|---|---|---|
| `portfolio-v2-scale-reference` | Portfolio V2 Scale Reference | person-scale-marker | none | REMOVE from runtime catalog → canonical navigation/editor-helper data | Editor helper (scale mannequin) — must never appear in runtime maps |
| `scale-reference-mannequin` | Scale Reference Mannequin | person-scale-marker | none | REMOVE from runtime catalog → canonical navigation/editor-helper data | Editor helper (scale mannequin) — must never appear in runtime maps |
| `walk-node` | Walk Node | navigation-anchor | none | REMOVE from runtime catalog → canonical navigation/editor-helper data | navigation-anchor archetype removed; visual stand-in replaced by editor-only visualization of the real NavigationNode/editor-helper data (currently ZERO linkage to actual nav graph — confirmed disconnected) |
| `route-junction` | Route Junction | navigation-anchor | none | REMOVE from runtime catalog → canonical navigation/editor-helper data | navigation-anchor archetype removed; visual stand-in replaced by editor-only visualization of the real NavigationNode/editor-helper data (currently ZERO linkage to actual nav graph — confirmed disconnected) |
| `wait-point` | Wait Point | navigation-anchor | none | REMOVE from runtime catalog → canonical navigation/editor-helper data | navigation-anchor archetype removed; visual stand-in replaced by editor-only visualization of the real NavigationNode/editor-helper data (currently ZERO linkage to actual nav graph — confirmed disconnected) |
| `look-at-point` | Look-at Point | navigation-anchor | none | REMOVE from runtime catalog → canonical navigation/editor-helper data | navigation-anchor archetype removed; visual stand-in replaced by editor-only visualization of the real NavigationNode/editor-helper data (currently ZERO linkage to actual nav graph — confirmed disconnected) |
| `character-spawn` | Character Spawn | navigation-anchor | none | REMOVE from runtime catalog → canonical navigation/editor-helper data | navigation-anchor archetype removed; visual stand-in replaced by editor-only visualization of the real NavigationNode/editor-helper data (currently ZERO linkage to actual nav graph — confirmed disconnected) |
| `bird-perch` | Bird Perch | navigation-anchor | none | REMOVE from runtime catalog → canonical navigation/editor-helper data | navigation-anchor archetype removed; visual stand-in replaced by editor-only visualization of the real NavigationNode/editor-helper data (currently ZERO linkage to actual nav graph — confirmed disconnected) |
| `ambient-animation-anchor` | Ambient Animation Anchor | navigation-anchor | none | REMOVE from runtime catalog → canonical navigation/editor-helper data | navigation-anchor archetype removed; visual stand-in replaced by editor-only visualization of the real NavigationNode/editor-helper data (currently ZERO linkage to actual nav graph — confirmed disconnected) |
| `flyer-start-point` | Flyer Start Point | navigation-anchor | none | REMOVE from runtime catalog → canonical navigation/editor-helper data | navigation-anchor archetype removed; visual stand-in replaced by editor-only visualization of the real NavigationNode/editor-helper data (currently ZERO linkage to actual nav graph — confirmed disconnected) |
| `flyer-end-point` | Flyer End Point | navigation-anchor | none | REMOVE from runtime catalog → canonical navigation/editor-helper data | navigation-anchor archetype removed; visual stand-in replaced by editor-only visualization of the real NavigationNode/editor-helper data (currently ZERO linkage to actual nav graph — confirmed disconnected) |
| `camera-interest-point` | Camera Interest Point | navigation-anchor | none | REMOVE from runtime catalog → canonical navigation/editor-helper data | navigation-anchor archetype removed; visual stand-in replaced by editor-only visualization of the real NavigationNode/editor-helper data (currently ZERO linkage to actual nav graph — confirmed disconnected) |

### office (24)

| ID | Name | Archetype | Collision | Proposed destination | Migration note |
|---|---|---|---|---|---|
| `portfolio-v2-storage-shelf` | Portfolio V2 Storage Shelf | display-rack | blocking | Prefab (kept, office/portfolio) | — |
| `portfolio-v2-tool-cabinet` | Portfolio V2 Tool Cabinet | container | blocking | Prefab (kept, object) | — |
| `portfolio-v2-chair` | Portfolio V2 Chair | chair | blocking | Prefab (kept, office) | — |
| `portfolio-v2-bookshelf` | Portfolio V2 Bookshelf | display-rack | blocking | Prefab (kept, office/portfolio) | — |
| `desk` | Desk | desk | blocking | Prefab (kept, office) | — |
| `worktable` | Worktable | desk | blocking | Prefab (kept, office) | — |
| `chair-proxy` | Chair Proxy | chair | blocking | Prefab (kept, office) | — |
| `office-chair-proxy` | Office Chair Proxy | chair | blocking | Prefab (kept, office) | — |
| `monitor` | Monitor | screen | blocking | Prefab (kept, office) | — |
| `laptop` | Laptop | screen | blocking | Prefab (kept, office) | — |
| `keyboard-slab` | Keyboard Slab | paper-stack | blocking | Prefab (kept, office/portfolio) | Collision correction: should be non-blocking (paper/document accessory) |
| `folder` | Folder | paper-stack | blocking | Prefab (kept, office/portfolio) | Collision correction: should be non-blocking (paper/document accessory) |
| `folder-stack` | Folder Stack | paper-stack | blocking | Prefab (kept, office/portfolio) | Collision correction: should be non-blocking (paper/document accessory) |
| `document-stack` | Document Stack | paper-stack | blocking | Prefab (kept, office/portfolio) | Collision correction: should be non-blocking (paper/document accessory) |
| `sketchbook` | Sketchbook | paper-stack | blocking | Prefab (kept, office/portfolio) | Collision correction: should be non-blocking (paper/document accessory) |
| `rolled-plan` | Rolled Plan | paper-stack | blocking | Prefab (kept, office/portfolio) | Collision correction: should be non-blocking (paper/document accessory) |
| `pinboard` | Pinboard | board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `filing-cabinet` | Filing Cabinet | container | blocking | Prefab (kept, object) | — |
| `storage-cabinet` | Storage Cabinet | container | blocking | Prefab (kept, object) | — |
| `shelf` | Shelf | container | blocking | Prefab (kept, object) | — |
| `desk-lamp` | Desk Lamp | post | blocking | Prefab (kept, street furniture) | — |
| `coffee-cup-proxy` | Coffee Cup Proxy | container | blocking | Prefab (kept, object) | — |
| `headphones-proxy` | Headphones Proxy | container | blocking | Prefab (kept, object) | — |
| `presentation-pedestal` | Presentation Pedestal | container | blocking | Prefab (kept, object) | — |

### portfolio (72)

| ID | Name | Archetype | Collision | Proposed destination | Migration note |
|---|---|---|---|---|---|
| `portfolio-v2-orientation-monument` | Portfolio V2 Orientation Monument | orientation-monument | blocking | Prefab (kept, landmark) | — |
| `portfolio-v2-loader-origin-surround` | Portfolio V2 Loader Origin Surround | round-platform | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity — FLAG: currently placed at world (0,0), spatially overlapping the 4 permanent loader terrain cells (confirmed overlap) |
| `portfolio-v2-intro-board` | Portfolio V2 Intro Board | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-info-pedestal` | Portfolio V2 Info Pedestal | container | blocking | Prefab (kept, object) | — |
| `portfolio-v2-arrival-marker` | Portfolio V2 Arrival Marker | navigation-anchor | trigger | Prefab (visible) + InteractionComponent (invisible data) | Interaction component required (contentReference/action/focusBehavior) — currently depends on invisible navigation-anchor geometry; must get real visible prefab geometry per rule "must not depend on visible navigation-anchor geometry" |
| `portfolio-v2-project-exhibition-canopy` | Portfolio V2 Project Exhibition Canopy | pavilion | blocking | Prefab (kept, architecture) | — |
| `portfolio-v2-project-display-table` | Portfolio V2 Project Display Table | workbench-rich | blocking | Prefab (kept, office/portfolio) | — |
| `portfolio-v2-workbench` | Portfolio V2 Workbench | workbench-rich | blocking | Prefab (kept, office/portfolio) | — |
| `portfolio-v2-project-board` | Portfolio V2 Project Board | display-rack | blocking | Prefab (kept, office/portfolio) | — |
| `portfolio-v2-featured-project-pedestal` | Portfolio V2 Featured Project Pedestal | landmark | blocking | Prefab (kept, portfolio) | — |
| `portfolio-v2-folder` | Portfolio V2 Folder | paper-stack | blocking | Prefab (kept, office/portfolio) | Collision correction: should be non-blocking (flyer/folder/document) |
| `portfolio-v2-document-stack` | Portfolio V2 Document Stack | paper-stack | blocking | Prefab (kept, office/portfolio) | Collision correction: should be non-blocking (flyer/folder/document) |
| `portfolio-v2-timeline-entrance-arch` | Portfolio V2 Timeline Entrance Arch | timeline-arch | blocking | Prefab (kept, portfolio) | — |
| `portfolio-v2-milestone-marker-a` | Portfolio V2 Milestone Marker A | milestone-station | blocking | Prefab (kept, portfolio) | — |
| `portfolio-v2-milestone-marker-b` | Portfolio V2 Milestone Marker B | milestone-station | blocking | Prefab (kept, portfolio) | — |
| `portfolio-v2-milestone-marker-c` | Portfolio V2 Milestone Marker C | milestone-station | blocking | Prefab (kept, portfolio) | — |
| `portfolio-v2-information-plaque` | Portfolio V2 Information Plaque | board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-career-path-marker` | Portfolio V2 Career Path Marker | navigation-anchor | trigger | Prefab (visible) + InteractionComponent (invisible data) | Interaction component required (contentReference/action/focusBehavior) — currently depends on invisible navigation-anchor geometry; must get real visible prefab geometry per rule "must not depend on visible navigation-anchor geometry" |
| `portfolio-v2-education-branch-marker` | Portfolio V2 Education Branch Marker | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-current-position-landmark` | Portfolio V2 Current Position Landmark | orientation-monument | blocking | Prefab (kept, landmark) | — |
| `portfolio-v2-exterior-workspace` | Portfolio V2 Exterior Workspace | monitor-desk | blocking | Prefab (kept, office) | — |
| `portfolio-v2-profile-pedestal` | Portfolio V2 Profile Pedestal | landmark | blocking | Prefab (kept, portfolio) | — |
| `portfolio-v2-cv-stand` | Portfolio V2 CV Stand | board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-skill-tree` | Portfolio V2 Skill Tree | skill-garden-landmark | blocking | Prefab (kept, portfolio) | — |
| `portfolio-v2-skill-stand-a` | Portfolio V2 Skill Stand A | display-rack | blocking | Prefab (kept, office/portfolio) | — |
| `portfolio-v2-skill-stand-b` | Portfolio V2 Skill Stand B | display-rack | blocking | Prefab (kept, office/portfolio) | — |
| `portfolio-v2-skill-stand-c` | Portfolio V2 Skill Stand C | display-rack | blocking | Prefab (kept, office/portfolio) | — |
| `portfolio-v2-frontend-marker` | Portfolio V2 Frontend Marker | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-backend-marker` | Portfolio V2 Backend Marker | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-tooling-marker` | Portfolio V2 Tooling Marker | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-design-ux-marker` | Portfolio V2 Design UX Marker | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-modular-skill-branch` | Portfolio V2 Modular Skill Branch | fence | blocking | Prefab (kept) | — |
| `portfolio-v2-skill-token` | Portfolio V2 Skill Token | navigation-anchor | trigger | Prefab (visible) + InteractionComponent (invisible data) | Interaction component required (contentReference/action/focusBehavior) — currently depends on invisible navigation-anchor geometry; must get real visible prefab geometry per rule "must not depend on visible navigation-anchor geometry" |
| `portfolio-v2-mailbox` | Portfolio V2 Mailbox | container | blocking | Prefab (kept, object) | — |
| `portfolio-v2-mailbox-cluster` | Portfolio V2 Mailbox Cluster | mailbox-bank | blocking | Prefab (kept, object) | — |
| `portfolio-v2-contact-noticeboard` | Portfolio V2 Contact Noticeboard | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-writing-counter` | Portfolio V2 Writing Counter | workbench-rich | blocking | Prefab (kept, office/portfolio) | — |
| `portfolio-v2-communication-mast` | Portfolio V2 Communication Mast | post | blocking | Prefab (kept, street furniture) | — |
| `portfolio-v2-social-link-marker` | Portfolio V2 Social Link Marker | navigation-anchor | trigger | Prefab (visible) + InteractionComponent (invisible data) | Interaction component required (contentReference/action/focusBehavior) — currently depends on invisible navigation-anchor geometry; must get real visible prefab geometry per rule "must not depend on visible navigation-anchor geometry" |
| `portfolio-v2-contact-form-marker` | Portfolio V2 Contact Form Marker | landmark | trigger | Prefab (visible) + InteractionComponent (invisible data) | Interaction component required (contentReference/action/focusBehavior) |
| `portfolio-v2-cv-download-marker` | Portfolio V2 CV Download Marker | board | trigger | Prefab (visible) + InteractionComponent (invisible data) | Interaction component required (contentReference/action/focusBehavior) |
| `portfolio-v2-flyer` | Portfolio V2 Flyer | paper-stack | blocking | Prefab (kept, office/portfolio) | Collision correction: should be non-blocking (flyer/folder/document) |
| `portfolio-v2-flyer-pile` | Portfolio V2 Flyer Pile | paper-stack | blocking | Prefab (kept, office/portfolio) | Collision correction: should be non-blocking (flyer/folder/document) |
| `portfolio-v2-wall-poster` | Portfolio V2 Wall Poster | board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `central-orientation-monument` | Central Orientation Monument | orientation-monument | blocking | Prefab (kept, landmark) | — |
| `project-display-rack` | Project Display Rack | display-rack | blocking | Prefab (kept, office/portfolio) | — |
| `skill-display-stand` | Skill Display Stand | display-rack | blocking | Prefab (kept, office/portfolio) | — |
| `timeline-arch` | Timeline Arch | timeline-arch | blocking | Prefab (kept, portfolio) | — |
| `milestone-station` | Milestone Station | milestone-station | blocking | Prefab (kept, portfolio) | — |
| `skill-branch-landmark` | Skill Branch Landmark | skill-garden-landmark | blocking | Prefab (kept, portfolio) | — |
| `mailbox-bank` | Mailbox Bank | mailbox-bank | blocking | Prefab (kept, object) | — |
| `development-workbench` | Development Workbench | workbench-rich | blocking | Prefab (kept, office/portfolio) | — |
| `desk-with-monitor` | Desk With Monitor | monitor-desk | blocking | Prefab (kept, office) | — |
| `about-desk` | About Desk | desk | blocking | Prefab (kept, office) | — |
| `project-display-monitor` | Project Display Monitor | screen | blocking | Prefab (kept, office) | — |
| `cv-flyer` | CV Flyer | paper-stack | blocking | Prefab (kept, office/portfolio) | Collision correction: should be non-blocking (flyer/folder/document) |
| `envelope` | Envelope | paper-stack | blocking | Prefab (kept, office/portfolio) | Collision correction: should be non-blocking (flyer/folder/document) |
| `project-folder` | Project Folder | paper-stack | blocking | Prefab (kept, office/portfolio) | Collision correction: should be non-blocking (flyer/folder/document) |
| `featured-project-folder` | Featured Project Folder | paper-stack | blocking | Prefab (kept, office/portfolio) | Collision correction: should be non-blocking (flyer/folder/document) |
| `project-blueprint-board` | Project Blueprint Board | board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `experience-milestone` | Experience Milestone | landmark | blocking | Prefab (kept, portfolio) | — |
| `experience-date-post` | Experience Date Post | landmark | blocking | Prefab (kept, portfolio) | — |
| `experience-noticeboard` | Experience Noticeboard | board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `skills-category-tree` | Skills Category Tree | tree | blocking | Prefab (kept, nature) | — |
| `skill-fruit-placeholder` | Skill Fruit Placeholder | landmark | none | Prefab (kept, portfolio) | Convert to attachment socket or editor helper (currently a bare landmark placeholder, collisionMode none) |
| `about-noticeboard` | About Noticeboard | board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `contact-mailbox` | Contact Mailbox | container | blocking | Prefab (kept, object) | — |
| `contact-noticeboard` | Contact Noticeboard | board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `contact-form-pedestal` | Contact Form Pedestal | container | blocking | Prefab (kept, object) | — |
| `central-portfolio-sign` | Central Portfolio Sign | board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `section-landmark` | Section Landmark | landmark | blocking | Prefab (kept, portfolio) | — |
| `future-portal-placeholder` | Future Portal Placeholder | landmark | blocking | Prefab (kept, portfolio) | Explicit placeholder (futureAssetSlot) — keep as editor helper until implemented |

### roads-and-paths (16)

| ID | Name | Archetype | Collision | Proposed destination | Migration note |
|---|---|---|---|---|---|
| `portfolio-v2-main-path-straight` | Portfolio V2 Main Path Straight | path-section | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity |
| `portfolio-v2-main-path-corner` | Portfolio V2 Main Path Corner | path-section | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity |
| `portfolio-v2-path-junction` | Portfolio V2 Path Junction | round-platform | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity |
| `portfolio-v2-secondary-path` | Portfolio V2 Secondary Path | path-section | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity |
| `portfolio-v2-stepping-stone` | Portfolio V2 Stepping Stone | path-detail | none | Decal system | Decal — lightweight surface-attached visual detail |
| `main-path-section` | Main Path Section | path-section | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity |
| `secondary-path-section` | Secondary Path Section | path-section | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity |
| `path-border` | Path Border | path-detail | none | Decal system | Decal — lightweight surface-attached visual detail |
| `path-corner-border` | Path Corner Border | path-detail | none | Decal system | Decal — lightweight surface-attached visual detail |
| `path-entrance` | Path Entrance | path-detail | none | Decal system | Decal — lightweight surface-attached visual detail |
| `pedestrian-crossing-marker` | Pedestrian Crossing Marker | path-detail | none | Decal system | Decal — lightweight surface-attached visual detail |
| `roadside-marker` | Roadside Marker | path-detail | none | Decal system | Decal — lightweight surface-attached visual detail |
| `junction-marker` | Junction Marker | path-detail | none | Decal system | Decal — lightweight surface-attached visual detail |
| `circular-plaza-insert` | Circular Plaza Insert | round-platform | walkable | Terrain brush/profile | Terrain brush/profile — outdoor ground surface, not an entity |
| `drain-or-ground-detail-plane` | Drain or Ground Detail Plane | path-detail | none | Decal system | Decal — lightweight surface-attached visual detail |
| `elevated-walkway` | Elevated Walkway | bridge | walkable | Prefab (kept, multi-cell) | — |

### signage (9)

| ID | Name | Archetype | Collision | Proposed destination | Migration note |
|---|---|---|---|---|---|
| `portfolio-v2-direction-sign` | Portfolio V2 Direction Sign | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-zone-entrance-sign` | Portfolio V2 Zone Entrance Sign | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-noticeboard` | Portfolio V2 Noticeboard | board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-map-board` | Portfolio V2 Map Board | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-workshop-entrance-sign` | Portfolio V2 Workshop Entrance Sign | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-about-entrance-sign` | Portfolio V2 About Entrance Sign | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-skills-entrance-sign` | Portfolio V2 Skills Entrance Sign | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `portfolio-v2-contact-entrance-sign` | Portfolio V2 Contact Entrance Sign | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `zone-identity-board` | Zone Identity Board | zone-board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |

### street-furniture (28)

| ID | Name | Archetype | Collision | Proposed destination | Migration note |
|---|---|---|---|---|---|
| `portfolio-v2-bollard` | Portfolio V2 Bollard | post | blocking | Prefab (kept, street furniture) | — |
| `portfolio-v2-path-lamp` | Portfolio V2 Path Lamp | post | blocking | Prefab (kept, street furniture) | — |
| `portfolio-v2-building-lamp` | Portfolio V2 Building Lamp | post | blocking | Prefab (kept, street furniture) | Feature gap: needs wall-anchor/socket support (currently free-standing post archetype) |
| `portfolio-v2-bench` | Portfolio V2 Bench | bench | blocking | Prefab (kept, furniture) | — |
| `portfolio-v2-planter` | Portfolio V2 Planter | container | blocking | Prefab (kept, object) | — |
| `portfolio-v2-plaza-seating` | Portfolio V2 Plaza Seating | bench | blocking | Prefab (kept, furniture) | — |
| `portfolio-v2-plaza-planter` | Portfolio V2 Plaza Planter | garden-bed | blocking | Prefab (kept, object) | JUDGMENT CALL: has real box-edge geometry (not flat paint) — classified as object not terrain brush; flagged for confirmation |
| `portfolio-v2-crate-stack` | Portfolio V2 Crate Stack | container | blocking | Prefab (kept, object) | Geometry gap: needs distinct representative geometry (currently generic box/tree) (needs stacked-crate geometry, currently single container box) |
| `portfolio-v2-reflection-seat` | Portfolio V2 Reflection Seat | bench | blocking | Prefab (kept, furniture) | — |
| `portfolio-v2-crate` | Portfolio V2 Crate | container | blocking | Prefab (kept, object) | — |
| `portfolio-v2-barrel-container` | Portfolio V2 Barrel Container | round-platform | walkable | Object registry (kept as prefab) | Collision correction: must be BLOCKING, not walkable (round-platform archetype defaults to walkable — confirmed bug) |
| `bench` | Bench | bench | blocking | Prefab (kept, furniture) | — |
| `lamp-post` | Lamp Post | post | blocking | Prefab (kept, street furniture) | — |
| `utility-pole` | Utility Pole | post | blocking | Prefab (kept, street furniture) | — |
| `directional-signpost` | Directional Signpost | post | blocking | Prefab (kept, street furniture) | — |
| `central-multi-direction-sign` | Central Multi-Direction Sign | post | blocking | Prefab (kept, street furniture) | — |
| `street-furniture-bollard` | Bollard | post | blocking | Prefab (kept, street furniture) | — |
| `section-sign` | Section Sign | board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `noticeboard` | Noticeboard | board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `bulletin-board` | Bulletin Board | board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `information-pedestal` | Information Pedestal | board | blocking | Prefab (kept, signage — shared modular sign geometry) | — |
| `mailbox` | Mailbox | container | blocking | Prefab (kept, object) | — |
| `waste-bin` | Waste Bin | container | blocking | Prefab (kept, object) | — |
| `planter` | Planter | container | blocking | Prefab (kept, object) | — |
| `bicycle-rack-proxy` | Bicycle Rack Proxy | container | blocking | Prefab (kept, object) | Geometry gap: needs distinct representative geometry (currently generic box/tree) (needs bike-rack geometry, currently generic container box) |
| `simple-barrier` | Simple Barrier | container | blocking | Prefab (kept, object) | Geometry gap: needs distinct representative geometry (currently generic box/tree) (needs barrier geometry, currently generic container box) |
| `crate` | Crate | container | blocking | Prefab (kept, object) | — |
| `barrel` | Barrel | round-platform | walkable | Object registry (kept as prefab) | Collision correction: must be BLOCKING, not walkable (round-platform archetype defaults to walkable — confirmed bug) |

### decoration (1)

| ID | Name | Archetype | Collision | Proposed destination | Migration note |
|---|---|---|---|---|---|
| `portfolio-v2-ground-debris` | Portfolio V2 Ground Debris | rock-stack | blocking | Prefab (kept, nature) | Collision correction: should be non-blocking (ground debris) |

---

## 6. Navigation nodes — 6 total (unaffected data, kept as-is)

Source: `lib/maps/map-navigation.ts:3`. These are already correctly modeled — a separate top-level `MapDefinition.navigation` field, disconnected from `entities`, exactly matching your "invisible movement data" rule. No change needed to this data shape; the fix is entirely on the prefab side (§0.3): remove the 10 `navigation-anchor` prefabs and give the editor a native way to visualize `walk`/`route-junction`/`wait-point`/`look-at`/`character-spawn`/`bird-perch` nodes directly, plus 4 new concepts your spec lists that have no `NavigationNodeType` counterpart today (`ambient-animation-anchor`, `flyer-start`, `flyer-end`, `camera-interest-point`) — these need either new `NavigationNodeType` values or a separate lightweight "editor marker" data list, since today they exist *only* as prefabs with no backing data at all.

---

## 7. Duplicate / variant / placeholder report

Classified per your four buckets. This is not exhaustive of all 263 — it covers every case the audit surfaced evidence for; anything not listed here is presumed a true unique/first-class entry.

**Explicit placeholders (author-marked via `futureAssetSlot`, 7 total)** — keep as placeholders, do not deduplicate:
`portfolio-v2-developer-workshop`, `portfolio-v2-personal-studio`, `portfolio-v2-communication-building` (all placed in the live V2 map, `futureAssetSlot` pointing at a not-yet-built final asset), plus their unused non-v2-namespaced near-twins `portfolio-workshop-compound`, `personal-studio-compound`, `communication-station` (also `futureAssetSlot`-marked, same archetype, never placed in any live map), and `future-portal-placeholder` (portfolio category, explicit placeholder).

**Candidate configured-variant pairs (same archetype + near-identical purpose, differ only in name/category/namespace) — needs your confirmation before merging, per "do not deduplicate solely because placeholder geometry is identical":**
- `portfolio-v2-developer-workshop` / `portfolio-workshop-compound` (both `workshop-compound`)
- `portfolio-v2-personal-studio` / `personal-studio-compound` (both `studio-compound`)
- `portfolio-v2-communication-building` / `communication-station` (both `communication-station`)
- `portfolio-v2-orientation-monument` / `central-orientation-monument` (both `orientation-monument`)
- `portfolio-v2-project-board` / `project-display-rack` / `skill-display-stand` (all `display-rack`)
- `portfolio-v2-workbench` / `development-workbench` (both `workbench-rich`)
- `portfolio-v2-mailbox-cluster` / `mailbox-bank` (both `mailbox-bank`)
- `portfolio-v2-timeline-entrance-arch` / `timeline-arch` (both `timeline-arch`)
- `portfolio-v2-milestone-marker-a/b/c` / `milestone-station` (all `milestone-station`)
- `portfolio-v2-skill-tree` / `skill-branch-landmark` (both `skill-garden-landmark`)
- `portfolio-v2-chair` / `chair-proxy` / `office-chair-proxy` (all `chair`)
- `portfolio-v2-bench` / `bench` / `portfolio-v2-reflection-seat` / `portfolio-v2-plaza-seating` (all `bench`)
- The entire `bollard`/`boundary-post`/`portfolio-v2-bollard` / lamp-post family (all `post`)
- Every generic `nature` tree entry (`Deciduous Tree`, `Conifer`, `Orchard Tree`, `Skill Tree Placeholder`, `Young Tree`) vs. `portfolio-v2-ornamental-tree` (all `tree`)

**Zone-specific authored prefabs (keep separate — not duplicates despite shared archetype):** the four `Portfolio V2 *Marker` signage entries (`Frontend`/`Backend`/`Tooling`/`Design UX Marker`, all `zone-board`) are intentionally distinct catalog names carrying different content/zone association even though geometry is identical — exactly the case your spec says to keep as named variants rather than merge away.

**True duplicates found:** none confirmed — every apparent duplicate above has at least a namespace (`portfolio-v2-*` vs. legacy) or placement-context difference, so none should be silently deleted; all require your confirmation per the rule above.

---

## 8. Collision-correction report

Reminder from §0.1: none of these are live runtime bugs today (no consumer reads this data for gameplay), but all are worth correcting now so the data is correct once a real system exists, and because the editor's overlap-validation already partially depends on `collisionMode`.

| Issue | Where | Fix |
|---|---|---|
| Barrels default to `walkable` | `barrel`, `portfolio-v2-barrel-container` (both `round-platform` archetype, `inferCollisionMode` defaults `round-platform`→`walkable`) | Force `blocking` override |
| Grass/flower/low-shrub clusters | `Portfolio V2 Grass/Flower Cluster`, `Portfolio V2 Low Shrub`, `Low Shrub Cluster`, `grass-clump`, `flower-patch-marker`, `hedge` | Set `none`/non-blocking (currently `blocking` by default, no override) |
| Small decorative rocks | `Portfolio V2 Medium Rock`, `rock` | Non-blocking; keep `Large Rock`/`Boulder Cluster`/rock-stack variants blocking |
| Ground debris | `portfolio-v2-ground-debris` | Non-blocking |
| Paper/document/office accessories | All `paper-stack`-archetype prefabs in `office`/`portfolio` (folders, sketchbooks, plans, keyboard slab, flyers, envelopes, CV items) | Non-blocking |
| Invisible interaction anchors relying on `trigger` | `portfolio-v2-arrival-marker`, `portfolio-v2-career-path-marker`, `portfolio-v2-skill-token`, `portfolio-v2-social-link-marker` (all `navigation-anchor` archetype + `collisionMode: trigger`) | Once `navigation-anchor` is removed (§0.3), these need real visible prefab geometry paired with an `InteractionComponent`, per your explicit rule that triggers "must not depend on visible navigation-anchor geometry" |
| Small decorative props needlessly blocking | Confirm case-by-case during implementation — no additional cases beyond the above were surfaced by static analysis; flagging for a pass once each prefab has real (not placeholder-box) geometry, since collision footprint should match final geometry |

Full per-prefab collision flags are inline in the §5 matrix (search for "Collision correction").

---

## 9. Proposed registry interfaces

```ts
// Terrain cell — geometry, material, and semantics fully decoupled
interface TerrainCell {
  terrainTypeId: TerrainTypeId;   // "ground" | "path" | ...  — semantic meaning, not appearance
  shapeId: TerrainShapeId;        // subset of today's shapes, see §1
  materialId: MaterialId;         // "grass" | "soil" | "rock" | "gravel" | "paving" | "sand" | "concrete" | "wood" | "metal" | ...
  rotation: Rotation;
  state: number;
}

// Terrain-edge/profile — attaches to a cell side/corner, does not replace the cell
interface TerrainEdgeProfile {
  id: string;
  cellRef: { x: number; y: number; z: number };
  side: FaceDirection | "corner";
  profileShapeId: EdgeProfileShapeId;  // retaining-wall-low, terrain-raised-edge, future curb/bank profiles
  materialId: MaterialId;
  rotation: Rotation;
}

// Fluid — dedicated system, decoupled from TerrainShapeRegistry
interface FluidCell {
  cellRef: { x: number; y: number; z: number };
  fluidTypeId: FluidTypeId;   // "water" today
  fillLevel: number;          // 0-15, matches today's 16-level `state` encoding
}

// Structure piece — grid/half-grid snapped modular construction, outside the voxel array
interface StructurePieceInstance {
  id: string;
  archetypeId: StructureArchetypeId;  // wall, wall-window, wall-door, gate, pillar, roof family, wooden-wall family, pipe-long/pipe
  transform: SerializableTransform;
  footprint: EntityFootprint;         // supports multi-cell
  attachedFaces?: FaceDirection[];
  connectsTo?: string[];              // optional neighbor-connection ids
  materialId: MaterialId;             // independent from geometry, per your rule
  collision: CollisionComponent;
}

// Object/prefab — independently selectable entities (existing PlacedMapEntity model, extended)
interface ArchetypeDefinition {
  id: string;
  geometry: PrefabPartDefinition[];   // today's createArchetypeParts() output
  sockets?: ObjectSocket[];           // NEW — parent/child anchoring (desk↔folder, planter↔plant, wall↔lamp)
  defaultCollision: CollisionMode;
  footprint: EntityFootprint;
}

interface PrefabVariant {
  id: string;
  archetypeId: string;
  materialOverrides?: Record<string, MaterialId>;
  scale: SerializableVector3;
  tags: string[];
  defaultComponents?: {
    interaction?: InteractionComponent;
    sign?: SignComponent;             // replaces the sign PrimitiveType coupling, §0.10
  };
}

// Decal — lightweight surface-attached visual detail (path-detail archetype today)
interface DecalInstance {
  id: string;
  surfaceRef: { x: number; y: number; z: number };
  decalTypeId: DecalTypeId;
  rotation: Rotation;
  scale: number;
}

// Interaction — invisible content/action data, decoupled from visible geometry
interface InteractionComponent {
  interactionType: "content" | "navigation-trigger" | "social-link" | "contact-form" | "cv-download";
  contentReference?: MapContentReference;   // reuses existing MapContentReference shape
  action?: string;
  focusBehavior?: { cameraPresetId?: string };
}

// Collision — split from interactivity, per your explicit rule
interface CollisionComponent {
  physicalCollision: boolean;
  walkableSupport: boolean;
  characterAvoidance: boolean;   // reserved — no consumer exists yet (§0.1)
  interactionTrigger: boolean;   // reserved — no consumer exists yet (§0.1)
  selectable: boolean;           // editor-only today
}
```

Kept unchanged (already correctly modeled, confirmed by the audit): `MapNavigationDefinition { nodes, edges, routes }`, `MapZoneDefinition` + per-column `zoneAssignments`, `MapMarkerDefinition` (though its relationship to `InteractionComponent` above needs reconciling — see risks).

---

## 10. Risks and compatibility plan

Ranked by severity:

1. **No prefab-version upgrade path exists (§0.5).** This is the top risk for the whole project. Before touching any kept archetype's `parts` (e.g. adding text to `board`/`zone-board`), a real version-gated resolver must exist: `resolvePrefabInstance` needs to be able to resolve an entity's stored `prefabVersion` against a historical parts table, not always the current one. Without this, any archetype geometry change silently reinterprets every saved instance (shipped maps and — more importantly — user localStorage drafts, which this audit cannot enumerate).
2. **Two persistence formats, three version fields, no ID-renumbering migration path exists today** (`MapDocument.version` 1-3, `MapDocument.cellEncoding`/`zoneEncoding`, `MapDefinition.schemaVersion` 2, `BUILT_IN_PREFAB_VERSION` 1). All existing migration code only migrates *container format* (flat↔cell edits, voxel↔column zones, missing-array backfill) — none of it rewrites a `blockId`/`shapeId` value's *meaning*. This refactor is exactly the kind of change existing migration code has never had to do; new migration code must be written, not extended.
3. **Removed/moved terrain shapes require converting single-voxel cell edits into placed entities** (rubble/stalactite/crystal/ice/icicle/fence shapes, §1). This is a structural conversion (voxel array → entity list), not a value remap, and needs careful footprint/anchor decisions per shape (e.g. does a `crystal-large` cell become one entity at the cell's center, preserving its existing bounds as the entity's scale?).
4. **`retaining-wall-low`/`terrain-raised-edge`/`terrain-diagonal-bank` → edge-profile system requires a new data model that doesn't exist** (§0.9) — this can't be sequenced as a pure migration step; the target architecture (cell + independent edge attachment) must be designed and built first.
5. **Boundary/special block removal changes visual appearance of existing maps** unless the new material registry preserves equivalent colors (§2) — needs your decision before implementation.
6. **`InteractionComponent` overlaps conceptually with the existing `MapMarkerDefinition`/`contentReference`/`markerId` system**, which already does most of what you're asking for (content reference, click-to-open, camera focus via `focusCameraPresetId`) but is marker-centric rather than entity-centric, and `interactionRadius`/entity-level `collisionMode: trigger` are both currently inert/unread. The cleanest design is likely to fold `InteractionComponent` *into* the marker system rather than build a parallel one — needs a design decision, not just a data move.
7. **Editor-helper runtime leakage (§0.2) should be fixed independently and first** — it's low-risk, high-value, and unblocks nothing else, so there's no reason to sequence it behind the larger terrain/prefab work.

---

## Phase 1 status: complete. Awaiting your review before any implementation begins.

Per your instructions, no code, registries, or persisted formats have been touched — the only file changes in this session are this audit document and the temporary, fully-reverted debug export used to extract prefab data for the tables above (confirmed via `git diff`, no residual changes).

Before I write proposed implementation phases, I need your decisions on the items marked "decision needed" above:

1. **Pipes**: `pipe-short`/`pipe-corner` → Object registry, `pipe-long`/`pipe` → StructurePieceRegistry — confirm or override.
2. **Boundary/Special blocks**: preserve their current paint color via an equivalent material (recommended), or accept a visual change and go pure-metadata as literally specified?
3. **Retaining Wall / Curb prefabs** (freestanding `wall`-archetype prefabs in infrastructure, distinct from the terrain-shape-level `retaining-wall-low`): keep as StructurePieceRegistry, or fold into the new terrain-edge-profile system alongside the shapes?
4. **The ~15 candidate variant pairs in §7**: merge into archetype+variant now, or keep as separate catalog entries until confirmed as true duplicates?
5. **InteractionComponent vs. the existing marker system** (risk #6): fold the new interaction data into `MapMarkerDefinition`, or build it as a genuinely separate component?

Given the scope (persistence, rendering, collision, editor UI, and ~20 new/changed test files), this will need to be implemented in stages rather than as one change — I'd recommend starting with the two lowest-risk, highest-value, fully-independent fixes (editor-helper runtime exclusion, §0.2; and building the prefab-version upgrade path, §10 risk #1) before touching the terrain/shape/prefab reclassification itself, since the reclassification work depends on the version-migration mechanism existing first. Let me know how you'd like to proceed.
