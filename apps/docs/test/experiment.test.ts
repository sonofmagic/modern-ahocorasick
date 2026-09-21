import AhoCorasick from 'modern-ahocorasick'
import {
  deserialize,
  Experiment,
  experimentDefaults,
  fromHash,
  highlights,
  hitCount,
  serialize,
  shareHash,
  snippet,
  validateInputs,
} from '../src/experiment'
import { defaults } from '../src/storage'

const input = { ...defaults, ...experimentDefaults }

it('reuses dictionary state on text changes and reuses the trace on strategy/replacement changes', () => {
  const engine = new Experiment()
  const first = engine.run(input)
  const second = engine.run({ ...input, text: 'she' })
  expect(second.model.nodes).toBe(first.model.nodes)
  expect(second.model.steps).not.toBe(first.model.steps)
  const third = engine.run({
    ...input,
    text: 'she',
    strategy: 'leftmost-first',
    replacement: '$&',
  })
  expect(third.model).toBe(second.model)
  expect(third.replaced).toBe('$&')
  expect(engine.run({ ...input, keywords: 'x' }).model.nodes).not.toBe(
    first.model.nodes,
  )
})

it.each(['all', 'leftmost-first', 'leftmost-longest'] as const)(
  'uses the public search and replacement semantics: %s',
  (strategy) => {
    const value = {
      ...input,
      keywords: 'a,aa,aaa,a',
      text: 'aaaa',
      strategy,
      replacement: '$&<b>',
    }
    const result = new Experiment().run(value)
    const matcher = new AhoCorasick(['a', 'aa', 'aaa', 'a'])
    expect(result.selected).toEqual(matcher.search(value.text, { strategy }))
    expect(result.replaced).toBe(
      matcher.replace(value.text, value.replacement, {
        strategy: strategy === 'all' ? 'leftmost-longest' : strategy,
      }),
    )
    expect(result.model.hits.map(hit => hit.match)).toEqual(
      matcher.search(value.text),
    )
  },
)

it('supports empty dictionaries and empty text', () => {
  expect(new Experiment().run({ ...input, keywords: '' }).selected).toEqual([])
  const result = new Experiment().run({ ...input, text: '' })
  expect(result.model.steps).toEqual([])
  expect(result.replaced).toBe('')
})

it('projects any cursor without duplicating hits and preserves exact Unicode slices', () => {
  const value = { ...input, keywords: '👨‍👩‍👧‍👦,é,😀,😀', text: ' 👨‍👩‍👧‍👦 é 😀 ' }
  const { model } = new Experiment().run(value)
  for (const cursor of [0, model.steps.length, 3, 1, model.steps.length]) {
    expect(
      model.hits.slice(0, hitCount(model.hits, cursor)).map(hit => hit.match),
    ).toEqual(
      model.steps
        .slice(0, cursor)
        .flatMap(step => (step.match ? [step.match] : [])),
    )
  }
  for (const hit of model.hits) {
    expect(value.text.slice(hit.match.start, hit.match.end)).toBe(
      hit.match.pattern,
    )
  }
  const { nodes } = new Experiment().run(input).model
  const she = nodes.find(node => node.prefix === 'she')!
  expect(nodes[she.failure].prefix).toBe('he')
  expect(she.ownPatternIndices).toEqual([1])
  expect(she.patternIndices).toEqual([1, 0])
})

it('highlights the union of overlapping results while preserving original text and selection boundaries', () => {
  const text = '<b>👨‍👩‍👧‍👦éaaa'
  const matches = new AhoCorasick(['👨‍👩‍👧‍👦', 'é', 'a', 'aa', 'a']).search(text)
  const selected = matches.at(-1)!
  const parts = highlights(text, matches, selected)
  expect(parts.map(part => part.text).join('')).toBe(text)
  expect(
    parts
      .filter(part => part.selected)
      .map(part => part.text)
      .join(''),
  ).toBe(selected.pattern)
  expect(
    parts
      .filter(part => part.hit)
      .map(part => part.text)
      .join(''),
  ).toBe('👨‍👩‍👧‍👦éaaa')
  expect(highlights('', [])).toEqual([])
})

it('round-trips versioned JSON and Unicode URLs, ignoring untrusted saved results', () => {
  const value = {
    ...input,
    keywords: '😀,é,a,a',
    text: ' <img>😀\n ',
    replacement: '$&',
    showFailure: true,
    strategy: 'leftmost-first' as const,
  }
  expect(fromHash(shareHash(value))).toEqual(value)
  expect(deserialize(serialize(value, new Experiment().run(value)))).toEqual(
    value,
  )
  expect(
    deserialize(
      JSON.stringify({
        version: 1,
        input: value,
        results: [{ pattern: 'fake' }],
      }),
    ),
  ).toEqual(value)
  expect(fromHash('#algorithm')).toBeUndefined()
  expect(snippet(value)).toContain('" <img>😀\\n "')
  expect(snippet(value)).toContain('strategy: \'leftmost-first\'')
})

it('rejects malformed and excessive inputs atomically', () => {
  for (const value of [
    null,
    {},
    { ...input, speed: NaN },
    { ...input, strategy: 'random' },
    { ...input, replacement: 42 },
    { ...input, showFailure: 'yes' },
  ]) {
    expect(() => validateInputs(value)).toThrow(TypeError)
  }
  for (const value of [
    { ...input, text: 'a'.repeat(20001) },
    { ...input, keywords: 'a'.repeat(2001) },
    { ...input, keywords: 'a,'.repeat(200) },
    { ...input, replacement: 'x'.repeat(201) },
  ]) {
    expect(() => validateInputs(value)).toThrow(RangeError)
  }
  expect(() => deserialize('{')).toThrow()
  expect(() => deserialize(JSON.stringify({ version: 2, input }))).toThrow()
  expect(() => fromHash('#workbench=%ZZ')).toThrow()
  expect(() =>
    new Experiment().run({
      ...input,
      keywords: 'a,a,a',
      text: 'a'.repeat(20000),
    }),
  ).toThrow(RangeError)
})

it('bounds exported result volume so every accepted configuration remains importable', () => {
  const value = { ...input, keywords: 'a'.repeat(1500), text: 'a'.repeat(16000) }
  expect(() => new Experiment().run(value)).toThrow('export budget')
  const smaller = { ...value, text: 'a'.repeat(2000) }
  expect(deserialize(serialize(smaller, new Experiment().run(smaller)))).toEqual(smaller)
})
