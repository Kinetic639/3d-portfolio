# ADR 0004: Three.js runtime ownership decision deferred

Status: NEEDS EXPERIMENT

P02 is the **Three.js runtime ownership experiment**. Three.js is the underlying 3D library in both candidates. React Three Fiber (R3F) is a React renderer/reconciler managing Three.js objects and lifecycle, not an alternative 3D engine.

- **Option A — imperative Three.js:** WorldRuntime → Three.js → WebGL. Runtime code directly owns THREE.WebGLRenderer, scene, camera, frame scheduling, object creation/removal, resources, map/session lifecycle, disposal, and integration with workers and future dynamic systems.
- **Option B — R3F-managed Three.js:** WorldRuntime / React integration → R3F → Three.js → WebGL. R3F manages the scene through React reconciliation and its runtime model. Establish what it owns and what remains our responsibility, including external/shared resources and workers.

Use equivalent original fixtures behind the same WorldRuntime facade, with identical geometry, materials, camera, resolution, loading and DOM interactions. Compare:

1. Lifecycle ownership: prepare, start, pause/resume, stop, dispose and repeated creation/destruction. Exercise stop through host/session behavior without inventing a WorldRuntime method.
2. Cleanup of geometries, materials, textures, render targets, animations, subscriptions, loaders, workers and map-specific resources.
3. Map loading/unloading, cancellation, A → B → A and fresh runtime restart.
4. Integration with the approved WorldRuntime facade.
5. Compatibility with Editor Play ownership and isolation; actual Play remains P04.
6. Keeping high-frequency 3D state outside normal React DOM state.
7. Worker and future dynamic-terrain compatibility.
8. Custom shaders/render passes and renderer control.
9. Lazy loading and public bundle impact.
10. Initialization and fixed runtime cost.
11. Small-scene frame behavior and pacing.
12. Complexity of the implementation we would maintain.
13. Amount and location of React/framework-specific production runtime code.
14. Testability of behavior, lifecycle and integration.

Use bounded probes or document limitations for future systems; do not implement terrain or full editor features in P02. A tiny scene establishes baseline behavior and lifecycle feasibility, not full-world performance.

This is not a faster-engine contest, a test of whether R3F renders Three.js content, or a proposal for two engines. Neither candidate is presumed to win. React usage alone does not establish meaningful overhead. The prototype provides no valid evidence that R3F caused its low baseline FPS.

After the experiment, choose ONE production ownership model and record the winning decision, reproducible evidence, tradeoffs and limitations in an ADR before adoption in P03. We will not maintain both production approaches.

The foundation restriction that packages/runtime does not import React remains in force. Comparative adapters stay development-only within allowed boundaries. If R3F-managed Three.js wins, deliberately review and update the relevant React/runtime boundary and dependency rules as part of that ADR before production integration. Never bypass the guard during the experiment. The public facade stays independent of React and renderer internals.

Neither Three.js nor R3F is installed as a production runtime dependency in the foundation.
