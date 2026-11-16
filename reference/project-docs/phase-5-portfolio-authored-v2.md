# Phase 5 Portfolio Authored V2

`portfolio-main-authored-v2` is a new authored Phase 5 portfolio map. It does not replace or delete `portfolio-main-greybox-v1`; v1 remains registered as an archived experiment and technical reference.

## Prefab Namespace

The reusable collection uses hyphenated stable IDs under `portfolio-v2-*` because the map schema requires stable slug IDs.

New v2 families cover architecture, infrastructure, arrival, projects, experience, about, skills, contact and environment pieces. Major compound prefabs include:

- `portfolio-v2-developer-workshop`
- `portfolio-v2-personal-studio`
- `portfolio-v2-communication-building`
- `portfolio-v2-orientation-monument`
- `portfolio-v2-timeline-entrance-arch`
- `portfolio-v2-skill-tree`
- `portfolio-v2-project-board`
- `portfolio-v2-mailbox-cluster`

The development-only `portfolio-v2-prefab-showcase` map displays the registered v2 collection through the normal prefab entity path.

## Scale

- Person reference: about `1.8` world units.
- Door: about `1 x 2` units.
- Single floor: about `2.5-3` units.
- Desk/workbench: about `0.75-0.8` units high.
- Bench seat: about `0.45` units high.
- Fence/handrail: about `0.9-1.2` units high.
- Main paths: `2-3` blocks wide, widening at junctions.
- Secondary paths: `1-2` blocks wide.

`portfolio-v2-scale-reference` is development/editor helper content and is not placed in the runtime portfolio map.

## Terrain

The v2 terrain is a continuous asymmetrical island generated from broad authored masks:

- Northwest Projects terrace.
- Northeast Experience ridge.
- Southeast About studio pocket.
- Western Skills garden terrain.
- South-central Contact station.
- Irregular arrival clearing near the loader origin.

The terrain uses broad deterministic forms, not per-cell visual noise. Paths are carved after terrain shaping, then explicit foundations are flattened for large structures.

## Composition

The four loader cells remain permanent at the origin. Around them is an irregular arrival clearing, not a circular five-spoke plaza.

Projects is the largest zone and reads as an elevated workshop compound. Experience is a winding ridge path with milestone stations. About is a compact sheltered studio. Skills is a meandering garden around a central skill sculpture. Contact is a south-central communication station near the main route.

## Verification Status

Automated tests verify:

- `portfolio-main-authored-v2` is registered and set as the default authored map.
- `portfolio-main-greybox-v1` remains registered.
- `portfolio-v2-prefab-showcase` exists as a development-only map.
- The v2 map uses only `portfolio-v2-*` prefab IDs.
- V2 landmarks and structures are grounded using the corrected placement system.
- Loader cells remain permanent.
- Main path samples are continuous.
- The map survives clone and document round trips.

Screenshots and saved benchmark IDs are still pending a browser pass. Do not treat this document as a performance report until benchmark artifacts are captured.
