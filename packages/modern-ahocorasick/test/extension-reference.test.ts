import type { Match } from '../src/types'
import { readFileSync } from 'node:fs'
import FastAhoCorasick from '../src/fast'
import AhoCorasick from '../src/index'
import { iterateChunks } from '../src/stream'
import UnicodeAhoCorasick from '../src/unicode'
import UnicodeFastAhoCorasick from '../src/unicode-fast'
// Independent oracle: compare every original grapheme-delimited substring.
const official = new Map<string, string>()
for (const line of readFileSync(new URL('./fixtures/CaseFolding-17.0.0.txt', import.meta.url), 'utf8').split('\n')) {
  const [point, status, mapping] = line.split('#')[0].split(';').map(value => value.trim())
  if (status === 'C' || status === 'F') {
    official.set(String.fromCodePoint(Number.parseInt(point, 16)), String.fromCodePoint(...mapping.split(' ').map(value => Number.parseInt(value, 16))))
  }
}
const fold = (text: string) => Array.from(text, character => official.get(character) ?? character).join('')
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
it('checks all backends and strategies against an independent substring oracle', () => {
  let seed = 29137
  const random = (bound: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % bound
  }
  const alphabet = ['a', 'A', 'b', 'ß', 's', 'S', 'İ', 'i\u0307', 'Σ', 'ς', '猫', '👨‍👩‍👧‍👦', ' ', '-', '\r\n']
  const word = (size: number) => Array.from({ length: size }, () => alphabet[random(alphabet.length)]).join('')
  for (let trial = 0; trial < 80; trial++) {
    const text = word(12)
    const patterns = Array.from({ length: 8 }, () => word(random(3) + 1))
    const segments = Array.from(segmenter.segment(text))
    const offsets = [...segments.map(segment => segment.index), text.length]
    for (const Constructor of [AhoCorasick, FastAhoCorasick, UnicodeAhoCorasick, UnicodeFastAhoCorasick]) {
      const folded = Constructor === UnicodeAhoCorasick || Constructor === UnicodeFastAhoCorasick
      const transform = folded ? fold : (text: string) => text
      for (const boundary of ['none', 'ascii', 'unicode'] as const) {
        const matcher = new Constructor(patterns, { boundary })
        const hits: {
          match: Match
          length: number
        }[] = []
        const isWord = (value: string) => boundary === 'ascii' ? /^[a-z0-9]/i.test(value) : /[\p{L}\p{N}\p{M}_]/u.test(value)
        for (let start = 0; start < segments.length; start++) {
          for (let end = start + 1; end <= segments.length; end++) {
            if (boundary !== 'none' && ((start > 0 && isWord(segments[start - 1].segment)) || (end < segments.length && isWord(segments[end].segment)))) {
              continue
            }
            for (const [patternIndex, pattern] of patterns.entries()) {
              if (transform(text.slice(offsets[start], offsets[end])) === transform(pattern)) {
                hits.push({ length: end - start, match: { pattern, patternIndex, start: offsets[start], end: offsets[end], data: undefined } })
              }
            }
          }
        }
        const all = [...hits].sort((a, b) => a.match.end - b.match.end || b.length - a.length || a.match.patternIndex - b.match.patternIndex).map(hit => hit.match)
        expect(matcher.search(text)).toEqual(all)
        expect(matcher.count(text)).toBe(all.length)
        expect(matcher.match(text)).toBe(all.length > 0)
        for (const strategy of ['leftmost-first', 'leftmost-longest', 'longest-first'] as const) {
          const sorted = [...hits].sort((a, b) => strategy === 'longest-first'
            ? b.length - a.length || a.match.start - b.match.start || a.match.patternIndex - b.match.patternIndex
            : a.match.start - b.match.start || (strategy === 'leftmost-longest' ? b.length - a.length : 0) || a.match.patternIndex - b.match.patternIndex)
          const selected: Match[] = []
          for (const { match } of sorted) {
            if (!selected.some(other => match.start < other.end && match.end > other.start)) {
              selected.push(match)
            }
          }
          selected.sort((a, b) => a.start - b.start)
          expect(matcher.search(text, { strategy })).toEqual(selected)
          if (strategy !== 'longest-first') {
            const chunks: string[] = []
            for (let i = 0; i < text.length;) {
              const next = i + random(5) + 1
              chunks.push(text.slice(i, next))
              i = next
            }
            expect([...iterateChunks(matcher, chunks, { strategy })]).toEqual(selected)
          }
        }
      }
    }
  }
})
