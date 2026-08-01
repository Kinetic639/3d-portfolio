# Interactive 3D Portfolio — Complete Development Roadmap

## Current position

The project already has a successful technical rendering proof of concept:

- a four-block animated loader;
- real terrain initialization;
- radial expansion into a `64 × 64` flat map;
- 4,096 instanced blocks divided into sixteen chunks;
- map panning, zooming and constrained camera rotation;
- strong browser performance.

The next objective is to turn this rendering demonstration into a usable gray-box portfolio before creating final models, textures or the Borderlands-inspired visual treatment.

Do not start by decorating the map. First make the complete portfolio function using plain blocks, placeholder geometry and accessible HTML content.

---

# Phase 1 — Preserve the successful baseline

## 1. Create a stable checkpoint

Before introducing more systems:

- commit the working proof of concept;
- create a tag or branch such as `voxel-poc`;
- run the production build;
- record FPS, frame time, draw calls and triangle count;
- test maximum zoom-out, panning, zooming and rotation;
- capture a screenshot or short recording.

### Completion criterion

It must always be possible to return to the version that renders all 4,096 blocks smoothly.

---

# Phase 2 — Build the actual world foundation

## 2. Formalize the logical grid

The map must be data-driven rather than generated directly inside rendering components.

Create a central world configuration defining:

```text
width: 64
depth: 64
height: 12
blockSize: 1
chunkSize: 16
airBlockId: 0
```

Create centralized operations for:

- getting a block;
- setting a block;
- converting grid coordinates to world coordinates;
- converting world coordinates to grid coordinates;
- checking world boundaries;
- locating a block's chunk;
- marking affected chunks as dirty.

Use integer grid coordinates as the source of truth. Three.js positions must always be derived from the grid.

### Completion criterion

Changing one entry in the world data predictably changes one position on the rendered map.

## 3. Create a block registry

Introduce stable block types even though everything initially looks similar:

```text
0 — Air
1 — Ground
2 — Path
3 — Zone Ground
4 — Boundary
5 — Special / Interactive
```

Each definition should eventually support:

- stable ID and key;
- display name;
- renderable state;
- solid state;
- temporary development color;
- future top, side and bottom textures;
- material category;
- interaction type;
- rules describing whether models may be placed on it.

Do not implement final textures during this phase.

### Completion criterion

Different block types can temporarily render with different flat colors while sharing the same rendering architecture.

---

# Phase 3 — Create an authoring workflow

## 4. Build a development-only map editor

Manually maintaining thousands of coordinates will quickly become impractical. Build a simple developer mode that allows the map to be authored visually.

The editor should eventually support:

- selecting a block;
- painting a block type;
- erasing a block;
- raising and lowering terrain;
- assigning a zone ID;
- marking paths;
- placing entity anchors;
- importing map data;
- exporting map data as JSON.

A minimal tool set is sufficient:

```text
Select
Paint
Erase
Raise
Lower
Assign zone
Place marker
Export
Import
```

The editor does not need polished production UI. Save only logical world and entity data, never Three.js matrices.

### Completion criterion

The map can be edited visually, exported, reloaded after a refresh and reproduced identically.

This is especially valuable because the project should be authorable by a web developer without requiring a complex external 3D level editor.

---

# Phase 4 — Define the portfolio structure

## 5. Prepare the actual portfolio content

Before designing the zones, define what the map needs to contain:

- Projects;
- About;
- Experience;
- Skills;
- Contact.

Store portfolio content independently from the 3D scene.

A project entry should eventually support fields such as:

```text
id
slug
title
shortDescription
longDescription
technologies
role
screenshots
liveUrl
repositoryUrl
featured
mapLocation
```

An experience entry should support:

```text
company
position
dateRange
description
technologies
mapLocation
```

Do not embed portfolio copy directly inside Three.js components.

### Completion criterion

All important portfolio information can be displayed as ordinary HTML without requiring the 3D scene.

## 6. Define the browsing states

The map experience should have explicit states:

```text
overview
zone selected
zone focused
item selected
content open
returning to overview
```

Define the expected behavior:

- hovering highlights a zone or item;
- clicking selects it;
- double-clicking or selecting an Explore action focuses the camera;
- selecting a project opens readable information;
- closing the content restores the previous camera state;
- selecting Overview returns to the complete map.

### Completion criterion

Every important click and transition can be described unambiguously without referencing final visual styling.

---

# Phase 5 — Gray-box the complete portfolio map

## 7. Design the map layout using plain blocks

Use the development editor and flat colors to create the rough portfolio zones.

Do not build detailed models yet. Use simple placeholders:

- cubes for buildings;
- cylinders for markers;
- colored platforms for zones;
- simple paths connecting locations;
- basic signs for section names.

A possible high-level structure is:

```text
Central landing area
├── Projects district
├── Experience route
├── About location
├── Skills area
└── Contact destination
```

The map should not resemble five rectangular website buttons placed on a grid. Give zones recognizable shapes, different elevations and clear boundaries while keeping travel distances short.

A recruiter should be able to reach every section quickly.

### Completion criterion

A person unfamiliar with the project can identify the major areas without extensive instructions.

## 8. Validate map navigation

Test:

- the full-map overview;
- camera rotation;
- panning;
- zooming;
- selecting zones from different angles;
- returning to overview;
- mobile gestures;
- the upper-hemisphere camera restriction;
- the inability to lose the map by excessive panning or zooming.

Use temporary labels and colors before creating artwork.

### Completion criterion

The plain gray-box map already feels comfortable and intuitive to browse.

---

# Phase 6 — Build interaction and readable website content

## 9. Implement the interaction system

Create a centralized interaction layer responsible for:

- raycasting;
- converting instance IDs to grid coordinates;
- hover state;
- selected state;
- click-versus-drag detection;
- zone detection;
- interaction hit areas;
- cursor changes.

Detailed models should eventually use simplified invisible hitboxes so users do not need to click tiny pieces of geometry precisely.

### Completion criterion

Hovering and selecting remain reliable while zooming, panning and rotating.

## 10. Add readable content panels

The 3D map should provide navigation, but substantial portfolio information should remain accessible HTML.

When a project is selected, show a readable panel containing:

- project title;
- concise description;
- role;
- technologies;
- screenshots;
- live-site link;
- repository link when appropriate;
- close or back action;
- an optional future Visit Location action.

The panel may visually belong to the map interface, but readability takes priority over spectacle.

### Completion criterion

Recruiters can inspect every important portfolio item without performing precise 3D camera manipulation.

## 11. Add navigation history and direct links

Selections should eventually correspond to meaningful URLs such as:

```text
/projects
/projects/ambra
/experience
/about
/contact
```

This enables:

- browser back and forward;
- direct project links;
- sharing;
- SEO;
- analytics;
- opening content without replaying the entire introduction.

The URL, content panel and 3D map selection must remain synchronized.

### Completion criterion

Refreshing or sharing a project URL restores the correct portfolio content and map context.

---

# Phase 7 — Create one complete visual vertical slice

## 12. Choose one small representative area

Do not style the entire map simultaneously.

Select:

- one small terrain area;
- one path;
- one landmark;
- one project object;
- one label;
- one interaction.

Use this area to establish the final visual language.

## 13. Develop the graphic style gradually

Apply visual complexity in this order:

1. Final color palette.
2. Basic cel-shaded lighting.
3. Darker block sides and lighter block tops.
4. Baked ambient occlusion.
5. One hand-painted block texture.
6. One conventional detailed model.
7. Painted linework on that model.
8. Selective silhouette outline.
9. Hover highlight.
10. Final zone label.

Measure performance after each addition.

### Completion criterion

One small area demonstrates the intended final quality while maintaining good performance and readable interaction.

Do not expand the style if it makes navigation or content harder to understand.

---

# Phase 8 — Establish the 3D asset pipeline

## 14. Define model rules

Before producing multiple models, define consistent conventions:

- GLTF/GLB format;
- correct object origin;
- consistent world scale;
- Y-up orientation;
- predictable naming;
- maximum texture sizes;
- triangle budgets;
- material limits;
- collision and hitbox naming;
- LOD naming;
- grid anchor coordinates.

Example naming:

```text
project_terminal.glb
project_terminal_hitbox
project_terminal_lod0
project_terminal_lod1
```

Use glTF Transform to inspect and optimize completed models.

### Completion criterion

A new model can be added, anchored to a grid coordinate and displayed without custom one-off positioning or repair code.

---

# Phase 9 — Implement portfolio zones incrementally

Build the zones in this order:

1. Central landing area.
2. Projects.
3. Experience.
4. About.
5. Skills.
6. Contact.

For each zone, complete:

- terrain;
- landmark;
- camera focus position;
- interactive items;
- readable HTML content;
- hover and selection behavior;
- mobile behavior;
- performance verification;
- accessible fallback.

Finish one zone before beginning the next.

Projects should receive the most space and visual emphasis because they provide the strongest evidence of development ability.

---

# Phase 10 — Polish the opening experience

## 15. Refine the loader

After real assets exist, make the loader track genuine work:

- critical models;
- textures;
- environment assets;
- material compilation;
- GPU preparation.

The four-block loader remains, but it now represents actual application preparation.

## 16. Add the welcome moment

The intended sequence is:

1. Four blocks float while critical assets initialize.
2. The blocks settle.
3. A small activation object appears.
4. The visitor receives a short welcome.
5. The visitor activates the map.
6. Terrain expands.
7. Portfolio landmarks appear.
8. Controls become available.

Keep this sequence short and allow returning visitors to skip it.

Store whether the visitor has completed the introduction so it does not become irritating on every visit.

---

# Phase 11 — Accessibility and normal-website fallback

## 17. Build an HTML representation

The portfolio must remain usable when:

- WebGL is unsupported;
- reduced motion is enabled;
- the device is weak;
- JavaScript fails;
- search engines inspect the page;
- users navigate using a keyboard or screen reader.

Provide an accessible HTML representation containing the same:

- projects;
- experience;
- about information;
- skills;
- contact links.

This is not a separate portfolio. It is another presentation of the same structured content.

---

# Phase 12 — Optimization and release

## 18. Add adaptive quality

Create several quality levels:

| Feature | High | Medium | Low |
| --- | --- | --- | --- |
| Device pixel ratio | `1.5–2` | `1.25` | `1` |
| Outlines | Full | Reduced | Minimal or disabled |
| Shadows | Dynamic | Limited | Baked or disabled |
| Decorative models | Full | Reduced | Essential only |
| Texture sizes | Higher | Medium | Lower |
| Animations | Full | Simplified | Reduced |

Do not select quality only by checking whether a visitor is on mobile. Measure actual frame performance and adapt accordingly.

## 19. Final testing

Test:

- Chrome;
- Firefox;
- Edge;
- Safari;
- desktop computers;
- integrated graphics;
- mobile devices;
- touch input;
- keyboard input;
- reduced-motion mode;
- slow networks;
- returning visitors;
- direct project URLs;
- WebGL failure;
- production builds.

Monitor:

- loading duration;
- JavaScript bundle size;
- model download size;
- texture memory;
- draw calls;
- triangle count;
- FPS;
- frame-time spikes;
- interaction responsiveness.

## 20. Deploy the map portfolio

Only after the map experience is complete, useful and accessible should development begin on the separate full game-world experience.

Treat it as a second product layer:

```text
Portfolio map
→ complete and usable website experience

Visit location
→ optional deeper game experience
```

---

# Immediate next sequence

The recommended order from the current proof of concept is:

1. Commit the working proof of concept.
2. Formalize the grid and world-data model.
3. Create the block registry.
4. Build the development-only map editor.
5. Prepare real portfolio content as structured data.
6. Gray-box all portfolio zones.
7. Implement zone selection and readable HTML content panels.
8. Complete one visually styled vertical slice.
9. Measure performance against the baseline.
10. Expand the successful visual system across the remaining map.

The most important immediate objective is not creating final models or textures. It is converting the flat technical proof of concept into an editable, data-driven gray-box map that already contains the complete portfolio information architecture.

