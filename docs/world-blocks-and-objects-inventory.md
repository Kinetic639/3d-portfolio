# World Blocks & Placeable Objects Inventory

Complete, source-verified inventory of every terrain block, terrain shape, primitive, prefab archetype, and individual prefab implemented in the map editor, as of 2026-08-04. Every table below enumerates **all** entries — none are summarized or sampled. Counts were verified by executing the actual registries (`npx tsx`), not by inspection alone.

The terrain system splits "what you paint" into two independent axes stored per voxel cell: a **block ID** (material) and a **shape ID** (geometry). Placeable objects are separately either raw **primitives**, or **prefabs** — named catalog entries, each built from one of 43 **archetypes** (fixed geometry compositions of primitives).

---

## Part 1 — World Blocks (terrain)

### 1a. Block materials — 7 total

Source: `lib/world/block-registry.ts:1-79`

| ID | Key | Name | Solid | Dev Color | Represents |
|---|---|---|---|---|---|
| 0 | `air` | Air | No | — | Empty space |
| 1 | `ground` | Ground | Yes | `#8a8a8a` | Generic default earth/terrain (also "None"/eraser default) |
| 2 | `path` | Path | Yes | `#817d68` | Walkway/trail surface |
| 3 | `zone-ground` | Zone Ground | Yes | `#6f8492` | Ground tagged as belonging to an editor zone |
| 4 | `boundary` | Boundary | Yes | `#4c5d54` | World-edge/off-limits marker terrain |
| 5 | `special` | Special / Interactive | Yes | `#86735c` | Interactive/trigger-purpose ground |
| 6 | `water` | Water | No (fluid) | `#5f9fb8` | Water surface |

No textures exist yet — material is a flat "greybox" vertex color. Shape (below) supplies the actual mesh geometry.

### 1b. Terrain shapes — 64 total

Source: `lib/voxel-shapes/shape-ids.ts:1-66`, definitions `lib/voxel-shapes/shape-registry.ts:637-700`

| ID | Key | Name | Category | Solid | Walkable | Blocks Movement | Fluid |
|---|---|---|---|---|---|---|---|
| 0 | `cube` | Cube | terrain | Yes | Yes | Yes | No |
| 1 | `slab` | Slab | terrain | Yes | Yes | Yes | No |
| 2 | `stair` | Stair | transition | Yes | Yes | No | No |
| 3 | `slope-shallow` | Shallow Slope | transition | Yes | Yes | No | No |
| 4 | `slope-steep` | Steep Slope | transition | Yes | No | Yes | No |
| 5 | `outer-stair-corner` | Outer Stair Corner | transition | Yes | Yes | No | No |
| 6 | `inner-stair-corner` | Inner Stair Corner | transition | Yes | Yes | No | No |
| 7 | `cut-corner` | Cut Corner | terrain | Yes | Yes | Yes | No |
| 8 | `wall` | Wall | structure | Yes | No | Yes | No |
| 9 | `beam` | Beam | structure | Yes | No | Yes | No |
| 10 | `pillar-base` | Pillar Base | structure | Yes | No | Yes | No |
| 11 | `pillar-middle` | Complete Pillar | structure | Yes | No | Yes | No |
| 12 | `pillar-cap` | Pillar Cap | structure | Yes | No | Yes | No |
| 13 | `roof-flat` | Flat Roof | roof | Yes | Yes | Yes | No |
| 14 | `roof-shallow` | Shallow Roof | roof | Yes | No | Yes | No |
| 15 | `roof-steep` | Steep Roof | roof | Yes | No | Yes | No |
| 16 | `roof-outer-corner` | Outer Roof Corner | roof | Yes | No | Yes | No |
| 17 | `roof-inner-corner` | Inner Roof Corner | roof | Yes | No | Yes | No |
| 18 | `fence` | Fence | structure | Yes | No | Yes | No |
| 19 | `pipe-short` | Short Pipe | utility | Yes | No | Yes | No |
| 20 | `pipe-long` | Long Pipe | utility | Yes | No | Yes | No |
| 21 | `pipe-corner` | Pipe Corner | utility | Yes | No | Yes | No |
| 22 | `water` | Water | fluid | No | No | No | Yes |
| 23 | `terrain-corner` | Terrain Corner | terrain | Yes | Yes | Yes | No |
| 24 | `roof-hollow` | Hollow Roof | roof | Yes | No | Yes | No |
| 25 | `rubble-small` | Small Rubble | terrain | Yes | No | No | No |
| 26 | `rubble-medium` | Medium Rubble | terrain | Yes | No | Yes | No |
| 27 | `stalactite-small` | Small Stalactite | terrain | Yes | No | No | No |
| 28 | `stalactite-large` | Large Stalactite | terrain | Yes | No | Yes | No |
| 29 | `crystal-small` | Small Crystal | terrain | Yes | No | No | No |
| 30 | `crystal-medium` | Medium Crystal | terrain | Yes | No | No | No |
| 31 | `crystal-large` | Large Crystal | terrain | Yes | No | Yes | No |
| 32 | `pipe` | Pipe | utility | Yes | No | Yes | No |
| 33 | `roof` | Roof | roof | Yes | No | Yes | No |
| 34 | `wooden-wall-full` | Wooden Wall - Full | structure | Yes | No | Yes | No |
| 35 | `ice-chunks` | Ice Chunks | terrain | Yes | No | No | No |
| 36 | `ice-chunks-medium` | Ice Chunks - Medium | terrain | Yes | No | Yes | No |
| 37 | `icicles` | Icicles | terrain | Yes | No | No | No |
| 38 | `icicles-large` | Large Icicles | terrain | Yes | No | Yes | No |
| 39 | `stair-inverted` | Inverted Stair | transition | Yes | No | No | No |
| 40 | `stair-low` | Low Terrain Steps | transition | Yes | Yes | No | No |
| 41 | `outer-stair-corner-inverted` | Inverted Outer Stair Corner | transition | Yes | No | No | No |
| 42 | `inner-stair-corner-inverted` | Inverted Inner Stair Corner | transition | Yes | No | No | No |
| 43 | `fence-post` | Fence Post | structure | Yes | No | Yes | No |
| 44 | `fence-corner` | Fence Corner | structure | Yes | No | Yes | No |
| 45 | `fence-t` | Fence T Junction | structure | Yes | No | Yes | No |
| 46 | `fence-cross` | Fence Cross Junction | structure | Yes | No | Yes | No |
| 47 | `fence-gate` | Fence Gate | structure | Yes | No | Yes | No |
| 48 | `retaining-wall-low` | Low Retaining Wall | structure | Yes | No | Yes | No |
| 49 | `terrain-raised-edge` | Raised Terrain Edge | terrain | Yes | Yes | Yes | No |
| 50 | `terrain-diagonal-bank` | Diagonal Terrain Bank | terrain | Yes | Yes | Yes | No |
| 51 | `wooden-wall-end` | Wooden Wall - End Pole | structure | Yes | No | Yes | No |
| 52 | `wooden-wall-corner` | Wooden Wall - Corner | structure | Yes | No | Yes | No |
| 53 | `wooden-wall-t` | Wooden Wall - T Junction | structure | Yes | No | Yes | No |
| 54 | `wooden-wall-cross` | Wooden Wall - Cross Junction | structure | Yes | No | Yes | No |
| 55 | `wooden-wall-gate` | Wooden Wall - Gate | structure | Yes | No | Yes | No |
| 56 | `stair-low-outer-corner` | Low Terrain Steps - Outer Corner | transition | Yes | Yes | No | No |
| 57 | `stair-low-inner-corner` | Low Terrain Steps - Inner Corner | transition | Yes | Yes | No | No |
| 58 | `solid-wooden-wall-full` | Solid Wooden Wall - Full | structure | Yes | No | Yes | No |
| 59 | `solid-wooden-wall-end` | Solid Wooden Wall - End Pole | structure | Yes | No | Yes | No |
| 60 | `solid-wooden-wall-corner` | Solid Wooden Wall - Corner | structure | Yes | No | Yes | No |
| 61 | `solid-wooden-wall-t` | Solid Wooden Wall - T Junction | structure | Yes | No | Yes | No |
| 62 | `solid-wooden-wall-cross` | Solid Wooden Wall - Cross Junction | structure | Yes | No | Yes | No |
| 63 | `solid-wooden-wall-gate` | Solid Wooden Wall - Gate | structure | Yes | No | Yes | No |

All shapes support 4-way rotation (`NORTH/EAST/SOUTH/WEST`); most also support a "pitch" (tilt onto a side/ceiling) via a packed state byte. Each voxel cell stores `blockId + shapeId + rotation + state` together — shape supplies mesh geometry, block supplies vertex color.

---

## Part 2 — Placeable Objects

### 2a. Raw primitives — 6 total

Source: `lib/maps/map-entities.ts:3,77`

| ID | Geometry | Represents |
|---|---|---|
| `box` | Box(1,1,1) | Generic block |
| `cylinder` | Cylinder(r0.5, h1) | Post/trunk-style shape |
| `sphere` | Sphere(r0.5) | Round/canopy shape |
| `plane` | thin Box(1, 0.04, 1) | Ground decal/marking |
| `platform` | thin Box(1, 0.22, 1) | Walkable slab (default collision: walkable) |
| `sign` | Box(1, 0.72, 0.08) | Floating label/subtitle/arrow text sign |

### 2b. Prefab archetypes — 43 total

Every prefab in the catalog (Part 2c) is built from exactly one of these fixed geometry compositions. Source: `lib/prefabs/prefab-library.ts:126-418` (`createArchetypeParts`).

| Archetype | Parts (primitive shapes used) | Represents |
|---|---|---|
| `building` | box mass + platform roof + box door | Small building |
| `workshop-compound` | platform foundation + 3 box volumes + 3 platform roofs + box door/windows/beams | Large multi-volume workshop building |
| `studio-compound` | platform terrace + 2 box volumes + 2 platform roofs + box entry/window + platform porch + 2 box posts | Personal studio building |
| `communication-station` | platform forecourt + 2 box volumes + platform roof + box window/door + cylinder mast + 2 box signal flags | Post-office/radio-station building |
| `pavilion` | platform deck + platform roof + 4 cylinder posts | Open-sided shelter |
| `wall` | 1 flat box | Plain wall segment |
| `wall-window` | 2 box wall halves + box sill/lintel + box window pane | Wall with a window opening |
| `wall-door` | 2 box wall halves + box lintel + box door | Wall with a door opening |
| `gate` | 2 box posts + box lintel | Archway / wall corner piece |
| `platform` | 1 flat box | Foundation/floor/roof/ramp |
| `path-section` | platform surface + 2 box curbs | Straight walking path segment |
| `round-platform` | 1 cylinder | Circular plaza/junction/barrel-top |
| `steps` | 3 stacked boxes | Staircase |
| `bridge` | platform deck + 2 box rails | Footbridge |
| `fence` | box rail + 2 box posts | Fencing |
| `garden-bed` | platform soil + 4 box edges | Planter bed |
| `path-detail` | 1 thin `plane` | Decal (stepping stone, drain cover, crossing marker) |
| `bench` | box seat + box back + 2 box legs | Seating |
| `post` | cylinder shaft + sphere cap | Lamp post/bollard |
| `board` | 2 box posts + box board | Noticeboard/sign |
| `orientation-monument` | 2 stacked cylinder bases + box obelisk + sphere cap + 2 box pointers | Landmark obelisk |
| `zone-board` | box base + 2 box posts + box panel + box header | Zone entrance sign |
| `container` | 1 box | Crate/planter/cabinet/mailbox |
| `mailbox-bank` | box rail + 3 colored boxes + 2 box posts | Row of mailboxes |
| `tree` | cylinder trunk + sphere canopy | Ornamental tree |
| `tree-wide` | cylinder trunk + 2 offset spheres | Broad-canopy tree |
| `tree-columnar` | cylinder trunk + 2 stacked spheres | Tall narrow tree/conifer |
| `bush` | 2 overlapping spheres | Bush |
| `shrub-low` | 3 low spheres | Grass/flower cluster |
| `rock` | 1 flattened sphere | Rock |
| `rock-stack` | 3 spheres | Boulder cluster |
| `desk` | box top + 4 box legs | Desk |
| `workbench-rich` | box top + box shelf + box vice + box "plans" + 4 box legs | Detailed workbench |
| `monitor-desk` | `desk` parts + box screen + box screen accent | Desk with monitor |
| `chair` | box seat + box back | Chair |
| `screen` | box screen + box stand | Monitor/laptop |
| `paper-stack` | 3 thin stacked boxes | Folder/document stack |
| `display-rack` | platform base + box back panel + 2 box shelves + 3 small display boxes | Project/skill display rack |
| `landmark` | cylinder base + box body + sphere cap | Generic pedestal/monument |
| `timeline-arch` | 2 box pillars + box lintel + box date plate | Timeline entrance arch |
| `milestone-station` | cylinder landing + box marker + box plaque + sphere cap | Milestone marker station |
| `skill-garden-landmark` | cylinder raised bed + cylinder trunk + 2 box branches (cross) + 4 sphere canopies (4 colors) | "Skill tree" centerpiece |
| `person-scale-marker` | platform + box body + sphere head | Human-scale reference mannequin (editor helper, non-collidable) |
| `navigation-anchor` | cylinder base + sphere marker | Invisible-at-runtime navigation/interaction node marker |

### 2c. Full prefab catalog — 263 total, 10 categories

Every named prefab, verified by executing `BUILT_IN_PREFABS` from `lib/prefabs/prefab-library.ts:493-679`. "Shape" = the archetype from Part 2b it's built from. "Collision" = physical behavior in-world (`blocking` = solid obstacle, `walkable` = can stand on, `trigger` = interactive/non-solid marker, `none` = purely visual/editor-only).

### Prefab catalog — `architecture` (40)

| ID | Name | Shape (archetype) | Collision | Tags |
|---|---|---|---|---|
| `portfolio-v2-foundation-square` | Portfolio V2 Foundation Square | platform | walkable | architecture, foundation |
| `portfolio-v2-foundation-rectangle` | Portfolio V2 Foundation Rectangle | platform | walkable | architecture, foundation |
| `portfolio-v2-raised-foundation` | Portfolio V2 Raised Foundation | platform | walkable | architecture, foundation |
| `portfolio-v2-wall-solid` | Portfolio V2 Wall Solid | wall | blocking | architecture, wall |
| `portfolio-v2-wall-window` | Portfolio V2 Wall Window | wall-window | blocking | architecture, wall |
| `portfolio-v2-wall-doorway` | Portfolio V2 Wall Doorway | wall-door | blocking | architecture, wall |
| `portfolio-v2-wall-corner` | Portfolio V2 Wall Corner | gate | blocking | architecture, wall |
| `portfolio-v2-roof-flat` | Portfolio V2 Roof Flat | platform | walkable | architecture, roof |
| `portfolio-v2-roof-stepped` | Portfolio V2 Roof Stepped | workshop-compound | blocking | architecture, roof |
| `portfolio-v2-porch` | Portfolio V2 Porch | pavilion | blocking | architecture, porch |
| `portfolio-v2-canopy` | Portfolio V2 Canopy | pavilion | blocking | architecture, canopy |
| `portfolio-v2-developer-workshop` | Portfolio V2 Developer Workshop | workshop-compound | blocking | projects, structure |
| `portfolio-v2-workshop-annex` | Portfolio V2 Workshop Annex | studio-compound | blocking | projects, structure |
| `portfolio-v2-covered-workspace` | Portfolio V2 Covered Workspace | pavilion | blocking | projects, structure |
| `portfolio-v2-personal-studio` | Portfolio V2 Personal Studio | studio-compound | blocking | about, structure |
| `portfolio-v2-studio-annex` | Portfolio V2 Studio Annex | building | blocking | about, structure |
| `portfolio-v2-maintenance-shelter` | Portfolio V2 Maintenance Shelter | pavilion | blocking | skills, structure |
| `portfolio-v2-communication-building` | Portfolio V2 Communication Building | communication-station | blocking | contact, structure |
| `portfolio-v2-contact-kiosk` | Portfolio V2 Contact Kiosk | building | blocking | contact, structure |
| `portfolio-workshop-compound` | Portfolio Workshop Compound | workshop-compound | blocking | architecture, workshop-compound |
| `personal-studio-compound` | Personal Studio Compound | studio-compound | blocking | architecture, studio-compound |
| `communication-station` | Communication Station | communication-station | blocking | architecture, communication-station |
| `wall-with-window` | Wall With Window | wall-window | blocking | architecture, wall-window |
| `wall-with-doorway` | Wall With Doorway | wall-door | blocking | architecture, wall-door |
| `building-mass` | Building Mass | building | blocking | architecture, building |
| `workshop-shell` | Workshop Shell | building | blocking | architecture, building |
| `open-pavilion` | Open Pavilion | pavilion | blocking | architecture, pavilion |
| `shed` | Shed | building | blocking | architecture, building |
| `kiosk` | Kiosk | building | blocking | architecture, building |
| `open-shelter` | Open Shelter | building | blocking | architecture, building |
| `door-frame` | Door Frame | gate | blocking | architecture, gate |
| `window-frame` | Window Frame | gate | blocking | architecture, gate |
| `flat-roof` | Flat Roof | building | blocking | architecture, building |
| `simple-sloped-roof` | Simple Sloped Roof | building | blocking | architecture, building |
| `archway` | Archway | gate | blocking | architecture, gate |
| `entrance-gate` | Entrance Gate | gate | blocking | architecture, gate |
| `porch` | Porch | pavilion | blocking | architecture, pavilion |
| `awning` | Awning | pavilion | blocking | architecture, pavilion |
| `wall-segment` | Wall Segment | wall | blocking | architecture, wall |
| `wall-corner` | Wall Corner | gate | blocking | architecture, gate |

### Prefab catalog — `infrastructure` (28)

| ID | Name | Shape (archetype) | Collision | Tags |
|---|---|---|---|---|
| `portfolio-v2-exterior-stair` | Portfolio V2 Exterior Stair | steps | walkable | infrastructure, stair |
| `portfolio-v2-ramp` | Portfolio V2 Ramp | platform | walkable | infrastructure, ramp |
| `portfolio-v2-handrail` | Portfolio V2 Handrail | fence | blocking | infrastructure, rail |
| `portfolio-v2-curb` | Portfolio V2 Curb | wall | blocking | infrastructure, curb |
| `portfolio-v2-retaining-wall` | Portfolio V2 Retaining Wall | wall | blocking | infrastructure, retaining |
| `portfolio-v2-fence-straight` | Portfolio V2 Fence Straight | fence | blocking | infrastructure, fence |
| `portfolio-v2-fence-gate` | Portfolio V2 Fence Gate | gate | blocking | infrastructure, fence |
| `portfolio-v2-bridge-section` | Portfolio V2 Bridge Section | bridge | walkable | infrastructure, bridge |
| `portfolio-v2-utility-cabinet` | Portfolio V2 Utility Cabinet | container | blocking | infrastructure |
| `portfolio-v2-drainage-cover` | Portfolio V2 Drainage Cover | path-detail | none | infrastructure |
| `portfolio-v2-cable-utility-box` | Portfolio V2 Cable Utility Box | container | blocking | projects, utility |
| `portfolio-v2-timeline-railing` | Portfolio V2 Timeline Railing | fence | blocking | experience, rail |
| `portfolio-v2-lookout-platform` | Portfolio V2 Lookout Platform | round-platform | walkable | experience |
| `portfolio-v2-radio-cabinet` | Portfolio V2 Radio Cabinet | container | blocking | contact |
| `square-platform` | Square Platform | platform | walkable | infrastructure, platform |
| `rectangular-platform` | Rectangular Platform | platform | walkable | infrastructure, platform |
| `circular-platform` | Circular Platform | round-platform | walkable | infrastructure, round-platform |
| `central-roundabout-base` | Central Roundabout Base | round-platform | walkable | infrastructure, round-platform |
| `bollard` | Bollard | post | blocking | infrastructure, post |
| `boundary-post` | Boundary Post | post | blocking | infrastructure, post |
| `retaining-wall` | Retaining Wall | wall | blocking | infrastructure, wall |
| `steps` | Steps | steps | walkable | infrastructure, steps |
| `ramp` | Ramp | platform | walkable | infrastructure, platform |
| `bridge` | Bridge | bridge | walkable | infrastructure, bridge |
| `simple-footbridge` | Simple Footbridge | bridge | walkable | infrastructure, bridge |
| `fence` | Fence | fence | blocking | infrastructure, fence |
| `fence-corner` | Fence Corner | gate | blocking | infrastructure, gate |
| `fence-gate` | Fence Gate | gate | blocking | infrastructure, gate |

### Prefab catalog — `nature` (33)

| ID | Name | Shape (archetype) | Collision | Tags |
|---|---|---|---|---|
| `portfolio-v2-raised-garden-bed` | Portfolio V2 Raised Garden Bed | garden-bed | blocking | vegetation |
| `portfolio-v2-technology-garden-bed` | Portfolio V2 Technology Garden Bed | garden-bed | blocking | skills, vegetation |
| `portfolio-v2-broad-canopy-tree` | Portfolio V2 Broad Canopy Tree | tree-wide | blocking | nature, vegetation |
| `portfolio-v2-tall-narrow-tree` | Portfolio V2 Tall Narrow Tree | tree-columnar | blocking | nature, vegetation |
| `portfolio-v2-ornamental-tree` | Portfolio V2 Ornamental Tree | tree | blocking | nature, vegetation |
| `portfolio-v2-large-shrub` | Portfolio V2 Large Shrub | bush | blocking | nature, vegetation |
| `portfolio-v2-low-shrub` | Portfolio V2 Low Shrub | shrub-low | blocking | nature, vegetation |
| `portfolio-v2-grass-cluster` | Portfolio V2 Grass Cluster | shrub-low | blocking | nature, vegetation |
| `portfolio-v2-flower-cluster` | Portfolio V2 Flower Cluster | shrub-low | blocking | nature, vegetation |
| `portfolio-v2-large-rock` | Portfolio V2 Large Rock | rock-stack | blocking | nature, rock |
| `portfolio-v2-medium-rock` | Portfolio V2 Medium Rock | rock | blocking | nature, rock |
| `portfolio-v2-small-rock-cluster` | Portfolio V2 Small Rock Cluster | rock-stack | blocking | nature, rock |
| `portfolio-v2-fallen-log` | Portfolio V2 Fallen Log | tree | blocking | nature |
| `portfolio-v2-timber-stack` | Portfolio V2 Timber Stack | container | blocking | nature |
| `raised-garden-bed` | Raised Garden Bed | garden-bed | blocking | nature, garden-bed |
| `wide-canopy-tree` | Wide Canopy Tree | tree-wide | blocking | nature, tree-wide |
| `columnar-tree` | Columnar Tree | tree-columnar | blocking | nature, tree-columnar |
| `low-shrub-cluster` | Low Shrub Cluster | shrub-low | blocking | nature, shrub-low |
| `stacked-rock-cluster` | Stacked Rock Cluster | rock-stack | blocking | nature, rock-stack |
| `deciduous-tree` | Deciduous Tree | tree | blocking | nature, tree |
| `conifer` | Conifer | tree | blocking | nature, tree |
| `orchard-tree` | Orchard Tree | tree | blocking | nature, tree |
| `skill-tree-placeholder` | Skill Tree Placeholder | tree | blocking | nature, tree |
| `narrow-tree` | Narrow Tree | tree | blocking | nature, tree |
| `young-tree` | Young Tree | tree | blocking | nature, tree |
| `tree-stump` | Tree Stump | tree | blocking | nature, tree |
| `fallen-log` | Fallen Log | tree | blocking | nature, tree |
| `bush` | Bush | bush | blocking | nature, bush |
| `hedge` | Hedge | bush | blocking | nature, bush |
| `rock` | Rock | rock | blocking | nature, rock |
| `boulder-cluster` | Boulder Cluster | rock | blocking | nature, rock |
| `grass-clump` | Grass Clump | bush | blocking | nature, bush |
| `flower-patch-marker` | Flower Patch Marker | bush | blocking | nature, bush |

### Prefab catalog — `navigation` (12)

| ID | Name | Shape (archetype) | Collision | Tags |
|---|---|---|---|---|
| `portfolio-v2-scale-reference` | Portfolio V2 Scale Reference | person-scale-marker | none | editor-helper, scale-reference |
| `scale-reference-mannequin` | Scale Reference Mannequin | person-scale-marker | none | navigation, editor-helper, scale-reference |
| `walk-node` | Walk Node | navigation-anchor | none | navigation, editor-helper |
| `route-junction` | Route Junction | navigation-anchor | none | navigation, editor-helper |
| `wait-point` | Wait Point | navigation-anchor | none | navigation, editor-helper |
| `look-at-point` | Look-at Point | navigation-anchor | none | navigation, editor-helper |
| `character-spawn` | Character Spawn | navigation-anchor | none | navigation, editor-helper |
| `bird-perch` | Bird Perch | navigation-anchor | none | navigation, editor-helper |
| `ambient-animation-anchor` | Ambient Animation Anchor | navigation-anchor | none | navigation, editor-helper |
| `flyer-start-point` | Flyer Start Point | navigation-anchor | none | navigation, editor-helper |
| `flyer-end-point` | Flyer End Point | navigation-anchor | none | navigation, editor-helper |
| `camera-interest-point` | Camera Interest Point | navigation-anchor | none | navigation, editor-helper |

### Prefab catalog — `office` (24)

| ID | Name | Shape (archetype) | Collision | Tags |
|---|---|---|---|---|
| `portfolio-v2-storage-shelf` | Portfolio V2 Storage Shelf | display-rack | blocking | projects, storage |
| `portfolio-v2-tool-cabinet` | Portfolio V2 Tool Cabinet | container | blocking | projects, storage |
| `portfolio-v2-chair` | Portfolio V2 Chair | chair | blocking | about |
| `portfolio-v2-bookshelf` | Portfolio V2 Bookshelf | display-rack | blocking | about |
| `desk` | Desk | desk | blocking | office, desk |
| `worktable` | Worktable | desk | blocking | office, desk |
| `chair-proxy` | Chair Proxy | chair | blocking | office, chair |
| `office-chair-proxy` | Office Chair Proxy | chair | blocking | office, chair |
| `monitor` | Monitor | screen | blocking | office, screen |
| `laptop` | Laptop | screen | blocking | office, screen |
| `keyboard-slab` | Keyboard Slab | paper-stack | blocking | office, paper-stack |
| `folder` | Folder | paper-stack | blocking | office, paper-stack |
| `folder-stack` | Folder Stack | paper-stack | blocking | office, paper-stack |
| `document-stack` | Document Stack | paper-stack | blocking | office, paper-stack |
| `sketchbook` | Sketchbook | paper-stack | blocking | office, paper-stack |
| `rolled-plan` | Rolled Plan | paper-stack | blocking | office, paper-stack |
| `pinboard` | Pinboard | board | blocking | office, board |
| `filing-cabinet` | Filing Cabinet | container | blocking | office, container |
| `storage-cabinet` | Storage Cabinet | container | blocking | office, container |
| `shelf` | Shelf | container | blocking | office, container |
| `desk-lamp` | Desk Lamp | post | blocking | office, post |
| `coffee-cup-proxy` | Coffee Cup Proxy | container | blocking | office, container |
| `headphones-proxy` | Headphones Proxy | container | blocking | office, container |
| `presentation-pedestal` | Presentation Pedestal | container | blocking | office, container |

### Prefab catalog — `portfolio` (72)

| ID | Name | Shape (archetype) | Collision | Tags |
|---|---|---|---|---|
| `portfolio-v2-orientation-monument` | Portfolio V2 Orientation Monument | orientation-monument | blocking | arrival, landmark |
| `portfolio-v2-loader-origin-surround` | Portfolio V2 Loader Origin Surround | round-platform | walkable | arrival |
| `portfolio-v2-intro-board` | Portfolio V2 Intro Board | zone-board | blocking | arrival, interactive |
| `portfolio-v2-info-pedestal` | Portfolio V2 Info Pedestal | container | blocking | interactive |
| `portfolio-v2-arrival-marker` | Portfolio V2 Arrival Marker | navigation-anchor | trigger | arrival, interactive |
| `portfolio-v2-project-exhibition-canopy` | Portfolio V2 Project Exhibition Canopy | pavilion | blocking | projects, display |
| `portfolio-v2-project-display-table` | Portfolio V2 Project Display Table | workbench-rich | blocking | projects, display |
| `portfolio-v2-workbench` | Portfolio V2 Workbench | workbench-rich | blocking | projects |
| `portfolio-v2-project-board` | Portfolio V2 Project Board | display-rack | blocking | projects, interactive |
| `portfolio-v2-featured-project-pedestal` | Portfolio V2 Featured Project Pedestal | landmark | blocking | projects, interactive |
| `portfolio-v2-folder` | Portfolio V2 Folder | paper-stack | blocking | projects, document |
| `portfolio-v2-document-stack` | Portfolio V2 Document Stack | paper-stack | blocking | projects, document |
| `portfolio-v2-timeline-entrance-arch` | Portfolio V2 Timeline Entrance Arch | timeline-arch | blocking | experience, landmark |
| `portfolio-v2-milestone-marker-a` | Portfolio V2 Milestone Marker A | milestone-station | blocking | experience, interactive |
| `portfolio-v2-milestone-marker-b` | Portfolio V2 Milestone Marker B | milestone-station | blocking | experience, interactive |
| `portfolio-v2-milestone-marker-c` | Portfolio V2 Milestone Marker C | milestone-station | blocking | experience, interactive |
| `portfolio-v2-information-plaque` | Portfolio V2 Information Plaque | board | blocking | interactive |
| `portfolio-v2-career-path-marker` | Portfolio V2 Career Path Marker | navigation-anchor | trigger | experience, interactive |
| `portfolio-v2-education-branch-marker` | Portfolio V2 Education Branch Marker | zone-board | blocking | experience, interactive |
| `portfolio-v2-current-position-landmark` | Portfolio V2 Current Position Landmark | orientation-monument | blocking | experience, landmark |
| `portfolio-v2-exterior-workspace` | Portfolio V2 Exterior Workspace | monitor-desk | blocking | about, interactive |
| `portfolio-v2-profile-pedestal` | Portfolio V2 Profile Pedestal | landmark | blocking | about, interactive |
| `portfolio-v2-cv-stand` | Portfolio V2 CV Stand | board | blocking | about, interactive |
| `portfolio-v2-skill-tree` | Portfolio V2 Skill Tree | skill-garden-landmark | blocking | skills, landmark |
| `portfolio-v2-skill-stand-a` | Portfolio V2 Skill Stand A | display-rack | blocking | skills, interactive |
| `portfolio-v2-skill-stand-b` | Portfolio V2 Skill Stand B | display-rack | blocking | skills, interactive |
| `portfolio-v2-skill-stand-c` | Portfolio V2 Skill Stand C | display-rack | blocking | skills, interactive |
| `portfolio-v2-frontend-marker` | Portfolio V2 Frontend Marker | zone-board | blocking | skills, interactive |
| `portfolio-v2-backend-marker` | Portfolio V2 Backend Marker | zone-board | blocking | skills, interactive |
| `portfolio-v2-tooling-marker` | Portfolio V2 Tooling Marker | zone-board | blocking | skills, interactive |
| `portfolio-v2-design-ux-marker` | Portfolio V2 Design UX Marker | zone-board | blocking | skills, interactive |
| `portfolio-v2-modular-skill-branch` | Portfolio V2 Modular Skill Branch | fence | blocking | skills |
| `portfolio-v2-skill-token` | Portfolio V2 Skill Token | navigation-anchor | trigger | skills, interactive |
| `portfolio-v2-mailbox` | Portfolio V2 Mailbox | container | blocking | contact, interactive |
| `portfolio-v2-mailbox-cluster` | Portfolio V2 Mailbox Cluster | mailbox-bank | blocking | contact, interactive |
| `portfolio-v2-contact-noticeboard` | Portfolio V2 Contact Noticeboard | zone-board | blocking | contact, interactive |
| `portfolio-v2-writing-counter` | Portfolio V2 Writing Counter | workbench-rich | blocking | contact |
| `portfolio-v2-communication-mast` | Portfolio V2 Communication Mast | post | blocking | contact, landmark |
| `portfolio-v2-social-link-marker` | Portfolio V2 Social Link Marker | navigation-anchor | trigger | contact, interactive |
| `portfolio-v2-contact-form-marker` | Portfolio V2 Contact Form Marker | landmark | trigger | contact, interactive |
| `portfolio-v2-cv-download-marker` | Portfolio V2 CV Download Marker | board | trigger | contact, interactive |
| `portfolio-v2-flyer` | Portfolio V2 Flyer | paper-stack | blocking | contact, flyer |
| `portfolio-v2-flyer-pile` | Portfolio V2 Flyer Pile | paper-stack | blocking | contact, flyer |
| `portfolio-v2-wall-poster` | Portfolio V2 Wall Poster | board | blocking | contact, flyer |
| `central-orientation-monument` | Central Orientation Monument | orientation-monument | blocking | portfolio, orientation-monument |
| `project-display-rack` | Project Display Rack | display-rack | blocking | portfolio, display-rack |
| `skill-display-stand` | Skill Display Stand | display-rack | blocking | portfolio, display-rack |
| `timeline-arch` | Timeline Arch | timeline-arch | blocking | portfolio, timeline-arch |
| `milestone-station` | Milestone Station | milestone-station | blocking | portfolio, milestone-station |
| `skill-branch-landmark` | Skill Branch Landmark | skill-garden-landmark | blocking | portfolio, skill-garden-landmark |
| `mailbox-bank` | Mailbox Bank | mailbox-bank | blocking | portfolio, mailbox-bank |
| `development-workbench` | Development Workbench | workbench-rich | blocking | portfolio, workbench-rich |
| `desk-with-monitor` | Desk With Monitor | monitor-desk | blocking | portfolio, monitor-desk |
| `about-desk` | About Desk | desk | blocking | portfolio, desk |
| `project-display-monitor` | Project Display Monitor | screen | blocking | portfolio, screen |
| `cv-flyer` | CV Flyer | paper-stack | blocking | portfolio, paper-stack |
| `envelope` | Envelope | paper-stack | blocking | portfolio, paper-stack |
| `project-folder` | Project Folder | paper-stack | blocking | portfolio, paper-stack |
| `featured-project-folder` | Featured Project Folder | paper-stack | blocking | portfolio, paper-stack |
| `project-blueprint-board` | Project Blueprint Board | board | blocking | portfolio, board |
| `experience-milestone` | Experience Milestone | landmark | blocking | portfolio, landmark |
| `experience-date-post` | Experience Date Post | landmark | blocking | portfolio, landmark |
| `experience-noticeboard` | Experience Noticeboard | board | blocking | portfolio, board |
| `skills-category-tree` | Skills Category Tree | tree | blocking | portfolio, tree |
| `skill-fruit-placeholder` | Skill Fruit Placeholder | landmark | none | portfolio, landmark |
| `about-noticeboard` | About Noticeboard | board | blocking | portfolio, board |
| `contact-mailbox` | Contact Mailbox | container | blocking | portfolio, container |
| `contact-noticeboard` | Contact Noticeboard | board | blocking | portfolio, board |
| `contact-form-pedestal` | Contact Form Pedestal | container | blocking | portfolio, container |
| `central-portfolio-sign` | Central Portfolio Sign | board | blocking | portfolio, board |
| `section-landmark` | Section Landmark | landmark | blocking | portfolio, landmark |
| `future-portal-placeholder` | Future Portal Placeholder | landmark | blocking | portfolio, landmark |

### Prefab catalog — `roads-and-paths` (16)

| ID | Name | Shape (archetype) | Collision | Tags |
|---|---|---|---|---|
| `portfolio-v2-main-path-straight` | Portfolio V2 Main Path Straight | path-section | walkable | path |
| `portfolio-v2-main-path-corner` | Portfolio V2 Main Path Corner | path-section | walkable | path |
| `portfolio-v2-path-junction` | Portfolio V2 Path Junction | round-platform | walkable | path |
| `portfolio-v2-secondary-path` | Portfolio V2 Secondary Path | path-section | walkable | path |
| `portfolio-v2-stepping-stone` | Portfolio V2 Stepping Stone | path-detail | none | path |
| `main-path-section` | Main Path Section | path-section | walkable | roads-and-paths, path-section |
| `secondary-path-section` | Secondary Path Section | path-section | walkable | roads-and-paths, path-section |
| `path-border` | Path Border | path-detail | none | roads-and-paths, path-detail |
| `path-corner-border` | Path Corner Border | path-detail | none | roads-and-paths, path-detail |
| `path-entrance` | Path Entrance | path-detail | none | roads-and-paths, path-detail |
| `pedestrian-crossing-marker` | Pedestrian Crossing Marker | path-detail | none | roads-and-paths, path-detail |
| `roadside-marker` | Roadside Marker | path-detail | none | roads-and-paths, path-detail |
| `junction-marker` | Junction Marker | path-detail | none | roads-and-paths, path-detail |
| `circular-plaza-insert` | Circular Plaza Insert | round-platform | walkable | roads-and-paths, round-platform |
| `drain-or-ground-detail-plane` | Drain or Ground Detail Plane | path-detail | none | roads-and-paths, path-detail |
| `elevated-walkway` | Elevated Walkway | bridge | walkable | roads-and-paths, bridge |

### Prefab catalog — `signage` (9)

| ID | Name | Shape (archetype) | Collision | Tags |
|---|---|---|---|---|
| `portfolio-v2-direction-sign` | Portfolio V2 Direction Sign | zone-board | blocking | signage |
| `portfolio-v2-zone-entrance-sign` | Portfolio V2 Zone Entrance Sign | zone-board | blocking | signage |
| `portfolio-v2-noticeboard` | Portfolio V2 Noticeboard | board | blocking | signage |
| `portfolio-v2-map-board` | Portfolio V2 Map Board | zone-board | blocking | signage |
| `portfolio-v2-workshop-entrance-sign` | Portfolio V2 Workshop Entrance Sign | zone-board | blocking | projects, signage |
| `portfolio-v2-about-entrance-sign` | Portfolio V2 About Entrance Sign | zone-board | blocking | about, signage |
| `portfolio-v2-skills-entrance-sign` | Portfolio V2 Skills Entrance Sign | zone-board | blocking | skills, signage |
| `portfolio-v2-contact-entrance-sign` | Portfolio V2 Contact Entrance Sign | zone-board | blocking | contact, signage |
| `zone-identity-board` | Zone Identity Board | zone-board | blocking | signage, zone-board |

### Prefab catalog — `street-furniture` (28)

| ID | Name | Shape (archetype) | Collision | Tags |
|---|---|---|---|---|
| `portfolio-v2-bollard` | Portfolio V2 Bollard | post | blocking | infrastructure |
| `portfolio-v2-path-lamp` | Portfolio V2 Path Lamp | post | blocking | lighting |
| `portfolio-v2-building-lamp` | Portfolio V2 Building Lamp | post | blocking | lighting |
| `portfolio-v2-bench` | Portfolio V2 Bench | bench | blocking | seating |
| `portfolio-v2-planter` | Portfolio V2 Planter | container | blocking | vegetation |
| `portfolio-v2-plaza-seating` | Portfolio V2 Plaza Seating | bench | blocking | arrival, seating |
| `portfolio-v2-plaza-planter` | Portfolio V2 Plaza Planter | garden-bed | blocking | arrival, vegetation |
| `portfolio-v2-crate-stack` | Portfolio V2 Crate Stack | container | blocking | projects, storage |
| `portfolio-v2-reflection-seat` | Portfolio V2 Reflection Seat | bench | blocking | experience |
| `portfolio-v2-crate` | Portfolio V2 Crate | container | blocking | decoration |
| `portfolio-v2-barrel-container` | Portfolio V2 Barrel Container | round-platform | walkable | decoration |
| `bench` | Bench | bench | blocking | street-furniture, bench |
| `lamp-post` | Lamp Post | post | blocking | street-furniture, post |
| `utility-pole` | Utility Pole | post | blocking | street-furniture, post |
| `directional-signpost` | Directional Signpost | post | blocking | street-furniture, post |
| `central-multi-direction-sign` | Central Multi-Direction Sign | post | blocking | street-furniture, post |
| `street-furniture-bollard` | Bollard | post | blocking | street-furniture, post |
| `section-sign` | Section Sign | board | blocking | street-furniture, board |
| `noticeboard` | Noticeboard | board | blocking | street-furniture, board |
| `bulletin-board` | Bulletin Board | board | blocking | street-furniture, board |
| `information-pedestal` | Information Pedestal | board | blocking | street-furniture, board |
| `mailbox` | Mailbox | container | blocking | street-furniture, container |
| `waste-bin` | Waste Bin | container | blocking | street-furniture, container |
| `planter` | Planter | container | blocking | street-furniture, container |
| `bicycle-rack-proxy` | Bicycle Rack Proxy | container | blocking | street-furniture, container |
| `simple-barrier` | Simple Barrier | container | blocking | street-furniture, container |
| `crate` | Crate | container | blocking | street-furniture, container |
| `barrel` | Barrel | round-platform | walkable | street-furniture, round-platform |

### Prefab catalog — `decoration` (1)

| ID | Name | Shape (archetype) | Collision | Tags |
|---|---|---|---|---|
| `portfolio-v2-ground-debris` | Portfolio V2 Ground Debris | rock-stack | blocking | decoration |

---

### 2d. Navigation nodes — 6 total (separate palette, not prefabs)

Source: `lib/maps/map-navigation.ts:3`

| Type | Represents |
|---|---|
| `walk` | Standard walkable graph node |
| `route-junction` | Branch point connecting multiple routes |
| `wait-point` | Node where a character/agent pauses |
| `look-at` | Camera/character look-target node |
| `character-spawn` | Spawn location for an NPC/character |
| `bird-perch` | Perch point for ambient bird animation |

Nodes are connected by edges into routes for AI/camera movement, and are visually represented in the world by the 10 `navigation-anchor`-based prefabs in the `navigation` category (Part 2c) — those are visual stand-ins, not a separate data type.

### 2e. Other editor-placed concepts (not discrete objects)

- **Zones** — brush-painted voxel-column tags (not placed entities), each with a color + focus direction.
- **Markers** — not placed directly; synthesized when a placed prefab/primitive is tagged with a `contentReference` (`project | about | experience | skillGroup | contact`), rendered as a billboard sprite.
- **Spawn points & camera presets** — map-level config entries authored in the editor, not visual props.

---

## Summary counts

| Category | Count |
|---|---|
| Block materials | 7 |
| Terrain shapes | 64 |
| Raw primitives | 6 |
| Prefab archetypes | 43 |
| Prefabs (full catalog) | 263 |
| Navigation node types | 6 |
| **Total distinct block/shape/object identifiers** | **389** |
