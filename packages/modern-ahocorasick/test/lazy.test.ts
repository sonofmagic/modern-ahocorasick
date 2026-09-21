import AhoCorasick from '@/index'

it('does not eagerly traverse the text and stops boolean queries on the first hit', () => {
  const matcher = new AhoCorasick(['a'])
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
    const text = `a${'b'.repeat(10000)}`
    const iterator = matcher.iterate(text)
    expect(visited).toBe(0)
    expect(iterator.next().value?.pattern).toBe('a')
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
