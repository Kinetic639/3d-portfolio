# Phase 5 Portfolio Main Greybox

`portfolio-main-greybox-v1` is the authored grey-box foundation for the main portfolio world. It is a normal bundled map, not a development-only fixture, so it appears in the map selector and benchmark workspace.

The earlier Phase 5 result is preserved as the development-only bundled map `portfolio-main-greybox-v1-basic-backup`.

## Map Contract

- Dimensions remain `64 x 12 x 64` with block size `1` and chunk size `16`.
- The original four loader cells remain permanent center path cells at grid positions `(31, 0, 31)`, `(32, 0, 31)`, `(31, 0, 32)` and `(32, 0, 32)`.
- Block-centre world bounds remain `-31.5` to `31.5`; map-edge bounds remain `-32` to `32`.
- Terrain is stored through the existing `flat-edits-v1` map-definition format and can be cloned, loaded and converted to a map document.
- Prefabs are referenced through the existing reusable prefab library. No map-specific JSX models are hardcoded into the scene.

## Placement Contract

The grounding bug in the initial Phase 5 pass came from mixing voxel-center and terrain-surface conventions. `VoxelWorld.gridToWorld()` returns the center of a voxel cell, but object placement was treating center-derived Y values as a usable bottom anchor. Prefabs are authored as compound local parts relative to a bottom-contact anchor, so placing a prefab at `topCellCenterY` or `topCellCenterY + 0.5` embedded or floated objects depending on the prefab bounds.

The corrected contract is:

- Voxel Y is the logical cell index.
- Voxel world position is the center of that cell.
- Terrain surface Y is `voxelCenterY + blockSize / 2`.
- Prefab placement position is the world-space bottom/contact anchor.
- Prefab visual bounds are resolved from every transformed child part.
- Grounded object Y is `surfaceY - visualLocalBounds.minY + explicitGroundOffset`.

`lib/world/surface-query.ts` is the authoritative terrain-surface query. `lib/prefabs/prefab-placement.ts` is the authoritative prefab-grounding resolver and footprint-support validator.

Large structural or landmark prefabs are validated against their whole footprint on flat foundations. Terrain-attached beds, signs and small props use single-cell grounding so they can sit on semantic terrain without weakening the building-support rule.

## Human Scale

The grey-box scale uses `blockSize = 1` as one world unit:

- Person reference: `1.8` units tall.
- Doors: about `0.8 x 1.7-1.9` units.
- Single-floor wall masses: about `2.3-2.8` units tall.
- Desks/workbenches: about `0.75-0.8` units high.
- Benches: about `0.45` units seat height.
- Fences and rails: about `0.9-1.2` units high.
- Primary paths: `3-5` terrain cells wide.
- Central plaza: about `12 x 12` cells.

The development-only `scale-reference-mannequin` prefab is registered in the navigation/editor-helper category and is not placed in visitor runtime by default.

## Prefab Kit

The rebuild adds reusable registered prefabs rather than hardcoded map JSX:

- Architecture: `portfolio-workshop-compound`, `personal-studio-compound`, `communication-station`, `wall-with-window`, `wall-with-doorway`.
- Paths/infrastructure: `main-path-section`, `secondary-path-section`.
- Portfolio landmarks: `central-orientation-monument`, `zone-identity-board`, `project-display-rack`, `timeline-arch`, `milestone-station`, `skill-branch-landmark`, `skill-display-stand`, `mailbox-bank`.
- Environment: `raised-garden-bed`, `wide-canopy-tree`, `columnar-tree`, `low-shrub-cluster`, `stacked-rock-cluster`.
- Scale/debug: `scale-reference-mannequin`.

All of these go through the existing prefab registry, editor browser, variant resolution, grounding, save/load and instanced rendering paths.

## Layout

The map uses a hub-and-spoke shape around a central arrival plaza:

- Projects: north-west workshop cluster around grid `x 9-24`, `z 7-23`.
- Experience: north and north-east elevated route around grid `x 34-54`, `z 7-22`.
- About: east and south-east pavilion/workspace around grid `x 39-58`, `z 27-43`.
- Skills: west and south-west garden/orchard around grid `x 4-24`, `z 36-52`.
- Contact: south kiosk and contact counter around grid `x 23-41`, `z 47-59`.

Primary paths connect each zone back to `nav-center`. Secondary paths and nearby props give each section a readable silhouette while staying intentionally grey-box.

## Terrain And Paths

The terrain starts as a continuous irregular island instead of five isolated display pads or a full square slab. The failed camouflage-like patchwork was removed. The surface palette is now semantic:

- `Ground`: neutral natural base.
- `Boundary`: vegetation/edge ground and retaining contours.
- `Path`: main plaza and path circulation.
- `Special`: warm architectural foundations for Projects and About.
- `ZoneGround`: blue-grey foundations for Experience and Contact.

Zone areas are broad connected regions with explicit foundations:

- Arrival and Contact stay at base level.
- Projects, About and Skills sit one block above the base.
- Experience rises from one block to a two-block landing at the current-role endpoint.

Paths are 2-5 cells wide, use the existing `Path` block ID, and are authored before the dirty chunks are cleared. The navigation graph mirrors the visual route: five primary hub edges plus secondary Projects-Experience, Skills-Contact and About-Contact links.

## Landmarks

Major grey-box landmarks are reusable prefab placements. The current authored map contains 328 logical object placements:

- Arrival: central orientation monument, map board, route signs, benches, planters and low plaza edge.
- Projects: multi-volume workshop compound, covered yard, storage annex, exhibition rack, entrance board, workbenches, shelves, crates and project anchors.
- Experience: timeline arch, milestone stations, education board, viewpoint platform, footbridge, route lights and retaining edges.
- About: personal studio compound, workstation, profile board, values board, CV flyer, quiet seating and private garden.
- Skills: skill-branch landmark, five organized skill beds, display stands, maintenance shelter and clustered vegetation.
- Contact: communication station, mailbox bank, contact counter, social board, CV board, forecourt seating and flyers.

Current density counters from automated tests:

- Total placements: 328.
- Central hub placements: at least 20.
- Structures and landmarks: at least 12.
- Vegetation placements: at least 45.
- Infrastructure placements: at least 60.
- Interactive stationary placeholders: at least 40.
- Prefab families used: at least 40.

The previous broad global edge/detail scatter pass was removed. Remaining generated placements are bounded by named clusters: plaza edge/seating/planters, workshop yard, milestone route, about garden, skills beds, contact forecourt, route-edge infrastructure and explicit boundary clusters. Invalid optional cluster candidates are filtered by terrain support instead of being placed in the air or beyond the island.

## Authoring Anchors

The map includes markers for the expected Phase 5 content surface:

- Projects: `project-featured`, `project-01`, `project-02`, `project-03`, `project-04`, `project-more`.
- Experience: `experience-start`, `experience-milestone-01`, `experience-milestone-02`, `experience-milestone-03`, `experience-current`, `experience-education`.
- About: `about-introduction`, `about-profile`, `about-values`, `about-cv`, `about-workspace`.
- Skills: `skills-overview`, `skills-frontend`, `skills-backend`, `skills-tooling`, `skills-design`, `skills-other`.
- Contact: `contact-main`, `contact-form`, `contact-email`, `contact-linkedin`, `contact-github`, `contact-cv`.

The bundled tests verify registration, dimensions, required zones and markers, navigation connectivity, prefab resolvability, in-bounds transforms, central loader preservation and document round trips.

## Static And Interactive Classification

Most structural objects carry `static` tags and keep the prefab library's collision mode. Portfolio interaction targets carry `interactive-stationary`; the Phase 5 map helper stores those as trigger-collision entities so they remain selectable without becoming visitor terrain. Flyer placeholders also include `future-dynamic-placeholder` metadata, but they are not animated in this phase.

## Prefab Audit

The prefab catalogue now contains more than 100 registered families across architecture, infrastructure, roads-and-paths, street furniture, nature, office, portfolio and navigation-helper categories. The main map intentionally uses a smaller authored subset instead of every available object.

Important compatible families intentionally left unused in the rich map are mostly narrow editor/helper or final-layout pieces such as character spawn, camera interest point, bird perch, ambient animation anchor, flyer end point and some door/window frame modules. Those are kept for later gameplay, animation and final building-detail passes.

## Camera

The default camera preset is `overview`, with focus presets for each portfolio zone and a `benchmark-dense-focus` preset for dense-zone measurement. Camera configuration stays inside map metadata, so the React renderer and controls remain map-agnostic.

## Reveal

The map uses the existing loader/reveal architecture. The center loader cells are part of the serialized terrain, the rest of the terrain and prefab entities are prepared through the normal map-loading path, and the current radial reveal can expose this authored map without constructing map-specific JSX.

## Save/Load

The map is created as an immutable bundled source map. It can be loaded, duplicated, saved as a draft, exported and imported through the existing editor/map-document system. Tests verify clone and map-document round trips.

## Placeholder Replacement

Future art can replace the prefab IDs and `assetReference` slots without moving the map architecture:

- `future/projects-workshop` for the Projects workshop.
- `future/current-role-marker` for the Experience endpoint.
- Existing prefab future slots for signs, folders, flyers, trees, kiosk and contact props.

## Benchmarking

This map is available to the existing benchmark selector as `Portfolio Main Greybox v1`. Record benchmark results separately after running the production app under fixed browser, DPR, viewport and camera-tour conditions.

No Phase 5 benchmark result is committed in this document yet. Scripted benchmark scenarios and visual screenshots still need to be captured through the benchmark workspace/browser on the target machine.

## Known Limitations

- Portfolio copy still points at placeholder content records.
- Signs and props are grey-box prefabs, not final stylized models.
- Interaction behavior is prepared through markers/entities, but final project/about/contact panels are outside this phase.
- Benchmark comparisons with flat and mid-stress maps are pending measured production runs.
