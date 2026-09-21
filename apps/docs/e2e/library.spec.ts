import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { expect, test } from '@playwright/test'

const library = readFileSync(new URL('../../../packages/modern-ahocorasick/dist/index.js', import.meta.url), 'utf8')
const textLibrary = readFileSync(new URL('../../../packages/modern-ahocorasick/dist/text.js', import.meta.url), 'utf8')
const reference = stripTypeScriptTypes(readFileSync(new URL('../../../packages/modern-ahocorasick/test/helpers/reference.ts', import.meta.url), 'utf8'))

test('built library preserves Unicode contracts in the browser engine', async ({ page }, testInfo) => {
  // Serve the actual built ESM and the independent native oracle without
  // shipping test code or an internal entrypoint in the production site.
  await page.route('**/__library.js', route => route.fulfill({ contentType: 'text/javascript', body: library }))
  await page.route('**/__reference.js', route => route.fulfill({ contentType: 'text/javascript', body: reference }))
  await page.route('**/__text-library.js', route => route.fulfill({ contentType: 'text/javascript', body: textLibrary }))
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const libraryURL = '/__library.js'
    const referenceURL = '/__reference.js'
    const [{ default: Constructor }, { verifyCases, contractCases }] = await Promise.all([import(libraryURL), import(referenceURL)])
    const textURL = '/__text-library.js'
    const { default: TextMatcher } = await import(textURL)
    const patterns = ['a', 'aa', 'a', 'e\u0301', '👩‍😀', '\r\n', 'cat', 'cat\ndog', 'dog']
    const text = 'aa e\u0301 👩‍😀\r\ncat\ndog!'
    const matcher = new Constructor(patterns)
    const restored = Constructor.deserialize(matcher.serialize())
    const equal = (actual: unknown, expected: unknown) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error('Enhanced API browser parity failed')
      }
    }
    equal(restored.search(text), matcher.search(text))
    equal(restored.countByPattern(text), patterns.map((_, i) => matcher.search(text).filter((hit: { patternIndex: number }) => hit.patternIndex === i).length))
    for (const strategy of ['all', 'leftmost-first', 'leftmost-longest']) {
      for (const wholeWord of [false, true]) {
        const options = { strategy, wholeWord, locale: 'en' }
        const expected = matcher.search(text, options)
        for (let split = 0; split <= text.length; split++) {
          const stream = restored.createStream(options)
          equal([...stream.write(text.slice(0, split)), ...stream.write(text.slice(split)), ...stream.finish()], expected)
        }
      }
    }
    const normalized = new TextMatcher(['STRASSE', 'é'], { caseFold: true, normalization: 'NFC' })
    equal(normalized.replace('Straße e\u0301', 'X'), 'X X')
    equal(new TextMatcher(['s', 'ss'], { caseFold: true }).countByPattern('ß'), [0, 1])
    return { cases: verifyCases(Constructor, contractCases()), userAgent: navigator.userAgent }
  })
  expect(result.cases).toBe(1078)
  await testInfo.attach('runtime', { body: JSON.stringify(result), contentType: 'application/json' })
})
