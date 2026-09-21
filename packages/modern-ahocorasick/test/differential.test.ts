import type { Match, MatchStrategy } from '@/index'
import AhoCorasick from '@/index'

// Intentionally independent: try every pattern at every grapheme boundary.
function naive(text: string, patterns: string[], strategy: MatchStrategy): Match<number>[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const textSegments = Array.from(segmenter.segment(text))
  const dictionary = patterns.map(pattern => Array.from(segmenter.segment(pattern), item => item.segment))
  const matches: Match<number>[] = []
  let cursor = 0
  for (let start = 0; start < textSegments.length; start++) {
    if (textSegments[start].index < cursor) {
      continue
    }
    const candidates: Match<number>[] = []
    for (let patternIndex = 0; patternIndex < patterns.length; patternIndex++) {
      const tokens = dictionary[patternIndex]
      if (tokens.every((token, offset) => textSegments[start + offset]?.segment === token)) {
        const last = textSegments[start + tokens.length - 1]
        candidates.push({ pattern: patterns[patternIndex], patternIndex, start: textSegments[start].index, end: last.index + last.segment.length, data: patternIndex })
      }
    }
    if (strategy === 'all') {
      matches.push(...candidates)
    }
    else if (candidates.length) {
      if (strategy === 'leftmost-longest') {
        candidates.sort((a, b) => b.end - a.end || a.patternIndex - b.patternIndex)
      }
      matches.push(candidates[0])
      cursor = candidates[0].end
    }
  }
  return strategy === 'all'
    ? matches.sort((a, b) => a.end - b.end || b.pattern.length - a.pattern.length || a.patternIndex - b.patternIndex)
    : matches
}

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
  for (let trial = 0; trial < 200; trial++) {
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
    for (const match of all) {
      expect(text.slice(match.start, match.end)).toBe(match.pattern)
    }
    for (const strategy of ['leftmost-first', 'leftmost-longest'] as const) {
      const expected = naive(text, patterns, strategy)
      expect(ac.search(text, { strategy })).toEqual(expected)
      let replaced = text
      for (const match of [...expected].reverse()) {
        replaced = `${replaced.slice(0, match.start)}X${replaced.slice(match.end)}`
      }
      expect(ac.replace(text, 'X', { strategy })).toBe(replaced)
    }
  }
})
