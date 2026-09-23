import FastAhoCorasick from '@/fast'
import AhoCorasick from '@/index'
import { advanceCompact, buildAutomaton } from '@/internal'
import UnicodeAhoCorasick from '@/unicode'
import UnicodeFastAhoCorasick from '@/unicode-fast'

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

it('preserves inserted state IDs, duplicate order and failure suffix outputs', () => {
  const patterns = ['he', 'she', 'hers', 'his', 'he']
  const { compact, counts, lengths, order } = buildAutomaton(patterns.map(pattern => ({ pattern })), segmenter)
  function state(text: string) {
    let state = 0
    for (const { segment } of segmenter.segment(text)) {
      state = advanceCompact(compact, state, segment)
    }
    return state
  }
  expect(['h', 'he', 's', 'sh', 'she', 'her', 'hers', 'hi', 'his'].map(state)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  expect([...compact.patterns.subarray(compact.terminals[2], compact.terminals[3])]).toEqual([0, 4])
  expect(compact.failures[5]).toBe(2)
  expect(compact.outputs[5]).toBe(2)
  expect(counts[5]).toBe(3)
  expect([...lengths]).toEqual([2, 3, 4, 3, 2])
  const positions = new Map([...order].map((state, index) => [state, index]))
  for (const state of order) {
    const failure = compact.failures[state]
    if (failure !== 0) {
      expect(positions.get(failure)!).toBeLessThan(positions.get(state)!)
    }
  }
})

it('grows across numeric blocks and promotes a long single path to a branch', () => {
  const stem = 'a'.repeat(20_000)
  const patterns = [`${stem}x`, `${stem}y`, 'x', `${stem}x`]
  const matcher = new AhoCorasick(patterns)
  const text = `${stem}x`
  expect(matcher.getStats().stateCount).toBe(stem.length + 4)
  expect(matcher.search(text).map(({ patternIndex, start, end }) => [patternIndex, start, end])).toEqual([
    [0, 0, text.length],
    [3, 0, text.length],
    [2, stem.length, text.length],
  ])
  expect(matcher.count(text)).toBe(3)
  expect(matcher.countByPattern(text)).toEqual([1, 0, 1, 1])
  expect(AhoCorasick.deserialize(matcher.serialize()).search(text)).toEqual(matcher.search(text))
})

it.each([16, 32, 64, 128, 256, 512, 1024])('preserves root promotion while growing through %i states', (capacity) => {
  const stem = 'a'.repeat(capacity - 1)
  // Adding b promotes the root at exactly the point where the first numeric
  // block must grow; adding c checks the copied branch reference remains live.
  const matcher = new AhoCorasick([stem, 'b', 'c', `${stem}d`])
  expect(matcher.search('bc').map(hit => hit.patternIndex)).toEqual([1, 2])
  expect(matcher.countByPattern(`${stem}d`)).toEqual([1, 0, 0, 1])
})

it('shares compact compilation with the double-array backend for a wide Unicode trie', () => {
  const patterns = Array.from({ length: 256 }, (_, index) => `${String.fromCodePoint(0x4E00 + index)}xy`)
  patterns.push('xy', patterns[0], patterns[128])
  const text = `${patterns[128]} ${patterns[0]} ${patterns[255]}`
  const compact = new AhoCorasick(patterns)
  const fast = new FastAhoCorasick(patterns)
  expect(fast.search(text)).toEqual(compact.search(text))
  expect(fast.countByPattern(text)).toEqual(compact.countByPattern(text))
  expect(fast.getStats().stateCount).toBe(compact.getStats().stateCount)
})

it.each([
  { name: 'compact', Constructor: AhoCorasick, folded: false },
  { name: 'double-array', Constructor: FastAhoCorasick, folded: false },
  { name: 'Unicode compact', Constructor: UnicodeAhoCorasick, folded: true },
  { name: 'Unicode double-array', Constructor: UnicodeFastAhoCorasick, folded: true },
])('keeps duplicate data and transformed lengths in $name compilation', ({ Constructor, folded }) => {
  const patterns = ['Straße', '猫', 'Straße', 'STRASSE', 'e\u0301', 'e\u0301', '👨‍👩‍👧‍👦', '👨‍👩‍👧‍👦']
    .map((pattern, id) => ({ pattern, data: { id } }))
  const text = 'Straße 猫 e\u0301 👨‍👩‍👧‍👦'
  const matcher = new Constructor(patterns)
  const indices = folded ? [0, 2, 3, 1, 4, 5, 6, 7] : [0, 2, 1, 4, 5, 6, 7]
  const matches = matcher.search(text)
  expect(matches.map(({ patternIndex }) => patternIndex)).toEqual(indices)
  for (const hit of matches) {
    expect(hit.data).toBe(patterns[hit.patternIndex].data)
    expect(hit.pattern).toBe(patterns[hit.patternIndex].pattern)
    expect(text.slice(hit.start, hit.end)).toBe(hit.patternIndex === 3 ? 'Straße' : hit.pattern)
  }
  expect(matcher.count(text)).toBe(indices.length)
  expect(matcher.countByPattern(text)).toEqual([1, 1, 1, folded ? 1 : 0, 1, 1, 1, 1])
  expect(matcher.search(text, { strategy: 'leftmost-longest' }).map(hit => hit.patternIndex)).toEqual([0, 1, 4, 6])
  if (!folded) {
    expect(AhoCorasick.deserialize(matcher.serialize()).search(text)).toEqual(matches)
  }
})

it('preserves duplicate terminal order among hundreds of unique patterns', () => {
  const strings = Array.from({ length: 300 }, (_, index) => `word-${index}-end`)
  strings.push(strings[0], strings[255], strings[256], strings[299])
  const patterns = strings.map((pattern, id) => ({ pattern, data: { id } }))
  const matcher = new AhoCorasick(patterns)
  const text = [strings[256], strings[0], strings[299], strings[255]].join(' ')
  const expected = [256, 302, 0, 300, 299, 303, 255, 301]
  const matches = matcher.search(text)
  expect(matches.map(hit => hit.patternIndex)).toEqual(expected)
  expect(matches.map(hit => hit.data!.id)).toEqual(expected)
  expect(matcher.count(text)).toBe(expected.length)
  expect(matcher.countByPattern(text)).toEqual(strings.map((_, index) => expected.includes(index) ? 1 : 0))
  expect(AhoCorasick.deserialize(matcher.serialize()).search(text)).toEqual(matches)
})

it('loads the previous compact schema with its original alphabet numbering', () => {
  // Captured before numeric-builder compilation: symbol IDs were assigned by
  // state traversal, rather than their first occurrence in the dictionary.
  const fixture = { format: 'modern-ahocorasick', version: 1, segmentation: 'Intl.Segmenter:grapheme', symbols: ['x', 'a', 'y', 'z'], edges: [0, 3, 4, 4, 5, 5, 5], labels: [0, 1, 2, 2, 3], targets: [1, 3, 5, 2, 4], failures: [0, 0, 5, 0, 0, 0], outputs: [-1, -1, 5, -1, -1, -1], terminals: [0, 0, 0, 2, 2, 3, 4], patternIndices: [0, 3, 1, 2], patterns: [{ pattern: 'xy', data: 'first' }, { pattern: 'az', data: 'second' }, { pattern: 'y', data: 'third' }, { pattern: 'xy', data: 'fourth' }] }
  const restored = AhoCorasick.deserialize(JSON.stringify(fixture))
  const current = new AhoCorasick(fixture.patterns)
  expect(restored.search('xy az y')).toEqual(current.search('xy az y'))
  expect(restored.countByPattern('xy az y')).toEqual([1, 1, 2, 1])
  expect(restored.search('xy').map(hit => hit.data)).toEqual(['first', 'fourth', 'third'])
})
