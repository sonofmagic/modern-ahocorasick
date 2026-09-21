import AhoCorasick from '@/index'

it('returns independent per-entry counts, including absent and duplicate patterns', () => {
  const matcher = new AhoCorasick(['a', 'aa', 'a', 'b'])
  const first = matcher.countByPattern('aaa')
  expect(first).toEqual([3, 2, 3, 0])
  first[0] = 100
  expect(matcher.countByPattern('aaa')).toEqual([3, 2, 3, 0])
  expect(matcher.countByPattern('')).toEqual([0, 0, 0, 0])
  expect(new AhoCorasick([]).countByPattern('abc')).toEqual([])
  expect(() => matcher.countByPattern(null as unknown as string)).toThrow(TypeError)
})

it('propagates inherited hits even when a failure state was constructed later', () => {
  const matcher = new AhoCorasick(['she', 'he', 'e', 'shex', 'hers'])
  expect(matcher.countByPattern('ushers she')).toEqual([2, 2, 2, 0, 1])
})

it('counts dense suffixes without creating or enumerating matches', () => {
  const matcher = new AhoCorasick(Array.from({ length: 1000 }, (_, i) => 'a'.repeat(i + 1)))
  vi.spyOn(matcher, 'search').mockImplementation(() => {
    throw new Error('must not search')
  })
  vi.spyOn(matcher, 'iterate').mockImplementation(() => {
    throw new Error('must not iterate')
  })
  expect(matcher.countByPattern('a'.repeat(10_000))).toEqual(Array.from({ length: 1000 }, (_, i) => 10_000 - i))
})

it('respects complete graphemes, CRLF and the ASCII-to-Unicode transition', () => {
  const patterns = ['a', 'e', 'e\u0301', 'é', '👨‍👩‍👧‍👦', '👨', '\r', '\n', '\r\n']
  const matcher = new AhoCorasick(patterns)
  expect(matcher.countByPattern('aaaaaaaaae\u0301 é 👨‍👩‍👧‍👦\r\n')).toEqual([9, 0, 1, 1, 1, 0, 0, 0, 1])
})
