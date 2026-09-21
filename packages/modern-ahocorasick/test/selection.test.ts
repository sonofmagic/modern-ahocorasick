import AhoCorasick from '@/index'

describe.each(['leftmost-first', 'leftmost-longest'] as const)('%s iteration', (strategy) => {
  it('waits for an earlier-starting long word and flushes at EOF', () => {
    const matcher = new AhoCorasick(['b', 'abcdef', 'xy', 'y'])
    expect([...matcher.iterate('abcdefxy', { strategy })].map(m => m.pattern)).toEqual(['abcdef', 'xy'])
    expect([...matcher.iterate('ab', { strategy })].map(m => m.pattern)).toEqual(['b'])
  })

  it('preserves earlier starts after long empty windows and skips empty tails', () => {
    const matcher = new AhoCorasick(['b', 'abcdef'])
    const gap = 'x'.repeat(10_000)
    const text = `${gap}abcdef${gap}abcdef${gap}`
    expect([...matcher.iterate(text, { strategy })].map(({ pattern, start, end }) => ({ pattern, start, end }))).toEqual([
      { pattern: 'abcdef', start: 10_000, end: 10_006 },
      { pattern: 'abcdef', start: 20_006, end: 20_012 },
    ])
    expect([...matcher.iterate(gap, { strategy })]).toEqual([])
  })

  it('reuses the candidate window across gaps, overlaps and adjacent Unicode matches', () => {
    const text = 'aab!👨‍👩‍👧‍👦e\u0301?'.repeat(1000)
    const matcher = new AhoCorasick(['aa', 'a', 'aab', 'b', '👨‍👩‍👧‍👦', 'e\u0301'])
    // Independent reference: materialize all matches and use the old sort/greedy rule.
    const candidates = matcher.search(text).sort((a, b) => a.start - b.start
      || (strategy === 'leftmost-longest' ? b.end - a.end : 0)
      || a.patternIndex - b.patternIndex)
    let end = 0
    const expected = candidates.filter((match) => {
      if (match.start < end) {
        return false
      }
      end = match.end
      return true
    })
    expect([...matcher.iterate(text, { strategy })]).toEqual(expected)
  })

  it('is lazy with bounded lookahead, including after skipped candidates', () => {
    const matcher = new AhoCorasick(['猫猫猫', '猫'])
    const original = Intl.Segmenter.prototype.segment
    let visited = 0
    const spy = vi.spyOn(Intl.Segmenter.prototype, 'segment').mockImplementation(function (this: Intl.Segmenter, text) {
      const segments = original.call(this, text)
      return {
        containing: segments.containing.bind(segments),
        * [Symbol.iterator](): Generator<Intl.SegmentData, undefined, unknown> {
          for (const segment of segments) {
            visited++
            yield segment
          }
          return undefined
        },
      }
    })
    try {
      const iterator = matcher.iterate('猫'.repeat(100_000), { strategy })
      expect(visited).toBe(0)
      for (let index = 0; index < 100; index++) {
        const match = iterator.next().value!
        expect(match.start).toBe(index * 3)
        expect(match.end).toBe(index * 3 + 3)
        expect(visited).toBe(index * 3 + 3)
        // A consumer must not be able to change the iterator's overlap cursor.
        match.end = 100_000
      }
      iterator.return?.()
      expect(visited).toBe(300)
    }
    finally {
      spy.mockRestore()
    }
  })

  it('isolates interleaved selected iterators and snapshots options', () => {
    const matcher = new AhoCorasick(['a', 'ab', 'bc'])
    const options = { strategy }
    const first = matcher.iterate('abcabc', options)
    options.strategy = strategy === 'leftmost-first' ? 'leftmost-longest' : 'leftmost-first'
    const second = matcher.iterate('abc', { strategy })
    const expected = matcher.search('abcabc', { strategy })
    expect(first.next().value).toEqual(expected[0])
    expect([...second]).toEqual(matcher.search('abc', { strategy }))
    expect([...first]).toEqual(expected.slice(1))
  })
})

it('counts duplicate and inherited outputs even at nonterminal states', () => {
  const matcher = new AhoCorasick(['a', 'a', 'ba', 'bac', 'aba'])
  expect(matcher.count('baba')).toBe(7)
  expect(matcher.count('baba')).toBe(matcher.search('baba').length)
  expect(new AhoCorasick(['a', 'bab']).count('ba')).toBe(1)
})

it('counts dense outputs without using the match-producing APIs', () => {
  const matcher = new AhoCorasick(Array.from({ length: 96 }, (_, i) => 'a'.repeat(i + 1)))
  const search = vi.spyOn(matcher, 'search').mockImplementation(() => {
    throw new Error('must not collect')
  })
  const iterate = vi.spyOn(matcher, 'iterate').mockImplementation(() => {
    throw new Error('must not enumerate')
  })
  expect(matcher.count('a'.repeat(1000))).toBe(91_440)
  expect(matcher.match('a')).toBe(true)
  expect(search).not.toHaveBeenCalled()
  expect(iterate).not.toHaveBeenCalled()
})
