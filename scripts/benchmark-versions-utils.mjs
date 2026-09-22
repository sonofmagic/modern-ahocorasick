import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const order = (a, b) => a.end - b.end || b.pattern.length - a.pattern.length || a.patternIndex - b.patternIndex
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Independent substring oracle: only accept original grapheme boundaries. */
export function reference(patterns, text) {
  const boundaries = new Set(Array.from(segmenter.segment(text), item => item.index))
  boundaries.add(text.length)
  const matches = []
  for (const [patternIndex, pattern] of patterns.entries()) {
    assert.ok(pattern.length > 0, 'Benchmark patterns must be nonempty')
    for (let start = text.indexOf(pattern); start !== -1; start = text.indexOf(pattern, start + 1)) {
      const end = start + pattern.length
      if (boundaries.has(start) && boundaries.has(end)) {
        matches.push({ pattern, patternIndex, start, end, data: undefined })
      }
    }
  }
  return matches.sort(order)
}

/** Preserve actual multiplicity; never expand a missing duplicate into a hit. */
export function normalizer(variant, patterns) {
  if (variant === 'current') {
    return result => result
  }
  const indices = new Map()
  patterns.forEach((pattern, index) => {
    if (!indices.has(pattern)) {
      indices.set(pattern, [])
    }
    indices.get(pattern).push(index)
  })
  return (groups, text) => {
    // This per-query segmentation is part of normalizedSearch's measured cost.
    const ends = variant === 'v2'
      ? Array.from(segmenter.segment(text), item => item.index + item.segment.length)
      : undefined
    const matches = []
    for (const [last, words] of groups) {
      const end = ends === undefined ? last + 1 : ends[last]
      assert.ok(Number.isInteger(end), 'Invalid historical end index')
      const used = new Map()
      for (const pattern of words) {
        const occurrence = used.get(pattern) ?? 0
        const patternIndex = indices.get(pattern)?.[occurrence]
        assert.notEqual(patternIndex, undefined, 'Unexpected or excess historical keyword')
        used.set(pattern, occurrence + 1)
        matches.push({ pattern, patternIndex, start: end - pattern.length, end, data: undefined })
      }
    }
    return matches
  }
}

export function compare(actual, expected, presence) {
  const sorted = [...actual].sort(order)
  const actualDigest = digest(sorted)
  const expectedDigest = digest(expected)
  const correct = actualDigest === expectedDigest && presence === (expected.length > 0)
  const key = hit => JSON.stringify([hit.pattern, hit.patternIndex, hit.start, hit.end])
  const expectedKeys = new Set(expected.map(key))
  const actualKeys = new Set(sorted.map(key))
  return {
    correct,
    actualCount: sorted.length,
    expectedCount: expected.length,
    presence,
    expectedPresence: expected.length > 0,
    actualDigest,
    expectedDigest,
    missingExamples: expected.filter(hit => !actualKeys.has(key(hit))).slice(0, 3),
    extraExamples: sorted.filter(hit => !expectedKeys.has(key(hit))).slice(0, 3),
  }
}

export const scenarios = {
  // Baselines include this deliberately small corpus so empty dictionaries do
  // not disappear behind the larger construction and scanning fixtures.
  'empty-dictionary': { patterns: [], text: 'empty dictionaries still scan ordinary ASCII text. '.repeat(400) },
  'tiny-no-match': { patterns: ['needle'], text: 'haystack only' },
  // Plain ASCII text keeps the scanner on its cheapest grapheme path without
  // making root fan-out the dominant variable.
  'ascii-fast': {
    patterns: ['a', 'ab', 'abc', 'cat', 'dog', 'needle', 'foo-bar'],
    text: Array.from({ length: 12000 }, (_, i) => ['a', 'ab', 'abc', 'cat', 'dog', 'ordinary', 'text'][i % 7]).join(' '),
  },
  'ordinary': {
    patterns: Array.from({ length: 200 }, (_, i) => `word${i}`),
    text: Array.from({ length: 2000 }, (_, i) => `line word${i % 200} end`).join(' '),
  },
  'sparse': { patterns: Array.from({ length: 500 }, (_, i) => `keyword-${i}`), text: 'ordinary text with no dictionary hits. '.repeat(1200) },
  'shared-prefix': {
    patterns: Array.from({ length: 1000 }, (_, i) => `common-prefix-${i}-suffix`),
    text: Array.from({ length: 1000 }, (_, i) => `common-prefix-${i}-suffix`).join(' '),
  },
  // Root fan-out is intentionally wide while each pattern stays short. This
  // distinguishes root transition lookup from the shared-prefix benchmark.
  'ascii-fanout': {
    patterns: Array.from({ length: 256 }, (_, i) => `k${i.toString(16).padStart(2, '0')}`),
    text: Array.from({ length: 6000 }, (_, i) => `k${(i % 256).toString(16).padStart(2, '0')}`).join(' '),
  },
  // Long failure links with a final miss exercise fallback traversal without
  // allocating a large result set for the final character.
  'fail-chain': {
    patterns: Array.from({ length: 64 }, (_, i) => 'a'.repeat(i + 1)),
    text: `${'a'.repeat(1200)}b${'x'.repeat(1200)}`,
  },
  'dense-suffix': { patterns: Array.from({ length: 96 }, (_, i) => 'a'.repeat(i + 1)), text: 'a'.repeat(1000) },
  'duplicates': { patterns: Array.from({ length: 200 }, (_, i) => `word${i % 10}`), text: 'word0 word1 word9 '.repeat(1000) },
  'early-hit': { patterns: ['needle'], text: `needle${'ordinary text '.repeat(10000)}` },
  'late-hit': { patterns: ['needle'], text: `${'ordinary text '.repeat(10000)}needle` },
  'large-dictionary': {
    patterns: Array.from({ length: 10000 }, (_, i) => `keyword-${i}-end`),
    text: Array.from({ length: 2000 }, (_, i) => `keyword-${i * 7 % 10000}-end`).join(' '),
  },
  'long-text': { patterns: ['cat', 'dog', 'bird', 'cat dog'], text: 'cat dog bird ordinary text. '.repeat(20000) },
  // Keep ASCII hits alongside grapheme-sensitive patterns. v1 is expected to
  // miss the emoji and ZWJ entries; v2 and current must remain fully correct.
  'mixed-ascii-unicode': {
    unicode: true,
    expectedV1Mismatch: true,
    patterns: ['cat', 'dog', '😀', 'e\u0301', '👩‍👩‍👧‍👦', 'a', 'abc'],
    text: 'cat a abc 😀 e\u0301 👩‍👩‍👧‍👦 dog '.repeat(2500),
  },
  // Duplicate nested suffixes make output cardinality and ordering visible
  // without relying on a historical grouped-result representation.
  'nested-duplicates': {
    patterns: ['a', 'aa', 'aaa', 'aaaa', 'a', 'aa', 'aaa', 'aaaa'],
    text: 'a'.repeat(700),
  },
  'chinese': { unicode: true, patterns: ['猫', '中文', '文', '词条'], text: '猫 中文词条 测试文本 '.repeat(3000) },
  'emoji': { unicode: true, expectedV1Mismatch: true, patterns: ['😀', '😺'], text: '😀 😺 '.repeat(3000) },
  'zwj': { unicode: true, expectedV1Mismatch: true, patterns: ['👨', '👩', '👨‍👩‍👧‍👦'], text: '👨‍👩‍👧‍👦 '.repeat(2000) },
  'combining': { unicode: true, expectedV1Mismatch: true, patterns: ['e', 'e\u0301', '\u0301', 'é'], text: 'e\u0301 é '.repeat(4000) },
  'crlf': { unicode: true, expectedV1Mismatch: true, patterns: ['a', '\r', '\n', '\r\n', 'a\r\nb'], text: 'a\r\nb '.repeat(4000) },
}

export function selection(value, choices, label) {
  const selected = value === undefined ? choices : value.split(',')
  assert.ok(selected.length > 0 && new Set(selected).size === selected.length && selected.every(item => choices.includes(item)), `Invalid ${label}`)
  return selected
}
