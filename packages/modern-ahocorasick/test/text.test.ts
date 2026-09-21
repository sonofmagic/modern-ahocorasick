import { readFileSync } from 'node:fs'
import { caseFold } from '../src/case-folding'
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
