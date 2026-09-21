import type AhoCorasick from '../../src/index'
import type { Match, MatchStrategy } from '../../src/types'

// Intentionally independent: try every pattern at every grapheme boundary.
export function naive(text: string, patterns: string[], strategy: MatchStrategy): Match<number>[] {
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

export interface ContractCase {
  patterns: string[]
  text: string
}

/** Serializable, deterministic input shared by Node and all browser engines. */
export function contractCases(): ContractCase[] {
  const cases: ContractCase[] = []
  const boundaries = ['\u0301', '\u200D👩', '\uFE0F', '\u20E3', '🇨🇳🇺', '👍🏽', '👨‍👩‍👧‍👦', '\u0600a', 'क्‍ष', '\uD800', '\uDC00', '\r\n', '\u0000']
  for (const boundary of boundaries) {
    for (const prefix of ['', 'a', 'abc', '\r', '\r\n', 'x'.repeat(128)]) {
      const text = `${prefix}${boundary}abc\r\nz`
      cases.push({ patterns: ['a', 'abc', '\r', '\n', '\r\n', boundary, `a${boundary}`, boundary], text })
    }
  }
  let seed = 0xC0FFEE
  const integer = (max: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % max
  }
  const alphabet = ['a', 'b', 'c', '猫', '😀', 'e', '\u0301', 'é', '👨‍👩‍👧‍👦', '👍🏽', '\r', '\n', '🇨', '🇳', '\u0600', '\u200D', '\uFE0F', '\uD800', '\uDC00']
  const word = (length: number) => Array.from({ length }, () => alphabet[integer(alphabet.length)]).join('')
  for (let i = 0; i < 1000; i++) {
    const patterns = Array.from({ length: integer(12) }, () => word(1 + integer(5)))
    if (patterns.length) {
      patterns.push(patterns[0])
    }
    cases.push({ patterns, text: word(integer(30)) + patterns.slice(0, 3).join('') })
  }
  return cases
}

/** No test-runner dependency: execute this same reference in real browsers. */
export function verifyCases(Constructor: typeof AhoCorasick, cases: ContractCase[]): number {
  function equal(actual: unknown, expected: unknown, label: string) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`)
    }
  }
  for (const [trial, { patterns, text }] of cases.entries()) {
    const matcher = new Constructor(patterns.map((pattern, data) => ({ pattern, data })))
    const all = naive(text, patterns, 'all')
    equal(matcher.count(text), all.length, `count ${trial}`)
    equal(matcher.match(text), all.length > 0, `match ${trial}`)
    for (const strategy of ['all', 'leftmost-first', 'leftmost-longest'] as const) {
      const expected = strategy === 'all' ? all : naive(text, patterns, strategy)
      equal(matcher.search(text, { strategy }), expected, `search ${strategy} ${trial}`)
      equal([...matcher.iterate(text, { strategy })], expected, `iterate ${strategy} ${trial}`)
      for (const match of expected) {
        equal(text.slice(match.start, match.end), match.pattern, `slice ${trial}`)
      }
      if (strategy !== 'all') {
        let replaced = text
        for (const match of [...expected].reverse()) {
          replaced = `${replaced.slice(0, match.start)}X${replaced.slice(match.end)}`
        }
        equal(matcher.replace(text, 'X', { strategy }), replaced, `replace ${strategy} ${trial}`)
      }
    }
  }
  const data = { id: 1 }
  const entry = { pattern: 'a', data }
  const matcher = new Constructor([entry, 'ab', 'a'])
  entry.pattern = 'b'
  const a = matcher.iterate('ababa')
  const b = matcher.iterate('aba')
  const first = a.next().value!
  if (first.data !== data) {
    throw new Error('metadata identity')
  }
  first.end = 999
  a.return?.()
  equal([...b], matcher.search('aba'), 'independent iterators')
  equal(matcher.replace('ab', (match, original) => {
    match.start = 999
    match.end = 999
    equal(matcher.match(original), true, 'reentrant query')
    return 'X'
  }), 'X', 'replacement mutation')
  for (const method of ['search', 'iterate', 'match', 'count'] as const) {
    let rejected = false
    try {
      matcher[method](null as unknown as string)
    }
    catch (error) {
      rejected = error instanceof TypeError
    }
    equal(rejected, true, `immediate validation ${method}`)
  }
  return cases.length
}
