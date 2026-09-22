---
title: "Develop the documentation site"
description: "Run the private bilingual VitePress app from the repository workspace."
---

# Develop the documentation site

Run the private bilingual VitePress app from the repository workspace.

## Requirements

Use pnpm 12.5.1 and Node.js matching `^22.22.1 || ^24.11.0 || >=26.0.0`. These are repository tooling requirements, not the library’s minimum browser runtime. Keep TypeScript on 6.x and VitePress at the repository’s exact prerelease.

## Local commands

```sh
pnpm install --frozen-lockfile
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

The development command builds the workspace library first. Preview serves the static output after a build. No backend, account, or deployment configuration is needed.

## Validate changes

```sh
pnpm build
pnpm exec repo doctor --strict
pnpm exec repo check --full
pnpm lint
pnpm typecheck
pnpm test
pnpm tsd
pnpm test:package
pnpm test:docs:e2e
```

Keep English and Chinese pages, examples and navigation aligned. Documentation changes run the browser suite; scanner or automaton changes also need `pnpm benchmark`. Production deployment remains gated on CI and main.
