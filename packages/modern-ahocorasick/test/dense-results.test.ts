import AhoCorasick from '@/index'
import { naive } from './helpers/reference'

it.each([
  { name: 'suffixes', patterns: Array.from({ length: 40 }, (_, index) => 'a'.repeat(index + 1)) },
  { name: 'duplicates', patterns: Array.from<string>({ length: 40 }).fill('a') },
])('preserves dense $name results through restored dictionaries', ({ patterns }) => {
  const text = `猫 ${'a'.repeat(45)}\r\n${'a'.repeat(40)} e\u0301`
  const original = new AhoCorasick(patterns.map((pattern, data) => ({ pattern, data })))
  const expected = naive(text, patterns, 'all')
  for (const matcher of [original, AhoCorasick.deserialize<number>(original.serialize())]) {
    const iterator = matcher.iterate(text)
    expect(iterator.next().value).toEqual(expected[0])
    iterator.return?.()
    expect(matcher.search(text)).toEqual(expected)
    expect([...matcher.iterate(text)]).toEqual(expected)
    const start = text.indexOf('a')
    const end = start + 20
    expect(matcher.search(text, { start, end })).toEqual(expected.filter(hit => hit.start >= start && hit.end <= end))
    expect(matcher.count(text)).toBe(expected.length)
    expect(matcher.search(text, { strategy: 'leftmost-longest' })).toEqual(naive(text, patterns, 'leftmost-longest'))
  }
})
