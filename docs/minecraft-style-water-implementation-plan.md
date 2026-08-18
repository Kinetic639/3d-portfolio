# Progress Tracker

- [x] Phase 0: Lock water mechanics and scope
- [x] Phase 1: Introduce the fluid data model
- [x] Phase 2: Implement the deterministic water solver
- [x] Phase 3: Build the dedicated water mesher
- [x] Phase 4: Add the stylized water renderer
- [x] Phase 5: Integrate liquid authoring into the editor
- [x] Phase 6: Add map persistence, migration, and baking
- [ ] Phase 7: Integrate settled water into portfolio runtime
- [ ] Phase 8: Add entity and navigation interaction rules
- [ ] Phase 9: Author and validate the creek, ponds, and waterfalls
- [ ] Phase 10: Profile, optimize, and release

Tracker rule: check a phase only after its exit criteria and automated tests pass. A phase with implementation work still awaiting verification remains unchecked.

# Minecraft-Style Water Implementation Plan

## Objective

Introduce functioning voxel water across the world model, editor, renderer, map format, and portfolio runtime. Water must propagate and recede using Minecraft-like cellular rules while remaining inexpensive when the published portfolio contains mostly settled ponds, a creek, and a small number of waterfalls.

The implementation must distinguish between:

- Authored source water.
- Derived flowing water.
- Falling water.
- Visual animation.
- Runtime simulation.

The published portfolio should render a pre-settled result and perform no continuous fluid simulation unless the world is modified at runtime.

## Non-Goals For The First Release

- Physically accurate or volume-conserving fluid dynamics.
- Navier-Stokes simulation.
- Ocean-scale waves.
- Real-time planar reflections.
- Screen-space reflections or refraction.
- Underwater gameplay, swimming, drowning, or buoyancy.
- Lava or fluid mixing.
- Fully general waterlogging of every partial voxel shape.
- Destructible terrain in the published portfolio.
- Multiplayer or server-authoritative simulation.

The data model should leave room for waterlogging and additional fluid types without requiring another fundamental redesign.

## Mechanics Baseline

The first release should follow Minecraft Java-style behavior closely enough to be recognizable and predictable:

1. A source cell contains permanent full water until explicitly removed.
2. Water first attempts to propagate downward.
3. When downward propagation is blocked, water spreads through the four horizontal neighbors.
4. Horizontal flow weakens by one level per cell.
5. Horizontal water stops after seven cells from valid incoming water on flat terrain.
6. When multiple horizontal routes exist, water prefers routes that reach a downward opening using the shortest bounded search.
7. Water with no source or incoming flow recedes.
8. Neighbor changes schedule local fluid updates.
9. Optional infinite-source behavior converts a supported cell into a source when it has at least two horizontal source neighbors.
10. Falling water retains a full-looking vertical column while carrying a falling flag.

References:

- [Minecraft Wiki: Water](https://minecraft.fandom.com/wiki/Water)
- [Minecraft Wiki: Fluid](https://minecraft.wiki/rest.php/v1/page/Fluid/html)
- [Fabric Yarn: FlowableFluid](https://maven.fabricmc.net/docs/yarn-1.19.4-rc2%2Bbuild.1/net/minecraft/fluid/FlowableFluid.html)
- [Forge JavaDocs: FlowingFluid](https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.16.5/net/minecraft/fluid/FlowingFluid.html)

## Existing Project Baseline

Phase 1 now provides the fluid foundation:

- Fluid type, level, and flags are stored independently from terrain.
- Stable fluid IDs distinguish empty cells from water.
- Source and falling states have explicit flags.
- `VoxelWorld` exposes validated fluid mutation and snapshot APIs.
- Fluid chunks have independent dirty tracking.
- Solid terrain edits remove fluid that can no longer be contained.
- Editor terrain history restores displaced fluid on undo and redo.
- World diagnostics report fluid, source, and falling-cell counts.

The retired terrain Water block, Water shape, editor palette item, and basic
transparent terrain material have been removed. They were unused prototypes and
are not a compatibility surface. Phase 1 intentionally does not include a
solver, water mesher, liquid editor mode, map persistence, or runtime rendering.

## Architectural Principles

### Separate Simulation From Rendering

The solver produces deterministic fluid state. The mesher converts that state into geometry. The shader animates appearance. A shader animation must never change simulation state, and the simulation must not rebuild geometry every frame.

### Separate Fluid From Solid Terrain

A voxel must be able to contain solid shape information and fluid information independently. This mirrors Minecraft's separation of block state and fluid state and prevents water from permanently competing with slabs, banks, plants, and future waterloggable shapes.

### Author Sources, Derive Flow

The editor should save source intent as authoritative data. Flowing and falling water are derived by the solver. A settled cache may be saved for fast runtime loading, but it must be invalidated when its source or terrain fingerprint changes.

### Incremental Updates Only

Normal edits enqueue the changed cell and nearby cells. They do not rescan all 49,152 world cells. Dirty water chunks are rebuilt once per processed batch rather than once per changed cell.

### Deterministic Results

The same world, sources, settings, and solver version must always settle to the same water state regardless of frame rate. Simulation order must be stable and covered by tests.

## Proposed Fluid Data Model

Add a dedicated fluid layer to `VoxelWorld`.

```ts
const FLUID_IDS = {
  None: 0,
  Water: 1,
} as const;

type FluidId = (typeof FLUID_IDS)[keyof typeof FLUID_IDS];

const FLUID_FLAGS = {
  Source: 1 << 0,
  Falling: 1 << 1,
} as const;
```

Store one byte per cell for each field:

```ts
fluidTypes: Uint8Array;
fluidLevels: Uint8Array;
fluidFlags: Uint8Array;
```

Level semantics:

- `0`: full source or full falling water.
- `1..7`: progressively weaker horizontal flow.
- `255`: no fluid, if a sentinel is useful internally; otherwise use `fluidTypes[index] === None`.

Do not reuse shape state as the authoritative fluid state. Shape state currently serves many unrelated shapes and uses visual height semantics opposite to Minecraft flow depth.

### Required World APIs

Add narrow APIs instead of exposing mutable arrays throughout the application:

```ts
getFluid(x, y, z): FluidCell;
setFluid(x, y, z, fluid: FluidCell): boolean;
setFluidSource(x, y, z, fluidId): boolean;
clearFluid(x, y, z): boolean;
canContainFluid(x, y, z, fluidId): boolean;
markFluidChunkDirtyForCell(x, z): void;
cloneFluidLayer(): FluidLayerSnapshot;
restoreFluidLayer(snapshot): void;
```

`setBlock`, `setShape`, and `setCell` must notify the fluid system when a terrain edit changes containment or opens/closes a flow route.

### Containment Policy

First release:

- Air cells can contain water.
- Full solid cubes reject water.
- Partial terrain shapes reject water unless explicitly marked fluid-compatible.
- Retired Water block and shape IDs are invalid rather than migrated.

Later release:

- Add per-shape fluid occupancy and exposed-face rules.
- Support waterlogged slabs, stairs, banks, vegetation, and decorations.

## Phase 0: Lock Water Mechanics And Scope

### Tasks

- [x] Confirm Java-style seven-cell horizontal range.
- [x] Confirm four-cell downward-route lookahead.
- [x] Confirm downward flow priority.
- [x] Decide whether infinite-source creation is enabled by default.
- [x] Decide whether sources can be removed during portfolio runtime.
- [x] Define which current shapes can contain water in release one.
- [x] Define whether water leaving world bounds drains or is blocked.
- [x] Define editor simulation speed and maximum work per frame.
- [x] Record the solver rules as pure input/output examples before implementation.

### Locked Release-One Decisions

- Horizontal range is seven cells, producing levels `1` through `7`; level `8` is empty.
- Downward-route lookahead is a bounded four-cell horizontal breadth-first search.
- A containable cell below always takes priority over horizontal spreading.
- Infinite-source creation is enabled by default and configurable per map.
- A supported cell becomes a source only with at least two horizontal source neighbors.
- Portfolio runtime cannot remove sources or modify terrain in release one.
- Only terrain-air cells can contain water; all solid and partial shapes reject it.
- An open world boundary drains water. World edges do not behave as invisible walls.
- Editor logical ticks are 250 ms when animated.
- Editor processing is capped at 2-4 ms per animation frame, with a secondary cell budget.
- Published maps load settled water and run no repeating simulation ticks.
- Solver batches read the previous logical state and commit deterministically by cell index.
- Sources remain until an explicit editor action removes them; all non-source water is derived.
- Falling water is visually full height and continues downward until blocked or out of bounds.
- When a falling stream lands, horizontal flow begins from the strongest valid incoming state.

### Locked Input/Output Examples

Notation: `S` is a source, `1..7` are horizontal flow levels, `F` is falling
water, `#` is rejecting terrain, and `.` is an empty containable cell. Examples
show the settled result; omitted cells remain unchanged.

| # | Input | Expected settled output |
|---:|---|---|
| 1 | Supported row `.......S.......` | `7654321S1234567` |
| 2 | Supported row `........S` with eight empty cells to its left | The nearest seven cells become `1..7`; the eighth remains `.` |
| 3 | `S` with an open cell directly below | The lower cell becomes `F`; no horizontal neighbor is filled while downward flow is available |
| 4 | `S` above a ten-cell open vertical shaft | Every in-bounds cell below becomes `F` until terrain or the world boundary |
| 5 | A blocked source with one horizontal route reaching a drop in two steps and another in three | Only the two-step route is selected initially |
| 6 | A blocked source with equal nearest drops east and west | Both tied directions receive level `1` flow |
| 7 | A blocked source whose nearest drop is five horizontal cells away | The four-cell search finds no preferred drop, so all containable horizontal directions spread |
| 8 | Derived row `S123` after removing `S` with no other incoming water | All four cells settle to `.` |
| 9 | Supported center `.` with horizontal source neighbors `S.S`, infinite sources enabled | Center settles to `S` |
| 10 | Same `S.S` input with infinite sources disabled | Center derives ordinary flow and does not become `S` |
| 11 | Water adjacent to a full cube or any partial terrain shape | It does not enter the rejecting cell |
| 12 | Water reaches an open world-edge neighbor | The out-of-bounds flow drains; no boundary cell is synthesized |
| 13 | The same queued edits are supplied in different insertion orders | Final fluid arrays are byte-identical |
| 14 | Falling water lands on terrain with supported horizontal air beside it | The vertical column remains `F` and horizontal levels spread from the landing cell |

### Exit Criteria

- Mechanics decisions are documented and no solver behavior remains ambiguous.
- At least ten representative grid examples have expected settled outputs.

## Phase 1: Introduce The Fluid Data Model

### Target Areas

- `lib/world/voxel-world.ts`
- `lib/world/world-config.ts`
- New `lib/fluids/fluid-types.ts`
- New `lib/fluids/fluid-containment.ts`
- Existing world and map tests

### Tasks

- [x] Define stable fluid IDs and flags.
- [x] Add fluid typed arrays to `VoxelWorld` construction.
- [x] Add validated read/write APIs.
- [x] Add cloning and snapshot restoration.
- [x] Add dedicated dirty-water-chunk tracking.
- [x] Ensure boundary writes fail without corrupting state.
- [x] Define fluid containment against block and shape definitions.
- [x] Make solid edits invalidate incompatible fluid cells.
- [x] Preserve fluid arrays across editor undo/redo snapshots.
- [x] Add fluid counts to world diagnostics.
- [x] Add unit tests for indexing, copying, mutation, and containment.

### Memory Budget

For 49,152 cells, three one-byte arrays consume approximately 147 KB. The complete fluid state, scheduler metadata, and snapshots should remain comfortably below 1 MB for normal runtime use.

### Exit Criteria

- Fluid state is independent of terrain block and shape state.
- World cloning and undo/redo preserve fluid exactly.
- No fluid simulation or rendering is required yet.
- Unit tests cover all world-layer APIs.

## Phase 2: Implement The Deterministic Water Solver

### Target Areas

- New `lib/fluids/water-simulator.ts`
- New `lib/fluids/fluid-scheduler.ts`
- New `lib/fluids/water-rules.ts`
- New test fixtures under `lib/fluids/__tests__` or the repository's established test layout

### Implementation Status

Phase 2 is implemented in `fluid-scheduler.ts`, `water-rules.ts`, and
`water-simulator.ts`. The simulator performs one initial source discovery scan
when attached to a world. Subsequent updates rebuild only the graph reachable
from authored sources and the previously managed fluid cells; they do not scan
all world cells. Rendering, persistence, and editor playback controls remain in
their later phases.

### Scheduler

Use a deterministic queue with cell deduplication:

- Queue stores cell indices and target logical tick.
- A bitset or generation array prevents duplicate work for the same scheduled tick.
- Changed cells enqueue themselves and six direct neighbors.
- Terrain edits enqueue nearby water and possible destination cells.
- Processing order is stable by logical tick and cell index.
- A batch returns changed cells and dirty water chunks.
- Solver contains no React, Three.js, DOM, or wall-clock dependencies.

### Cell Evaluation

For a scheduled cell:

1. Read a consistent snapshot of relevant neighbors.
2. Preserve explicitly authored sources unless removed or invalidated.
3. If compatible water exists above, derive full falling water.
4. Check the cell below and prioritize downward propagation.
5. If downward propagation is blocked, inspect four horizontal neighbors.
6. Derive the best incoming horizontal level.
7. Reject derived flow beyond level seven.
8. Count neighboring sources for optional source regeneration.
9. Search eligible horizontal directions for downward openings.
10. Produce the next state without immediately mutating unrelated neighbors.
11. Commit the batch deterministically.
12. Enqueue cells affected by changes.

### Downward-Route Search

Implement a bounded breadth-first search from each eligible horizontal neighbor:

- Search only horizontal moves.
- Stop when a cell has a valid downward opening.
- Limit search depth to four cells.
- Do not immediately reverse into the originating cell.
- Respect solid face containment.
- Select all directions tied for the shortest valid route.
- If no downward route exists, spread to all otherwise valid directions.

### Receding

Derived water must disappear when it loses all valid incoming support:

- Removing a source schedules its former flow region incrementally.
- A falling column disappears from top to bottom when its incoming water ends.
- Neighboring sources remain stable.
- Receding must not oscillate between two equivalent states.

### Required Solver Tests

- [x] One source spreads seven cells on a flat supported channel.
- [x] The eighth horizontal cell remains dry.
- [x] Water flows downward without a vertical distance limit inside world bounds.
- [x] Flow level resets appropriately after reaching a lower supported elevation.
- [x] Water selects the nearest downward opening.
- [x] Equal downward routes both receive flow.
- [x] Walls and closed solid faces block flow.
- [x] An enclosed basin fills only according to available source rules.
- [x] Removing the only source causes derived water to recede.
- [x] Two supported neighboring sources create a source when enabled.
- [x] Infinite-source creation does not occur when disabled.
- [x] Fluid behavior is correct across chunk boundaries.
- [x] Fluid drains at configured open world boundaries.
- [x] Replaying the same input produces byte-identical output.
- [x] The solver always terminates for representative worlds.

### Exit Criteria

- All solver tests pass without rendering or editor code.
- Settling a representative creek is deterministic.
- A single update never requires a whole-world scan.

## Phase 3: Build The Dedicated Water Mesher

### Target Areas

- New `lib/terrain/water-mesher.ts`
- `lib/terrain/terrain.ts`
- `lib/terrain/surface-mesher.ts`
- Mesher unit tests

### Implementation Status

Water now builds into independent chunk meshes with smoothed top corners,
exposed shore and waterfall sides, internal-face removal, flow vectors, falling
flags, foam factors, and triangle-to-cell mappings. Chunk-edge heights are
sampled from world coordinates so neighboring chunks produce matching seams.

### Mesh Separation

Water must use dedicated chunk meshes rather than sharing the opaque surface chunk's material classification.

Each water chunk should provide:

```ts
type WaterChunkMeshData = {
  id: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  flowVectors: Float32Array;
  fallingFlags: Float32Array;
  foamFactors: Float32Array;
  indices: Uint32Array;
  triangleToCell: Uint32Array;
};
```

### Geometry Rules

- Generate a top face when water is not covered by compatible water above.
- Generate side faces against air, lower water, and non-occluding partial shapes.
- Generate vertical waterfall faces for falling water.
- Omit internal faces between compatible water cells.
- Keep water slightly inset or offset to avoid z-fighting with banks.
- Preserve cell-to-triangle mappings for editor picking.
- Rebuild water independently from opaque terrain.

### Surface Heights

Calculate four top-corner heights from the cell and neighboring fluid levels:

- Full/source neighbors pull shared corners upward.
- Lower flow levels create a readable slope.
- Water above forces the surface to full height.
- Shared corners must produce identical heights in adjacent cells.
- Height calculations must not create cracks at chunk boundaries.

### Flow Vectors

Derive a horizontal flow vector from neighboring surface heights:

- Flat enclosed sources produce a zero vector and use still-water animation.
- Sloped flow points toward lower neighboring levels.
- Falling cells receive a vertical-flow classification.
- Store flow direction per vertex or per face for shader use.

### Required Mesher Tests

- [x] Adjacent full water produces a flat crack-free surface.
- [x] Flow levels produce consistent slopes.
- [x] Chunk-boundary corners match exactly.
- [x] Internal water faces are removed.
- [x] Exposed shore and waterfall sides are generated.
- [x] Falling flags and flow vectors map to the correct faces.
- [x] Triangle-to-cell picking remains correct.

### Exit Criteria

- Water and opaque geometry are independently generated and rebuilt.
- Ponds, sloped creeks, and waterfalls can be represented without per-cell objects.

## Phase 4: Add The Stylized Water Renderer

### Target Areas

- `components/experience/PortfolioExperience.tsx`
- Prefer extracting water rendering into a focused component/module instead of enlarging the existing file further
- `public/textures/water/`
- Shader tests or visual regression coverage where practical

### Implementation Status

The portfolio runtime now renders all non-empty water chunks with one shared
transparent `ShaderMaterial`. Procedural directional bands distinguish still,
flowing, and falling water; shoreline foam and dark side accents support the
graphic outlined art direction. Water uses a stable render order, does not write
depth, updates only the existing shared time uniform, and disposes material and
geometry GPU resources on replacement or unmount.

### Material Strategy

Use one shared stylized water material for all water chunks:

- Transparent forward-rendered surface.
- Shared `uTime` animation uniform.
- Still and flowing texture treatments.
- Flow-vector-directed UV animation.
- Faster vertical scrolling for waterfalls.
- Limited cyan/blue palette.
- Dark shoreline accents compatible with the future outlined visual style.
- Foam mask at sharp drops, waterfall bases, and selected obstacle boundaries.
- No real-time reflection camera.
- No screen-space reflection or refraction.

### Transparency Rules

- Render opaque terrain before water.
- Keep water in a dedicated render layer or predictable render order.
- Avoid overlapping internal water surfaces.
- Evaluate `depthWrite` carefully against shorelines and entities.
- Keep shader work bounded and avoid extra render targets.
- Use a fallback material for reduced-motion or low-quality mode if necessary.

### Waterfall Effects

Waterfalls should be visually animated but geometrically static after settling:

- Vertical UV scrolling provides most motion.
- Top and bottom foam use small strip geometry or shader masks.
- Optional particles are capped at 10-30 visible particles per waterfall.
- Particles pause or reduce under reduced-motion settings.
- Off-screen waterfall effects do not update unnecessarily.

### Exit Criteria

- Still ponds appear calm rather than frozen.
- Creek surfaces visibly communicate flow direction.
- Waterfalls read clearly without simulation or geometry updates every frame.
- The visual style remains graphic and cartoon-like rather than realistic.

## Phase 5: Integrate Liquid Authoring Into The Editor

### Implementation Status

The editor now has a dedicated Liquid workspace with source, removal, and
inspection tools; play/pause, step, settle, reset, and clear-flow controls; an
infinite-source toggle; fluid diagnostics; direct water-surface picking; and a
selected-cell source/level/falling/flow overlay. Source strokes and their
derived settled results are stored as one undoable transaction. Basin filling
uses an explicit point preview, rejects open-boundary leaks, and requires
confirmation before creating sources.

### Editor Mode

Introduce a dedicated Liquid mode or dedicated subsection under Terrain. Water should not remain an ordinary material choice because authors place sources, not final derived flow cells.

### Core Tools

- [x] Source brush: place permanent water source cells.
- [x] Remove brush: remove authored sources and schedule receding.
- [x] Inspect tool: show source, level, falling state, and incoming direction.
- [x] Play/Pause control: run or suspend scheduled water ticks.
- [x] Step control: process one logical water tick.
- [x] Settle control: process until stable within a safety limit.
- [x] Reset control: restore fluid state from the last saved/source snapshot.
- [x] Clear derived flow: remove non-source water without deleting sources.
- [x] Infinite-source toggle: configure map behavior.

### Basin Fill Tool

Add after source painting is reliable:

1. Author selects a basin cell and target waterline.
2. Tool flood-fills connected containable cells below that waterline.
3. Tool aborts or warns when the basin reaches an open world boundary.
4. Preview displays the proposed fill region.
5. Confirmation creates the required source layout.
6. The normal solver validates and settles the result.

The tool must not directly bypass fluid rules by writing unexplained derived water.

### Debug Visualization

Provide a developer overlay using color and compact numeric labels:

- Source: distinct full-water color.
- Horizontal levels 1-7: graduated colors.
- Falling: separate color or arrow.
- Flow vector: directional arrow.
- Pending scheduler cells: transient highlight.
- Leaking boundary cells: warning highlight.

### Undo/Redo

An editor action should store source edits and the resulting settled fluid transaction coherently:

- Placing one source is one undoable action.
- Automatic derived changes do not create hundreds of history entries.
- Undo restores both authored source state and derived settled state.
- Redo reruns or restores the deterministic result.

### Responsiveness

- Process simulation with a 2-4 ms frame budget.
- Cap processed cells per frame as a secondary safety limit.
- Batch dirty-water-chunk rebuilds after each frame's solver work.
- Display pending work in existing editor diagnostics.
- Provide cancellation for long settle or basin operations.

### Exit Criteria

- A user can create, inspect, settle, remove, undo, redo, and save water without directly editing derived flow levels.
- Large pond operations do not freeze editor input.

## Phase 6: Add Map Persistence, Migration, And Baking

**Status:** Complete. Map document v4 and map definition schema v3 persist authoritative authored sources and settings, include fingerprinted settled caches, rebuild stale caches deterministically, preserve fluid data through editor/import/export paths, and reject retired IDs or invalid source containment. Solver-generated infinite sources remain derived rather than becoming authored on save.

### Target Areas

- `lib/world/map-document.ts`
- Map definitions and validation
- Map import/export UI
- Bundled map loading
- Migration tests

### Map Format

Introduce a new map document version containing:

```ts
type FluidDocument = {
  encoding: "fluid-sources-v1";
  settings: {
    infiniteSources: boolean;
    openBoundaryDrains: boolean;
    solverVersion: string;
  };
  sources: EncodedFluidSource[];
  settledCache?: {
    terrainFingerprint: string;
    sourceFingerprint: string;
    solverVersion: string;
    cells: EncodedFluidCell[];
  };
};
```

### Authoritative And Derived Data

- Sources and fluid settings are authoritative.
- Settled flow is a replaceable cache.
- Cache is valid only when terrain, sources, settings, and solver version match.
- Invalid cache triggers deterministic settling during load or a build-time baking step.
- Production maps should ship with a valid settled cache.

### Versioning And Retired IDs

There is no legacy-water migration. The old Water block and Water shape were
never used by authored maps and have been removed completely:

- Retired numeric block ID `6` and shape ID `22` are invalid.
- Import validation must report these IDs instead of guessing intent.
- Map-version migration only introduces the new authoritative fluid document.
- Loaders must never silently convert or rewrite user map files.

### Validation

Add map validation messages for:

- Fluid source inside a rejecting solid shape.
- Unsupported fluid ID or flag.
- Invalid level.
- Settled cache fingerprint mismatch.
- Solver version mismatch.
- Fluid leaking through an unintended world boundary.
- Excessive pending work after the settle safety limit.

### Exit Criteria

- Existing maps that do not use retired prototype IDs still load.
- Retired prototype IDs fail validation clearly.
- Export/import round trips sources and settled water without data loss.
- Production can load water without running a visible fill simulation.

## Phase 7: Integrate Settled Water Into Portfolio Runtime

### Runtime Rules

- Load the baked settled cache before or during terrain preparation.
- Reveal water coherently with the terrain expansion.
- Do not start a repeating solver loop after settlement.
- Animate only shader uniforms and bounded visual effects.
- Start local simulation only after an actual terrain or source mutation.
- Stop the simulator immediately when its queue becomes empty.

### Reveal Integration

Water should not appear before its creek bed and pond terrain:

- Reuse compatible terrain reveal timing per water cell.
- Keep transparent sorting stable during expansion.
- Ensure waterfall faces do not flash before adjoining top surfaces.
- Avoid rebuilding settled water during the reveal.

### Runtime Diagnostics

Extend diagnostics with:

- Water cell count.
- Water chunk count.
- Water triangles and draw calls.
- Pending fluid updates.
- Last simulation batch duration.
- Last water-mesh rebuild duration.
- Settled-cache hit/miss.

### Exit Criteria

- Normal portfolio exploration reports zero pending water simulation work.
- Water animation causes no React rerenders.
- Runtime does not rebuild water geometry unless the world changes.

## Phase 8: Add Entity And Navigation Interaction Rules

### First Release

- Water surfaces remain non-walkable.
- Click-to-move rejects water destinations.
- Navigation generation treats water cells as blocked unless a bridge or explicit navigation link exists.
- Objects cannot use water as solid placement support.
- Raycasting can still inspect/select water in Liquid editor mode.

### Later Extensions

- Swimming navigation layer.
- Current vector influence on characters and particles.
- Wading through shallow water.
- Splash effects at entry points.
- Underwater camera treatment.
- Sound zones derived from waterfalls and creek flow strength.

### Exit Criteria

- Existing Soldier movement cannot accidentally walk on or stand inside water.
- Bridges and authored crossings remain navigable.

## Phase 9: Author The Creek, Ponds, And Waterfalls

### Creek Workflow

1. Validate the complete creek bed is continuous and made from Riverbed, Sand, Stone, or intended bank materials.
2. Inspect elevation changes and identify waterfall/drop cells.
3. Seal unintended side and bottom leaks.
4. Place upstream source cells.
5. Settle and inspect flow direction.
6. Add intentional supporting sources where the creek exceeds Minecraft's seven-cell horizontal propagation distance.
7. Validate water crosses chunk boundaries cleanly.
8. Add foam and waterfall visual markers only after the physical flow is correct.

### Pond Workflow

1. Validate basin containment.
2. Select the intended waterline.
3. Preview basin fill.
4. Create a supported source surface.
5. Settle and confirm the pond remains flat and still.
6. Inspect every shore for cracks and transparency artifacts.
7. Confirm no hidden leak produces unnecessary solver work.

### Waterfall Workflow

1. Confirm the top source and downward opening.
2. Verify a continuous falling column reaches its intended catch basin.
3. Generate vertical waterfall faces.
4. Add top lip and bottom foam treatment.
5. Add a small bounded particle effect only if the shader is insufficient.
6. Verify reduced-motion behavior.

### Exit Criteria

- Every intended water feature settles with an empty scheduler queue.
- No unintended map-edge drain exists.
- Creek flow direction is visually readable.
- Ponds remain visually flat.
- Waterfalls connect top and bottom water bodies without gaps.

## Phase 10: Profile, Optimize, And Release

### Performance Budgets

| Metric | Target |
|---|---:|
| Settled runtime simulation | 0 ms/frame |
| Runtime fluid memory | Less than 1 MB |
| Visible water draw calls | 1-16 |
| Runtime water mesh rebuilds | 0 during normal exploration |
| Water shader uniform updates | One shared update per frame |
| Editor solver budget | 2-4 ms/frame maximum |
| Waterfall particles | 10-30 per visible waterfall |
| Water textures | 64x64 or 128x128 |

### Profiling Scenarios

- [ ] Empty world with no water.
- [ ] Final authored portfolio from overview camera.
- [ ] Camera close to the largest pond.
- [ ] Camera viewing all waterfalls simultaneously.
- [ ] Editor placing one source in an empty channel.
- [ ] Editor removing the primary creek source.
- [ ] Editor filling the largest basin.
- [ ] Simulation crossing four chunk boundaries.
- [ ] Reduced-motion mode.
- [ ] Mobile viewport and constrained device profile.

### Optimization Order

Optimize only after measurements identify a problem:

1. Remove redundant internal and overlapping water faces.
2. Batch solver changes before rebuilding chunks.
3. Rebuild only dirty water chunks.
4. Reduce transparent overdraw.
5. Cull off-screen waterfall effects.
6. Reduce particle count.
7. Simplify shader instructions or provide a quality tier.
8. Move large editor-only settle operations to a worker only if profiling proves it necessary.

### Release Checks

- [ ] Production build succeeds.
- [ ] Unit and integration tests pass.
- [ ] Map migration tests pass.
- [ ] Editor E2E authoring workflow passes.
- [ ] Portfolio reveal E2E passes with water enabled.
- [ ] No WebGL shader validation errors occur.
- [ ] No transparent sorting defects are visible in reference views.
- [ ] Runtime scheduler remains empty during normal exploration.
- [ ] Desktop and mobile frame-time budgets are met.
- [ ] The settled cache matches the current terrain and solver version.

### Exit Criteria

- Water meets the functional, visual, editor, persistence, and performance requirements.
- The final portfolio runs with baked settled water and no continuous solver cost.

## Test Matrix

### Unit Tests

- Fluid storage and validation.
- Source creation and removal.
- Horizontal level derivation.
- Downward propagation.
- Bounded slope search.
- Infinite-source behavior.
- Receding behavior.
- Stable deterministic scheduling.
- Water corner-height calculation.
- Flow-vector calculation.
- Chunk-boundary meshing.
- Serialization and format versioning.

### Integration Tests

- Terrain edit opens a leak and schedules nearby water.
- Terrain edit closes a channel and causes rerouting.
- Editor undo restores source and settled flow.
- Editor redo restores the same deterministic result.
- Saving and reloading preserves the settled appearance.
- Invalid baked cache is rejected and regenerated.
- Soldier destination selection rejects fluid surfaces.

### End-To-End Tests

- Place a source, observe propagation, settle, and save.
- Remove a source, observe receding, undo, and redo.
- Fill a closed pond basin.
- Detect and cancel an open/leaking basin fill.
- Load the production map and enter exploration without runtime simulation activity.

### Visual Regression Views

- Flat pond shore.
- Creek slope.
- Inner and outer creek bends.
- One-block waterfall.
- Multi-block waterfall.
- Water crossing a chunk boundary.
- Water beside stairs, slabs, and terrain banks.
- Terrain reveal with transparent water.

## Risk Register

### Transparent Sorting

Risk: water renders in the wrong order against itself, terrain, or entities.

Mitigation: dedicated water pass, internal-face removal, stable chunk ordering, minimal overlapping surfaces, and reference screenshots.

### Solver Oscillation

Risk: cells alternate indefinitely after source removal or competing updates.

Mitigation: deterministic batched evaluation, stable ordering, explicit source authority, termination tests, and a settle safety limit.

### Editor Freezes

Risk: large basin fills or receding regions monopolize the main thread.

Mitigation: scheduled batches, a 2-4 ms frame budget, cancellation, batched mesh rebuilds, and worker escalation only if measured.

### Map Format Churn

Risk: changing fluid semantics invalidates authored maps.

Mitigation: versioned source encoding, solver versioning, derived cache fingerprints, explicit format upgrades, and clear rejection of retired prototype IDs.

### Water And Partial Shapes

Risk: water intersects slabs, banks, and other non-cube geometry.

Mitigation: conservative release-one containment, per-shape compatibility metadata, and defer general waterlogging until occupancy rules exist.

### Visual Scope Expansion

Risk: realistic water features consume time and GPU budget without serving the portfolio style.

Mitigation: enforce the stylized shader scope and prohibit expensive reflection/refraction systems unless later profiling and art direction justify them.

## Definition Of Done

The water feature is complete when:

- Authors place sources rather than manually painting final flow cells.
- Water flows downward, spreads horizontally, chooses sensible downhill routes, and recedes when unsupported.
- Ponds, the creek, and waterfalls settle deterministically.
- Water is stored separately from solid terrain.
- Water has dedicated chunked geometry and a stylized shared material.
- The editor provides simulation, inspection, undo, redo, settle, and save workflows.
- The map format stores authoritative sources and a validated settled cache.
- The published portfolio loads settled water without continuous simulation.
- Characters and navigation respect water as non-walkable.
- Automated tests cover solver rules, persistence, meshing, editor behavior, and runtime loading.
- Runtime performance remains within the budgets above on desktop and mobile reference devices.
