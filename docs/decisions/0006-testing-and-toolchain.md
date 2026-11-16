# ADR 0006: Verified foundation and compatible tooling

Status: Accepted

Use Node 24.18.x, pnpm 10.34.5, Next.js 16.3.4 and React 19.2.8. Dependency versions are pinned and the root lockfile is authoritative. TypeScript 5.9.3 is chosen within the supported typescript-eslint peer range; latest TypeScript 7 was outside it. ESLint 9.39.5 is the compatible maintenance release because current Next plugins reject ESLint 10. Keep strict peer checks; do not suppress incompatibilities.

Libraries compile independently with tsc and explicit dist exports. Turbo orders dependency builds and caches outputs. Next apps build independently using filtered dependency closures. Root tooling is not another workspace package.

Verification defaults to at most two concurrent Turbo tasks, production builds run one task at a time, and each Next build uses two workers. Initial unrestricted parallel verification exhausted process memory on the development host. Persistent dev/watch commands explicitly allow enough task slots for the selected dependency closure; do not run multiple full verification groups in parallel.

Vitest required tasks reject empty suites. Every member has contract or behavior tests. Type assertions are checked by required TypeScript tasks as well as executed test files. Root architecture tests include negative rules. Browser performance/Play/leak tests belong to the next slice, when a runtime exists; no passing placeholder tasks stand in for them.

TDD focuses on public behavior, contracts, cancellation, ownership and authoring operations. Visual rendering and terrain choices require measured visual experiments, not private implementation snapshots.
