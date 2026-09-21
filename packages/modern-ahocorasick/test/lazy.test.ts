import AhoCorasick from '@/index'

it('preserves presence state across short and long ASCII/Unicode boundaries', () => {
  expect(new AhoCorasick(['abab']).match('ab猫')).toBe(false)
  expect(new AhoCorasick(['cat']).match('cat猫')).toBe(true)
  expect(new AhoCorasick(['zzze\u0301']).match(`${'z'.repeat(100)}e\u0301`)).toBe(true)
  expect(new AhoCorasick(['a猫']).match(`${'a'.repeat(100)}猫`)).toBe(true)
})

it('does not touch a Unicode suffix after an early ASCII presence hit', () => {
  const matcher = new AhoCorasick(['a', 'abc'])
  const spy = vi.spyOn(Intl.Segmenter.prototype, 'segment').mockImplementation(() => {
    throw new Error('unneeded Unicode suffix was visited')
  })
  try {
    const text = `abc${'x'.repeat(100_000)}e\u0301`
    expect(matcher.match(text)).toBe(true)
    expect(spy).not.toHaveBeenCalled()
  }
  finally {
    spy.mockRestore()
  }
})

it('constructs, counts and checks complete ASCII input without native segmentation', () => {
  const spy = vi.spyOn(Intl.Segmenter.prototype, 'segment')
  try {
    const matcher = new AhoCorasick(['a', '\r', '\n', '\r\n'])
    expect(matcher.count('a\r\n')).toBe(2)
    expect(matcher.match('a\r\n')).toBe(true)
    expect(new AhoCorasick(['\r', '\n']).count('a\r\nb')).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  }
  finally {
    spy.mockRestore()
  }
})

it('does not eagerly traverse the text and stops boolean queries on the first hit', () => {
  const matcher = new AhoCorasick(['猫'])
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
    const text = `猫${'b'.repeat(10000)}`
    const iterator = matcher.iterate(text)
    expect(visited).toBe(0)
    expect(iterator.next().value?.pattern).toBe('猫')
    expect(visited).toBe(1)
    iterator.return?.()
    visited = 0
    expect(matcher.match(text)).toBe(true)
    expect(visited).toBe(1)
  }
  finally {
    spy.mockRestore()
  }
})
