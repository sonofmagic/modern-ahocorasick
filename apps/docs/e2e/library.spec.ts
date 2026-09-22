import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { expect, test } from '@playwright/test'

const reference = stripTypeScriptTypes(readFileSync(new URL('../../../packages/modern-ahocorasick/test/helpers/reference.ts', import.meta.url), 'utf8'))

test.beforeEach(async ({ page }) => {
  await page.route('**/__package/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice('/__package/'.length)
    if (!/^[\w./-]+\.js$/.test(path) || path.includes('..')) {
      return route.abort()
    }
    const body = readFileSync(new URL(`../../../packages/modern-ahocorasick/dist/${path}`, import.meta.url), 'utf8')
    return route.fulfill({ contentType: 'text/javascript', body })
  })
})

test('built library preserves Unicode contracts in the browser engine', async ({ page }, testInfo) => {
  // Serve the actual built ESM and the independent native oracle without
  // shipping test code or an internal entrypoint in the production site.
  await page.route('**/__reference.js', route => route.fulfill({ contentType: 'text/javascript', body: reference }))
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const libraryURL = '/__package/index.js'
    const referenceURL = '/__reference.js'
    const [{ default: Constructor }, { verifyCases, contractCases }] = await Promise.all([import(libraryURL), import(referenceURL)])
    const textURL = '/__package/text.js'
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

test('optional entries preserve folding and chunked replacement in the browser', async ({ page }) => {
  await page.goto('/extensions')
  const result = await page.evaluate(async () => {
    const entry = (name: string) => import(`/__package/${name}.js`)
    const [{ default: Unicode }, { default: Fast }, stream, filters, web] = await Promise.all(['unicode', 'fast', 'stream', 'stream/filters', 'stream/web'].map(entry))
    const matcher = new Unicode(['STRASSE', 'ss', 's'])
    const chunks = '😀Straße ss'.split('')
    const folded = [...stream.replaceChunks(matcher, chunks, 'X')].join('')
    const filtered = [...stream.replaceChunks(new Fast(['cat']), 'cat `cat` https://cat cat'.split(''), 'X', { filter: filters.protectedText({ urls: true, markdown: true }) })].join('')
    const input = new ReadableStream<string>({ start(controller) {
      controller.enqueue('Stra')
      controller.enqueue('ße')
      controller.close()
    } })
    const reader = input.pipeThrough<string>(web.createReplaceTransform(matcher, async () => 'X')).getReader()
    let transformed = ''
    while (true) {
      const next = await reader.read()
      if (next.done) {
        break
      }
      transformed += next.value
    }
    return { folded, filtered, transformed, halfExpansion: new Unicode(['s']).match('ß') }
  })
  expect(result).toEqual({ folded: '😀X X', filtered: 'X `cat` https://cat X', transformed: 'X', halfExpansion: false })
  await page.goto('/zh/extensions')
  await expect(page.getByRole('heading', { name: /^扩展能力概览/, level: 1 })).toBeVisible()
})

for (const prefix of ['', 'zh/']) {
  test(`documented ${prefix || 'en'} highlighting renders HTML-looking input as text`, async ({ page }) => {
    const markdown = readFileSync(new URL(`../${prefix}examples/highlighting.md`, import.meta.url), 'utf8')
    const source = [...markdown.matchAll(/```ts\n([\s\S]*?)\n```/g)][0][1]
      .replace('from \'modern-ahocorasick\'', 'from \'/__package/index.js\'')
    await page.route('**/__highlight.js', route => route.fulfill({
      contentType: 'text/javascript',
      body: stripTypeScriptTypes(source),
    }))
    await page.goto('/')
    await page.evaluate(async () => {
      const exampleURL = '/__highlight.js'
      await import(exampleURL)
    })
    await expect(page.locator('body > p')).toHaveText('<img> a cat!')
    await expect(page.locator('body > p mark')).toHaveText('cat')
    await expect(page.locator('body > p img')).toHaveCount(0)
  })
}
