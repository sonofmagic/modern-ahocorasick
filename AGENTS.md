# Repository development

- Use pnpm 12.4.2 and Node.js >=22.13. The root is private; the only publishable package is `packages/modern-ahocorasick`.
- Keep repository tooling options in `repoctl.config.ts` and use the `repoctl/tooling` entrypoints.
- Preserve the default constructor export, direct CommonJS `require()` contract, existing dist paths, and exact grapheme-cluster matching. Match ranges use original-text UTF-16 offsets with an exclusive end.
- Validate changes with `pnpm exec repo doctor --strict`, `pnpm exec repo check --full`, `pnpm tsd`, and `pnpm test:package` after building.
- Do not expose automaton tables or allow returned matches to mutate matcher state. Keep CommonJS constructor and named type imports covered by the packed-consumer test.
- Run `pnpm benchmark` for scanner or automaton changes; report speed and retained-heap tradeoffs rather than assuming an improvement.
- Add pnpm change intents for publishable changes. Do not publish or trigger Release without explicit user authorization.
- The Release workflow is intentionally manual-only. Preserve this policy during repoctl upgrades.
