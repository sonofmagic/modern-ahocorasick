import AhoCorasick from '@/index'
import { naive } from './helpers/reference'

it('agrees with a naive grapheme matcher across seeded random dictionaries and texts', () => {
  let seed = 0x5EED1234
  function integer(max: number) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % max
  }
  const alphabet = ['a', 'b', 'c', '猫', '😀', 'e', '\u0301', 'é', '👨‍👩‍👧‍👦', '👍🏽', '\r', '\n', '🇨', '🇳']
  function word(length: number) {
    return Array.from({ length }, () => alphabet[integer(alphabet.length)]).join('')
  }
  for (let trial = 0; trial < 1000; trial++) {
    const patterns = Array.from({ length: integer(12) }, () => word(1 + integer(5)))
    if (patterns.length) {
      patterns.push(patterns[0])
    }
    const text = word(integer(30)) + patterns.slice(0, 3).join('')
    const ac = new AhoCorasick(patterns.map((pattern, data) => ({ pattern, data })))
    const all = naive(text, patterns, 'all')
    expect(ac.search(text), `trial ${trial}`).toEqual(all)
    expect([...ac.iterate(text)]).toEqual(all)
    expect(ac.match(text)).toBe(all.length > 0)
    expect(ac.count(text)).toBe(all.length)
    for (const match of all) {
      expect(text.slice(match.start, match.end)).toBe(match.pattern)
    }
    for (const strategy of ['leftmost-first', 'leftmost-longest'] as const) {
      const expected = naive(text, patterns, strategy)
      expect(ac.search(text, { strategy })).toEqual(expected)
      expect([...ac.iterate(text, { strategy })]).toEqual(expected)
      let replaced = text
      for (const match of [...expected].reverse()) {
        replaced = `${replaced.slice(0, match.start)}X${replaced.slice(match.end)}`
      }
      expect(ac.replace(text, 'X', { strategy })).toBe(replaced)
    }
  }
})
