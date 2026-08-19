# 3D Portfolio

This repository contains two isolated applications:

- `new-portfolio/`: the active clean implementation.
- `portfolio-prototype/`: the preserved working prototype and behavioral reference.

Shared agent configuration and project documentation live at the repository root. Each application owns its dependencies, lockfile, build output, and application configuration.

## Development

```powershell
pnpm --dir new-portfolio dev
pnpm --dir portfolio-prototype dev -- --port 3001
```
