---
name: runtime-lifecycle-verification
description: Verify ownership, cancellation and cleanup when implementing or changing the 3d-portfolio runtime, map lifecycle or editor Play workflow. Requires an executable runtime.
---

# Runtime lifecycle verification

Read the current public facade and lifecycle ADRs in this repository before choosing checks. If only declarations exist, report that executable lifecycle verification is not yet possible; do not fabricate a runtime to satisfy this skill.

Exercise supported prepare/start/pause/resume/dispose behavior, prepare cancellation, failed loading, stop during preparation, repeated disposal, map A to B to A, and complete runtime restart. Editor Play must use the production runtime and gameplay UI, with diagnostics outside production dependencies.

Track ownership and release of geometry, materials, textures, render targets, workers, listeners, mixers, timers, physics, audio and bridge subscriptions. Distinguish deliberate bounded caches from leaked resources. Verify late async results cannot resurrect a disposed session.

Compare equivalent checkpoints over repeated cycles, allowing documented warm-up/cache stabilization. Use resource counters, listener behavior and browser heap evidence together. JavaScript heap measurements do not establish GPU memory usage; garbage collection timing is not deterministic.

Report reproduction steps, iteration count, resource deltas, retained-object evidence and unresolved limitations. Add regression coverage for observable failures. Update only the relevant lifecycle items in `docs/progress-tracker.md` after checks pass.
