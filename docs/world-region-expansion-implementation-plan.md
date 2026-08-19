# Progress Tracker

- [x] Phase 0: Lock terminology, scope, invariants, and budgets
- [x] Phase 1: Introduce WorldLayout and WorldRegion contracts
- [x] Phase 2: Add global, region, chunk, and cell coordinate utilities
- [x] Phase 3: Wrap the existing map as the unchanged center region
- [x] Phase 4: Add and persist one North scenery region
- [x] Phase 5: Make Center-to-North terrain rendering seamless
- [x] Phase 6: Introduce layout-level editor selection
- [x] Phase 7: Add Show All, Focus, Isolate, and region overlays
- [x] Phase 8: Support normal terrain authoring and persistence in scenery
- [x] Phase 9: Support cross-region terrain brushes and atomic undo
- [ ] Phase 10: Expand the proven architecture to all nine regions
- [ ] Phase 11: Separate runtime capabilities by region role
- [ ] Phase 12: Add affordable authored scenery-water behavior
- [ ] Phase 13: Extend the center-originating reveal across the layout
- [ ] Phase 14: Profile, optimize, and validate the expanded world
- [ ] Phase 15: Design terrain baking as a separate follow-up feature

Tracker rule: check a phase only after every task and exit criterion in that phase is complete and its automated tests pass. A phase awaiting visual, performance, persistence, or regression verification remains unchecked.

# 3x3 World Region Expansion Implementation Plan

## Objective

Expand the visible landscape from one 64x64x12 map into a 3x3 arrangement of nine 64x64x12 regions while preserving the existing 16x16 terrain-chunk implementation.

The existing map remains the central playable region without changing its terrain, liquids, objects, navigation, coordinates, loader blocks, or current behavior. The eight surrounding regions are complete voxel terrain sources in the editor but scenery-only at runtime.

```text
[ north-west ][ north  ][ north-east ]
[ west       ][ center ][ east       ]
[ south-west ][ south  ][ south-east ]
```

The resulting visible landscape is 192x192x12. It must read as one continuous world rather than nine adjacent maps.

## Core Invariants

1. `chunk` continues to mean the existing 16x16x12 terrain/render subdivision.
2. `WorldRegion` means one 64x64x12 authoring area containing the existing chunk structure.
3. `WorldLayout` means the higher-level 3x3 arrangement of regions.
4. All nine regions are normal editable voxel terrain in the editor.
5. Only `center` receives full gameplay capabilities at runtime.
6. The current center map document and local coordinates remain unchanged.
7. Editor Show All can display and edit all nine voxel regions together.
8. Lazy hydration may reduce work but must never prevent Show All.
9. Terrain baking is not part of the initial implementation.
10. The architecture must allow rendering to be replaced later without replacing source authoring data.
11. Current center reveal timing and loader behavior must remain unchanged.
12. The reveal must eventually continue beyond the center without restarting at region boundaries.

## Region Capability Baseline

### Center Region

- Editable voxel terrain.
- Terrain and liquid rendering.
- Liquid authoring and simulation.
- Navigation and click-to-move.
- Collision and terrain-surface queries.
- Entities, triggers, zones, and portfolio interaction.
- Terrain and placeable-object reveal participation.

### Scenery Regions

- Editable voxel terrain in the editor.
- Terrain shapes, materials, textures, and elevation tools.
- Terrain rendering and lighting.
- Authored scenery objects and explicit lightweight animations.
- Authored water presentation without continuous runtime simulation.
- Terrain and appropriate scenery-object reveal participation.

Scenery regions do not receive character navigation, gameplay collision, click-to-move destinations, triggers, portfolio interaction, runtime terrain editing, normal gameplay selection, NPC simulation, or continuous liquid simulation.

## Non-Goals For The Initial Region Feature

- Terrain baking or a baked asset file format.
- Baked reveal shaders or reveal-to-baked swapping.
- Camera and character boundary redesign.
- Final authored mountains, forests, railway, waterfalls, or scenery props.
- Weather, wind, clouds, day/night, environment zones, or ambient audio.
- Cross-region gameplay navigation.
- Full runtime fluid simulation across scenery regions.
- Infinite or streamed worlds.
- Changing the existing 16x16 chunk size.
- Replacing the existing center map schema with a 192x192 map.

## Existing Architecture Baseline

- `lib/world/world-config.ts` defines the fixed 64x64x12 region dimensions and 16-cell chunk size.
- `lib/world/voxel-world.ts` stores cells, fluids, zones, dirty chunks, coordinate conversion, and render-chunk creation for one 64x64 world.
- `lib/maps/map-definition.ts` validates and serializes one fixed-size map including terrain, fluids, entities, navigation, and presentation data.
- `lib/editor/map-editor.ts` owns one `VoxelWorld`, one undo/redo history, entities, saved state, and water authoring behavior.
- `lib/terrain/surface-mesher.ts` builds surface geometry one existing 16x16 chunk at a time and currently treats cells outside its `VoxelWorld` as empty.
- `lib/terrain/terrain.ts` builds terrain, surface, and water render data for one world.
- `lib/world/reveal.ts` identifies the center 2x2 loader platform and derives reveal delay from region-local coordinates.
- `components/experience/PortfolioExperience.tsx` currently orchestrates one world for rendering, editor selection, liquid tools, surface queries, navigation, soldier movement, reveal, entities, and performance reporting.

## Target Architecture

```text
WorldLayout
  WorldRegion north-west  -> VoxelWorld -> existing 16x16 chunks
  WorldRegion north       -> VoxelWorld -> existing 16x16 chunks
  WorldRegion north-east  -> VoxelWorld -> existing 16x16 chunks
  WorldRegion west        -> VoxelWorld -> existing 16x16 chunks
  WorldRegion center      -> existing map and VoxelWorld
  WorldRegion east        -> VoxelWorld -> existing 16x16 chunks
  WorldRegion south-west  -> VoxelWorld -> existing 16x16 chunks
  WorldRegion south       -> VoxelWorld -> existing 16x16 chunks
  WorldRegion south-east  -> VoxelWorld -> existing 16x16 chunks
```

Source documents remain independent from runtime rendering. Initially every visible region uses the current voxel surface-mesh renderer. A later baker may replace that renderer while retaining the same source maps, layout coordinates, materials, liquids, and center gameplay metadata.

## Phase 0: Lock Terminology, Scope, Invariants, And Budgets

### Tasks

- [x] Adopt `WorldLayout`, `WorldRegion`, and existing `chunk` terminology.
- [x] Record the nine stable region IDs and their grid offsets.
- [x] Record the center-data preservation invariants.
- [x] Define editor and runtime capability matrices.
- [x] Confirm scenery regions initially remain 64x64x12.
- [x] Define initial CPU, memory, draw-call, and reveal-frame budgets.
- [x] Capture current center-map persistence, mesh, reveal, and performance baselines.
- [x] Decide whether region files are embedded in a layout document or referenced by stable map IDs.
- [x] Decide how missing or unloaded scenery regions are represented.

### Locked Decisions

- One `WorldLayoutDefinition` references independent region map documents by stable `mapId`; it does not embed or concatenate their cell arrays.
- A region omitted from a layout is not part of that layout. A referenced region can independently be `unloaded`, `loading`, `ready`, or `error` at runtime or in the editor.
- Center-only layouts are valid for backward compatibility. A complete authored portfolio layout contains all nine fixed slots.
- Region IDs own their immutable offsets and roles. Documents do not persist arbitrary offsets that could overlap or drift.
- `center` is the only playable slot. The other eight fixed slots are scenery.
- Every region initially uses the existing 64x64x12 map dimensions and contains 16 existing 16x16 render chunks.
- Editor Show All must be capable of hydrating all nine regions. Lazy hydration controls when work occurs, not whether full-world authoring is possible.
- Region capability selection is explicit. Loading scenery source data must not implicitly register navigation, interaction, collision, or continuous simulation.
- Terrain baking remains a later rendering concern and does not alter the layout or region source contracts introduced here.

### Initial Budgets And Baseline

- Current Center structural baseline: 49,152 logical cells, 4,096 surface columns, and 16 internal render chunks.
- Complete hydrated editor ceiling: 442,368 logical cells, 36,864 surface columns, and 144 internal render chunks before later baking.
- Phase 1 runtime budget: zero additional hydrated worlds, render chunks, draw calls, frame callbacks, raycasts, or GPU allocations. The new contracts must be inert until a layout loader is introduced.
- Incremental editing budget: a local edit may rebuild affected 16x16 chunks and seam neighbors only; it must not rebuild nine complete regions.
- Runtime gameplay budget: scenery must add zero navigation, collision, gameplay selection, entity-grounding, or continuous liquid-simulation work.
- Reveal budget: Center timing is a regression invariant. Expanded reveal performance will be measured before Phase 13 is accepted rather than guessed during the contract phase.
- Automated baseline recorded before Phase 1: 32 test files, 216 tests, 31 files and 215 tests passing in 88.43 seconds. One pre-existing failure remains in `PortfolioMainAuthoredV2.test.ts` because it expects zero entities while the current authored map contains two.
- The repository benchmark harness already covers idle overview, scripted camera, dense close-up, and expansion reveal. Comparable browser/GPU results will be captured in Phase 14 when renderable regions exist; Phase 1 intentionally has no render-path delta to benchmark.

### Exit Criteria

- [x] Terminology is unambiguous in code and documentation.
- [x] Baseline tests and applicable contract-phase benchmark results are recorded before implementation.
- [x] No unresolved schema ownership or lifecycle decision blocks Phase 1.

## Phase 1: Introduce WorldLayout And WorldRegion Contracts

### Expected Modules

- `lib/world-layout/world-layout-types.ts`
- `lib/world-layout/world-region.ts`
- `lib/world-layout/world-layout.test.ts`

### Tasks

- [x] Define the nine `WorldRegionId` values.
- [x] Define `WorldRegionRole` as `playable | scenery`.
- [x] Define immutable region grid offsets.
- [x] Define `WorldLayoutDefinition` independently from hydrated worlds.
- [x] Define runtime/editor region state without embedding React or Three.js objects.
- [x] Validate exactly one center region and valid unique offsets.
- [x] Prevent arbitrary components from inventing region offsets.

### Exit Criteria

- [x] A center-only layout and a complete 3x3 layout validate correctly.
- [x] Duplicate IDs, map references, or invalid playable-region assignments are rejected; offsets are fixed by unique region ID and cannot be supplied by documents.
- [x] No current world behavior has changed.

## Phase 2: Add Global, Region, Chunk, And Cell Coordinates

### Expected Modules

- `lib/world-layout/world-layout-coordinates.ts`
- `lib/world-layout/world-layout-coordinates.test.ts`

### Tasks

- [x] Convert region-local cells to global layout cells.
- [x] Convert global layout cells to region ID and local cells.
- [x] Convert region-local cells to existing 16x16 chunk and chunk-local cells.
- [x] Convert local cells to continuous Three.js world positions.
- [x] Convert Three.js positions back to region-local selection coordinates.
- [x] Use correct signed floor division and modulo for North and West.
- [x] Define behavior for coordinates outside the 3x3 layout.
- [x] Add centralized region-offset and boundary ownership lookup; neighbor-cell traversal builds on these primitives in Phase 5.

### Required Tests

- [x] All four corners of every region round-trip correctly.
- [x] Center local coordinates preserve current world positions exactly.
- [x] Center/North, Center/South, Center/East, and Center/West boundaries are adjacent by one cell.
- [x] Corner transitions resolve correctly across diagonal regions.
- [x] Existing 16x16 chunk coordinates remain unchanged within a region.

### Exit Criteria

- [x] All new layout coordinate calculations flow through the centralized utilities.
- [x] The center map has zero coordinate drift.

## Phase 3: Wrap The Existing Map As The Unchanged Center Region

### Tasks

- [x] Create a center-only layout compatibility path.
- [x] Reference the existing map as `center` without rewriting its document.
- [x] Preserve block, shape, rotation, state, fluid, zone, entity, navigation, spawn, and camera data.
- [x] Preserve the center region scene transform at the existing origin.
- [x] Keep legacy single-map loading functional during the transition.
- [x] Ensure save operations do not rewrite untouched center data unnecessarily.

### Regression Tests

- [x] Serialized center terrain is semantically identical.
- [x] The four loader cells remain at the same local and world coordinates.
- [x] Current liquid source and settled data are preserved with the unchanged map definition.
- [x] Navigation and soldier click-to-move remain unchanged because the experience continues using the existing Center map path.
- [x] Current terrain reveal metadata remains identical and the object-reveal path is untouched.
- [x] Existing editor save/load and undo/redo code paths remain untouched and their targeted tests pass.

### Exit Criteria

- [x] The center-only compatibility loader produces the same map, voxel data, world positions, and reveal metadata.
- [x] No scenery-specific code path is required by existing maps.

## Phase 4: Add And Persist One North Scenery Region

### Expected Modules

- `lib/world-layout/world-layout-document.ts`
- `lib/world-layout/world-layout-loader.ts`
- corresponding schema, migration, and loading tests

### Tasks

- [x] Create a flat North 64x64x12 map source.
- [x] Place North exactly one region width beyond Center through the centralized coordinate contract.
- [x] Add layout serialization and validation.
- [x] Load Center and North independently into region-scoped `VoxelWorld` instances.
- [x] Save and reload edits in North without modifying Center.
- [x] Define deterministic region-specific error state for a missing North document.
- [x] Keep North free of gameplay systems at runtime; Phase 4 only hydrates map state on explicit request and does not register it with the experience.

### Exit Criteria

- [x] Center and North load, save, and reload independently; rendering begins in Phase 5.
- [x] Center remains behaviorally identical.
- [x] Persistence and resolver errors identify the affected region.

## Phase 5: Make Center-To-North Terrain Rendering Seamless

### Expected Changes

- `lib/terrain/surface-mesher.ts`
- `lib/terrain/terrain.ts`
- `lib/world/voxel-world.ts` only where narrow neighbor hooks are required

### Tasks

- [x] Provide the mesher with read-only adjacent-region cell lookup.
- [x] Cull faces hidden by terrain in the neighboring region.
- [x] Retain faces when no neighboring region or occluding cell exists.
- [x] Dirty the neighboring boundary chunk when an edge cell changes.
- [x] Use global layout coordinates for deterministic texture variation.
- [x] Preserve shape rotation, UV orientation, grass-side rules, and material IDs across the seam.
- [x] Keep region-aware terrain meshing separate from the existing water mesher; cross-region water remains explicitly deferred to Phase 12.
- [x] Namespace scenery mesh IDs while preserving current Center IDs required by existing editor raycasting.
- [x] Render North through the existing shared surface material without collision, gameplay click handling, or scenery-water simulation.
- [x] Fill North level `y=0` completely with Riverbed and level `y=1` completely with Ground, leaving `y=2` and above empty for authoring.

### Required Tests

- [x] Two full cubes across the seam do not emit internal faces.
- [x] Editing either boundary cell dirties both relevant boundary chunks and exposed faces are restored after removal.
- [x] Partial and rotated shape data crosses the neighbor reader without incorrectly culling non-full faces; the existing shape mesher regression suite remains green.
- [x] Grass and dirt transitions retain the existing material-selection path.
- [x] Texture variation does not restart at local coordinate zero.
- [x] A continuous Center-to-North surface has no exposed internal boundary face or duplicate chunk identity.
- [x] Every North column contains Riverbed at `y=0`, Ground at `y=1`, and Air at `y=2` before authoring.

### Exit Criteria

- [x] Center and North appear as one continuous terrain surface in automated geometry checks and desktop screenshot verification.
- [x] Boundary edits update the eight affected seam chunks at most, not both full regions.
- [x] Phase 1-5 constitute the completed first implementation milestone and are ready for review before broader editor expansion.

## Phase 6: Introduce Layout-Level Editor Selection

### Tasks

- [x] Represent selection as region ID plus region-local coordinate.
- [x] Expose derived global coordinates for diagnostics and tools.
- [x] Attach region identity to terrain raycast results.
- [x] Route hover, selection, inspection, and tool targeting to the owning region.
- [x] Preserve current center selection behavior.
- [x] Prevent hidden or noninteractive ghost meshes from stealing selection.

### Exit Criteria

- [x] Selecting either Center or North resolves the correct region and cell.
- [x] Selection remains stable while changing region visibility mode.

## Phase 7: Add Show All, Focus, Isolate, And Region Overlays

### Tasks

- [x] Add `show-all`, `focus-selected`, and `isolate-selected` editor states.
- [x] Ensure Show All hydrates and displays every requested voxel region.
- [x] Ghost non-focused regions without making terrain unreadable.
- [x] Hide all non-selected regions in Isolate mode.
- [x] Add a toggleable region-boundary overlay.
- [x] Add a compact 3x3 navigator only if it improves navigation without replacing selection. (Deferred; the two-region milestone does not need one.)
- [x] Frame the camera appropriately for one region or the complete layout.
- [x] Preserve unsaved state while switching visibility modes.

### Exit Criteria

- [x] All visibility modes work without reloading or losing edits.
- [x] Show All displays normal editable voxel terrain, not baked previews.
- [x] Editor controls remain usable at desktop and supported smaller viewports.

## Phase 8: Support Normal Terrain Authoring And Persistence In Scenery

### Tasks

- [x] Route add, remove, raise, lower, flatten, fill, clear, and path tools by region.
- [x] Route shape, rotation, state, and material painting by region.
- [x] Preserve per-region dirty chunk rebuilding.
- [x] Save and load every region independently through the layout.
- [x] Report unsaved state at layout and individual-region levels.
- [x] Prevent scenery editing from creating runtime navigation or gameplay metadata implicitly.
- [x] Verify large scenery edits do not snapshot all nine worlds unnecessarily.

### Exit Criteria

- [x] Every existing terrain-authoring operation works normally in a scenery region.
- [x] Reloading the layout restores all authored terrain exactly.
- [x] Undo and redo work within one region before cross-region commands are introduced.

## Phase 9: Support Cross-Region Terrain Brushes And Atomic Undo

### Tasks

- [x] Calculate brush footprints in global layout coordinates.
- [x] Partition mutations by owning region.
- [x] Convert mutations back to region-local coordinates before applying them.
- [x] Record one layout-level command for a cross-region brush stroke.
- [x] Undo or redo the complete stroke atomically.
- [x] Rebuild only affected internal chunks, including neighboring seam chunks.
- [x] Reject mutations outside the complete layout safely.

### Required Tests

- [x] Paint, raise, lower, flatten, and erase can cross every cardinal seam.
- [x] A brush can cross a four-region intersection.
- [x] One undo reverses the entire multi-region stroke.
- [x] Saving and reloading preserves the result.

### Exit Criteria

- [x] Region boundaries do not constrain ordinary terrain-authoring workflows.
- [x] History memory remains within the Phase 0 budget.

## Phase 10: Expand The Proven Architecture To All Nine Regions

### Tasks

- [ ] Add the remaining seven region documents and layout entries.
- [ ] Generalize seam lookup to all cardinal neighboring pairs.
- [ ] Validate corner-region placement and mesh identity.
- [ ] Support Show All, Focus, and Isolate across all nine regions.
- [ ] Add load progress and region-specific error reporting.
- [ ] Avoid synchronous remeshing of all regions after a local edit.
- [ ] Ensure all nine can be hydrated together in editor mode.

### Exit Criteria

- [ ] The editor displays a continuous 192x192 voxel landscape.
- [ ] Every region is independently editable and persistent.
- [ ] No visible seam identifies the nine-region structure.

## Phase 11: Separate Runtime Capabilities By Region Role

### Tasks

- [ ] Define explicit runtime capability resolution from region role.
- [ ] Route surface queries and click-to-move to Center only.
- [ ] Keep soldier navigation and destination validation Center-only.
- [ ] Register gameplay entities, triggers, zones, and interactions from Center only.
- [ ] Disable runtime scenery terrain raycasting.
- [ ] Avoid collision generation for scenery terrain.
- [ ] Permit explicit lightweight scenery objects and animations through a separate path.
- [ ] Confirm editor capabilities remain broader than runtime capabilities.

### Exit Criteria

- [ ] Scenery contributes visual rendering without appearing in gameplay queries.
- [ ] Center gameplay behavior remains unchanged.
- [ ] Runtime work is capability-driven rather than implicitly applied to every loaded region.

## Phase 12: Add Affordable Authored Scenery-Water Behavior

### Tasks

- [ ] Keep full liquid tools available for an active scenery region in the editor where practical.
- [ ] Avoid continuously simulating eight scenery regions at runtime.
- [ ] Define whether cross-region sources are solved independently, transferred through boundary conditions, or authored as settled visual continuity.
- [ ] Save authored sources and any validated settled representation per region.
- [ ] Render scenery water statically with normal shader animation.
- [ ] Validate rivers crossing Center/scenery seams and distant waterfalls.
- [ ] Keep a future global or baked water representation possible.

### Exit Criteria

- [ ] Scenery rivers and basins can be authored and persist.
- [ ] Published runtime performs no unnecessary scenery-water solver work.
- [ ] Water seams do not expose region boundaries.

## Phase 13: Extend The Center-Originating Reveal Across The Layout

### Tasks

- [ ] Preserve the exact four center loader cells and their special behavior.
- [ ] Express reveal distance using global layout coordinates.
- [ ] Preserve every Center cell's current reveal delay.
- [ ] Continue the same spatial wave speed beyond Center.
- [ ] Prevent reveal timing from restarting or renormalizing per region.
- [ ] Keep terrain reveal separate from placeable-object reveal.
- [ ] Keep scenery props hidden until their appropriate object-reveal phase.
- [ ] Add reduced-motion behavior for the expanded terrain.

### Required Tests

- [ ] Old and new delays match for every Center terrain cell.
- [ ] The first scenery row follows its adjacent Center boundary continuously.
- [ ] Equal global distances reveal at equal times.
- [ ] Only Center's 2x2 loader platform receives loader behavior.
- [ ] Placeable objects reveal once after terrain reveal completes.

### Exit Criteria

- [ ] The visitor perceives one expansion wave across the complete landscape.
- [ ] The current Center entrance remains visually and temporally unchanged.

## Phase 14: Profile, Optimize, And Validate The Expanded World

### Performance Scenarios

- [ ] Center-only compatibility layout.
- [ ] Center plus North seam prototype.
- [ ] Editor Show All with all nine regions.
- [ ] Editor isolated region with repeated brush strokes.
- [ ] Cross-region brush and undo.
- [ ] Runtime overview facing several scenery regions.
- [ ] Complete 192x192 reveal.
- [ ] Mobile and constrained-device profiles.

### Tasks

- [ ] Measure document load, hydration, meshing, GPU upload, and first-visible times separately.
- [ ] Measure memory for source documents, hydrated worlds, geometry, textures, and history.
- [ ] Measure draw calls, triangles, visible chunks, and frame time.
- [ ] Load or hydrate editor regions incrementally while guaranteeing Show All completion.
- [ ] Retain frustum culling for all existing 16x16 render chunks.
- [ ] Disable scenery raycasting and update loops at runtime.
- [ ] Add layout metrics to the existing benchmark diagnostics.
- [ ] Verify resource disposal when layouts or editor visibility change.

### Release Checks

- [ ] Production build succeeds.
- [ ] Unit and integration tests pass.
- [ ] Existing center-map regression tests pass.
- [ ] Layout persistence and migration tests pass.
- [ ] Editor Show All, Focus, and Isolate workflows pass.
- [ ] Cross-region editing and atomic undo tests pass.
- [ ] Reveal regression and continuity tests pass.
- [ ] No WebGL shader or geometry validation errors occur.
- [ ] Desktop and mobile performance budgets are met.

## Phase 15: Design Terrain Baking As A Separate Follow-Up Feature

This phase is a design and planning gate only. Do not implement the baker as part of the initial region expansion.

### Future Requirements To Preserve

- [ ] Source voxel documents remain authoritative and editable.
- [ ] Center and scenery can use the same baking pipeline with different retained gameplay metadata.
- [ ] Baked output preserves positions, normals, UVs, material IDs, texture variants, AO, and required reveal metadata.
- [ ] Dynamic lighting, fog, wetness, weather, snow, and environment uniforms remain runtime-controlled.
- [ ] Baked sectors retain useful culling boundaries.
- [ ] Center retains navigation, liquids, collision/height queries, and interaction metadata independently from rendered geometry.
- [ ] Scenery can omit gameplay data from its runtime package.
- [ ] The future reveal may swap animated terrain to baked terrain or reveal baked geometry directly.

### Exit Criteria

- [ ] A separate reviewed baking plan exists after the voxel-region architecture is stable and benchmarked.
- [ ] No baking assumption has leaked into the source/editor data model.

## Main Risks And Mitigations

### Center Regression

Mitigation: wrap rather than migrate the existing map, preserve its local coordinates, and compare serialized data plus reveal timings in automated tests.

### Visible Region Seams

Mitigation: neighbor-aware face occlusion, global texture hashing, boundary dirty propagation, shape-specific seam tests, and visual reference captures.

### Editor Memory And Responsiveness

Mitigation: hydrate incrementally, rebuild dirty chunks only, store mutation deltas instead of whole-world history snapshots, and make Show All an explicit supported benchmark.

### Cross-Region History Corruption

Mitigation: one layout-level command owns all region mutations from a single brush stroke and commits or rolls back atomically.

### Accidental Scenery Simulation

Mitigation: explicit runtime capability resolution. Systems receive Center or an allowed region list rather than discovering every loaded region automatically.

### Reveal Becoming Nine Separate Waves

Mitigation: compute timing from global coordinates, preserve Center delays exactly, and test continuity at every boundary.

### Premature Baking Abstractions

Mitigation: keep source documents separate from rendering but defer concrete baked formats, exporters, shaders, and swapping until Phase 15 planning.

## First Delivery Milestone

The first implementation pass should stop after Phase 5 and be reviewed before proceeding.

It must demonstrate:

- The current map running unchanged as Center.
- One persisted North scenery region.
- Correct global and local coordinate conversion.
- Existing 16x16 chunks retained inside both regions.
- Continuous terrain with correct boundary face occlusion.
- Global texture variation without a repeated region pattern.
- Neighboring dirty-chunk propagation after seam edits.
- No gameplay systems activated for North.

Only after this milestone passes should layout-level editor selection, visibility modes, cross-region tools, and the remaining seven regions be implemented.
