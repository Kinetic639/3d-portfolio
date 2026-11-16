---
name: portfolio-change-workflow
description: Implement an approved milestone in the 3d-portfolio rebuild while preserving workspace boundaries and updating verified progress. Use for product changes in this repository.
---

# Portfolio change workflow

Read the relevant phase in `docs/production-roadmap.md`, its status in `docs/progress-tracker.md`, and applicable guidance in `docs/architecture-guide.md` and `docs/decisions/`. These documents are relative to the repository root and remain authoritative; do not duplicate them here.

Before editing, identify the requested outcome, affected workspace members, allowed dependency direction, and observable acceptance criteria. Proceed within the user's scope; a milestone description does not authorize completing unrelated phases.

Keep portfolio DOM usable independently of 3D. UI uses the public WorldRuntime facade; editor UI uses EditorSession. Preserve production/editor isolation and the world-build restriction to authoring schema/validation entry points. Historical projects under reference are behavioral reference only, never import or copy sources/assets into production.

Use test-first development for contracts, lifecycle and domain behavior. Select checks from the root scripts based on the change; run boundary checks for dependency or API changes, affected tests and typechecks for implementation, and build/artifact checks for loading or bundle changes. Browser behavior needs browser evidence; a typecheck is not a playtest.

Update only relevant tracker items after verification. Distinguish installed tooling, declarations, working features, and measured production behavior. Record unresolved decisions and evidence rather than claiming a phase complete from scaffolding alone.
