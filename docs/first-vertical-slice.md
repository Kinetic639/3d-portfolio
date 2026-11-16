# First end-to-end 3D/editor vertical slice: P02 → P03 → P04

P01 is the next product phase and a prerequisite for this end-to-end slice because it provides the real DOM portfolio content used by the experience. P02 may run in parallel with P01; it does not require P01 to be complete before its experiment starts.

The first end-to-end 3D/editor vertical slice spans P02 → P03 → P04: runtime ownership experimentation, the production DOM/world interaction, then minimal authoring and real Editor Play/Stop. Completion of the vertical slice occurs at the end of P04, not at the end of P02. The [roadmap](production-roadmap.md) retains the scope and dependencies of each phase.

1. Compare imperative Three.js and R3F-managed Three.js behind WorldRuntime on a tiny original fixture.
2. Add lazy runtime creation, readiness and cancellation without delaying the DOM page.
3. Open real DOM sample content from one world interaction and send a DOM command back.
4. Compile a tiny source world into an immutable manifest; no terrain system.
5. Implement minimal EditorSession Play/Stop with the same production UI/runtime in an iframe.
6. Record initialization, frame and resource ownership observations externally.
7. Verify repeated map changes/restarts, no eager 3D requests, and production bundle exclusion.

Initial guardrails are hypotheses: 60 FPS means a 16.7 ms frame interval; target low-preset DPR 1, a bounded cache and one active map. Measure on an agreed integrated-GPU laptop before setting enforced timing/memory thresholds. No hardware performance claim follows from the foundation's static builds.

## Three.js runtime ownership clarification

P02 is the **Three.js runtime ownership experiment**: imperative Three.js versus R3F-managed Three.js. R3F manages Three.js objects and lifecycle through React reconciliation; Three.js is the underlying 3D library in both solutions. This compares ownership/integration models, not engines. Select one production model from equivalent measurements and record the evidence in an ADR; do not maintain both.

The foundation restriction against React imports in `packages/runtime` remains unchanged. If the R3F-managed model wins, review and update the boundary and dependency rules deliberately in the ADR before production adoption, without bypassing them during P02. See [ADR 0004](decisions/0004-renderer-experiment.md) for the comparison criteria and ownership responsibilities.
