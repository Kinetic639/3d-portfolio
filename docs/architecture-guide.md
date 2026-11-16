# How to understand and extend this project

This is the practical guide to deciding **where code belongs, how parts communicate, and what visitors should download**. Read it before adding a feature. The shorter [architecture specification](architecture.md) and [decision records](decisions/) explain the formal decisions.

## 1. Start with the product, not the package names

We are building one portfolio with two ways to explore it:

- A normal website where people can read projects, case studies and contact information immediately.
- An optional interactive 3D world that helps people discover that same content.

We also need a separate development application for creating those worlds: the editor.

Think of the project as three activities:

1. **Present the portfolio:** website pages and readable content.
2. **Run a world:** render, animate and handle interactions for visitors.
3. **Create a world:** edit source data, prepare production files and inspect performance.

Activities 1 and 2 reach visitors. Most of activity 3 must never reach them.

## 2. What “app”, “package” and “boundary” mean here

An **app** is something we launch and deploy. `apps/portfolio` and `apps/editor` each have their own website routes and build output.

A **package** is a separately checked and built collection of code with an explicit public interface. It is not another website or server. Packages help us share useful behavior without sharing everything around it.

A **boundary** is the rule governing who may use that interface. For example, the editor can use production runtime code, but the runtime cannot import the editor.

An **import dependency** is different from communication. If runtime emits an event that the editor observes, runtime does not need to import editor code. The observer supplies a callback through an agreed interface.

A **facade** is a small front door to a larger implementation. UI code uses `WorldRuntime`; it does not browse the runtime's internal folders to find objects to mutate.

An **artifact** is generated output, such as a prepared map mesh. We regenerate artifacts from source instead of editing them by hand.

## 3. The two applications

### `apps/portfolio`: the website a visitor opens

Put website-specific decisions here:

- Home, projects, case-study and contact routes.
- Website navigation, page layouts and metadata.
- How URLs change when content opens.
- Whether and when to offer the optional 3D experience.
- The website's integration with the shared experience host.

For example, `/projects/my-project` belongs here. The reusable document content it displays can belong in `portfolio-content`.

It may depend on `contracts`, `experience-ui` and `portfolio-content`. Nothing depends on this application as a code library.

**Never put editor controls, source-map editing, compilation or development profiling here.** A hidden editor route would still weaken the separation we intentionally created.

### `apps/editor`: the tool you use to build worlds

Put editor-specific presentation and coordination here:

- Toolbars, inspectors, asset browsers and editor shortcuts.
- Selection and transformation viewport adapters.
- File/storage adapters and build-job integration.
- The `EditorSession` coordinator.
- Play/Stop controls and the future Play iframe host.
- Laboratory and diagnostics panels.

The editor application may use all seven packages. However, `world-build` is restricted to its `src/server` code. Browser panels must not import a compiler or filesystem tool.

**Current restriction:** the foundation also blocks imports into `src/server` from outside that directory. When implementing build endpoints, we must deliberately add and test the appropriate server-route boundary. Do not bypass the rule with a relative import or weaken it globally.

No package or other app imports `apps/editor`. Its code is never part of the portfolio deployment.

## 4. The seven packages, translated into ordinary language

### `contracts`: the shared vocabulary

**Question it answers:** “What information and requests do these parts agree to exchange?”

Examples include the shape of a world snapshot, a request to activate an object, a document-requested event and the version of a runtime map manifest.

Contracts describe the agreement; they do not implement rendering, editing or website behavior. They must not contain React components, Three.js objects, asset catalogs or unrelated helpers.

All other members may use this package. It has no internal workspace dependencies. Types disappear during compilation; future runtime values or validators may be delivered where needed.

**Example:** add a typed `document-requested` event here, but implement opening the DOM document in `experience-ui`.

### `world-authoring`: the editable world and editing rules

**Question it answers:** “What are we authoring, and what is a valid edit?”

Eventually this will describe object placements, terrain authoring information, map exits, environment settings and interaction configuration. It also owns editing operations and undoable changes, independently of the buttons that trigger them.

It depends only on `contracts` internally. The editor uses it. The compiler uses only its source-data entry points. Visitors never need it.

Its separate entry points are intentional:

| Entry           | Purpose                           | Compiler allowed? |
| --------------- | --------------------------------- | ----------------- |
| `/schema`       | Structure of editable source data | Yes               |
| `/validation`   | Whether source data is valid      | Yes               |
| `/commands`     | Editing operations                | No                |
| `/history`      | Undo/redo information             | No                |
| `/transactions` | Grouping edits into an operation  | No                |

There is no root export that combines these. Schema and validation must not indirectly import editing behavior either.

**Example:** the rule for moving an authored object belongs here; the inspector's position input belongs in `apps/editor`.

Do not put React panels, file access, WebGL resources or production gameplay simulation here.

### `world-build`: the workshop that prepares delivery files

**Question it answers:** “How do we turn editable source into something cheap for a visitor to load?”

Future responsibilities include asset processing, terrain baking, instance grouping, collision preparation and generating runtime manifests.

It may depend on `contracts` and the authoring `/schema` and `/validation` exports. The editor's server-side job integration and build tools may call it. Neither the public website nor its runtime may import it.

**Example:** preparing a static cliff mesh belongs here. Drawing that prepared mesh during a visit belongs in `runtime`.

The compiler receives a source snapshot. It does not instantiate an editor session or replay undo history. It does not contain Next.js routes or editor panels.

The foundation declares a build contract, but does not yet compile maps or process assets.

### `runtime`: the machinery that runs the visitor's world

**Question it answers:** “What happens while somebody experiences a prepared world?”

Future responsibilities include rendering, map transitions, resource loading, interactions, animation, environmental state and selected gameplay systems.

It depends only on `contracts` internally. Its external rendering dependencies will be chosen through the Three.js runtime ownership experiment. `experience-ui` uses its production facade; the editor may use that facade too.

**Example:** a tree responding to current wind belongs here. The editor slider that sets the authored wind value does not.

No brushes, undo history, inspector panels, source-world compiler or Next.js routes belong here. It must never depend on diagnostics to perform essential cleanup.

UI sees only `WorldRuntime`. No scene, renderer or arbitrary object mutation interface is exposed. The runtime is intended to load separately from the initial website.

**Current status:** only facade types exist. No renderer or running world has been implemented.

### `experience-ui`: the production DOM interface around the world

**Question it answers:** “How does the real website interface participate in the world experience?”

Future responsibilities include the runtime host, interaction prompts, inventory UI, document overlays, contextual menus and focus/input coordination.

It may use `contracts`, the `runtime` facade and `portfolio-content`. Both apps use it, because editor Play must show the same gameplay UI as production.

**Example:** `[E] Open project` belongs here. Whether the player is near enough to open the project is runtime behavior. The project document's content belongs in `portfolio-content`.

This package must not contain editor controls or assume a particular Next.js route. The app supplies navigation and content-loading integration.

The initial website entry control can stay in `apps/portfolio`, so merely displaying “Enter world” does not load the entire experience UI.

### `portfolio-content`: the portfolio information and reusable presentation

**Question it answers:** “What is the visitor reading, regardless of how they found it?”

This is where shared project identity, case-study content and reusable document presentation should grow. The website owns routes; the world references content using stable IDs.

It may depend on `contracts`. Both apps and `experience-ui` may use it. Required content can reach visitors, but opening one document should not load every document.

**Example:** the body of a case study should be reusable by a direct website page and a world document overlay.

Do not put world movement, discovery rules, editor tools or app-specific routing here. When server content processing and browser presentation are added, give them explicit entry points instead of one import that pulls both environments together.

### `diagnostics`: tools for understanding cost and behavior

**Question it answers:** “What happened, what did it cost, and did it clean up?”

Future responsibilities include timing reports, benchmark comparisons, resource-count inspection, stress scenarios and profiling panels.

It depends on `contracts`. The editor and development verification tools may consume it. Production packages may not.

**Example:** runtime records a small loading-stage measurement through an observation hook. Diagnostics turns samples into a timeline. Runtime never imports the timeline tool.

Runtime remains responsible for releasing resources; diagnostics observes whether that happened. Diagnostics must not become a required part of normal operation.

## 5. Why sharing production code does not ship the editor

Arrows below mean “imports code from”. They do not mean all code is eagerly downloaded.

```text
apps/portfolio
  → portfolio-content
  → experience-ui
      → runtime
      → portfolio-content
  → contracts

apps/editor
  → world-authoring
  → diagnostics
  → experience-ui
      → the SAME runtime
  → runtime facade
  → portfolio-content
  → contracts

apps/editor server / build tools
  → world-build
      → world-authoring/schema
      → world-authoring/validation
      → contracts
```

The other packages use `contracts` where allowed. No arrow points from production into editor functionality.

There are two different protections:

1. **Dependency isolation:** editor/compiler code is absent from the portfolio build.
2. **Lazy loading:** legitimate production 3D code is deferred until needed.

Hiding a panel with a production flag does not provide the first protection. Moving code to a separate package does not automatically provide the second.

## 6. How the website and world talk

The future experience host creates one runtime and keeps its handle. Communication is in memory in the same public page; no network request is needed merely to open a world document.

| Interface | Meaning                                        | Example                                         |
| --------- | ---------------------------------------------- | ----------------------------------------------- |
| Command   | Ask for a supported action                     | Activate the folder                             |
| Result    | Report whether the request completed or failed | Travel rejected because the exit is unavailable |
| Event     | Notify the UI about an occurrence              | Document requested                              |
| Snapshot  | Describe current UI-relevant state             | Active map and interaction prompt               |
| Lifecycle | Control the experience's lifetime              | Prepare, start, pause, dispose                  |

For a folder interaction:

```text
World input activates the folder
→ runtime checks the interaction and animates it
→ runtime emits a document ID
→ experience-ui opens DOM content
→ portfolio-content provides the document
→ the app handles any route change
```

For a DOM action:

```text
Visitor chooses a destination in the menu
→ experience-ui sends a travel command
→ runtime validates and performs the transition
→ snapshot/event updates the menu
```

React does not receive every character position or shader uniform every frame. Those stay inside runtime. UI observes semantic changes and sends intent.

Website routing and DOM focus belong to the website/host. Gameplay state belongs to runtime. Do not create competing writable copies of inventory or active-map state in a website store.

## 7. How editor panels and the edit viewport talk

`EditorSession` coordinates editing. The source document is authoritative; the Three.js scene is its visual representation.

```text
Change position in inspector
→ editing command
→ source document changes
→ viewport updates
→ undo history records the change
```

The reverse direction uses the same path:

```text
Drag an object in the viewport
→ viewport reports editing intent
→ source document changes
→ inspector updates
```

A drag may have immediate visual feedback, but the completed drag should become one useful undo operation rather than hundreds of separate steps.

Editor-specific viewport helpers belong inside editor adapters. No `runtime/rendering` entry is currently exported. If edit rendering needs additional shared production primitives, define and review a narrow interface first; do not start importing runtime internals.

## 8. Edit and Play are different lifetimes

Edit Mode changes source data. Play runs prepared production data.

The planned flow is:

```text
Press Play
→ snapshot the current source revision
→ validate and compile that revision
→ release the editing viewport's GPU resources
→ start a fresh iframe containing the real experience host
→ run the real runtime and gameplay DOM UI
→ observe diagnostics from outside
```

The outer editor receives a `PlaySession`. Its `world` exposes exactly the production `WorldRuntime` interface through a message proxy, not extra editor mutation commands.

Pressing Stop must await cleanup before removing the iframe. Otherwise iframe destruction could hide resource-management bugs. Returning to Edit Mode restores the source document, not whatever objects happened to remain in the simulated world.

The iframe adds separation for DOM, focus and browser-global state. It does not isolate GPU cost from the surrounding editor. Use standalone production runs for authoritative performance measurements.

## 9. Where files and data belong

| Location          | What belongs there                                | What does not                                                 |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| `worlds/`         | Editable production world documents               | Generated meshes or prototype maps copied as a starting point |
| `assets/source/`  | Original approved model/texture/animation sources | Extracted game assets or unapproved references                |
| `assets/catalog/` | Asset IDs, provenance and processing settings     | Loaded GPU objects                                            |
| `artifacts/`      | Generated maps, processed assets and reports      | Hand-edited source of truth                                   |
| `tools/config/`   | Shared build/test configuration                   | Gameplay behavior                                             |
| `tools/checks/`   | Repository verification scripts                   | Runtime systems needed by visitors                            |
| `reference/`      | Historical applications and experiments           | Anything imported into active code                            |

Production input roots are explicitly listed in `tools/config/production-inputs.json`. Reference applications are excluded from workspace membership and normal tooling. They can be read for ideas; their implementation must be independently rebuilt.

## 10. Static maps and destructible maps do not need identical output

A static garden can be compiled into ready-to-load meshes, instance placement and collision data. Visitors should not run the terrain authoring algorithm to see it.

A destructible cave needs additional chunk data and runtime modification behavior. Only maps requiring that capability should load it.

One editor can present a coherent workflow while producing different outputs. We have not chosen final terrain storage or meshing algorithms yet.

If a proven meshing algorithm later needs to run both offline and in a browser, it may justify a small shared pure package. Never reuse compiler code by importing `world-build` into `runtime`.

## 11. Where common future features go

Most features cross several boundaries. Do not put an entire feature into one package merely because it has one name.

| Feature                           | Correct division                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a case study                  | Shared content in `portfolio-content`; route in portfolio app; world link stored as source data                                             |
| Clickable project folder          | Behavior/animation in runtime; prompt/overlay in experience-ui; placement/configuration in authoring/editor                                 |
| Tree wind                         | Original asset in assets; authored settings in world-authoring; live behavior/material implementation in runtime; editor controls in editor |
| Terrain brush                     | Button/gesture handling in editor; edit rules in world-authoring; production preparation in world-build                                     |
| Map exit                          | Source connection in authoring; link validation/preparation in build; transition in runtime; transition UI in experience-ui                 |
| Loading timeline                  | Small runtime observation points; aggregation/display in diagnostics                                                                        |
| Spawn 500 rocks for a stress test | Development scenario in diagnostics/editor; exercise real production object/rendering behavior                                              |
| Change website navigation         | Portfolio app; no runtime changes unless it requests a world action                                                                         |
| Save an edited document           | Editor persistence adapter; source format in world-authoring                                                                                |

These are placement examples, not features already implemented.

## 12. Resource ownership is part of the architecture

Every allocation needs an owner and a release point.

- Experience host owns the runtime handle and UI subscriptions.
- Runtime owns its renderer, scheduler, worker pool and bounded resource cache.
- A map session owns its scene, actors, map jobs, listeners and resource leases.
- EditorSession owns editing tools, the edit viewport and Play coordination.
- Diagnostics owns its observation subscriptions and report buffers.

A shared texture can have several users, but its cache owns the allocation. Map users release leases; the cache disposes it when its policy permits. An individual object must not dispose a texture another object still uses.

Changing maps stops old work and releases map resources. Restarting runtime also releases renderer/session resources. Late loader or worker results must not resurrect a disposed map.

## 13. How the boundaries are checked

The most useful entry points are:

- [Import policy](../tools/checks/policy.mjs): allowed package dependencies and special restrictions.
- [Source checker](../tools/checks/boundaries.mjs): checks imports, exports, membership and input roots.
- [Negative tests](../tools/checks/boundaries.test.mjs): prove forbidden paths fail.
- [Dependency-cruiser configuration](../.dependency-cruiser.cjs): source cycles and additional graph checks.
- [Artifact checker](../tools/checks/artifacts.mjs): verifies built application traces.

Package `exports` define the public import paths. Use those paths instead of `../../another-package/src/...`. Type-only imports are also checked: architectural coupling still matters even when a type erases at runtime.

The guards prevent accidental coupling. They are not a security sandbox. New bundler aliases, loaders, server routes or exported interfaces require deliberate review and tests.

## 14. How to add the next piece of functionality

1. Describe the behavior in user terms.
2. Decide who owns its state and resources.
3. Identify the existing package responsible for each part.
4. Decide whether the public interface needs a new command, event or data field.
5. Add focused tests for the agreed observable behavior.
6. Implement behind that interface; keep rendering internals out of UI.
7. Run boundary checks early, then the full verification workflow.
8. Measure browser/rendering cost when the feature introduces actual runtime work.

Useful commands from the repository root:

```sh
pnpm check:boundaries
pnpm test
pnpm typecheck
pnpm verify
```

Use the pinned pnpm version described in the root README. `pnpm verify` includes required type checking: some facade tests are compile-time assertions and are not a replacement for behavioral runtime tests.

Do not create another workspace package merely because a folder is growing. First use well-defined internal modules. A new package is justified when it needs a genuinely separate allowed-dependency set, execution environment, consumer interface or build lifecycle.

## 15. What exists today, and what remains planned

**Exists:** two DOM application shells, package exports, facade declarations, a minimal source-envelope validator, tooling, boundary checks, tests and architecture records.

**Planned:** executable runtime/editor sessions, lazy 3D startup, DOM/world bridge, iframe Play, actual map compilation, production assets, resource telemetry and world systems.

**Undecided:** imperative Three.js versus R3F-managed Three.js, terrain representation and detailed rendering techniques. These need small measured experiments.

The next implementation should prove a tiny end-to-end interaction and lifecycle through these boundaries. It should not begin by building a large terrain engine. See [the first vertical slice](first-vertical-slice.md).

## Three.js runtime ownership clarification

P02 is the **Three.js runtime ownership experiment**: imperative Three.js versus R3F-managed Three.js. R3F manages Three.js objects and lifecycle through React reconciliation; Three.js is the underlying 3D library in both solutions. This compares ownership/integration models, not engines. Select one production model from equivalent measurements and record the evidence in an ADR; do not maintain both.

The foundation restriction against React imports in `packages/runtime` remains unchanged. If the R3F-managed model wins, review and update the boundary and dependency rules deliberately in the ADR before production adoption, without bypassing them during P02. See [ADR 0004](decisions/0004-renderer-experiment.md) for the comparison criteria and ownership responsibilities.
