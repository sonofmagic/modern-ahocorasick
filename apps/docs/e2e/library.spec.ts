import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { expect, test } from '@playwright/test'

const library = readFileSync(new URL('../../../packages/modern-ahocorasick/dist/index.js', import.meta.url), 'utf8')
const reference = stripTypeScriptTypes(readFileSync(new URL('../../../packages/modern-ahocorasick/test/helpers/reference.ts', import.meta.url), 'utf8'))

test('built library preserves Unicode contracts in the browser engine', async ({ page }, testInfo) => {
  // Serve the actual built ESM and the independent native oracle without
  // shipping test code or an internal entrypoint in the production site.
  await page.route('**/__library.js', route => route.fulfill({ contentType: 'text/javascript', body: library }))
  await page.route('**/__reference.js', route => route.fulfill({ contentType: 'text/javascript', body: reference }))
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const libraryURL = '/__library.js'
    const referenceURL = '/__reference.js'
    const [{ default: Constructor }, { verifyCases, contractCases }] = await Promise.all([import(libraryURL), import(referenceURL)])
    return { cases: verifyCases(Constructor, contractCases()), userAgent: navigator.userAgent }
  })
  expect(result.cases).toBe(1078)
  await testInfo.attach('runtime', { body: JSON.stringify(result), contentType: 'application/json' })
})
