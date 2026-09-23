import AhoCorasick from '@/index'
import { naive, verifyCases } from './helpers/reference'

const strategies = ['all', 'leftmost-first', 'leftmost-longest'] as const

it('carries automaton and selected candidates across ASCII/Unicode transitions', () => {
  const cases = []
  for (const length of [0, 1, 7, 8, 9, 64]) {
    for (const suffix of ['f\u0301', '\r\n猫', '👨‍👩‍👧‍👦', '\u0600a', '🇨🇳', '\uD800']) {
      cases.push({
        patterns: ['b', `abcde${suffix}`, 'bc', suffix, `abcde${suffix}`, '\r', '\n', '\r\n', 'z'],
        text: `${'x'.repeat(length)}abcde${suffix}z`,
      })
    }
  }
  expect(verifyCases(AhoCorasick, cases)).toBe(36)
})

it.each(strategies)('%s scans ASCII and CRLF without creating native segments', (strategy) => {
  const patterns = ['ab', 'b', 'ab', '\r', '\n', '\r\n']
  const text = 'ab\r\nab\r\n'
  const expected = naive(text, patterns, strategy)
  const matcher = new AhoCorasick(patterns.map((pattern, data) => ({ pattern, data })))
  const segment = vi.spyOn(Intl.Segmenter.prototype, 'segment')
  try {
    expect(matcher.search(text, { strategy })).toEqual(expected)
    expect([...matcher.iterate(text, { strategy })]).toEqual(expected)
    expect(segment).not.toHaveBeenCalled()
  }
  finally {
    segment.mockRestore()
  }
})

it.each(strategies)('%s stops before a distant Unicode suffix and isolates yielded matches', (strategy) => {
  const matcher = new AhoCorasick(['hit', 'hit'])
  const text = `hit${'x'.repeat(100_000)}e\u0301`
  const expected = matcher.search(text, { strategy })
  const segment = vi.spyOn(Intl.Segmenter.prototype, 'segment')
  try {
    const first = matcher.iterate(text, { strategy })
    const second = matcher.iterate('hit', { strategy })
    expect(segment).not.toHaveBeenCalled()
    const hit = first.next().value!
    expect(hit).toEqual(expected[0])
    hit.start = 999
    hit.end = 999
    expect(second.next().value).toEqual(expected[0])
    first.return?.()
    second.return?.()
    expect(matcher.findFirst(text, { strategy })).toEqual(expected[0])
    expect(segment).not.toHaveBeenCalled()
  }
  finally {
    segment.mockRestore()
  }
})

it.each(strategies)('%s keeps absolute offsets when candidates span the native handoff', (strategy) => {
  const patterns = ['b', 'abcdef\u0301', 'f\u0301', 'z', 'abcdef\u0301']
  const text = 'xxxxxxxxxabcdef\u0301z'
  const matcher = new AhoCorasick(patterns.map((pattern, data) => ({ pattern, data })))
  const expected = naive(text, patterns, strategy)
  const segment = vi.spyOn(Intl.Segmenter.prototype, 'segment')
  try {
    expect(matcher.search(text, { strategy })).toEqual(expected)
    // The uncommitted ASCII f belongs to the same grapheme as its accent.
    expect(segment.mock.calls).toEqual([['f\u0301z']])
  }
  finally {
    segment.mockRestore()
  }
})
