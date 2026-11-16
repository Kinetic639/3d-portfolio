---
name: performance-experiment
description: Run comparable renderer, terrain, asset or runtime performance experiments for the 3d-portfolio project and document evidence before selecting an approach.
---

# Performance experiment

Read the experiment's phase and decision gate in `docs/production-roadmap.md` and current baselines in `docs/progress-tracker.md`, relative to the repository root. Keep the experiment small and bounded to the decision it must unlock.

Define an equivalent fixture and acceptance criteria before comparing approaches. Record browser/build versions, hardware, power mode, viewport, DPR, quality, asset content, shadows and instrumentation. Separate cold loading, warm loading, preparation, and steady-state rendering. Run repeated trials and report variability and frame-time tails, not just average FPS.

Measure only supported metrics; distinguish CPU timing, GPU timing, estimates, and unavailable GPU memory. Profiling overhead must be reported or removed for baseline runs. Keep workload, visuals and correctness comparable; report differences that prevent a fair comparison.

Include lifecycle costs and failure behavior where relevant: prepare/cancel, transition, dispose and restart. Do not copy prototype timings into production baselines. Do not select imperative Three.js versus R3F-managed Three.js or static versus destructible terrain before the agreed evidence exists.

Store reproducible commands and results with the experiment, update the relevant tracker evidence, and propose the decision with its limitations. An experiment does not authorize expanding the production architecture or implementing the full feature.
