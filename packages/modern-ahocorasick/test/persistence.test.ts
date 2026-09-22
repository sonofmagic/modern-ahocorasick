import FastAhoCorasick from '@/fast'
import AhoCorasick from '@/index'

it('round-trips compiled Unicode dictionaries, duplicates and metadata through every query', () => {
  const patterns = ['she', 'he', 'a', 'aa', 'a', 'e\u0301', '👨‍👩‍👧‍👦', '\r\n']
  const original = new AhoCorasick(patterns.map((pattern, id) => ({ pattern, data: { id } })))
  const restored = AhoCorasick.deserialize(original.serialize())
  const text = 'she aaa e\u0301 👨‍👩‍👧‍👦\r\n'
  for (const wholeWord of [false, true]) {
    const options = { wholeWord, locale: 'en' }
    expect(restored.count(text, options)).toBe(original.count(text, options))
    expect(restored.countByPattern(text, options)).toEqual(original.countByPattern(text, options))
    expect(restored.match(text, options)).toBe(true)
    for (const strategy of ['all', 'leftmost-first', 'leftmost-longest'] as const) {
      expect(restored.search(text, { ...options, strategy })).toEqual(original.search(text, { ...options, strategy }))
      expect([...restored.iterate(text, { ...options, strategy })]).toEqual(original.search(text, { ...options, strategy }))
      if (strategy !== 'all') {
        expect(restored.replace(text, 'X', { ...options, strategy })).toBe(original.replace(text, 'X', { ...options, strategy }))
      }
    }
  }
  expect(restored.serialize()).toBe(original.serialize())
  expect(AhoCorasick.deserialize(new AhoCorasick([]).serialize()).search('anything')).toEqual([])
})

it('round-trips portable compiled artifacts with profile metadata', () => {
  const matcher = new AhoCorasick([{ pattern: 'cat', data: { id: 1 } }])
  const restored = AhoCorasick.deserializeArtifact<{ id: number }>(matcher.serializeArtifact())
  expect(restored.search('cat')).toEqual(matcher.search('cat'))
  expect(() => AhoCorasick.deserializeArtifact('{"format":"modern-ahocorasick/artifact","version":1}')).toThrow(TypeError)
  const tampered = JSON.parse(matcher.serializeArtifact())
  tampered.payload = `${tampered.payload} `
  expect(() => AhoCorasick.deserializeArtifact(JSON.stringify(tampered))).toThrow(TypeError)
  const fast = new FastAhoCorasick(['dog'])
  expect(FastAhoCorasick.deserializeArtifact(fast.serializeArtifact()).match('dog')).toBe(true)
})

it('supports explicit metadata codecs without changing caller-owned values', () => {
  const date = new Date('2026-09-22T00:00:00Z')
  const original = new AhoCorasick([{ pattern: 'a', data: date }, 'b'])
  expect(() => original.serialize()).toThrow(TypeError)
  const serialized = original.serialize({ encodeData: value => value.toISOString() })
  const restored = AhoCorasick.deserialize(serialized, { decodeData: value => new Date(value as string) })
  expect(restored.search('ab').map(hit => hit.data)).toEqual([date, undefined])
  expect(restored.search('a')[0].data).not.toBe(date)
  expect(original.search('a')[0].data).toBe(date)
})

it('rejects lossy or cyclic metadata and invalid codecs', () => {
  const hooked = Object.defineProperty({}, 'toJSON', { value: () => null })
  expect(() => new AhoCorasick([{ pattern: 'a', data: hooked }]).serialize()).toThrow(TypeError)
  const cyclic: unknown[] = []
  cyclic.push(cyclic)
  for (const data of [cyclic, 1n, Number.NaN, Infinity, () => 1, Symbol('x'), new Map(), { x: undefined }, [undefined]]) {
    expect(() => new AhoCorasick([{ pattern: 'a', data }]).serialize()).toThrow(TypeError)
  }
  const original = new AhoCorasick(['a'])
  expect(() => original.serialize(null as never)).toThrow(TypeError)
  expect(() => original.serialize({ encodeData: 1 } as never)).toThrow(TypeError)
  expect(() => AhoCorasick.deserialize(original.serialize(), { decodeData: 1 } as never)).toThrow(TypeError)
})

it('rejects malformed, cyclic and semantically inconsistent compiled tables', () => {
  const serialized = new AhoCorasick(['she', 'he', 'e', 'abc', 'abc']).serialize()
  for (const input of ['', '{', 'null', '[]', '1', undefined]) {
    expect(() => AhoCorasick.deserialize(input as string)).toThrow(TypeError)
  }
  // The format is deliberately opaque to consumers; these mutations test the loader.
  const mutations = [
    (value: any) => { value.version = 999 },
    (value: any) => { value.segmentation = 'codepoints' },
    (value: any) => { value.symbols.push(value.symbols[0]) },
    (value: any) => { value.edges[0] = 1 },
    (value: any) => { value.edges[2] = -1 },
    (value: any) => { value.targets[0] = 0 },
    (value: any) => { value.targets[1] = value.targets[0] },
    (value: any) => { value.failures[1] = 1 },
    (value: any) => { value.outputs[1] = 1 },
    (value: any) => { value.terminals[1] = 1 },
    (value: any) => { value.patternIndices[1] = value.patternIndices[0] },
    (value: any) => { value.patterns[0].pattern = 'different' },
    (value: any) => { value.patterns[0].pattern = '' },
    (value: any) => { value.patterns[0].pattern = 1 },
  ]
  for (const mutate of mutations) {
    const value = JSON.parse(serialized)
    mutate(value)
    expect(() => AhoCorasick.deserialize(JSON.stringify(value))).toThrow(TypeError)
  }
})

it('rejects dictionaries whose saved segmentation differs from the loading runtime', () => {
  const serialized = new AhoCorasick(['e\u0301']).serialize()
  const spy = vi.spyOn(Intl.Segmenter.prototype, 'segment').mockImplementation(() => [
    { segment: 'e', index: 0, input: 'e\u0301' },
    { segment: '\u0301', index: 1, input: 'e\u0301' },
  ] as unknown as Intl.Segments)
  try {
    expect(() => AhoCorasick.deserialize(serialized)).toThrow(TypeError)
  }
  finally {
    spy.mockRestore()
  }
})
