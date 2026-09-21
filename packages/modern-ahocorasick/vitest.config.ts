import { fileURLToPath } from 'node:url'
import { defineVitestProjectConfig } from 'repoctl/tooling'
import { defineProject } from 'vitest/config'

export default defineProject(async () => {
  const config = await defineVitestProjectConfig({
    options: { alias: [{ find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) }] },
  })
  return {
    ...config,
    test: { ...config.test, name: 'modern-ahocorasick', include: ['test/**/*.test.ts'] },
  }
})
