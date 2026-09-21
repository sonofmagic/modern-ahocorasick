# Repository development

- Use pnpm 12.5.1 and Node.js 22.22.1+, 24.11+, or 26+ (matching the root engines range). The root is private; the only publishable package is `packages/modern-ahocorasick`.
- Keep repository tooling options in `repoctl.config.ts` and use the `repoctl/tooling` entrypoints.
- Preserve the default constructor export, direct CommonJS `require()` contract, existing dist paths, and exact grapheme-cluster matching. Match ranges use original-text UTF-16 offsets with an exclusive end.
- Validate changes with `pnpm exec repo doctor --strict`, `pnpm exec repo check --full`, `pnpm tsd`, and `pnpm test:package` after building.
- Do not expose automaton tables or allow returned matches to mutate matcher state. Keep CommonJS constructor and named type imports covered by the packed-consumer test.
- Run `pnpm benchmark` for scanner or automaton changes; report speed and retained-heap tradeoffs rather than assuming an improvement.
- Add pnpm change intents for publishable changes. Release automatically prepares a version PR on main pushes; npm publication requires explicit user authorization.
- Preserve automatic version PR preparation and manual-only npm publication during repoctl upgrades.

- `apps/docs` is a private bilingual VitePress app. Keep English and Chinese pages aligned; v3 ranges are UTF-16 while the visualizer's grouped display uses zero-based grapheme end indices.
- The docs adapter imports `src/internal.ts` from the library source. Do not copy the builder or expose it in npm; declaration packaging removes its private declaration. Verify packed files after changing this integration.
- Run `pnpm test:docs:e2e` for workbench or documentation changes. Keep one cancellable player timeout, cancel on input/reset/unmount, and preserve blocked-storage behavior.

- Keep TypeScript on 6.x until repoctl, typescript-eslint and vue-tsc support the TypeScript 7 compiler API. VitePress 2 is currently pinned to an exact prerelease; run docs E2E when updating it.

- The workbench's Worker owns dictionary/trace caching. Keep input edits cancellable and all browser inputs bounded; graph layout is capped and tables/results are paginated. Never silently truncate matches. The lab uses the public API; trace parity belongs in tests.
- Keep share/import format versioned and validated, preserve original text, and recompute imported results. Only explicit user actions create share links; render input as text, never HTML or executable replacement code.

- Documentation production is https://aho.icebreaker.top on Workers Static Assets. Keep deploy-docs gated on all CI checks and main, serialize deployments and skip stale commits. Cloudflare credentials stay scoped to the deploy step. Keep npm publication manual. Validate clean URLs, 404, deployed SHA and the browser workbench after deployment.
