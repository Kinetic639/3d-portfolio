# Production roadmap

Planning baseline: 2026-09-06. Proposed sequence for review; this document does not authorize implementation.

Use [the progress tracker](progress-tracker.md) to answer what is finished, active and next. Use this roadmap to understand why work is ordered this way. Package responsibilities remain defined by the [architecture guide](architecture-guide.md), [architecture specification](architecture.md) and [ADRs](decisions/). This roadmap expands the approved [first vertical slice](first-vertical-slice.md) into smaller milestones; it does not replace the agreed boundaries.

## Current foundation

| Workspace                    | What actually exists                                                                                    | What does not exist yet                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `apps/portfolio`             | Working Next.js DOM shell using generic portfolio identity                                              | Real navigation, portfolio pages, case studies, accessibility acceptance or 3D entry |
| `apps/editor`                | Working Next.js shell; EditorSession/PlaySession declarations                                           | Editing sessions, persistence, viewport, tools or Play                               |
| `packages/contracts`         | WorldRuntime commands/events/snapshot/lifecycle types; minimal runtime manifest and diagnostic types    | Production-proven behavior contracts or complete map formats                         |
| `packages/world-authoring`   | Source envelope with version/id/revision; implemented envelope validator; separate editing type exports | World authoring operations, undo/redo, terrain/entity formats or document storage    |
| `packages/world-build`       | Build request/result declarations; restricted source-schema/validation dependencies                     | Compilation, baking, asset processing or incremental build engine                    |
| `packages/runtime`           | Facade re-export and factory type                                                                       | Executable WorldRuntime, renderer, scheduler, resource ownership or map loading      |
| `packages/experience-ui`     | ExperienceHost declaration                                                                              | Host implementation, gameplay DOM UI or runtime communication                        |
| `packages/portfolio-content` | Immutable generic portfolio identity                                                                    | Actual project content, documents and reusable content presentation                  |
| `packages/diagnostics`       | Observation subscription declaration                                                                    | Collectors, timelines, benchmarks, leak analysis or diagnostic panels                |

Tooling genuinely exists: explicit nine-member workspace, pinned dependencies/lockfile, TypeScript/lint/format configuration, Turbo tasks, package exports, negative dependency checks, required nonempty tests, local deployment-trace and HTTP checks, architecture documentation and a CI workflow. Both old applications and historical documentation are isolated under `reference/`.

Evidence: the foundation implementation was locally verified with 16 app/package tests, nine architecture tests, nine empty-selection failures, all nine builds, independent public/editor build closures and production HTTP checks. The stored [verification log](../artifacts/reports/verify.log) is a local generated artifact and may not exist in another checkout. This planning pass inspected source, manifests, ADRs, CI configuration and that prior evidence; it did not rerun product tests or establish new performance results. A hosted CI run has not been independently verified. CI configuration is complete; remote execution evidence remains pending.

Prototype inspection supports behavioral targets such as the crow, coordinated tree wind, entry/reveal, editor controls and Scene Lab. It establishes neither completion in the new project nor a valid new-project performance baseline. Full weather, snow, water and dynamic terrain remain product requirements/experiments, not assumed proven production features.

## How to read the sequence

- **FOUNDATION:** a capability that later work needs.
- **EXPERIMENT / R&D:** a bounded comparison with an evidence-based decision, not a predetermined implementation.
- **FEATURE:** visitor-facing behavior or content.
- **TOOLING:** authoring, inspection and development workflows.
- **OPTIMIZATION:** improvement against a measured baseline.
- **PRODUCTION HARDENING:** reliability, compatibility and release verification.

There are **18 phases, P00–P17**, including the completed monorepo foundation. Phase numbers are stable planning IDs, not calendar estimates. Work may overlap where dependencies allow; do not treat the list as eighteen strictly serial projects. Every phase ends with a reviewable demonstration and evidence, not merely merged files.

```text
P00 → P01 (usable DOM portfolio) ───────────────┐
    → P02 (Three.js runtime ownership experiment) ───────────────┴→ P03 (real DOM/world slice)
                                                  → P04 (minimal editor Play)
                                                  → P05 (assets + map lifecycle)
P04 + P05 → P06 (observability laboratory)
P06 → P07 (visual rendering trial) ──┐
    → P08 (static terrain trial) ────┴→ P09 (production static-world baking)
P04 + P09 → P10 (world creation tools)
P05 + P06 + P07 → P11 (environment/vegetation)
                 → P12 (actors/interactions)
P01 + P10 + P11 + P12 → P13 (authored portfolio experience)
P06 + P09 + P10 + P12 → P14 (destruction trial) → P15 (dynamic capability)
P13 + applicable dynamic-scope gate → P16 (hardening/optimization) → P17 (release)
```

### Practical ordering rules

1. **Build a portfolio early.** Real content starts in P01 and grows throughout the work; it is not postponed until the world is finished.
2. **Prove the whole connection on tiny fixtures.** P03–P04 make every layer useful without a terrain engine: runtime, DOM UI, source snapshot, minimal compiler, editor Play and external observations.
3. **Introduce editor capability in two steps.** P04 proves Play and ownership; P10 adds productive terrain/world creation after formats are experimentally validated.
4. **Measure from the first rendered frame.** P02 establishes comparison measurements, P03 adds lifecycle timings, P06 builds the full laboratory. P16 is release validation and remaining optimization, not the start of performance work.
5. **Use thin fixtures before final systems.** P04's compiler handles a tiny placement scene. P05 adds asset/map delivery. P09 adds actual static terrain baking. These are successive increments of one pipeline, not competing compilers.
6. **Parallel work is optional, not automatic.** P01/P02, P07/P08 and later P10/P11/P12 have independent work. Agree shared content IDs, measurement fixtures and reviewed contracts before overlapping changes. Package names alone do not make two tasks independent.
7. **Postpone speculative breadth.** No general scripting language, general-purpose engine, universal terrain representation, cloud editor service or full physics framework until a selected experience demonstrates the need.
8. **Advanced scope remains visible.** P14/P15 cover destructible experiences. They may move after the first public release only through an explicit scope decision. If deferred, leave their tracker items incomplete; do not call the full roadmap complete. Rain/snow, rivers and other optional effects likewise require a recorded scope decision, not silent omission.

### When each workspace starts doing real work

| Workspace                         | First useful implementation                                   | Later growth                                                            |
| --------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Portfolio app / portfolio-content | P01 actual routes and one real case study                     | P03 experience entry; P13 finished content and discovery paths          |
| contracts                         | P02–P03 validate the smallest lifecycle/interaction agreement | Versioned source/runtime compatibility and selected capability messages |
| runtime                           | P02 comparative fixtures; P03 chosen production lifecycle     | P05 maps/assets; P07 rendering; P11/P12 environment/actors              |
| experience-ui                     | P03 actual production prompts/documents and host              | Shared editor Play UI and later game menus/sequences                    |
| Editor app / world-authoring      | P04 a tiny editable document, session and Play                | P10 productive map creation and validation                              |
| world-build                       | P04 smallest real snapshot-to-artifact conversion             | P05 asset processing; P09 terrain and incremental baking                |
| diagnostics                       | P03 minimal external timing consumer                          | P06 repeatable laboratory; later budget/regression tooling              |

## P00

**Verified monorepo foundation — FOUNDATION / TOOLING**

### Goal

A clean, buildable workspace with enforceable public/editor/reference separation. This phase is complete at skeleton scope.

### Why this phase happens now

Every later implementation needs reliable placement, interfaces, verification and dependency direction.

### Packages/apps involved

Both apps, all seven packages, root tooling, CI and reference isolation.

### Work items

- Establish independent apps/packages, explicit exports and pinned workspace tooling.
- Enforce production/editor and compiler/authoring boundaries; isolate historical sources and production input roots.
- Provide real required tests, local verification commands and architecture records; configure CI.

### Tests / verification

Use the previously completed local foundation verification above. Source inspection confirms the configuration and declarations. Do not interpret interface tests as executable runtime tests or claim a remote CI run occurred.

### Performance checks

Build graphs and deployment traces exclude reference/editor functionality from the public path. Build success is not a website or GPU benchmark; no production performance baseline exists.

### Exit criteria

All nine members build, checks reject prohibited paths, and required tests reject empty selections. Existing evidence satisfies this foundation gate.

### Dependencies

None.

### What is explicitly NOT part of this phase

Runtime/editor implementation, maps, shaders, rendering-library selection, assets and production gameplay.

## P01

**A usable conventional portfolio — FEATURE / FOUNDATION**

### Goal

A visitor can browse real portfolio information and at least one substantive case study without any world.

### Why this phase happens now

The world needs actual content to reveal, and its loading must be compared against a meaningful DOM experience.

### Packages/apps involved

`apps/portfolio`, `packages/portfolio-content`, `packages/contracts` only where content identity needs agreement; browser-test tooling.

### Work items

- Define content IDs and routes for projects, About, Experience, Skills and Contact; author one real case study and outline remaining content.
- Implement responsive navigation/document presentation, focus behavior and initial website loading states only where asynchronous website work warrants them. Do not block server-rendered content behind a decorative loader.
- Add browser/accessibility testing and agree the reference device, viewport/network profile and provisional website budgets; verify hosted CI when available.

### Tests / verification

Direct URLs, keyboard navigation, mobile layout, document semantics, no-JavaScript access to essential content and successful use while 3D is absent. Add automated checks plus manual accessibility review.

### Performance checks

Record production initial JS, transfer sizes, LCP/CLS and interaction responsiveness on the named profile. Check no renderer/model requests. Separate lab measurements from eventual field metrics.

### Exit criteria

Real case-study content and essential navigation are directly usable; website/accessibility evidence and an initial DOM performance report are recorded.

### Dependencies

P00. Content authoring may continue independently afterward.

### What is explicitly NOT part of this phase

3D implementation, a CMS chosen without need, final world art or a 3D loading screen.

## P02

**Three.js runtime ownership experiment — EXPERIMENT / R&D**

### Goal

Choose the ownership/integration model for the production Three.js runtime using equivalent small experiments, not the prototype's dependency list. R3F is a React renderer/reconciler managing Three.js objects and lifecycle; it uses Three.js underneath. Three.js is part of either solution.

Compare **imperative Three.js** (WorldRuntime → Three.js → WebGL) with **R3F-managed Three.js** (WorldRuntime / React integration → R3F → Three.js → WebGL). This is not a faster-engine contest, a test of whether R3F can render Three.js content, or a proposal for two separate engines.

### Why this phase happens now

Lifecycle and host design need a real rendering test before substantial implementation commits us to a framework.

### Packages/apps involved

`packages/runtime`, `packages/contracts`, a development-only comparison host in `apps/editor`; minimal external measurements.

### Work items

- Define the smallest facade behaviors to exercise and a reproducible test profile. If the target laptop is unavailable, use a labeled provisional profile and keep its limitation visible.
- Compare imperative Three.js and R3F-managed Three.js with identical simple original geometry, camera/render settings, one DOM callback and prepare/start/pause/dispose behavior.
- Record integration complexity, lifecycle behavior and costs; review the decision and retain one production approach.
- Apply all 14 comparison criteria in [ADR 0004](decisions/0004-renderer-experiment.md): lifecycle including stop/restart, explicit resource cleanup, map loading/cancellation/A → B → A, facade and Editor Play compatibility, high-frequency state isolation, worker/dynamic-terrain seams, shader/pass control, lazy loading/bundle impact, fixed initialization cost, small-scene frame behavior, maintainability, framework coupling and testability. Use bounded probes or document limitations for future systems; actual Editor Play remains P04.

The current dependency policy forbids React imports in runtime. Keep comparative adapters development-only during the experiment. If the R3F-managed model wins, deliberately review and update the relevant React/runtime boundary and dependency rules as part of the evidence-backed ADR before production adoption in P03; the public facade must still expose no React or renderer internals. The experiment is not permission to bypass the current guard.

### Tests / verification

Run equivalent input/interaction and repeated teardown cases. Inspect imports and ensure the comparison host never becomes a public dependency. A tiny scene does not establish large-world performance.

### Performance checks

Compare incremental JS, initialization, first usable frame, idle frame work, frame pacing and retained resources at the same DPR. Capture raw reports with versions/settings.

### Exit criteria

**DECISION REQUIRED AFTER EXPERIMENT:** choose ONE production ownership model based on equivalent measurements, lifecycle correctness and maintainability. Record the winning decision and experiment evidence in an ADR before adoption in P03. We will not maintain both production approaches. Neither is presumed to win; React usage alone does not demonstrate meaningful overhead. The prototype provides no valid evidence that R3F caused its low baseline FPS.

### Dependencies

P00. Can run alongside P01; does not require finished portfolio design.

### What is explicitly NOT part of this phase

Two permanent production ownership implementations, terrain, full gameplay, final shaders or inferring that R3F caused prototype performance problems.

## P03

**First real production DOM/world interaction — FOUNDATION / FEATURE**

### Goal

One lazy production world object opens real DOM content, and a DOM action changes the world through WorldRuntime.

### Why this phase happens now

This proves the central product connection and ownership model before editor or world complexity obscures them.

### Packages/apps involved

`apps/portfolio`, `packages/runtime`, `packages/contracts`, `packages/experience-ui`, `packages/portfolio-content`, minimal `packages/diagnostics` consumer.

### Work items

- Implement the smallest real renderer/scheduler/resource lifetime and prepare/start/pause/resume/dispose behavior behind the chosen facade.
- Implement lazy host initialization, readiness, cancellation/failure fallback, commands/events/snapshots and one accessible document interaction using P01 content.
- Add minimal stage timings, owned-resource counts and baseline quality/DPR controls. Keep per-frame positions out of React state and diagnostics out of production dependencies.

### Tests / verification

Browser-test both communication directions, input suppression/focus restoration, failure/cancellation and repeated create/dispose. Use contract tests and real browser rendering; the current HTTP smoke test alone is insufficient.

### Performance checks

Compare P01 with 3D unused, preparing and active. Measure initialization, warm-up and first interaction; confirm no eager world requests and bounded idle work.

### Exit criteria

An end-to-end demonstration works via the production facade, the conventional site survives runtime failure, and repeat lifecycle runs leave no unexplained owned work/resources.

### Dependencies

P01 and P02.

### What is explicitly NOT part of this phase

Map editor, terrain, rich inventory, production asset catalog or a comprehensive telemetry dashboard.

## P04

**Minimal authoring and real Play/Stop — TOOLING / FOUNDATION**

### Goal

Edit a tiny source document and Play its prepared revision using the same production runtime and DOM UI.

### Why this phase happens now

We need to prove editor/production parity and the source-to-runtime boundary before building many editor tools.

### Packages/apps involved

`apps/editor`, `world-authoring`, `world-build`, `contracts`, `runtime`, `experience-ui`, `portfolio-content`, `diagnostics` under `packages/`.

### Work items

- Implement minimal EditorSession ownership, selection, one transform edit, undo/redo and local save/open for a tiny original fixture.
- Extend source validation only as needed and implement one real compiler path into an immutable manifest. Add reviewed server-job endpoint boundaries: the current blanket restriction on importing editor `src/server` needs a deliberate, tested endpoint integration.
- Implement iframe Play, typed production-facade proxy, revision identity, cancellation, Stop/Restart and observations outside Play. Release the edit viewport before Play and restore source state afterward.

### Tests / verification

Edit → compile → Play demonstrates the edit, real prompt and document UI. Test stale build results, invalid input, focus, repeated runs and awaited disposal before iframe removal. Compiler tests prove no history/commands dependency.

### Performance checks

Measure snapshot/prepare/ready/Stop costs and retained resources across repeated runs. Compare behavior with standalone production and label editor overhead separately.

### Exit criteria

The current source revision reliably runs through the production path; stopping leaves source intact and releases the Play lifetime. Evidence includes an automated parity/lifecycle scenario.

### Dependencies

P03. This completes the minimal end-to-end slice described in the earlier first-slice document.

### What is explicitly NOT part of this phase

Terrain brushes, a full editor shell, cloud collaboration, final source format or a separate imitation of gameplay.

## P05

**Asset delivery and multiple-map lifecycle — FOUNDATION**

### Goal

Load and transition between two small prepared maps with original assets and controlled ownership.

### Why this phase happens now

Rendering, actor and world work need real asset dependencies, unloading and reproducible preparation to measure against.

### Packages/apps involved

`runtime`, `world-build`, `world-authoring/schema`, `world-authoring/validation`, `contracts`, `experience-ui`; editor build integration; `assets/` and `worlds/`.

### Work items

- Implement a minimal approved asset catalog and processing path for representative original GLB/textures; validate material/animation attributes and collision proxies needed by fixtures.
- Extend compiled manifests with exact map-specific dependencies, hashes/versions and spawn/exit links; implement request deduplication, bounded CPU/GPU caching and cancellation.
- Add map A → B → A, failed-transition recovery, pause/unload policy and capability loading without importing every map feature. Compare compression/LOD candidates before adopting defaults.

### Tests / verification

Test incompatible formats, missing/corrupt assets, stale async results, resource sharing, link validation and independent map builds. Cold and warm requests must respect each map's dependency closure.

### Performance checks

Measure bytes, download, decode/parse, upload/warm-up, ready time and residency during transitions. **DECISION REQUIRED AFTER EXPERIMENT:** compression/texture delivery defaults use end-to-end time, memory and visual quality, not file size alone.

### Exit criteria

Two fixture maps transition reliably without unrelated downloads or unexplained resource growth; processed artifacts are versioned and reproducible.

### Dependencies

P03 for runtime implementation. Integrating the workflow into editor Play requires P04; pipeline work can start independently while P04 finishes.

### What is explicitly NOT part of this phase

Natural terrain generation, full asset library, general physics engine, infinite streaming or destructive terrain.

## P06

**Repeatable observability laboratory — TOOLING / OPTIMIZATION**

### Goal

Make loading, frame cost and cleanup attributable and repeatable before expensive visual features arrive.

### Why this phase happens now

We now have genuine Play, assets and map lifecycles to observe. Further graphics work needs reliable measurements.

### Packages/apps involved

`apps/editor`, `packages/diagnostics`, minimal `runtime` observation hooks and `contracts`; development test/report tooling.

### Work items

- Build loading-stage timelines, aggregate frame statistics, renderer/asset counters and explicit ownership/disposal reports.
- Add small repeatable population and A/B/A/restart scenarios, trace export and production standalone runs; establish named hardware/network/quality profiles and budgets.
- Measure instrumentation overhead, keep buffers bounded and add bundle/import regression checks. Track hosted CI verification if still pending.

### Tests / verification

Validate timer meanings/aggregation and compare known scenarios with browser tools. Repeated cycles distinguish intentional caches from accumulation. Unsupported GPU timing/memory fields must say unavailable.

### Performance checks

Record empty-scene and two-map baselines, p50/p95/p99 frame intervals, main-thread work, GPU timing where supported, draw calls, triangles and estimated texture residency. Renderer resource counts are not complete VRAM measurements.

### Exit criteria

A saved, reproducible report explains initialization and frame/resource costs; repeat runs detect an intentionally introduced test leak and demonstrate its absence after cleanup. Instrumentation overhead is quantified.

### Dependencies

P04 and P05. Minimal telemetry already exists from P03; this phase expands it.

### What is explicitly NOT part of this phase

Shipping the profiler to visitors, precise VRAM claims unsupported by browsers or optimizing unmeasured hypothetical bottlenecks.

## P07

**Measured stylized rendering direction — EXPERIMENT / R&D / FEATURE**

### Goal

Approve an original visual rendering treatment with an affordable low-quality path.

### Why this phase happens now

Art and terrain production need a tested visual target, and the laboratory can attribute each added effect's cost.

### Packages/apps involved

`packages/runtime`, `world-build`, `diagnostics`, `contracts`; editor laboratory and original sample assets.

### Work items

- Establish lighting/material/color treatment on a small original scene; compare shadows, outlines and hatching one effect at a time.
- Define compatible material/asset settings and low/medium/high behavior; test shader preparation and avoid uncontrolled variant growth.
- Review visuals against the intended stylized direction without copying game assets. Adopt only effects meeting appearance and budget criteria.

### Tests / verification

Use fixed-camera/time visual fixtures, resize/DPR tests and first-use shader checks. Confirm low quality remains readable and coherent.

### Performance checks

Record incremental passes, shader cost, draw calls, frame timing, memory and readiness for each effect. **DECISION REQUIRED AFTER EXPERIMENT:** choose outline/hatching/shadow techniques and initial renderer/backend scope from measured quality and compatibility.

### Exit criteria

An approved original style fixture and measured quality matrix exist, with effects whose costs are justified and repeatable.

### Dependencies

P06, which includes the asset/map foundation. Can overlap P08; agree a shared visual fixture before P09.

### What is explicitly NOT part of this phase

A large asset collection, final maps, all weather effects or a dual graphics backend maintained without evidence.

## P08

**Natural static-terrain experiments — EXPERIMENT / R&D**

### Goal

Choose how ordinary terrain achieves natural stylized slopes, cliffs and surface transitions without obvious voxel tiles.

### Why this phase happens now

Source formats and editor brushes must not be locked around an unproven terrain representation.

### Packages/apps involved

Development fixtures in editor, `world-build`, `runtime`, `diagnostics`; experimental source descriptions isolated from final schema commitments.

### Work items

- Compare a small set of plausible height/mesh/hybrid approaches on one patch containing hill, cliff, worn path and grass/dirt/sand transitions.
- Test seams, collision/walkability and a river bank or overhang fixture where relevant; distinguish geometry and material representation decisions.
- Document editability, bake cost and visual tradeoffs. Preserve comparison evidence, not competing permanent terrain engines.

### Tests / verification

Use fixed views and worked terrain fixtures to inspect seams, normals, material blending and collision agreement. Art review is part of acceptance.

### Performance checks

Compare source/output sizes, compilation time, triangles, draw calls, runtime initialization and frame cost at identical settings. Recheck appearance with P07 materials before acceptance.

### Exit criteria

**DECISION REQUIRED AFTER EXPERIMENT:** approve the static terrain/source approach using natural appearance, editing feasibility and target-device performance. Record limitations and what dynamic terrain will need to test separately.

### Dependencies

P06. P07 visual compatibility is an acceptance gate; exploratory geometry work can run in parallel.

### What is explicitly NOT part of this phase

Full terrain editor, mining, production caves or a claim that one representation must serve every map.

## P09

**Production static-world compilation — FOUNDATION / OPTIMIZATION**

### Goal

Bake a useful static map from editable source into optimized runtime files, without visitor-side world generation.

### Why this phase happens now

The visual and terrain choices are now evidence-based. Stable outputs allow productive editor tooling and content creation.

### Packages/apps involved

`world-build`, authoring `/schema` and `/validation`, `contracts`, `runtime`, editor job integration; production asset/world roots.

### Work items

- Implement chosen static terrain/cliff/material preparation, spatial instance grouping and required simplified collision/navigation data.
- Define only the source/runtime fields needed by these capabilities, migration/version checks and incremental dependency fingerprints.
- Integrate reproducible asset/world tasks into Turbo with declared inputs/outputs; prepare bounds and stable IDs useful for later transitions/reveal without implementing reveal effects now.

### Tests / verification

Round-trip supported source formats, validate output in the real runtime, reject invalid references and compare clean versus incremental build results. A change to one asset must invalidate affected outputs but not unrelated worlds.

### Performance checks

Measure bake times, cache hits, artifact/texture sizes, collision/navigation costs and runtime load/frame cost. Verify static visitors do not execute compiler or dynamic-terrain work.

### Exit criteria

An original static map loads from reproducible compiled output, incremental correctness is tested, and artifact/runtime budgets pass on the reference profile.

### Dependencies

P05, P07 and P08.

### What is explicitly NOT part of this phase

Destructible terrain, general-purpose pathfinding for every actor or a full visual map editor.

## P10

**Productive world creation in the editor — TOOLING / FEATURE**

### Goal

Create, save, validate, compile and Play a small world through editor tools rather than hand-coded map implementation.

### Why this phase happens now

The editor can now target proven source and output formats instead of inventing an alternative runtime.

### Packages/apps involved

`apps/editor`, `world-authoring`, `world-build`, `runtime` through reviewed interfaces, `experience-ui`, `diagnostics`, `contracts`.

### Work items

- Add map creation/open/save, source ownership, selection/transforms, asset placement and tested undo/redo for authoring operations.
- Add terrain elevation/cliff/material/path tools appropriate to P08, spawn points, entrances/exits, environment configuration and interaction/content-link setup.
- Integrate validation feedback and production-equivalent Play; add river authoring only if selected for the first world. Review a narrow edit-viewport rendering interface if required; do not deep-import runtime internals.

### Tests / verification

Create a map via the UI, persist/reopen it, undo/redo edits and compare compiled Play. Verify source revision correctness, invalid links and error recovery.

### Performance checks

Measure brush/transform responsiveness, document/history memory, incremental rebuild latency and viewport-to-Play resource release.

### Exit criteria

Two simple linked static maps can be authored without manually editing runtime code; saved source reproduces the Play result and editing remains responsive on an agreed scene.

### Dependencies

P04 and P09. Can overlap P11/P12 where source fields/interfaces are agreed.

### What is explicitly NOT part of this phase

Cloud collaboration, arbitrary scripting, every imaginable terrain tool or shipping editor UI in the portfolio.

## P11

**Coherent environment and vegetation — FOUNDATION / FEATURE**

### Goal

An original environment responds consistently to shared time/weather/wind and stays affordable at representative vegetation density.

### Why this phase happens now

There is a measured renderer and asset pipeline. Environment can grow independently of detailed terrain tools while using real production assets.

### Packages/apps involved

`runtime`, `contracts`, source configuration in `world-authoring`, asset preparation in `world-build`, editor controls and `diagnostics`.

### Work items

- Implement shared environmental state for time/sun/lighting and wind; author original trees, grass and bushes with compatible response metadata.
- Add spatial instancing/culling and bounded density/scatter preparation; make all compatible vegetation respond to shared conditions with individual variation.
- Add selected rain/fog/water effects incrementally with quality controls. Decide whether snow, flowing rivers or broader weather simulation belong in launch scope; keep deferred work visible.

### Tests / verification

Test deterministic environmental transitions, vegetation consistency, map overrides and lifecycle cleanup. Use representative visual fixtures and quality comparisons.

### Performance checks

Measure density scaling, wind/shadow passes, overdraw, texture residency and weather cost independently. Check low preset under worst selected conditions.

### Exit criteria

Shared wind and time/lighting work on original vegetation; selected weather/water behaviors pass visual and performance acceptance. Optional-effect scope is recorded.

### Dependencies

P05, P06 and P07. Final integration with editor-created maps follows P10.

### What is explicitly NOT part of this phase

Physical simulation for every leaf, Minecraft-style fluids by default or all seasonal effects regardless of portfolio value.

## P12

**Actors and portfolio interactions — FOUNDATION / FEATURE**

### Goal

Support a small set of original animated actors and meaningful interactions using the production lifecycle and DOM interface.

### Why this phase happens now

Animation and interaction cost can now be measured against a stable rendering/asset baseline.

### Packages/apps involved

`runtime`, `experience-ui`, `contracts`, `world-authoring`, `world-build`, `portfolio-content`, editor configuration and `diagnostics`.

### Work items

- Implement actor lifetime, skeletal animation and movement on one original bird/character fixture; choose simplified movement/collision before adding a general physics dependency.
- Extend the basic document interaction to selected pickups, doors and short camera/object sequences with cancellation and clear ownership.
- Add animation visibility/distance policies where measured necessary; author interaction configurations usable by the editor, not arbitrary embedded executable code.

### Tests / verification

Test animation/map disposal, interrupted sequences, inventory/door behavior, keyboard/touch alternatives and DOM focus/input restoration. Validate authored interaction/content references.

### Performance checks

Measure one versus multiple actors, mixer/CPU cost, animation draw calls, loading and culling/LOD behavior. Choose active-actor budgets from results.

### Exit criteria

An original actor and the selected portfolio interaction set work through configured source data and shared production UI, including cancellation and map teardown.

### Dependencies

P05, P06 and P07; the basic DOM bridge already exists in P03. Can overlap P11.

### What is explicitly NOT part of this phase

A general AI framework, multiplayer, a general visual scripting language or cloning the prototype crow implementation/assets.

## P13

**Author the actual portfolio experience — FEATURE**

### Goal

A coherent, original multi-map portfolio with finished DOM content and deliberate visual presentation.

### Why this phase happens now

The creation tools and production systems now support actual content production without hard-coding each map.

### Packages/apps involved

Both apps; `portfolio-content`, `experience-ui`, `runtime`, authoring/build packages; original `assets/`, `worlds/` and diagnostics for review.

### Work items

- Finish projects/case studies, About, Experience, Skills, Contact and documents begun in P01; maintain direct access to all essential information.
- Author original maps/assets, spawn/exit connections, actors, environmental settings and portfolio-specific discovery interactions through the editor.
- Add controlled entry/reveal, transitions and camera presentation with reduced-motion/skip behavior. Distinguish website availability from 3D readiness; never cover a usable site with a mandatory world loader.

### Tests / verification

Run the intended visitor journeys and direct-website alternatives. Review visual identity, content accuracy, link validity, navigation, keyboard/touch controls and uninterrupted access during world failure.

### Performance checks

Measure representative and worst authored views, first entry, transitions, cold/warm asset loads and full sequences. Every final asset replacement must stay within the established map budgets.

### Exit criteria

At least two intentional linked maps present the actual portfolio; essential DOM content is complete; original-asset provenance and content/visual reviews are recorded.

### Dependencies

P01, P10, P11 and P12. Content drafting and asset art can proceed earlier within approved formats.

### What is explicitly NOT part of this phase

New engine subsystems invented for decorative details, essential content gated behind gameplay or assuming final art needs no remeasurement.

## P14

**Bounded destructible-cave experiment — EXPERIMENT / R&D**

### Goal

Determine whether and how a local destructible experience fits the product and hardware budgets.

### Why this phase happens now

Normal static maps, editing, interactions and measurement must work before introducing substantially more expensive terrain behavior.

### Packages/apps involved

Development editor/lab, `world-build`, `runtime`, `diagnostics`, narrowly experimental source data; shared algorithm extraction only if evidence justifies it.

### Work items

- Compare a small cave-room modification fixture with candidate volumetric/local-remesh approaches; do not rebuild the whole terrain system.
- Measure local edits, seams and collision updates with/without worker execution; define cancellation and stale-result behavior.
- Evaluate authoring compatibility and minimal save-delta/version behavior, then decide feasibility and launch versus post-launch scope.

### Tests / verification

Use known edit/collision fixtures, chunk boundaries, rapid repeated edits, map exits during work and reset/reload cases.

### Performance checks

Measure edit-to-visible latency, main-thread stalls, worker/transfer cost, rebuild locality and residency. Compare static-map costs with the capability completely unused.

### Exit criteria

**DECISION REQUIRED AFTER EXPERIMENT:** record chosen representation/worker approach or rejection, measured limits and the product scope decision. An unsuccessful approach can complete the experiment if findings and next scope are reviewed; it does not complete P15.

### Dependencies

P06, P09, P10 and P12. Can overlap P13 after P10's static-map acceptance; do not delay ordinary content production for cave research.

### What is explicitly NOT part of this phase

A full mining game, changing every map to volumetric storage or committing to voxel terrain because the prototype used it.

## P15

**Selected dynamic-map capability — FOUNDATION / FEATURE**

### Goal

Deliver the approved dynamic interaction as an isolated production map capability, if selected by P14.

### Why this phase happens now

Implementation follows a bounded experiment and explicit scope decision rather than driving the entire architecture prematurely.

### Packages/apps involved

`runtime`, `world-build`, `world-authoring`, `contracts`, `experience-ui`, editor tools and `diagnostics`.

### Work items

- Implement approved local modification/remeshing, collision updates, worker/job ownership and initial prepared data.
- Add minimal authoring and interaction support, state reset and selected save-delta/version handling; keep DOM content directly accessible.
- Load the capability only for the relevant map, including any extra decoder/worker modules; test the static portfolio without those requests.

### Tests / verification

Exercise mining/edit sequences, persistence/reset, cancellation, corrupt saved state and repeated map transitions. Test static-world isolation as a regression.

### Performance checks

Enforce P14's edit latency, residency and worker/main-thread budgets. Confirm no added static-map initialization work or unused capability downloads.

### Exit criteria

The selected dynamic experience passes behavior/lifecycle/budget checks and can be authored/prepared through the production workflow. If explicitly deferred, this phase remains NOT STARTED with the decision recorded.

### Dependencies

P14 feasibility/selection and P05/P12 production foundations. No implementation until the experiment's decision is accepted.

### What is explicitly NOT part of this phase

Universal destruction, multiplayer persistence or turning the portfolio into a mining game.

## P16

**Release-candidate optimization and hardening — OPTIMIZATION / PRODUCTION HARDENING**

### Goal

Prove the authored product meets explicit reliability, access and performance budgets across the supported audience.

### Why this phase happens now

Only real content and representative journeys expose the final combined workload. Earlier phases already measured individual costs.

### Packages/apps involved

Both apps, all selected production packages, build tooling, diagnostics and cross-app/browser tests.

### Work items

- Profile the release candidate and address measured bundle, shader, shadow, DPR, culling, instancing, texture and animation bottlenecks; record quality scaling thresholds/hysteresis.
- Harden loading failures, WebGL initialization/context loss, network interruption, cancellation, background-tab behavior and repeated map/runtime lifecycles.
- Finish browser/device/accessibility matrices, production/editor parity checks, source/asset provenance audits and reproducible release rehearsals. If editor is remotely hosted, add and verify access control; noindex is not security.

### Tests / verification

Run extended A/B/A and restart scenarios, cold/warm loads, corrupted/missing assets, fallback browsing and accessible alternatives. Run real production browser/network/bundle checks in addition to static traces. Verify hosted CI execution and fresh-checkout reproducibility.

### Performance checks

Compare all target profiles to agreed website/readiness/frame-time/memory budgets. Report p95/p99 stalls and unavailable GPU metrics honestly. Investigate retained resources against a documented cache baseline; do not equate forced garbage collection with correct ownership.

### Exit criteria

No unresolved release-blocking reliability/accessibility issues; budget and lifecycle reports pass or have explicit reviewed exceptions. All selected scope is implemented and original-source provenance is verified.

### Dependencies

P13. If dynamic maps are selected for release, also P15; otherwise an explicit deferral decision is required, with P14/P15 left pending where appropriate. Other optional systems need the same transparent scope treatment.

### What is explicitly NOT part of this phase

Unbounded new features, hiding poor performance by removing essential information or treating simulated CPU throttling as proof of integrated-GPU behavior.

## P17

**Reproducible deployment and release acceptance — PRODUCTION HARDENING**

### Goal

Ship a verified portfolio release from approved sources, with a repeatable publishing and recovery procedure.

### Why this phase happens now

The candidate has passed content, systems and performance gates. Actual hosting/cache behavior must still be tested after deployment.

### Packages/apps involved

Portfolio deployment, separately distributed editor, `world-build`, source assets/worlds, CI and release verification tooling.

### Work items

- Run source validation → asset processing → world compilation → tests → app builds from a clean checkout and pinned toolchain.
- Publish immutable artifacts before the matching release manifest; verify correct asset headers/URLs and document rollback/version compatibility.
- Audit the actual deployed site for cold entry, direct content access, selected gameplay, weak-device fallback and absence of editor/reference files. Record any explicitly deferred roadmap scope.

### Tests / verification

Exercise public deployed URLs, fresh browser/cache conditions, content links, readiness, error fallback, accessibility and rollback to a known release. Deploy editor separately or retain it locally; never publish the repository root as the portfolio.

### Performance checks

Run final website/runtime audits on named devices/networks against P16 reports, including actual CDN/cache behavior. Define minimal sampled production monitoring without shipping development profiling tools.

### Exit criteria

Deployment, rollback and post-deploy acceptance evidence are recorded and the Production Definition of Done below is reviewed. Any earlier first release with deferred P14/P15 must be labeled as such, not completion of all roadmap scope.

### Dependencies

P16 and selected hosting/release configuration.

### What is explicitly NOT part of this phase

New rendering features, silently publishing reference assets or claiming the editor is secure merely because it is a separate app.

## Evidence and decision policy

Each completed phase needs a short dated tracker entry linking its code/PR and test, visual or performance report. Experiments record the fixture, alternatives, constraints, results and decision. Use **DECISION REQUIRED AFTER EXPERIMENT** until that review occurs. Do not design a full class hierarchy or fixed terrain algorithm in this roadmap.

Performance is recorded from P01 onward. Agree target hardware/browser, resolution, DPR, quality, network, source revision, build mode, cache state and scenario before comparing results. Store raw reports outside the compact tracker and link them. A 60 FPS aspiration gives a 16.7 ms frame interval, not evidence that the app meets it. Baselines for the new runtime currently do not exist.

Open scope includes the representative laptop/device matrix, primary input/camera experience, content inventory, original asset production plan, selected weather/water features, dynamic-map release timing and local versus hosted editor. None prevents starting the DOM content milestone; relevant dependent work must resolve these before its exit gate. See the tracker's open decisions for evidence and timing.

Update status in the tracker as work happens. Change this roadmap only when sequencing, scope or a reviewed decision actually changes. Keep stable IDs and append completion evidence rather than rewriting completed history. If a check later regresses, reopen the affected phase and record why.

## Production Definition of Done

### Portfolio website

- Real projects, case studies, About, Experience, Skills and Contact are available as readable DOM content through direct navigation.
- The site is responsive, keyboard-accessible and appropriate for quick recruiter/HR browsing; essential content does not require gameplay or JavaScript-driven world initialization.
- Loading, unsupported graphics, user preference and world failures leave normal browsing functional. Accessibility acceptance includes manual review, not automated scores alone.

### 3D experience

- The world loads separately, becomes available at a meaningful ready state and uses original production-approved assets.
- At least two intentional maps provide a polished stylized game-like experience with production interactions, coherent environment behavior and real DOM ↔ 3D communication.
- Map transitions, input/focus, quality scaling, actor/resource lifetimes and failure handling meet reviewed behavior and performance budgets.
- Static maps do not pay for dynamic terrain. Selected optional capabilities load only where needed. Deferred dynamic/weather scope is explicitly listed; it is never marked implemented by implication.

### Editor

- Worlds can be created, reopened, managed and saved, with appropriate terrain/material/world tools, asset placement, spawn points, map links and interaction configuration.
- Play uses the real production runtime, rendering and DOM/game UI through the agreed facade; Stop/Restart disposes correctly and preserves authored source.
- Telemetry, stress scenarios, loading/resource inspection and production map preparation are usable development workflows, isolated from public deployment.

### Performance

- Target hardware, browsers, DPR/resolution/quality and network profiles are documented; website load, runtime startup, readiness and frame budgets have measured acceptance evidence.
- CPU/GPU cost, assets, texture residency, shadows, animation and map caches are controlled. Unsupported metrics are labeled; estimates are not presented as exact measurements.
- Repeated load/unload/restart tests show no unexplained resource/listener/worker/animation accumulation.
- Actual production dependency, bundle and network checks confirm editor/compiler/diagnostics/reference code is absent from the public path and unnecessary map capabilities are not loaded.

### Production pipeline and release

- Original source assets are validated/processed and editable worlds compile into versioned, reproducible runtime artifacts using allowlisted inputs.
- Incremental outputs match clean builds; release manifests reference exact artifacts and rollback is documented.
- CI actually runs required boundary/type/test checks; empty suites fail. Browser, lifecycle, visual and performance evidence supplements unit tests.
- Deployable artifacts and the deployed site pass content, accessibility, loading, runtime and provenance audits. Editor distribution is separate, with access control if remotely hosted.
