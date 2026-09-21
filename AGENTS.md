# Repository development

- Use pnpm 12.4.2 and Node.js >=22.13. The root is private; the only publishable package is `packages/modern-ahocorasick`.
- Keep repository tooling options in `repoctl.config.ts` and use the `repoctl/tooling` entrypoints.
- Preserve the default constructor export, direct CommonJS `require()` contract, existing dist paths, and grapheme-cluster match indices.
- Validate changes with `pnpm exec repo doctor --strict`, `pnpm exec repo check --full`, `pnpm tsd`, and `pnpm test:package` after building.
- Add pnpm change intents for publishable changes. Do not publish or trigger Release without explicit user authorization.
- The Release workflow is intentionally manual-only. Preserve this policy during repoctl upgrades.
