import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import AhoCorasick from '@/index'
import manifest from './fixtures/unicode/manifest.json'
import { contractCases, verifyCases } from './helpers/reference'

it('agrees with the native reference at ASCII/Unicode boundaries and on randomized inputs', () => {
  expect(verifyCases(AhoCorasick, contractCases())).toBe(1078)
})

it('preserves every ASCII boundary, including controls, before Unicode joins', () => {
  const cases = []
  for (let code = 0; code < 128; code++) {
    const character = String.fromCharCode(code)
    for (const suffix of ['\u0301', '\u200D', '\uFE0F', '\u0600a', '🇨🇳', '\r\n', '\uD800', '猫']) {
      cases.push({ patterns: [character, suffix, character + suffix, '\r', '\n', '\r\n'], text: `ascii prefix ${character}${suffix}xyz` })
    }
  }
  expect(verifyCases(AhoCorasick, cases)).toBe(1024)
})

it('builds mixed dictionaries with short and long ASCII prefixes consistently', () => {
  const cases = []
  for (const prefix of ['a', 'a'.repeat(7), 'a'.repeat(8), 'a'.repeat(9), 'abc'.repeat(32)]) {
    for (const suffix of ['\u0301猫', '👨‍👩‍👧‍👦', '\r\n猫', '\u0600a', '🇨🇳']) {
      const word = prefix + suffix
      cases.push({ patterns: [word, prefix, suffix, word], text: `!${word} ${word}` })
    }
  }
  expect(verifyCases(AhoCorasick, cases)).toBe(25)
})

it('conforms to the runtime Unicode grapheme corpus, including original match offsets', () => {
  const version = `${process.versions['unicode']}.0`
  if (!(version in manifest)) {
    throw new Error(`Add the official GraphemeBreakTest fixture for Unicode ${version}`)
  }
  const fixture = readFileSync(new URL(`./fixtures/unicode/${version}.txt`, import.meta.url), 'utf8')
  expect(createHash('sha256').update(fixture).digest('hex')).toBe(manifest[version as keyof typeof manifest].sha256)
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  let tested = 0
  for (const line of fixture.split('\n')) {
    const body = line.split('#')[0].trim()
    if (!body) {
      continue
    }
    let text = ''
    const boundaries: number[] = []
    for (const token of body.split(/\s+/)) {
      if (token === '÷') {
        boundaries.push(text.length)
      }
      else if (token !== '×') {
        text += String.fromCodePoint(Number.parseInt(token, 16))
      }
    }
    expect([...segmenter.segment(text)].map(item => item.index).concat(text.length), line).toEqual(boundaries)
    const clusters = boundaries.slice(0, -1).map((start, i) => text.slice(start, boundaries[i + 1]))
    const patterns = [...clusters, ...Array.from(text), text]
    // Prefixes exercise fast scanning and fallback; expectations always use
    // the native reference because a prefix can change the first boundary.
    verifyCases(AhoCorasick, ['', 'a', 'xyz\r\n', 'ascii prefix xyz\r\n'].map(prefix => ({ patterns, text: prefix + text })))
    const ac = new AhoCorasick(patterns)
    const stream = ac.createStream()
    const hits = Array.from({ length: text.length }, (_, index) => text.slice(index, index + 1)).flatMap(chunk => stream.write(chunk))
    hits.push(...stream.finish())
    expect(hits, line).toEqual(ac.search(text))
    tested++
  }
  expect(tested).toBeGreaterThan(500)
})
