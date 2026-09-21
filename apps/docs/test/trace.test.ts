import AhoCorasick from 'modern-ahocorasick'
import { prepare } from '../src/integration'
import { groupedMatches, parseKeywords } from '../src/trace'

it.each([
  ['he,she,his,hers', 'ushers'],
  ['a,aa,aaa,a', 'aaaa'],
  ['abcd,bcd,cd,d,bc', 'abcxabcdbcd'],
  ['abcd,bcd,cd,d', 'abcx'],
  ['x,y', 'not here'],
  ['', 'abc'],
  ['a', ''],
  ['中国,中国人,人,你好', '你好，中国人！'],
  ['é,é,e', '😀é et é'],
  ['👨‍👩‍👧‍👦,😀,😀😀,👨', 'Hi 👨‍👩‍👧‍👦! 😀😀'],
  ['𠮷,𠮷野', ' 𠮷野\n'],
  ['<img>,a,a', '<img> a'],
])('trace agrees with real search: %s', (keywords, text) => {
  const model = prepare(keywords, text)
  const actual = model.steps.flatMap(step =>
    step.match ? [step.match] : [],
  )
  expect(actual).toEqual(new AhoCorasick(model.patterns).search(text))
  for (const hit of actual) {
    expect(text.slice(hit.start, hit.end)).toBe(hit.pattern)
  }
  expect(prepare(keywords, text).steps).toEqual(model.steps)
})

it('preserves the classic grouped indices and inherited order', () => {
  expect(groupedMatches(prepare('he,she,his,hers', 'ushers').steps)).toEqual([
    [3, ['she', 'he']],
    [5, ['hers']],
  ])
})

it('retries one grapheme through multiple failure links', () => {
  const steps = prepare('abcd,bcd,cd,d', 'abcx').steps
  const fallbacks = steps.filter(step => step.kind === 'fallback')
  expect(fallbacks.length).toBeGreaterThan(1)
  expect(
    fallbacks.every(step => step.grapheme === 3 && step.segment === 'x'),
  ).toBe(true)
  expect(steps.at(-1)?.kind).toBe('skip')
})

it('trims only keyword entries, keeps duplicates and preserves text whitespace', () => {
  expect(parseKeywords(' a, ,a, b ,')).toEqual(['a', 'a', 'b'])
  expect(
    prepare('a', ' a\n ')
      .segments.map(part => part.segment)
      .join(''),
  ).toBe(' a\n ')
})

it('matches a deterministic mixed Unicode corpus', () => {
  let seed = 1729
  const next = (max: number) => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed % max
  }
  const alphabet = ['a', 'b', '中', 'é', '👨‍👩‍👧‍👦', '😀', ' ']
  const word = (size: number) =>
    Array.from({ length: size }, () => alphabet[next(alphabet.length)]).join(
      '',
    )
  for (let i = 0; i < 100; i++) {
    const keywords = Array.from({ length: 8 }, () => word(1 + next(3))).join(
      ',',
    )
    const text = word(25)
    const model = prepare(keywords, text)
    expect(
      model.steps.flatMap(step => (step.match ? [step.match] : [])),
    ).toEqual(new AhoCorasick(model.patterns).search(text))
  }
})
