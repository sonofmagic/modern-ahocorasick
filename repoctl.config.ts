import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    create: { defaultTemplate: 'tsdown' },
    upgrade: { skipOverwrite: true },
  },
  tooling: {
    eslint: { ignores: ['**/dist/**', '**/coverage/**', '**/.turbo/**'] },
    vitest: {
      includeWorkspaceRootConfig: false,
      coverageExclude: ['**/dist/**', '**/test-d/**'],
      overrides: { test: { coverage: { include: ['packages/*/src/**/*.ts'] } } },
    },
    vitestProject: { globals: true, testTimeout: 60_000 },
  },
})
