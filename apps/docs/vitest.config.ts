import { defineVitestProjectConfig } from 'repoctl/tooling'
import { defineProject } from 'vitest/config'

export default defineProject(async () => {
  const config = await defineVitestProjectConfig()
  return {
    ...config,
    test: { ...config.test, name: 'docs', include: ['test/**/*.test.ts'] },
  }
})
