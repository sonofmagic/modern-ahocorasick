import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const externalURL = process.env['DOCS_E2E_BASE_URL']
const cloudflare = process.env['DOCS_E2E_CLOUDFLARE'] === '1'
const localURL = cloudflare ? 'http://127.0.0.1:8789' : 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env['CI'] ? 1 : 0,
  workers: 2,
  reporter: 'list',
  use: { baseURL: externalURL ?? localURL, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      testIgnore: '**/library.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'mobile-dark',
      testIgnore: '**/library.spec.ts',
      use: {
        ...devices['Pixel 7'],
        colorScheme: 'dark',
        reducedMotion: 'reduce',
      },
    },
    ...(['chromium', 'firefox', 'webkit'] as const).map(browserName => ({
      name: `library-${browserName}`,
      testMatch: '**/library.spec.ts',
      use: { browserName },
    })),
  ],
  ...(externalURL
    ? {}
    : {
        webServer: {
          command: cloudflare ? 'pnpm preview:cloudflare --port 8789' : 'pnpm preview --port 4173',
          url: localURL,
          reuseExistingServer: false,
        },
      }),
})
