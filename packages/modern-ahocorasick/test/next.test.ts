import type { PatternInput, Replacement, ReplaceOptions, SearchOptions } from '@/index'
import AhoCorasick from '@/index'

function result(pattern: string, patternIndex: number, start: number, end: number) {
  return { pattern, patternIndex, start, end, data: undefined }
}

describe('v3 contracts', () => {
  it('orders overlapping matches by end, descending length and input index', () => {
    const ac = new AhoCorasick(['he', 'she', 'hers', 'he'])
    expect(ac.search('ushers')).toEqual([
      result('she', 1, 1, 4),
      result('he', 0, 2, 4),
      result('he', 3, 2, 4),
      result('hers', 2, 2, 6),
    ])
  })

  it('handles empty dictionaries and text', () => {
    const empty = new AhoCorasick([])
    expect(empty.search('text')).toEqual([])
    expect([...empty.iterate('text')]).toEqual([])
    expect(empty.match('text')).toBe(false)
    expect(empty.count('text')).toBe(0)
    expect(empty.replace('text', 'x')).toBe('text')
    const ac = new AhoCorasick(['a'])
    expect(ac.search('')).toEqual([])
    expect(ac.match('')).toBe(false)
    expect(ac.count('')).toBe(0)
    expect(ac.replace('', 'x')).toBe('')
  })

  it('reports the offending empty keyword index', () => {
    expect(() => new AhoCorasick(['a', ''])).toThrow(RangeError)
    expect(() => new AhoCorasick(['a', { pattern: '' }])).toThrow('patterns[1]')
  })

  it.each([null, undefined, 'abc', 42, {}])('rejects invalid dictionaries: %j', (input) => {
    expect(() => new AhoCorasick(input as unknown as PatternInput[])).toThrow(TypeError)
  })

  it.each([null, undefined, 42, {}, [], { pattern: 2 }])('rejects invalid entries: %j', (input) => {
    expect(() => new AhoCorasick(['valid', input as PatternInput])).toThrow(TypeError)
  })

  it('rejects sparse dictionary entries', () => {
    expect(() => new AhoCorasick(Array.from({ length: 2 }) as string[])).toThrow(TypeError)
    expect(() => new AhoCorasick(Array.from({ length: 2 }))).toThrow(TypeError)
  })

  it.each([null, undefined, 42, {}, []])('validates text immediately on every public method: %j', (input) => {
    const ac = new AhoCorasick([])
    const text = input as unknown as string
    expect(() => ac.search(text)).toThrow(TypeError)
    expect(() => ac.iterate(text)).toThrow(TypeError)
    expect(() => ac.match(text)).toThrow(TypeError)
    expect(() => ac.count(text)).toThrow(TypeError)
    expect(() => ac.replace(text, '')).toThrow(TypeError)
  })

  it.each([null, 'all', [], 1, { strategy: 'unknown' }, { strategy: null }, { strategy: 1 }])('rejects invalid options: %j', (options) => {
    const ac = new AhoCorasick([])
    expect(() => ac.search('', options as SearchOptions)).toThrow(TypeError)
    expect(() => ac.iterate('', options as SearchOptions)).toThrow(TypeError)
    expect(() => ac.replace('', '', options as ReplaceOptions)).toThrow(TypeError)
  })

  it('preserves duplicate entries and metadata identity', () => {
    const data = { id: 'first' }
    const ac = new AhoCorasick(['a', { pattern: 'a', data }, { pattern: 'a', data: { id: 'second' } }])
    expect(ac.search('a').map(match => match.patternIndex)).toEqual([0, 1, 2])
    expect(ac.search('a')[1].data).toBe(data)
  })

  it('snapshots the dictionary and pattern records', () => {
    const data = { label: 'before' }
    const entry = { pattern: 'cat', data }
    const inputs: PatternInput<typeof data>[] = [entry]
    const ac = new AhoCorasick(inputs)
    entry.pattern = 'dog'
    entry.data = { label: 'new object' }
    inputs[0] = 'bird'
    inputs.push('fish')
    data.label = 'after'
    expect(ac.search('cat')).toEqual([{ pattern: 'cat', patternIndex: 0, start: 0, end: 3, data }])
    expect(ac.match('dog bird fish')).toBe(false)
  })

  it('isolates result mutation and hides internal tables', () => {
    const ac = new AhoCorasick(['cat'])
    const matches = ac.search('cat')
    matches[0].pattern = 'dog'
    matches[0].start = 100
    matches.length = 0
    const item = ac.iterate('cat').next().value!
    item.patternIndex = 100
    expect(ac.search('cat')).toEqual([result('cat', 0, 0, 3)])
    expect(ac.match('cat')).toBe(true)
    expect(Object.keys(ac)).toEqual([])
    expect('gotoFn' in ac || 'failure' in ac || 'output' in ac || '_buildTables' in ac).toBe(false)
  })

  it('supports independent, interleaved and early-terminated iterators', () => {
    const ac = new AhoCorasick(['a', 'aa'])
    const a = ac.iterate('aaa')
    const b = ac.iterate('aa')
    expect(a.next().value).toEqual(result('a', 0, 0, 1))
    expect(b.next().value).toEqual(result('a', 0, 0, 1))
    expect(a.next().value).toEqual(result('aa', 1, 0, 2))
    a.return?.()
    expect([...b]).toEqual([result('aa', 1, 0, 2), result('a', 0, 1, 2)])
    expect(ac.match('aa')).toBe(true)
  })

  it('handles special characters and emojis with UTF-16 ranges', () => {
    const text = 'Hello 😊👍🎉 world!'
    const ac = new AhoCorasick(['😊', '👍', '🎉'])
    expect(ac.search(text)).toEqual([result('😊', 0, 6, 8), result('👍', 1, 8, 10), result('🎉', 2, 10, 12)])
    expect(new AhoCorasick(['cat']).search('😀cat')).toEqual([result('cat', 0, 2, 5)])
  })

  it('matches special characters and emojis', () => {
    const ac = new AhoCorasick(['😊', '👍', '🎉'])
    expect(ac.match('Hello 😊')).toBe(true)
    expect(ac.match('Hello world')).toBe(false)
  })

  it.each([
    ['e\u0301', 'é e\u0301', 2, 4],
    ['👨‍👩‍👧‍👦', '😁👨‍👩‍👧‍👦😀', 2, 13],
    ['中文', '😀中文', 2, 4],
    ['𠮟', '人を𠮟る', 2, 4],
    ['👍🏽', 'a👍🏽b', 1, 5],
    ['🇨🇳', 'a🇨🇳b', 1, 5],
    ['\r\n', 'a\r\nb', 1, 3],
    ['\uD800', 'a\uD800b', 1, 2],
  ])('returns sliceable ranges for %s', (pattern, text, start, end) => {
    const matches = new AhoCorasick([pattern]).search(text)
    expect(matches).toEqual([result(pattern, 0, start, end)])
    expect(text.slice(matches[0].start, matches[0].end)).toBe(pattern)
  })

  it('matches only whole grapheme clusters without normalization or case folding', () => {
    expect(new AhoCorasick(['e', '\u0301']).search('e\u0301')).toEqual([])
    expect(new AhoCorasick(['é']).match('e\u0301')).toBe(false)
    expect(new AhoCorasick(['👨', '👍']).match('👨‍👩‍👧‍👦👍🏽')).toBe(false)
    expect(new AhoCorasick(['a']).match('A')).toBe(false)
  })
})

describe('non-overlapping selection and replacement', () => {
  const ac = new AhoCorasick(['a', 'ab', 'bc', 'abc', 'ab'])

  it('prioritizes the leftmost start even if another match ends earlier', () => {
    expect(new AhoCorasick(['b', 'abc']).search('abc', { strategy: 'leftmost-first' })).toEqual([result('abc', 1, 0, 3)])
  })

  it('uses input priority for leftmost-first and allows adjacent matches', () => {
    expect(ac.search('abcab', { strategy: 'leftmost-first' })).toEqual([
      result('a', 0, 0, 1),
      result('bc', 2, 1, 3),
      result('a', 0, 3, 4),
    ])
  })

  it('uses length then input priority for leftmost-longest', () => {
    expect(ac.search('abcab', { strategy: 'leftmost-longest' })).toEqual([
      result('abc', 3, 0, 3),
      result('ab', 1, 3, 5),
    ])
  })

  it('replaces original ranges once, defaults to longest and preserves gaps', () => {
    expect(ac.replace('!abc?ab.', 'ab')).toBe('!ab?ab.')
    expect(ac.replace('abcab', 'X', { strategy: 'leftmost-first' })).toBe('XXXb')
    expect(ac.replace('abcab', '')).toBe('')
    expect(ac.replace('xyz', 'X')).toBe('xyz')
    expect(ac.replace('abc', '$&$1$$')).toBe('$&$1$$')
  })

  it('passes metadata, original ranges and text to callbacks in source order', () => {
    const matcher = new AhoCorasick([{ pattern: '猫', data: 'cat' }, { pattern: '狗', data: 'dog' }])
    const calls: unknown[] = []
    expect(matcher.replace('😀猫和狗', (match, text) => {
      calls.push([match.start, match.end, text])
      return `<${match.data}>`
    })).toBe('😀<cat>和<dog>')
    expect(calls).toEqual([[2, 3, '猫'], [4, 5, '狗']])
  })

  it('allows callback mutation and reentrant searches without corrupting replacement', () => {
    expect(ac.replace('abc-ab', (match, text) => {
      match.start = 999
      match.end = 999
      expect(ac.match(text)).toBe(true)
      return 'X'
    })).toBe('X-X')
  })

  it('rejects overlapping replacement even for empty input', () => {
    expect(() => ac.replace('', '', { strategy: 'all' } as unknown as ReplaceOptions)).toThrow(TypeError)
  })

  it.each([null, undefined, 42, {}])('rejects invalid replacements even without matches: %j', (input) => {
    expect(() => ac.replace('', input as Replacement)).toThrow(TypeError)
  })

  it('rejects non-string callback returns and propagates user exceptions', () => {
    expect(() => ac.replace('abc', (() => 42) as unknown as Replacement)).toThrow(TypeError)
    const error = new Error('caller error')
    expect(() => ac.replace('abc', () => {
      throw error
    })).toThrow(error)
  })
})
