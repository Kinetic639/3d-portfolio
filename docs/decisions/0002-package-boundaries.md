# ADR 0002: One-way package dependencies

Status: Accepted

Use two apps and seven packages as described in ../architecture.md. Enforce allowed direct edges; because every edge is checked and cycles are rejected, production cannot transitively reach development packages.

world-authoring has no root export. world-build may import only its /schema and /validation entry points. Those entry points cannot import editor commands, history or transactions, even indirectly through new helper modules without review.

runtime has a facade-only root export. No deep imports or app-to-app imports. React and Next.js do not belong in runtime, contracts, authoring or compilation. The editor compiler adapter belongs only under apps/editor/src/server.

Do not rely on tree shaking, NODE_ENV or devDependencies classification for isolation. Verify source graphs and emitted outputs.
