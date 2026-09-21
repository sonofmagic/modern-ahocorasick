import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    create: { defaultTemplate: 'tsdown' },
    upgrade: { skipOverwrite: true },
  },
  tooling: {
    eslint: { vue: true, ignores: ['**/dist/**', '**/coverage/**', '**/.turbo/**', '**/.wrangler/**', '**/.vitepress/cache/**', '**/test-results/**', '**/playwright-report/**'] },
    vitest: {
      includeWorkspaceRootConfig: false,
      coverageExclude: ['**/dist/**', '**/test-d/**'],
      overrides: { test: { coverage: { include: ['packages/*/src/**/*.ts', 'apps/docs/src/{trace,player,storage,integration,experiment,computation}.ts'] } } },
    },
    vitestProject: { globals: true, testTimeout: 60_000 },
  },
})
