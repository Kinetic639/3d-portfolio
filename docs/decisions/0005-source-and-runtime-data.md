# ADR 0005: Compile source worlds into production artifacts

Status: Accepted; terrain formats NEED EXPERIMENT

Editable documents preserve author intent. Compiled worlds minimize visitor computation and load only map-specific dependencies. Source editing history is never required by the compiler or runtime.

Static and destructible maps may use different runtime representations. Dynamic capabilities load only for maps that need them. If a proven browser/offline algorithm must be shared later, extract a small pure kernel; never import world-build into runtime.

Asset processing is original-source-only, versioned and reproducible. Hash relevant source/settings/compiler/dependency inputs. Publish immutable artifacts before the release manifest. Source roots are explicitly allowlisted; reference is never an input.
