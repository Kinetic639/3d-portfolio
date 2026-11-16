# Portfolio Rebuild Progress

Last planning update: 2026-09-06. Read the [production roadmap](production-roadmap.md) for explanations and phase dependencies. Read the [architecture guide](architecture-guide.md) for where code belongs.

## Overall

- **Last completed phase:** P00 — COMPLETE; verified monorepo foundation.
- **Next active phase:** P01 — usable DOM portfolio; NOT STARTED.
- **Parallel candidate:** P02 — Three.js runtime ownership experiment; may overlap P01; NOT STARTED.
- **Planning status:** Roadmap NEEDS REVIEW before the next implementation scope is selected.
- **Currently in progress:** Nothing. Product implementation has not started.
- **Next milestone:** P01 — real, independent DOM portfolio with one substantive case study.
- **Following milestone:** P03 — one production DOM/world interaction, after P01 and P02.
- **Last completed milestone:** Fresh nine-member workspace, enforced boundaries and local skeleton verification.
- **Active blockers:** None reported for the foundation. Device/content/scope decisions below constrain later acceptance, not all work now.
- **No delivery dates or overall percentage yet:** Phase sizes differ; checked bundles are not an estimate of total product effort.

## Phase status

Progress counts work bundles, excluding exit gates. `Blocked by` lists prerequisites, not active incidents. Future phases remain NOT STARTED instead of being labeled BLOCKED merely because earlier work is pending.

| Phase                            | Milestone                             | Status      | Progress | Blocked by                                        |
| -------------------------------- | ------------------------------------- | ----------- | -------- | ------------------------------------------------- |
| [P00](production-roadmap.md#p00) | Monorepo foundation                   | COMPLETE    | 3/3      | —                                                 |
| [P01](production-roadmap.md#p01) | Usable DOM portfolio                  | NOT STARTED | 0/3      | —; P00 complete                                   |
| [P02](production-roadmap.md#p02) | Three.js runtime ownership experiment | NOT STARTED | 0/3      | —; P00 complete                                   |
| [P03](production-roadmap.md#p03) | Real runtime + DOM bridge             | NOT STARTED | 0/3      | P01, P02                                          |
| [P04](production-roadmap.md#p04) | Minimal editor Play/Stop              | NOT STARTED | 0/3      | P03                                               |
| [P05](production-roadmap.md#p05) | Asset delivery + map lifecycle        | NOT STARTED | 0/3      | P03; editor integration P04                       |
| [P06](production-roadmap.md#p06) | Observability laboratory              | NOT STARTED | 0/3      | P04, P05                                          |
| [P07](production-roadmap.md#p07) | Stylized rendering trial              | NOT STARTED | 0/3      | P06                                               |
| [P08](production-roadmap.md#p08) | Static terrain trial                  | NOT STARTED | 0/3      | P06; visual acceptance P07                        |
| [P09](production-roadmap.md#p09) | Static-world baking                   | NOT STARTED | 0/3      | P05, P07, P08                                     |
| [P10](production-roadmap.md#p10) | Productive world editor               | NOT STARTED | 0/3      | P04, P09                                          |
| [P11](production-roadmap.md#p11) | Environment + vegetation              | NOT STARTED | 0/3      | P05, P06, P07                                     |
| [P12](production-roadmap.md#p12) | Actors + interactions                 | NOT STARTED | 0/3      | P05, P06, P07                                     |
| [P13](production-roadmap.md#p13) | Authored portfolio experience         | NOT STARTED | 0/3      | P01, P10, P11, P12                                |
| [P14](production-roadmap.md#p14) | Destructible-cave trial               | NOT STARTED | 0/3      | P06, P09, P10, P12                                |
| [P15](production-roadmap.md#p15) | Selected dynamic capability           | NOT STARTED | 0/3      | P14 decision; P05/P12                             |
| [P16](production-roadmap.md#p16) | Optimize and harden candidate         | NOT STARTED | 0/3      | P13; P15 if selected, otherwise explicit deferral |
| [P17](production-roadmap.md#p17) | Deployment + acceptance               | NOT STARTED | 0/3      | P16                                               |

## Phase work items

### P00 — Monorepo foundation

Status: COMPLETE

- [x] Fresh two-app/seven-package workspace, pinned tooling and explicit exports.
- [x] Reference isolation, production/compiler dependency guards and architecture/ADR documentation.
- [x] Required tests, local full/filtered build verification and CI workflow configuration.

Exit criteria:

- [x] Nine members build; prohibited imports and empty test selections fail.
- [x] Local artifact/HTTP checks pass; reference preservation was verified.

Evidence: foundation implementation in this repository; prior local `pnpm verify` passed (16 app/package tests, nine architecture tests, nine empty-selection failures, ten build traces). Filtered builds passed for public (five members) and editor (eight members). Reference move preserved 696 non-generated files by SHA-256 comparison. Local generated reports are under `artifacts/reports/`; [verification log](../artifacts/reports/verify.log). The planning pass inspected this evidence; it did not rerun these commands. Hosted CI success is NOT claimed.

### P01 — Usable DOM portfolio

Status: NOT STARTED

- [ ] Content IDs/routes, one real case study and remaining content outline.
- [ ] Responsive accessible navigation/document UI and nonblocking website loading states.
- [ ] Browser/accessibility checks, initial website profile/budgets and hosted CI evidence.

Exit criteria:

- [ ] Essential content and direct URLs work without 3D.
- [ ] Content/accessibility review and DOM performance report recorded.

### P02 — Three.js runtime ownership experiment

Status: NOT STARTED

- [ ] Equivalent fixture, facade behaviors and named test profile.
- [ ] Imperative Three.js / R3F-managed Three.js lifecycle, interaction and cost comparison.
- [ ] Evidence reviewed and runtime ownership ADR decision recorded.

Exit criteria:

- [ ] Comparison is equivalent and covers repeated cleanup.
- [ ] One production approach selected; no parallel production ownership models.

### P03 — Real runtime + DOM bridge

Status: NOT STARTED

- [ ] Renderer/scheduler/resource lifecycle, lazy prepare/start/pause/dispose and failure/cancellation.
- [ ] Typed commands/events/snapshots and real accessible DOM ↔ world interaction.
- [ ] Initial timing/ownership observations, quality controls and browser/lifecycle tests.

Exit criteria:

- [ ] World interaction opens real content; DOM action affects world through the facade.
- [ ] Website remains usable on failure; readiness/resource baseline recorded.

### P04 — Minimal editor Play/Stop

Status: NOT STARTED

- [ ] EditorSession source ownership, selection/edit, history and local save/open.
- [ ] Tiny snapshot compiler and reviewed server-job endpoint boundary.
- [ ] Real runtime/UI iframe Play, proxy, revision/cancellation handling and Stop/Restart tests.

Exit criteria:

- [ ] Current source revision produces matching production Play behavior.
- [ ] Awaited cleanup precedes iframe removal; source remains intact.

### P05 — Asset delivery + map lifecycle

Status: NOT STARTED

- [ ] Original asset catalog, validation and measured GLB/texture processing choices.
- [ ] Versioned manifests, map-specific dependencies, bounded loading/cache ownership.
- [ ] Two-map transitions, failure recovery and cancellation/unload verification.

Exit criteria:

- [ ] Cold/warm A → B → A works without unrelated downloads or resource growth.
- [ ] Reproducible processed fixtures and delivery measurements recorded.

### P06 — Observability laboratory

Status: NOT STARTED

- [ ] Loading timelines, frame/renderer counters and ownership reports.
- [ ] Repeatable population/map/restart scenarios and standalone report export.
- [ ] Instrumentation overhead, regression checks and accepted measurement profiles/budgets.

Exit criteria:

- [ ] Reports explain costs and distinguish unavailable metrics from zero.
- [ ] Lifecycle harness detects a test leak and verifies proper cleanup afterward.

### P07 — Stylized rendering trial

Status: NOT STARTED

- [ ] Original lighting/material fixture and separate shadow/outline/hatching comparisons.
- [ ] Quality profiles and shader preparation/variant checks.
- [ ] Visual review and measured rendering-technique decision.

Exit criteria:

- [ ] Approved original style remains readable on low quality.
- [ ] Effect-by-effect cost report meets accepted budgets.

### P08 — Static terrain trial

Status: NOT STARTED

- [ ] Equivalent natural hill/cliff/path/material-transition fixtures.
- [ ] Candidate comparisons including seams, collision, editability and baking cost.
- [ ] Evidence-based static representation decision and P07 visual compatibility review.

Exit criteria:

- [ ] Natural appearance and target-device cost accepted.
- [ ] Source/output approach chosen without imposing it on destructible maps.

### P09 — Static-world baking

Status: NOT STARTED

- [ ] Static terrain/material/instance/collision/navigation preparation as needed.
- [ ] Source/runtime compatibility, dependency fingerprints and incremental correctness.
- [ ] Reproducible pipeline tasks, compiled runtime loading and budget verification.

Exit criteria:

- [ ] Static map loads without visitor-side compilation.
- [ ] Incremental outputs match clean builds and only affected work rebuilds.

### P10 — Productive world editor

Status: NOT STARTED

- [ ] Map create/open/save, placement/transforms and useful undo/redo.
- [ ] Terrain/material/path tools, spawn/exits, environment and interaction configuration.
- [ ] Validation feedback, reviewed viewport interface and production-equivalent Play workflow.

Exit criteria:

- [ ] Two linked static maps can be authored through UI and reproduced from saved source.
- [ ] Editing latency, history memory and Play cleanup are acceptable.

### P11 — Environment + vegetation

Status: NOT STARTED

- [ ] Shared time/sun/wind state and original compatible vegetation assets.
- [ ] Instancing/culling/scatter and representative density verification.
- [ ] Selected weather/water effects, quality controls and explicit optional-effect scope.

Exit criteria:

- [ ] Vegetation responds coherently; selected environment behavior passes review.
- [ ] Worst selected conditions pass low-preset budgets.

### P12 — Actors + interactions

Status: NOT STARTED

- [ ] Original animated actor, movement and owned animation lifecycle.
- [ ] Selected documents/pickups/doors/sequences with accessible DOM control.
- [ ] Authored configuration, cancellation tests and measured animation culling/LOD.

Exit criteria:

- [ ] Actor and chosen interaction set work without editor-specific gameplay code.
- [ ] Resource release and active-actor budget evidence recorded.

### P13 — Authored portfolio experience

Status: NOT STARTED

- [ ] Finish real portfolio content begun in P01 and review direct access.
- [ ] Author original maps/assets, environment, actors and content-linked interactions.
- [ ] Entry/reveal/camera transitions, reduced-motion/skip behavior and complete journey review.

Exit criteria:

- [ ] At least two intentional linked maps present complete essential portfolio content.
- [ ] Original provenance, visual/content review and representative map budgets pass.

### P14 — Destructible-cave trial

Status: NOT STARTED

- [ ] Bounded cave fixture and candidate local terrain modification approaches.
- [ ] Remesh/collision/worker/cancellation and save-delta feasibility measurements.
- [ ] Representation, feasibility and release-scope decision reviewed.

Exit criteria:

- [ ] Measured findings support implementation or a documented rejection/deferral.
- [ ] Static-map cost remains isolated; P15 is not marked complete by this experiment.

### P15 — Selected dynamic capability

Status: NOT STARTED

- [ ] Approved remeshing/collision/worker capability and prepared initial state.
- [ ] Authoring/interaction integration and reset/selected persistence behavior.
- [ ] Capability-specific loading, static-map exclusion and stress/lifecycle tests.

Exit criteria:

- [ ] Selected dynamic experience is authorable and meets P14 budgets.
- [ ] Static maps incur no unused dynamic initialization/downloads.

If moved after first release, keep unchecked and record the approved deferral. This is not automatic launch scope.

### P16 — Optimize and harden candidate

Status: NOT STARTED

- [ ] Profile actual content and resolve measured bundle/render/asset/animation costs.
- [ ] Failure/context-loss/network/background/lifecycle hardening and quality scaling.
- [ ] Browser/device/accessibility, provenance, parity, hosted CI and reproducibility audits.

Exit criteria:

- [ ] Selected scope meets budgets with no unexplained leaks or release blockers.
- [ ] Any scope deferrals or exceptions are explicit and reviewed.

### P17 — Deployment + acceptance

Status: NOT STARTED

- [ ] Clean source → processed assets → compiled worlds → tested application build.
- [ ] Separate deployment outputs, immutable release publication and rollback procedure.
- [ ] Deployed cold-load/accessibility/performance/bundle audit and minimal production monitoring.

Exit criteria:

- [ ] Production Definition of Done reviewed with evidence for deployed artifacts.
- [ ] Release/rollback results recorded; any unfinished roadmap scope remains visible.

## Open Decisions

OPEN means undecided, not permission to choose during unrelated work. Experimental choices require **DECISION REQUIRED AFTER EXPERIMENT** evidence before acceptance.

| Decision                                                      | Status | Required evidence                                                 | Planned phase                              |
| ------------------------------------------------------------- | ------ | ----------------------------------------------------------------- | ------------------------------------------ |
| Target laptop, browser, viewport/network and input support    | OPEN   | Named representative devices and audience requirements            | P01/P02; budgets finalized P06             |
| Real content inventory and first case study                   | OPEN   | Owner-reviewed projects, documents and narrative                  | P01                                        |
| Navigation/camera/input style                                 | OPEN   | Tiny interaction usability trial; keyboard/touch alternatives     | P02/P03                                    |
| Three.js runtime ownership model                              | OPEN   | Equivalent lifecycle/bundle/frame/complexity comparison           | P02                                        |
| Source/asset save location and editor persistence             | OPEN   | Local workflow, portability and recovery requirements             | P04                                        |
| Narrow server endpoint / edit-viewport interfaces             | OPEN   | Concrete Play/edit integration tests preserving package isolation | P04/P10                                    |
| Texture/mesh compression and asset LOD defaults               | OPEN   | Download, decode, GPU residency and visual comparisons            | P05                                        |
| Measured performance budgets                                  | OPEN   | Accepted hardware profiles and repeatable DOM/runtime baselines   | P01–P06                                    |
| Outline/hatching/shadow techniques and graphics backend scope | OPEN   | Original style fixture, compatibility and effect cost             | P07                                        |
| Static terrain/material/path representation                   | OPEN   | Natural terrain, seams, collision, editing and bake trial         | P08                                        |
| Original production asset creation plan                       | OPEN   | Provenance, style approval, tooling and production capacity       | P05/P07; final P13                         |
| Launch weather/water/rivers/snow scope                        | OPEN   | Portfolio value and measured environment/density cost             | P11                                        |
| Movement/collision/physics complexity and actor budgets       | OPEN   | Chosen interactions and actor-density results                     | P12                                        |
| Dynamic terrain representation and worker strategy            | OPEN   | Local cave remeshing/collision/transfer measurements              | P14                                        |
| Destructible experience release timing and save policy        | OPEN   | Feasibility, portfolio value and persistence/reset expectations   | P14/P15; deferral before P16 if applicable |
| Hosting/CDN and local versus hosted editor                    | OPEN   | Deployment/cache needs and editor access requirements             | P16/P17                                    |

## Performance Baselines

**NO BASELINE YET.** No valid measured production DOM/runtime profile has been recorded here. Existing build durations and HTTP success are not rendering/readiness baselines. Prototype numbers must never be copied into this table.

| Milestone | Hardware/browser | Viewport / DPR / quality | FPS / frame p95 | Draw calls   | Initial 3D load / ready | Evidence                                                |
| --------- | ---------------- | ------------------------ | --------------- | ------------ | ----------------------- | ------------------------------------------------------- |
| None yet  | Not selected     | Not established          | Not measured    | Not measured | Not measured            | P01 starts DOM baseline; P02/P03 start runtime baseline |

For each future row link the report with source revision, production build, scenario, network/cache state, sample duration, p50/p95/p99, CPU/GPU distinction, resource estimates and instrumentation overhead. Keep unavailable fields explicit. Website reports also record initial JS, bytes and web responsiveness/layout metrics.

## Workspace maturity

All nine members are **product skeletons** even though their build/test/boundary infrastructure is working.

| Workspace                    | Current state                                     | Next responsibility                                    |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| `apps/portfolio`             | DOM shell                                         | Real pages/navigation and content in P01               |
| `apps/editor`                | DOM shell + EditorSession types                   | Development comparison host P02; real session/Play P04 |
| `packages/contracts`         | Interface skeleton                                | Prove smallest runtime/interaction contract P02/P03    |
| `packages/world-authoring`   | Minimal envelope validator + editing declarations | Tiny editable document/operations P04                  |
| `packages/world-build`       | Request/result types only                         | Actual tiny source-to-artifact compilation P04         |
| `packages/runtime`           | Factory/facade types only                         | Compare ownership models P02; executable lifecycle P03 |
| `packages/experience-ui`     | Host declaration only                             | Real host, prompts and document bridge P03             |
| `packages/portfolio-content` | Generic identity object                           | Real content IDs and case-study presentation P01       |
| `packages/diagnostics`       | Observation declaration only                      | Minimal timing consumer P03; laboratory P06            |

## Prototype capability migration / replacement

“Replacement” means independent production implementation. No prototype code/assets are copied. Some rows are broader requested capabilities, not claims that the prototype fully implemented them.

| Prototype/reference capability            | New implementation status | Planned replacement / phase                                                      |
| ----------------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| Crow actor behavior                       | NOT STARTED               | Original actor/animation/movement P12                                            |
| Tree wind                                 | NOT STARTED               | Shared environment + original vegetation P11                                     |
| Global environmental conditions / weather | NOT STARTED               | Coherent production conditions P11; full weather not assumed proven in prototype |
| Voxel terrain                             | NOT STARTED               | Static R&D P08; dynamic R&D P14; representation may be replaced entirely         |
| Natural cliffs/material transitions/paths | NOT STARTED               | P08 experiment → P09 baking → P10 authoring                                      |
| Stylized materials/outlines/hatching      | NOT STARTED               | Original measured visual pipeline P07                                            |
| World entry/reveal                        | NOT STARTED               | Small readiness flow P03; authored reveal/presentation P13                       |
| Map editor                                | NOT STARTED               | Minimal session P04; productive tools P10                                        |
| Scene Lab / population tests              | NOT STARTED               | Production-observing development lab P06                                         |
| Maps and transitions                      | NOT STARTED               | Owned production lifecycle P05                                                   |
| Content/document interactions             | NOT STARTED               | One production bridge P03; interaction set P12                                   |
| Water/liquid experiments                  | NOT STARTED               | Selected stylized water scope P11; no assumed fluid-simulation port              |
| Asset inspection                          | NOT STARTED               | Approved asset pipeline P05 and diagnostics P06                                  |
| Cave mining/destruction example           | NOT STARTED               | Feasibility P14; selected capability P15                                         |

## Completion history

- **2026-09-06 — P00:** Fresh foundation established and locally verified. Source files, manifests and prior reports inspected for this tracker. Both apps also reported working by the project owner. No hosted CI or production GPU performance claim.
- **2026-09-06 — Planning:** Roadmap/tracker created for review. No product phase started.

## Maintaining this tracker

1. At the start of work, name one bounded milestone and set its phase to IN PROGRESS. Use NEEDS REVIEW when acceptance is pending.
2. Check a work bundle only when all its listed behavior exists and relevant verification has passed. Add an evidence link; a type declaration is not implementation.
3. COMPLETE requires both exit gates and the roadmap's full exit criteria. Use BLOCKED only for an actual impediment, with the needed action recorded.
4. Update this table, the affected phase items and a short dated history entry. Do not rewrite previous completion records or unrelated phases.
5. Link detailed benchmark/visual/test reports instead of embedding them here. Do not invent overall percentages from unequal phases.
6. Record decisions/deferrals explicitly. A deferred feature stays incomplete; a successful static release is not automatic completion of advanced dynamic scope.
7. If evidence becomes invalid or a guarantee regresses, reopen the affected item and record the reason.
