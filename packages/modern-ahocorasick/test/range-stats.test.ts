import type { Matcher, MatchStrategy, QueryOptions } from '../src/types'
import Fast from '../src/fast'
import AhoCorasick from '../src/index'
import { createMatchStream, createMatchStreamAsync, createReplaceStream, createTokenStream, iterateChunks, iterateChunksAsync } from '../src/stream'
import { createMatchTransform as nodeTransform } from '../src/stream/node'
import { createMatchTransform as webTransform } from '../src/stream/web'
import TextMatcher from '../src/text'
import Unicode from '../src/unicode'
import UnicodeFast from '../src/unicode-fast'

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const constructors = [AhoCorasick, Fast, Unicode, UnicodeFast, TextMatcher]
const strategies: MatchStrategy[] = ['all', 'leftmost-first', 'leftmost-longest', 'longest-first']

it('validates ranges immediately for every whole-text operation, including empty dictionaries', () => {
  for (const Constructor of constructors) {
    for (const patterns of [[], ['a']]) {
      const matcher = new Constructor(patterns)
      const queries = [
        (text: string, options: QueryOptions) => matcher.search(text, options),
        (text: string, options: QueryOptions) => matcher.iterate(text, options),
        (text: string, options: QueryOptions) => matcher.count(text, options),
        (text: string, options: QueryOptions) => matcher.countByPattern(text, options),
        (text: string, options: QueryOptions) => matcher.match(text, options),
        (text: string, options: QueryOptions) => matcher.replace(text, '', options),
        (text: string, options: QueryOptions) => matcher.tokenize(text, options),
      ]
      for (const query of queries) {
        for (const options of [{ start: -1 }, { end: 4 }, { start: 2, end: 1 }, { start: 0.5 }, { end: Number.NaN }, { start: Infinity }, { end: null }]) {
          expect(() => query('abc', options as QueryOptions)).toThrow(RangeError)
        }
        expect(() => query('abc', { anchored: 1 } as unknown as QueryOptions)).toThrow(TypeError)
        for (const text of ['😀', 'e\u0301', '👨‍👩‍👧‍👦', '🇨🇳', '\r\n']) {
          for (let offset = 1; offset < text.length; offset++) {
            expect(() => query(text, { start: offset })).toThrow(RangeError)
            expect(() => query(text, { end: offset })).toThrow(RangeError)
          }
        }
      }
      expect(matcher.search('', { start: 0, end: 0, anchored: true })).toEqual([])
      expect(matcher.search('abc', { start: 1, end: 1 })).toEqual([])
      expect(matcher.replace('abc', '!', { start: 3, end: 3 })).toBe('abc')
    }
  }
})

it('filters before overlap selection and keeps full-input boundary context', () => {
  for (const Constructor of constructors) {
    const matcher = new Constructor(['abc', 'bc', 'b', 'bc'])
    for (const strategy of strategies) {
      const expected = strategy === 'all' ? ['b', 'bc', 'bc'] : ['bc']
      expect(matcher.search('abc', { start: 1, anchored: true, strategy }).map(hit => hit.pattern)).toEqual(expected)
    }
    expect(matcher.replace('!abc!', '#', { start: 2, end: 4 })).toBe('!a#!')
    expect(matcher.tokenize('!abc!', { start: 2, end: 4 }).map(token => token.text).join('')).toBe('!abc!')
    expect(new Constructor(['cat']).search('scat!', { start: 1, end: 4, wholeWord: true })).toEqual([])
  }
  for (const Constructor of [AhoCorasick, Fast, Unicode, UnicodeFast]) {
    expect(new Constructor(['cat'], { boundary: 'ascii' }).search('scat!', { start: 1, end: 4 })).toEqual([])
    expect(new Constructor(['cat'], { boundary: 'ascii' }).search('!cats', { start: 1, end: 4 })).toEqual([])
  }
  for (const matcher of [new Unicode(['ss', 's']), new UnicodeFast(['ss', 's']), new TextMatcher(['ss', 's'], { caseFold: true })]) {
    expect(matcher.search('xßs', { start: 1, end: 2, anchored: true })).toEqual([{ pattern: 'ss', patternIndex: 0, data: undefined, start: 1, end: 2 }])
    expect(matcher.replace('xßs', (_hit, original) => `[${original}]`, { start: 1, end: 2 })).toBe('x[ß]s')
  }
  expect(new TextMatcher(['é'], { normalization: 'NFC' }).search('xe\u0301é', { start: 1, end: 3 })).toEqual([{ pattern: 'é', patternIndex: 0, data: undefined, start: 1, end: 3 }])
})

it('compares ranges, anchoring and all selections with an independent substring oracle', () => {
  let seed = 513927
  const random = (n: number) => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n)
  const alphabet = ['a', 'b', 's', 'ß', 'S', 'e\u0301', 'é', '😀', '🇨🇳', '\r\n', ' ']
  const word = (n: number) => Array.from({ length: n }, () => alphabet[random(alphabet.length)]).join('')
  const fold = (text: string) => text.replaceAll('ß', 'ss').replaceAll('S', 's')
  for (let trial = 0; trial < 70; trial++) {
    const text = word(8)
    const segments = [...segmenter.segment(text)]
    const offsets = [...segments.map(part => part.index), text.length]
    const patterns = [segments[random(segments.length)].segment, word(1), word(2), word(3)]
    patterns.push(patterns[0])
    const a = random(offsets.length)
    const b = a + random(offsets.length - a)
    const options = { start: offsets[a], end: offsets[b], anchored: trial % 2 === 0 }
    const variants: [Matcher, (text: string) => string][] = [
      [new AhoCorasick(patterns), text => text],
      [new Fast(patterns), text => text],
      [new Unicode(patterns), fold],
      [new UnicodeFast(patterns), fold],
      [new TextMatcher(patterns, { caseFold: true, normalization: 'NFC' }), text => fold(text).normalize('NFC')],
    ]
    for (const [matcher, transform] of variants) {
      const hits: { pattern: string, patternIndex: number, start: number, end: number, data: undefined, length: number }[] = []
      for (let from = a; from < b; from++) {
        if (options.anchored && from !== a) {
          continue
        }
        for (let to = from + 1; to <= b; to++) {
          for (const [patternIndex, pattern] of patterns.entries()) {
            if (transform(pattern) === transform(text.slice(offsets[from], offsets[to]))) {
              hits.push({ pattern, patternIndex, start: offsets[from], end: offsets[to], data: undefined, length: to - from })
            }
          }
        }
      }
      const strip = ({ length: _length, ...hit }: typeof hits[number]) => hit
      const all = [...hits].sort((a, b) => a.end - b.end || b.length - a.length || a.patternIndex - b.patternIndex).map(strip)
      expect(matcher.search(text, options)).toEqual(all)
      expect([...matcher.iterate(text, options)]).toEqual(all)
      expect(matcher.count(text, options)).toBe(all.length)
      expect(matcher.match(text, options)).toBe(all.length > 0)
      expect(matcher.countByPattern(text, options)).toEqual(patterns.map((_, index) => all.filter(hit => hit.patternIndex === index).length))
      for (const strategy of strategies.slice(1) as Exclude<MatchStrategy, 'all'>[]) {
        const ordered = [...hits].sort((a, b) => strategy === 'longest-first'
          ? b.length - a.length || a.start - b.start || a.patternIndex - b.patternIndex
          : a.start - b.start || (strategy === 'leftmost-longest' ? b.length - a.length : 0) || a.patternIndex - b.patternIndex)
        const selected: typeof hits = []
        for (const hit of ordered) {
          if (!selected.some(other => hit.start < other.end && other.start < hit.end)) {
            selected.push(hit)
          }
        }
        selected.sort((a, b) => a.start - b.start)
        expect(matcher.search(text, { ...options, strategy })).toEqual(selected.map(strip))
        const tokens = matcher.tokenize(text, { ...options, strategy })
        expect(tokens.map(token => token.text).join('')).toBe(text)
        expect(tokens.filter(token => token.type === 'match').map(token => token.match)).toEqual(selected.map(strip))
        let replaced = text
        for (const hit of [...selected].reverse()) {
          replaced = `${replaced.slice(0, hit.start)}#${replaced.slice(hit.end)}`
        }
        expect(matcher.replace(text, '#', { ...options, strategy })).toBe(replaced)
      }
    }
  }
})

it('rejects offline range keys on legacy and new stream entrypoints', () => {
  const matcher = new AhoCorasick(['a'])
  for (const options of [{ start: 0 }, { end: 1 }, { anchored: false }, { start: undefined }]) {
    const invalid = options as never
    for (const create of [
      () => matcher.createStream(invalid),
      () => createMatchStream(matcher, invalid),
      () => createTokenStream(matcher, invalid),
      () => createReplaceStream(matcher, '', invalid),
      () => createMatchStreamAsync(matcher, invalid),
      () => iterateChunks(matcher, ['a'], invalid),
      () => iterateChunksAsync(matcher, ['a'], invalid),
    ]) {
      expect(create).toThrow(TypeError)
    }
  }
})

it('returns cached frozen scalar statistics without leaking tables, including deserialization', () => {
  for (const Constructor of [AhoCorasick, Fast, Unicode, UnicodeFast]) {
    const matcher = new Constructor(['he', 'she', 'he'])
    const stats = matcher.getStats()
    expect(stats).toMatchObject({
      backend: Constructor === Fast || Constructor === UnicodeFast ? 'double-array' : 'compact',
      patternCount: 3,
      stateCount: 6,
      transitionCount: 5,
      alphabetSize: 3,
      maxPatternUnits: 3,
      unit: Constructor === Unicode || Constructor === UnicodeFast ? 'folded-codepoint' : 'grapheme',
    })
    expect(Object.isFrozen(stats)).toBe(true)
    expect(matcher.getStats()).toBe(stats)
    expect(stats.typedArrayBytes).toBeGreaterThan(0)
    expect(Object.values(stats).every(value => typeof value === 'string' || typeof value === 'number')).toBe(true)
    expect(() => Object.assign(stats, { stateCount: 0 })).toThrow(TypeError)
    expect(matcher.search('she')).toHaveLength(3)
  }
  const matcher = new AhoCorasick(['he', 'she', 'he'])
  expect(AhoCorasick.deserialize(matcher.serialize()).getStats()).toEqual(matcher.getStats())
  expect(AhoCorasick.deserialize(new Fast(['he', 'she', 'he']).serialize()).getStats()).toEqual(matcher.getStats())
  expect(new AhoCorasick([]).getStats()).toMatchObject({ stateCount: 1, transitionCount: 0, patternCount: 0, maxPatternUnits: 0, alphabetSize: 0 })
  expect(new AhoCorasick(['ß']).getStats().maxPatternUnits).toBe(1)
  expect(new Unicode(['ß']).getStats().maxPatternUnits).toBe(2)
  expect(new UnicodeFast(['👨‍👩‍👧‍👦']).getStats().maxPatternUnits).toBe(7)
})

it('rejects offline options when platform adapters are consumed and releases their resources', async () => {
  const matcher = new AhoCorasick(['a'])
  const node = nodeTransform(matcher, { start: 0 } as never)
  const readNode = async () => {
    for await (const _ of node) { /* consume until invalid options fail */ }
  }
  await expect(readNode()).rejects.toThrow(TypeError)
  expect(node.destroyed).toBe(true)
  expect(() => webTransform(matcher, { anchored: false } as never)).toThrow(TypeError)
})
