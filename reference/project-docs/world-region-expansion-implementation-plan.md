# Progress Tracker

- [x] Phase 0: Expand and migrate the vertical world range
- [x] Phase 1: Lock the seamless-world contract and capture baselines
- [x] Phase 2: Make horizontal world dimensions configurable
- [x] Phase 3: Define the world manifest and region-file contract
- [x] Phase 4: Assemble the current center map into one seamless world
- [x] Phase 5: Add one North region and prove the storage boundary
- [x] Phase 6: Run the existing editor against the composite world
- [x] Phase 7: Persist seamless edits back into region files
- [x] Phase 8: Add the remaining seven scenery regions
- [x] Phase 9: Make rendering seamless across storage boundaries
- [ ] Phase 10: Apply runtime capabilities from manifest roles
- [ ] Phase 11: Extend liquids and reveal into scenery
- [ ] Phase 12: Profile, optimize, and validate the complete source world
- [ ] Phase 13: Design and implement production scenery baking separately

Tracker rule: check a phase only after its implementation, automated tests, persistence checks, and relevant visual or performance verification are complete. Planning a phase does not complete it.

# Seamless 3x3 World Expansion Plan

## Objective

Expand the current `64x64x32` world into one seamless `192x192x32` authoring world.

The source world is persisted as nine `64x64x32` region map files plus one manifest, but those files are storage partitions only. Once loaded, the editor and terrain systems operate on one `VoxelWorld`, one `MapEditorSession`, one coordinate space, and one undo history.

```text
[ north-west ][ north  ][ north-east ]
[ west       ][ center ][ east       ]
[ south-west ][ south  ][ south-east ]
```

The existing authored map becomes the center partition without changing its visible world position. The eight surrounding partitions provide distant scenery. At runtime, the character and camera remain constrained to the center area even though the complete landscape is visible.

## Fundamental Model

```text
WorldManifest
  -> references nine region map files
  -> assigns role and runtime capabilities

CompositeWorldLoader
  -> loads each 64x64x32 region
  -> offsets its local X/Z cells into global X/Z
  -> creates one 192x192x32 VoxelWorld
  -> creates one editor session

CompositeWorldSaver
  -> reads the one edited world
  -> partitions cells and region-owned metadata
  -> saves nine independent region files
```

The editor must not know that terrain is stored in nine files during ordinary editing. A brush crossing a region boundary is an ordinary brush operating on adjacent global cells.

## Coordinate Model

The composite world uses these logical coordinates:

```text
X: 0..191
Y: -12..19
Z: 0..191
```

Each persisted region uses local coordinates:

```text
X: 0..63
Y: -12..19
Z: 0..63
```

The center region occupies global cells:

```text
X: 64..127
Z: 64..127
```

Mapping the existing center cell `(x, y, z)` to `(x + 64, y, z + 64)` preserves its Three.js world position when the composite world is centered around `192x192`:

```text
old world X = x - 31.5
new world X = (x + 64) - 95.5
new world X = x - 31.5
```

The same applies to Z. Existing terrain, objects, camera targets, loader blocks, water, and gameplay therefore remain visually stationary.

## Core Invariants

1. Runtime and editor terrain are one `192x192x32` logical world.
2. Region files are persistence partitions, not separate interactive worlds.
3. The editor owns one `MapEditorSession` and one `VoxelWorld`.
4. Existing brush implementations continue operating on normal world coordinates.
5. One brush stroke produces one atomic undo command, including across file boundaries.
6. There is no layout-level selection and no region-focused editing mode.
7. There are no Show All, Focus, Isolate, or ghost-region controls.
8. Existing editor tools and their UI remain visually and behaviorally consistent.
9. The center map retains its authored data and visible positions.
10. All regions share the same vertical bounds: `minY=-12`, `height=32`.
11. Newly created regions use stone at `Y=-12..-1` and their authored surface at or above `Y=0`.
12. Terrain meshing, texture variation, water, and reveal use global coordinates after assembly.
13. Region roles affect runtime capabilities, not editor terrain behavior.
14. Baking is a later output representation, not part of source authoring.

## Explicitly Rejected Architecture

The implementation must not reintroduce:

- One active `MapEditorSession` per region.
- A `WorldLayoutEditor` coordinating nine editors.
- Cross-session brush dispatch.
- Region-specific undo stacks.
- Layout selection as a prerequisite for terrain editing.
- Show All, Focus, Isolate, or ghosting as core editor modes.
- Separate raycast and selection paths for each region.
- Region boundaries that affect brush footprints.
- Runtime hydration state inside terrain-authoring commands.
- Baking abstractions before the seamless source world is stable.

## Manifest Contract

The manifest owns world composition and policy. It does not contain terrain cell arrays.

Illustrative shape:

```json
{
  "schemaVersion": 1,
  "id": "portfolio-world",
  "dimensions": {
    "regionsX": 3,
    "regionsZ": 3,
    "regionWidth": 64,
    "regionDepth": 64,
    "minY": -12,
    "height": 32
  },
  "centerRegionId": "center",
  "regions": [
    {
      "id": "north-west",
      "gridX": 0,
      "gridZ": 0,
      "mapId": "portfolio-north-west",
      "role": "scenery"
    },
    {
      "id": "center",
      "gridX": 1,
      "gridZ": 1,
      "mapId": "portfolio-primary-flat",
      "role": "playable"
    }
  ]
}
```

Required validation:

- Exactly nine unique slots for the completed portfolio world.
- Exactly one playable center region.
- No duplicate IDs, map IDs, or grid positions.
- Grid positions remain within `0..2` on both axes.
- Every region has matching `64x64x32` bounds.
- Every region uses `minY=-12`.
- Missing files and invalid maps fail with region-specific errors.

Future optional settings can be added to manifest entries without changing the region map schema, for example:

- Runtime visibility.
- Collision participation.
- Navigation participation.
- Liquid simulation mode.
- Reveal participation.
- Baked asset reference.
- Level-of-detail policy.

## Data Ownership

### Region Map Files

Each region file owns:

- Terrain blocks, shapes, rotations, and state.
- Fluid source data belonging to cells in that region.
- Zone assignments for that region.
- Scenery entities authored in that region.
- Region-specific metadata.

### Manifest

The manifest owns:

- Region placement.
- Region role.
- Map-file references.
- Center/playable designation.
- Runtime capability settings.
- Future baked representation references.

### Center Gameplay Data

The center map continues to own current gameplay data unless a later requirement justifies moving a specific field:

- Spawn points.
- Navigation graph.
- Portfolio markers and interaction anchors.
- Gameplay entities.
- Camera presets.

Scenery maps may own decorative entities but do not automatically participate in gameplay systems.

## Save Semantics

The editor presents one map, but saving is a coordinated multi-file operation:

1. Snapshot the composite world and editor metadata.
2. Partition terrain by global X/Z into nine local-coordinate documents.
3. Partition fluids, zones, and region-owned entities using the same ownership rule.
4. Validate all nine generated documents before writing any of them.
5. Write drafts or files through one save transaction where the environment permits it.
6. Report partial-write failures explicitly; never silently leave a mixed revision.
7. Mark the composite editor clean only after every region save succeeds.

Undo and redo remain entirely in the composite editor session. They are unrelated to how a later save partitions the data.

## Runtime Capability Model

### Playable Center

- Terrain and water rendering.
- Character navigation and click-to-move.
- Collision and terrain-surface queries.
- Portfolio markers, triggers, and interactions.
- Gameplay entities and animation.
- Camera and character movement constraints.
- Full authored reveal behavior.

### Scenery Regions

- Terrain and water rendering.
- Decorative scenery entities.
- Reveal participation.
- Optional lightweight authored animation.

Scenery regions do not receive normal gameplay navigation, character destinations, portfolio interactions, triggers, continuous NPC simulation, or editor-like runtime mutation.

These policies are filters over one composite world. They must not require nine runtime worlds.

## Performance Strategy

The source editor can afford a larger logical world because logical cells are compact typed-array data and editing is local. Performance work should focus on rendered and simulated content:

- Continue using existing `16x16` internal render chunks.
- A `192x192` world contains `12x12 = 144` horizontal render chunks.
- Rebuild only dirty chunks touched by an edit.
- Keep surface meshing restricted to exposed faces.
- Avoid gameplay collision and navigation work outside the center bounds.
- Avoid continuous fluid simulation in settled scenery water.
- Frustum-cull scenery chunks.
- Measure reveal and editor rebuild costs before adding abstractions.
- Bake scenery only after the complete voxel source workflow is correct.

Production baking remains valuable because the eight scenery regions are visual-only. It is not a justification for making the source editor region-aware.

# Implementation Phases

## Phase 0: Expand And Migrate The Vertical World Range

Status: complete in commit `d0b4faf`.

Completed behavior:

- [x] Expanded the world from `Y=0..11` to `Y=-12..19`.
- [x] Added storage-index translation for negative logical Y.
- [x] Preserved all existing authored logical coordinates and world positions.
- [x] Added stone foundation at `Y=-12..-1`.
- [x] Kept existing authored terrain at and above `Y=0`.
- [x] Updated editor brushes, meshing, water, selection, camera bounds, and serialization.
- [x] Migrated `portfolio-primary-flat.map.json` to schema version 4.
- [x] Verified all 8,936 authored edits and non-terrain map data were preserved.
- [x] Passed the complete automated suite and production build.

## Phase 1: Lock The Seamless-World Contract And Capture Baselines

### Tasks

- [x] Record the current center map checksum and semantic data counts.
- [x] Capture screenshots of runtime, reveal completion, and key editor views.
- [x] Record editor load time, surface build time, draw calls, memory, and idle frame time.
- [x] Lock the global and region-local coordinate formulas.
- [x] Lock center gameplay bounds in global coordinates.
- [x] Confirm that the editor UX remains one seamless map with no region controls.
- [x] Document which center metadata remains local during persistence conversion.

### Locked Baseline

Source map: `lib/maps/portfolio-primary-flat.map.json` at commit `d0b4faf`.

```text
SHA-256                 0a4785001f9ddce7f471ed4794d354404b48d9618d431ab4c2f06bf5a89788c5
File bytes              844,000
Block edits             8,936
Fluid sources           0
Settled fluid cells     0
Zone definitions        10
Zone assignments        688
Markers                  0
Placed entities          2
Entity groups            0
Navigation nodes         0
Navigation edges         0
Navigation routes        0
Spawn points             1
Camera presets           1
```

The reproducible Playwright capture is `e2e/world-expansion-baseline.spec.ts`. It attaches full-page runtime and editor screenshots to the test report. A Chromium development/headless run at `1440x900` recorded:

```text
Logical cells            131,072
Air cells                 69,504
Non-air blocks             61,568
Horizontal chunks              16
Visible / culled chunks      14 / 2
Surface quads              15,454
Surface triangles          30,908
Runtime draw calls              21
Runtime frame sample       126.8 ms
Runtime surface build      402.8 ms
Editor draw calls               33
Editor frame sample         93.3 ms
Editor surface build       418.5 ms
Editor ready              18,183 ms
Editor used JS heap       131,000,000 bytes
```

These timings are development/headless comparison baselines, not production budgets. They must be compared under the same environment.

### Locked Coordinates And Ownership

- Region-local to global: `globalX = localX + gridX * 64`, `globalZ = localZ + gridZ * 64`.
- Global to region slot: `gridX = floor(globalX / 64)`, `gridZ = floor(globalZ / 64)`.
- Global to region-local: `localX = globalX % 64`, `localZ = globalZ % 64`.
- Center source cells add `(64,64)` during assembly and subtract `(64,64)` during persistence.
- Center gameplay cell bounds are inclusive global X/Z `64..127`.
- Center gameplay world-space ground bounds remain `-32..32` on X/Z; current cell centers remain `-31.5..31.5`.
- Terrain edits, shapes, fluids, and zone columns are region-local in files and global in the composite session.
- Grid markers and grid spawn points remain region-local in the center file and receive the center offset during assembly.
- Entity transforms, navigation positions, and camera presets remain world-space values and are not translated.
- Center gameplay metadata remains owned by the center map. Scenery files cannot redefine center gameplay defaults.
- The editor remains one seamless surface with no region-selection controls.

### Exit Criteria

- [x] Center preservation can be verified automatically and visually.
- [x] No unresolved coordinate or ownership decision blocks implementation.

## Phase 2: Make Horizontal World Dimensions Configurable

### Tasks

- [x] Remove assumptions that width and depth are always 64.
- [x] Derive horizontal chunk counts from each `WorldConfig` instance.
- [x] Support both `64x64x32` region worlds and `192x192x32` composite worlds.
- [x] Replace global chunk-count constants in instance methods with config-derived values.
- [x] Verify cell indexing, world conversion, chunk lookup, dirty propagation, and bounds at 192 cells.
- [x] Keep block size and internal chunk size unchanged.

### Required Tests

- [x] All corner cells round-trip for both sizes.
- [x] The composite world contains exactly 144 horizontal render chunks.
- [x] Center local cells retain their existing Three.js positions after the `+64` offset.
- [x] Dirty propagation remains local at ordinary chunk boundaries.

### Exit Criteria

- [x] A blank `192x192x32` world works without any region concepts.
- [x] Existing `64x64x32` maps still load and pass regressions.

## Phase 3: Define The World Manifest And Region-File Contract

### Tasks

- [x] Add manifest types, parser, validator, and cloning utilities.
- [x] Define the nine stable region IDs and grid positions.
- [x] Reference region documents by stable map ID.
- [x] Define `playable` and `scenery` roles.
- [x] Validate matching vertical and local horizontal bounds.
- [x] Add bundled-manifest registry support.
- [x] Keep map documents independently loadable for diagnostics.

### Exit Criteria

- [x] Valid center-only test fixtures and complete manifests parse deterministically.
- [x] Invalid slots, duplicate references, mismatched dimensions, and missing maps fail clearly.
- [x] No editor or renderer behavior changes in this phase.

## Phase 4: Assemble The Current Center Map Into One Seamless World

### Tasks

- [x] Create a composite loader that targets one `192x192x32` `VoxelWorld`.
- [x] Copy center terrain from local X/Z into global X/Z using offset `(64,64)`.
- [x] Convert center fluid and zone coordinates using the same offset.
- [x] Translate grid-owned markers and spawn points where required.
- [x] Preserve world-space entity transforms and camera values that must not move.
- [x] Preserve loader-platform world position and reveal timing.
- [x] Leave the eight unused areas empty during this compatibility phase.

### Exit Criteria

- [x] Runtime and editor screenshots match the current center-only baseline.
- [x] Every authored center cell maps back to its original region-local coordinate.
- [x] Soldier movement, water, markers, entities, navigation, and reveal remain unchanged.

## Phase 5: Add One North Region And Prove The Storage Boundary

### Tasks

- [x] Create one North `64x64x32` map with stone foundation and a simple test surface.
- [x] Add it to the manifest at grid position `(1,0)`.
- [x] Assemble it into global cells `X=64..127`, `Z=0..63`.
- [x] Confirm center and North cells are adjacent at global Z `63/64`.
- [x] Prove local-to-global-to-local round trips at the seam.
- [x] Keep both regions inside the same `VoxelWorld` and editor session.

### Exit Criteria

- [x] Center plus North load as one logical terrain volume.
- [x] No editor selection or tool code chooses an active region.
- [x] A direct cell edit on either side uses the same existing world API.

## Phase 6: Run The Existing Editor Against The Composite World

### Tasks

- [x] Pass the composite `VoxelWorld` to the normal `MapEditorSession`.
- [x] Keep the existing toolbar, tools, brush visuals, and shortcuts.
- [x] Expand camera framing and raycasting to the composite bounds.
- [x] Keep normal selection behavior across all global cells.
- [x] Verify paint, erase, raise, lower, flatten, fill, clear, paths, zones, shapes, and liquids.
- [x] Verify one history stack and one dirty-state indicator.
- [x] Do not add region UI.

### Exit Criteria

- [x] Existing tools behave normally in center and North.
- [x] A brush footprint crossing Z `63/64` is continuous and atomic.
- [x] Undo and redo restore the entire cross-boundary stroke in one action.

## Phase 7: Persist Seamless Edits Back Into Region Files

### Tasks

- [x] Implement deterministic global-to-region partitioning.
- [x] Convert partitioned cells back to local X/Z coordinates.
- [x] Partition fluids, zones, and region-owned entities.
- [x] Preserve center-only gameplay metadata without duplication.
- [x] Validate every output document before saving.
- [x] Add coordinated save failure reporting.
- [x] Reload the nine-file result and compare it with the pre-save composite world.

### Required Tests

- [x] A center-only load/save does not alter center authored data.
- [x] A cross-boundary stroke saves edits into both correct files.
- [x] Reloading produces a cell-for-cell equivalent composite world.
- [x] Undo history remains an editor concern and never leaks into files.

### Exit Criteria

- [x] The storage partition is invisible during editing and exact during save/load.

## Phase 8: Add The Remaining Seven Scenery Regions

### Tasks

- [x] Create the remaining region map files.
- [x] Initialize every new region with the standard vertical bounds and stone foundation.
- [x] Register all nine files in the manifest.
- [x] Assemble the complete `192x192x32` source world.
- [x] Add temporary terrain sufficient to inspect every seam.
- [x] Confirm all files can be edited and saved through the same session.

### Exit Criteria

- [x] All nine regions form one editable world.
- [x] No new region count increases editor architecture complexity.

## Phase 9: Make Rendering Seamless Across Storage Boundaries

Because the renderer receives one world, ordinary neighbor lookup should naturally cross former region boundaries. This phase verifies and removes any remaining 64-cell assumptions.

### Tasks

- [x] Verify face occlusion across every former region boundary.
- [x] Verify dirty render chunks on both sides rebuild when seam cells change.
- [x] Seed texture variants and rotations from global coordinates.
- [x] Verify grass covering, stone, water, shapes, and transparent faces at seams.
- [x] Ensure no region-edge overlays appear in runtime output.
- [x] Keep optional debug boundaries development-only.

### Exit Criteria

- [x] No cracks, duplicate faces, texture resets, or visible 64-cell partition lines remain.

## Phase 10: Apply Runtime Capabilities From Manifest Roles

### Tasks

- [ ] Define global center bounds from the center manifest slot.
- [ ] Restrict player destinations and navigation to center bounds.
- [ ] Restrict portfolio interaction and gameplay selection to center-owned content.
- [ ] Keep scenery terrain visible but non-interactive at runtime.
- [ ] Filter scenery collision and simulation work without splitting the world.
- [ ] Keep editor authoring unrestricted across all regions.

### Exit Criteria

- [ ] Users cannot enter or interact with scenery regions.
- [ ] Camera controls cannot expose invalid viewpoints beyond the intended center constraint.
- [ ] Scenery contributes no ordinary gameplay processing.

## Phase 11: Extend Liquids And Reveal Into Scenery

### Liquids

- [ ] Keep full existing water behavior in the center.
- [ ] Author scenery water through the same editor tools.
- [ ] Serialize scenery sources and settled results into the owning region file.
- [ ] Prefer settled/static runtime scenery water over continuous simulation.
- [ ] Define deliberate behavior for water crossing region-file boundaries.

### Reveal

- [ ] Preserve the current center reveal visually and temporally.
- [ ] Continue the same wave beyond the old center boundary using global world distance.
- [ ] Do not renormalize the center timing against the larger world.
- [ ] Reveal appropriate scenery entities once, after nearby terrain.
- [ ] Verify objects never restart their pop animation.

### Exit Criteria

- [ ] Center regressions are absent.
- [ ] Scenery water is visually convincing within the performance budget.
- [ ] Reveal reads as one continuous expansion across the complete world.

## Phase 12: Profile, Optimize, And Validate The Complete Source World

### Measurements

- [ ] Composite load and assembly time.
- [ ] Editor entry time.
- [ ] Initial surface build time.
- [ ] Cross-boundary brush latency.
- [ ] Save partitioning and serialization time.
- [ ] CPU frame time and GPU frame time.
- [ ] Draw calls, triangles, and texture memory.
- [ ] Reveal worst-frame time.
- [ ] Heap growth across repeated editor open/close cycles.

### Optimization Order

1. Remove accidental full-world rebuilds.
2. Reduce scenery simulation and interaction work.
3. Improve chunk culling and material batching.
4. Cache settled scenery liquids.
5. Only then introduce production baking.

### Exit Criteria

- [ ] Editor tools remain responsive on the complete source world.
- [ ] Runtime meets the agreed portfolio performance budget.
- [ ] No optimization compromises source authoring correctness.

## Phase 13: Design And Implement Production Scenery Baking Separately

This phase starts only after Phases 1-12 are stable.

### Intended Direction

- Keep all nine voxel region files as authoritative source data.
- Keep the center playable representation dynamic where required.
- Bake visual-only scenery terrain and suitable props into optimized assets.
- Reference baked outputs from optional manifest fields.
- Preserve the source-to-bake relationship for rebuilding.
- Decide separately how the reveal transitions from source voxel presentation to baked scenery.

### Not Yet Specified

- Baked file format.
- Mesh grouping and LOD strategy.
- Texture atlas generation.
- Occlusion data.
- Reveal shader implementation.
- Voxel-to-baked swap timing.

These decisions must be based on profiling the working `192x192x32` source world rather than guessed in advance.

# Final Acceptance Criteria

- [ ] The editor presents one seamless `192x192x32` world.
- [ ] All existing tools retain their established appearance and interaction model.
- [ ] Brushes cross former region boundaries normally.
- [ ] One action creates one undo entry.
- [ ] The world saves into nine region files through one coordinated save operation.
- [ ] Reloaded data is cell-for-cell equivalent to the saved composite world.
- [ ] The current center map remains visually and behaviorally unchanged.
- [ ] The eight surrounding regions are visible scenery but not playable runtime areas.
- [ ] Terrain, textures, water, and reveal do not expose storage boundaries.
- [ ] The implementation contains none of the rejected multi-editor architecture.
- [ ] Production baking remains a separate, measurable optimization stage.
