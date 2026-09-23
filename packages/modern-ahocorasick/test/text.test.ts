import { readFileSync } from 'node:fs'
import { caseFold } from '../src/case-folding'
import { createMatchStream, replaceChunks, tokenizeChunks } from '../src/stream'
import { protectedText, urls } from '../src/stream/filters'
import TextMatcher from '../src/text'

it('agrees with an independent original-boundary substring oracle', () => {
  const alphabet = ['a', 'A', 'b', 'B', 'ß', 's', 'S', 'é', 'e\u0301', 'ﬁ', 'f', 'i', '😀', '猫', '가', '가']
  let seed = 42
  const next = (max: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % max
  }
  const word = (size: number) => Array.from({ length: size }, () => alphabet[next(alphabet.length)]).join('')
  const convert = (text: string) => text.normalize('NFKC').replace(/[A-Z]/g, value => value.toLowerCase()).replaceAll('ß', 'ss')
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (let trial = 0; trial < 200; trial++) {
    const patterns = Array.from({ length: 8 }, () => word(1 + next(3)))
    const text = word(20) + patterns.slice(0, 2).join('')
    const boundaries = [...segmenter.segment(text)].map(part => part.index).concat(text.length)
    const expected = []
    for (const start of boundaries) {
      for (const end of boundaries) {
        if (end <= start) {
          continue
        }
        for (const [patternIndex, pattern] of patterns.entries()) {
          if (convert(text.slice(start, end)) === convert(pattern)) {
            expected.push({ pattern, patternIndex, start, end, data: undefined })
          }
        }
      }
    }
    expected.sort((a, b) => a.end - b.end || a.start - b.start || a.patternIndex - b.patternIndex)
    const matcher = new TextMatcher(patterns, { normalization: 'NFKC', caseFold: true })
    expect(matcher.search(text), `trial ${trial}`).toEqual(expected)
    for (const strategy of ['leftmost-first', 'leftmost-longest'] as const) {
      const sorted = [...expected].sort((a, b) => a.start - b.start || (strategy === 'leftmost-longest' ? b.end - a.end : 0) || a.patternIndex - b.patternIndex)
      let end = 0
      const selected = sorted.filter((hit) => {
        if (hit.start < end) {
          return false
        }
        end = hit.end
        return true
      })
      expect(matcher.search(text, { strategy })).toEqual(selected)
    }
  }
})

it('conforms to the pinned Unicode 17 full and Turkic case-folding mappings', () => {
  const source = readFileSync(new URL('./fixtures/CaseFolding-17.0.0.txt', import.meta.url), 'utf8')
  let checked = 0
  for (const line of source.split('\n')) {
    const [code, status, mapping] = line.split('#')[0].split(';').map(part => part.trim())
    if (status === 'C' || status === 'F' || status === 'T') {
      const input = String.fromCodePoint(Number.parseInt(code, 16))
      const expected = String.fromCodePoint(...mapping.split(' ').map(value => Number.parseInt(value, 16)))
      expect(caseFold(input, status === 'T'), `${code}; ${status}`).toBe(expected)
      checked++
    }
  }
  expect(checked).toBeGreaterThan(1500)
  expect(caseFold('猫😀', false)).toBe('猫😀')
})

it('normalizes and folds both patterns and input while preserving original ranges and metadata', () => {
  const data = { id: 1 }
  const ac = new TextMatcher([{ pattern: 'STRASSE', data }, { pattern: 'é', data }], { normalization: 'NFC', caseFold: true })
  const text = '😀Straße e\u0301'
  expect(ac.search(text)).toEqual([
    { pattern: 'STRASSE', patternIndex: 0, start: 2, end: 8, data },
    { pattern: 'é', patternIndex: 1, start: 9, end: 11, data },
  ])
  expect(ac.search(text)[0].data).toBe(data)
  expect(ac.countByPattern(text)).toEqual([1, 1])
  expect(ac.count(text)).toBe(2)
  expect(ac.match(text)).toBe(true)
  expect([...ac.iterate(text)]).toEqual(ac.search(text))
  const slices: string[] = []
  expect(ac.replace(text, (hit, original) => {
    slices.push(original)
    hit.end = 999
    return 'X'
  })).toBe('😀X X')
  expect(slices).toEqual(['Straße', 'e\u0301'])
})

it('filters partial expansions before selection and never replaces part of an original grapheme', () => {
  const ac = new TextMatcher(['s', 'ss', 'ß'], { caseFold: true })
  expect(ac.search('ß').map(hit => hit.patternIndex)).toEqual([1, 2])
  expect(ac.countByPattern('ß')).toEqual([0, 1, 1])
  expect(ac.search('ß', { strategy: 'leftmost-first' }).map(hit => hit.patternIndex)).toEqual([1])
  expect(ac.replace('ß', 'X')).toBe('X')
  const ligatures = new TextMatcher(['f', 'fi', 'ﬁ'], { normalization: 'NFKC' })
  expect(ligatures.search('ﬁ').map(hit => hit.patternIndex)).toEqual([1, 2])
  expect(ligatures.replace('ﬁ fi', 'X')).toBe('X X')
})

it('keeps exact defaults and distinguishes canonical, compatibility and Turkic rules', () => {
  expect(new TextMatcher(['é']).match('e\u0301')).toBe(false)
  expect(new TextMatcher(['a']).match('A')).toBe(false)
  expect(new TextMatcher(['é'], { normalization: 'NFD' }).match('e\u0301')).toBe(true)
  expect(new TextMatcher(['fi'], { normalization: 'NFC' }).match('ﬁ')).toBe(false)
  expect(new TextMatcher(['fi'], { normalization: 'NFKD' }).match('ﬁ')).toBe(true)
  expect(new TextMatcher(['σ'], { caseFold: true }).count('Σσς')).toBe(3)
  expect(new TextMatcher(['i'], { caseFold: true }).count('Iİıi')).toBe(2)
  expect(new TextMatcher(['i'], { caseFold: 'turkic' }).count('Iİıi')).toBe(2)
  expect(new TextMatcher(['ı'], { caseFold: 'turkic' }).count('Iİıi')).toBe(2)
})

it('supports transformed incremental streams and low-allocation first-hit queries', () => {
  const matcher = new TextMatcher(['ss', 'strasse'], { caseFold: true })
  const whole = '😀Straße SS'
  for (let split = 0; split <= whole.length; split++) {
    const stream = matcher.createStream({ strategy: 'leftmost-longest' })
    const hits = [...stream.write(whole.slice(0, split)), ...stream.write(whole.slice(split)), ...stream.finish()]
    expect(hits, `split ${split}`).toEqual(matcher.search(whole, { strategy: 'leftmost-longest' }))
  }
  expect(matcher.findFirst('xxStraße')).toEqual(matcher.search('xxStraße')[0])
  expect(matcher.findAt('xxStraße', 2)?.pattern).toBe('strasse')
  expect(matcher.findAt('xxStraße', 1)).toBeUndefined()
})

it('keeps complete transformed expansions before applying leftmost selection', () => {
  const matcher = new TextMatcher(['s', 'ss', 'strasse'], { caseFold: true })
  for (const strategy of ['leftmost-first', 'leftmost-longest'] as const) {
    const text = '😀Straße SS'
    const stream = matcher.createStream({ strategy })
    const hits = [...stream.write(text.slice(0, 1)), ...stream.write(text.slice(1)), ...stream.finish()]
    expect(hits).toEqual(matcher.search(text, { strategy }))
  }
})

it('round-trips transformed compiled artifacts and supports token/replacement sessions', () => {
  const matcher = new TextMatcher([{ pattern: 'STRASSE', data: { id: 1 } }], { caseFold: true })
  const restored = TextMatcher.deserialize<{ id: number }>(matcher.serialize())
  expect(restored.search('Straße')).toEqual(matcher.search('Straße'))
  expect(restored.getStats().stateCount).toBeGreaterThan(0)
  const tokens = restored.createTokenStream()
  expect(tokens.write('xxStra')).toEqual([])
  expect(tokens.end().map(token => token.text).join('')).toBe('xxStra')
  const replacement = restored.createReplaceStream('X')
  replacement.write('xxStraße')
  expect(replacement.end().join('')).toBe('xxX')
  expect(() => restored.createTokenStream({ strategy: 'all' as never })).toThrow(TypeError)
  const invalid = restored.createReplaceStream(() => 1 as never)
  invalid.write('Straße')
  expect(() => invalid.end()).toThrow(TypeError)
})

it('checks word boundaries on the original text and preserves longest/first tie rules', () => {
  const ac = new TextMatcher(['strasse', 'strasse!cat', 'cat'], { caseFold: true })
  const text = 'Straße!catx CAT'
  for (const strategy of ['leftmost-first', 'leftmost-longest'] as const) {
    expect(ac.search(text, { wholeWord: true, locale: 'de', strategy }).map(hit => hit.pattern)).toEqual(['strasse', 'cat'])
  }
  const choice = new TextMatcher(['a', 'ab'], { caseFold: true })
  expect(choice.replace('AB', 'X', { strategy: 'leftmost-first' })).toBe('XB')
  expect(choice.replace('AB', 'X')).toBe('X')
})

it('snapshots inputs and options and validates runtime arguments', () => {
  const patterns = [{ pattern: 'a', data: 1 }]
  const options = { caseFold: true }
  const ac = new TextMatcher(patterns, options)
  patterns[0].pattern = 'b'
  options.caseFold = false
  expect(ac.match('A')).toBe(true)
  expect(new TextMatcher([]).countByPattern('anything')).toEqual([])
  expect(() => new TextMatcher(['a'], null as never)).toThrow(TypeError)
  expect(() => new TextMatcher(['a'], { normalization: 'invalid' } as never)).toThrow(TypeError)
  expect(() => new TextMatcher(['a'], { caseFold: 'invalid' } as never)).toThrow(TypeError)
  expect(() => new TextMatcher(null as never)).toThrow(TypeError)
  expect(() => new TextMatcher([null] as never)).toThrow(TypeError)
  expect(() => new TextMatcher([''])).toThrow(RangeError)
  expect(() => ac.iterate(null as never)).toThrow(TypeError)
  expect(() => ac.iterate('a', { strategy: 'invalid' } as never)).toThrow(TypeError)
  expect(() => ac.replace('a', null as never)).toThrow(TypeError)
  expect(() => ac.replace('a', () => 1 as never)).toThrow(TypeError)
  expect(() => ac.replace('a', 'X', { strategy: 'all' } as never)).toThrow(TypeError)
})

it('emits default transformed tokens and replacements before EOF without losing early matches', () => {
  const matcher = new TextMatcher(['cat', 'a', 'ab'], { caseFold: true })
  const text = `CAT ab${' '.repeat(24)}`
  const tokens = matcher.createTokenStream()
  const early = tokens.write(text)
  expect(early.filter(token => token.type === 'match').map(token => token.text)).toEqual(['CAT', 'ab'])
  const all = [...early, ...tokens.end()]
  expect(all.map(token => token.text).join('')).toBe(text)
  expect(all.filter(token => token.type === 'match').map(token => token.match)).toEqual(matcher.search(text, { strategy: 'leftmost-longest' }))
  const replacement = matcher.createReplaceStream('X')
  const first = replacement.write(text)
  expect(first.join('')).toContain('X X')
  expect([...first, ...replacement.end()].join('')).toBe(matcher.replace(text, 'X'))
  const overlap = new TextMatcher(['a', 'ab']).createTokenStream()
  expect([...overlap.write('ab'), ...overlap.end()].map(token => token.text)).toEqual(['ab'])
})

it('keeps transformed grapheme joins and complete expansions identical at every source split', () => {
  const text = 'ㄱㅏ ß ﬁ e\u0301 İ 👨‍👩‍👧‍👦 a\u{1D165} \uD800!'
  const patterns = ['ㄱ', 'ㅏ', '가', 's', 'ss', 'ß', 'f', 'fi', 'ﬁ', 'é', 'i\u0307', '👨‍👩‍👧‍👦', 'a', 'a\u{1D165}', '\uD800']
  for (const normalization of ['NFC', 'NFD', 'NFKC', 'NFKD'] as const) {
    const matcher = new TextMatcher(patterns, { normalization, caseFold: true })
    const chunkings = [...Array.from({ length: text.length + 1 }, (_, at) => [text.slice(0, at), text.slice(at)]), text.split('')]
    for (const strategy of ['all', 'leftmost-first', 'leftmost-longest'] as const) {
      const expected = matcher.search(text, { strategy })
      for (const chunks of chunkings) {
        const stream = matcher.createStream({ strategy })
        expect([...chunks.flatMap(chunk => stream.write(chunk)), ...stream.finish()], `${normalization}, ${strategy}`).toEqual(expected)
        if (strategy !== 'all') {
          const tokens = [...tokenizeChunks(matcher, chunks, { strategy })]
          expect(tokens.map(token => token.text).join('')).toBe(text)
          expect(tokens.filter(token => token.type === 'match').map(token => token.match)).toEqual(expected)
        }
      }
    }
  }
  const hangul = new TextMatcher(['ㄱ', 'ㅏ', '가'], { normalization: 'NFKD' })
  const stream = hangul.createStream()
  expect([...stream.write('ㄱ'), ...stream.write('ㅏ'), ...stream.finish()].map(hit => hit.pattern)).toEqual(['가'])
})

it('retains original word boundaries until delayed transformed matches settle across lines', () => {
  const matcher = new TextMatcher(['s', 'ss', 'strasse', 'strasse\ncat', 'cat'], { caseFold: true })
  const text = 'Straße\nCAT Straße!catx CAT\nStraße\n'
  for (const strategy of ['all', 'leftmost-first', 'leftmost-longest'] as const) {
    const options = { strategy, wholeWord: true, locale: 'de' }
    const stream = matcher.createStream(options)
    const matches = []
    for (const chunk of text.split('')) {
      matches.push(...stream.write(chunk))
    }
    expect(matches.length).toBeGreaterThan(0)
    matches.push(...stream.finish())
    expect(matches).toEqual(matcher.search(text, options))
  }
})

it('filters original syntax before transformation and previews without consuming parser state', () => {
  const matcher = new TextMatcher(['cat'], { normalization: 'NFKC', caseFold: true })
  const text = 'ＣＡＴ https://ＣＡＴ ＣＡＴ `ＣＡＴ` ｈｔｔｐｓ：／／ＣＡＴ'
  const expected = 'X https://ＣＡＴ X `ＣＡＴ` ｈｔｔｐｓ：／／X'
  const filter = protectedText({ urls: true, markdown: true })
  for (const chunks of [text.split(''), ...Array.from({ length: text.length + 1 }, (_, at) => [text.slice(0, at), text.slice(at)])]) {
    expect([...replaceChunks(matcher, chunks, 'X', { filter })].join('')).toBe(expected)
  }
  const stream = matcher.createTokenStream({ filter })
  const tokens = stream.write('ＣＡＴ https://ＣＡＴ `ＣＡＴ')
  const first = stream.preview()
  expect(stream.preview()).toEqual(first)
  expect(first.tokens.filter(token => token.type === 'match').map(token => token.text)).not.toContain('ＣＡＴ')
  tokens.push(...stream.write('` ＣＡＴ'), ...stream.end())
  expect(tokens.map(token => token.text).join('')).toBe('ＣＡＴ https://ＣＡＴ `ＣＡＴ` ＣＡＴ')
  expect(tokens.filter(token => token.type === 'match').map(token => token.match.start)).toEqual([0, 22])
  const prefix = matcher.createTokenStream({ filter: urls() })
  prefix.write('ＣＡＴ http')
  expect(prefix.preview().tokens.map(token => token.text).join('')).toBe(prefix.preview().text)
  prefix.destroy()
})

it('bounds undecided original text through normalization, whole words and protected syntax', () => {
  const matcher = new TextMatcher(['ss', 'cat'], { caseFold: true, normalization: 'NFKD' })
  for (const create of [
    () => matcher.createStream({ maxBufferedUnits: 8 }),
    () => matcher.createTokenStream({ maxBufferLength: 8 }),
    () => matcher.createReplaceStream('X', { maxBufferLength: 8 }),
  ]) {
    const stream = create()
    expect(() => stream.write(`a${'\u0301'.repeat(20)}`)).toThrow(RangeError)
    expect(() => stream.write('cat')).toThrow()
  }
  const joined = matcher.createStream({ maxBufferLength: 8 })
  expect(() => joined.write('ㄱ'.repeat(20))).toThrow(RangeError)
  const word = matcher.createStream({ wholeWord: true, maxBufferLength: 8 })
  expect(() => word.write('x'.repeat(20))).toThrow(RangeError)
  const syntax = matcher.createStream({ filter: protectedText({ markdown: true }), maxBufferLength: 8 })
  expect(() => syntax.write(`\`${'x'.repeat(20)}`)).toThrow(RangeError)
  const unlimited = matcher.createStream({ maxBufferLength: Number.POSITIVE_INFINITY, maxBufferedUnits: 1 })
  expect(unlimited.write(`a${'\u0301'.repeat(20)}`)).toEqual([])
  expect(unlimited.finish()).toEqual([])
  const bounded = matcher.createStream({ maxBufferLength: 8, maxBufferedUnits: Number.POSITIVE_INFINITY })
  expect(() => bounded.write(`a${'\u0301'.repeat(20)}`)).toThrow(RangeError)
  const expansion = new TextMatcher(['ss'], { caseFold: true }).createStream({ maxBufferLength: 8 })
  const matches = [...expansion.write('ß '.repeat(40)), ...expansion.finish()]
  expect(matches).toHaveLength(40)
})

it('keeps transformed offset history bounded and clears it at EOF or cancellation', () => {
  const matcher = new TextMatcher(['strasse'], { caseFold: true })
  const maps = new Set<Map<unknown, unknown>>()
  const originalSet = Map.prototype.set
  let maximum = 0
  let count = 0
  const spy = vi.spyOn(Map.prototype, 'set').mockImplementation(function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
    const result = originalSet.call(this, key, value)
    if (typeof key === 'number' && typeof value === 'number') {
      maps.add(this)
      maximum = Math.max(maximum, this.size)
    }
    return result
  })
  try {
    const stream = matcher.createStream({ maxBufferedUnits: 32 })
    for (let index = 0; index < 200; index++) {
      count += stream.write('Straße '.repeat(6)).length
    }
    count += stream.finish().length
    const cancelled = matcher.createStream({ maxBufferedUnits: 32 })
    for (let index = 0; index < 200; index++) {
      cancelled.write('Straße '.repeat(6))
    }
    cancelled.cancel()
  }
  finally {
    spy.mockRestore()
  }
  expect(count).toBe(1200)
  expect(maps.size).toBe(2)
  expect(maximum).toBeLessThan(32)
  expect([...maps].map(map => map.size)).toEqual([0, 0])
})

it('preserves strict text-session closure while shared adapters remain independently usable', () => {
  const matcher = new TextMatcher(['cat'], { caseFold: true })
  const stream = matcher.createStream()
  stream.write('CAT')
  const hits = stream.finish()
  hits[0].pattern = 'changed'
  expect(matcher.search('CAT')[0].pattern).toBe('cat')
  expect(() => stream.finish()).toThrow('finished or cancelled')
  expect(() => stream.write('CAT')).toThrow('finished or cancelled')
  stream.cancel()
  stream.cancel()
  const tokens = matcher.createTokenStream()
  tokens.write('CAT')
  tokens.end()
  expect(() => tokens.end()).toThrow('finished or cancelled')
  expect(tokens.preview()).toEqual({ start: 0, text: '', tokens: [] })
  const cancelled = matcher.createTokenStream()
  cancelled.write('CAT')
  cancelled.destroy()
  expect(cancelled.preview()).toEqual({ start: 0, text: '', tokens: [] })
  expect(() => cancelled.write('CAT')).toThrow('finished or cancelled')
  const shared = createMatchStream(matcher)
  expect([...shared.write('CAT'), ...shared.end()]).toEqual(matcher.search('CAT'))
  expect(shared.end()).toEqual([])
  const failed = matcher.createReplaceStream(() => {
    throw new Error('callback failed')
  })
  expect(() => failed.write('CAT'.repeat(30))).toThrow('callback failed')
  expect(() => failed.write('CAT')).toThrow()
})
