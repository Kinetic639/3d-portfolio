# ADR 0001: Fresh workspace and historical isolation

Status: Accepted

Create the production workspace from scratch at the repository root. Preserve both old apps and old project docs under reference. Do not migrate code, dependencies or assets wholesale.

Use an explicit nine-member pnpm allowlist. Reference apps are excluded from tasks, TS includes, source scanning, production inputs and deployment traces. Root Docker/Vercel exclusions are defense in depth; deployment must use an app's traced output rather than uploading the repository as a website.

The existing Git repository/history is retained. Relocation preserves source, assets and uncommitted work. Reference lockfiles and installed dependencies do not participate in the root workspace.
