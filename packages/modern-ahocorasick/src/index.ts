import type { AutomatonNode } from './internal.js'
import type { Match, MatchStrategy, PatternInput, Replacement, ReplaceOptions, SearchOptions } from './types.js'
import { advance, asciiPrefix, buildAutomaton } from './internal.js'

export type { Match, MatchStrategy, PatternInput, Replacement, ReplaceOptions, SearchOptions } from './types.js'

interface Pattern<T> {
  pattern: string
  data: T | undefined
}

function assertText(text: string): void {
  if (typeof text !== 'string') {
    throw new TypeError('text must be a string')
  }
}

function resolveStrategy(options: SearchOptions | undefined, fallback: MatchStrategy): MatchStrategy {
  if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) {
    throw new TypeError('options must be an object')
  }
  const strategy = options?.strategy === undefined ? fallback : options.strategy
  if (strategy !== 'all' && strategy !== 'leftmost-first' && strategy !== 'leftmost-longest') {
    throw new TypeError(`Unknown match strategy: ${String(strategy)}`)
  }
  return strategy
}

/** An immutable compiled dictionary for exact grapheme-cluster matching. */
export default class AhoCorasick<T = unknown> {
  readonly #nodes: AutomatonNode[]
  readonly #patterns: Pattern<T>[]
  readonly #maxLength: number
  /** Pattern lengths in graphemes; string.length and public ranges use UTF-16. */
  readonly #lengths: Uint32Array
  readonly #counts: Uint32Array
  readonly #segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

  constructor(patterns: readonly PatternInput<T>[]) {
    if (!Array.isArray(patterns)) {
      throw new TypeError('patterns must be an array')
    }
    this.#patterns = Array.from(patterns, (input, index) => {
      const pattern = typeof input === 'string'
        ? input
        : input !== null && typeof input === 'object' && !Array.isArray(input)
          ? input.pattern
          : undefined
      if (typeof pattern !== 'string') {
        throw new TypeError(`patterns[${index}].pattern must be a string`)
      }
      if (pattern.length === 0) {
        throw new RangeError(`patterns[${index}] must not be empty`)
      }
      return { pattern, data: typeof input === 'string' ? undefined : input.data }
    })
    const { nodes, lengths, counts, maxLength } = buildAutomaton(this.#patterns, this.#segmenter)
    this.#nodes = nodes
    this.#lengths = lengths
    this.#counts = counts
    this.#maxLength = maxLength
  }

  /** All matches, optionally reduced to a non-overlapping selection. */
  search(text: string, options?: SearchOptions): Match<T>[] {
    const matches: Match<T>[] = []
    for (const match of this.iterate(text, options)) {
      matches.push(match)
    }
    return matches
  }

  /** Lazily emit the chosen strategy's results. Validates arguments immediately. */
  iterate(text: string, options?: SearchOptions): IterableIterator<Match<T>> {
    assertText(text)
    const strategy = resolveStrategy(options, 'all')
    return strategy === 'all' ? this.#scan(text) : this.#select(text, strategy)
  }

  /** Count all occurrences, including overlaps and duplicate dictionary entries. */
  count(text: string): number {
    assertText(text)
    if (this.#patterns.length === 0) {
      return 0
    }
    let state = 0
    let count = 0
    const ascii = asciiPrefix(text)
    if (ascii !== undefined) {
      for (const { segment } of ascii) {
        state = advance(this.#nodes, state, segment)
        count += this.#counts[state]
        if (!Number.isSafeInteger(count)) {
          throw new RangeError('match count exceeds Number.MAX_SAFE_INTEGER')
        }
      }
      if (ascii.position === text.length) {
        return count
      }
    }
    // Keep native iteration at its own call site. Mixing the JS cursor and
    // native iterator in one hot loop penalizes long Unicode suffixes in V8.
    const suffix = ascii === undefined ? text : text.slice(ascii.position)
    for (const { segment } of this.#segmenter.segment(suffix)) {
      state = advance(this.#nodes, state, segment)
      count += this.#counts[state]
      if (!Number.isSafeInteger(count)) {
        throw new RangeError('match count exceeds Number.MAX_SAFE_INTEGER')
      }
    }
    return count
  }

  /** Stop scanning as soon as a match is found. */
  match(text: string): boolean {
    assertText(text)
    if (this.#patterns.length === 0) {
      return false
    }
    let state = 0
    const ascii = asciiPrefix(text)
    if (ascii !== undefined) {
      for (const { segment } of ascii) {
        state = advance(this.#nodes, state, segment)
        if (this.#counts[state] !== 0) {
          return true
        }
      }
      if (ascii.position === text.length) {
        return false
      }
    }
    const suffix = ascii === undefined ? text : text.slice(ascii.position)
    for (const { segment } of this.#segmenter.segment(suffix)) {
      state = advance(this.#nodes, state, segment)
      if (this.#counts[state] !== 0) {
        return true
      }
    }
    return false
  }

  /** Replace selected original ranges once; replacement strings are literal. */
  replace(text: string, replacement: Replacement<T>, options?: ReplaceOptions): string {
    assertText(text)
    if (typeof replacement !== 'string' && typeof replacement !== 'function') {
      throw new TypeError('replacement must be a string or a function')
    }
    const strategy = resolveStrategy(options, 'leftmost-longest')
    if (strategy === 'all') {
      throw new TypeError('replace requires a non-overlapping strategy')
    }
    const selected = this.#select(text, strategy)
    const parts: string[] = []
    let cursor = 0
    for (const match of selected) {
      // Capture ranges before calling user code, which may mutate its match object.
      const { start, end } = match
      const value = typeof replacement === 'string' ? replacement : replacement(match, text.slice(start, end))
      if (typeof value !== 'string') {
        throw new TypeError('replacement callback must return a string')
      }
      parts.push(text.slice(cursor, start), value)
      cursor = end
    }
    parts.push(text.slice(cursor))
    return parts.join('')
  }

  * #scan(text: string): Generator<Match<T>> {
    if (this.#patterns.length === 0) {
      return
    }
    let state = 0
    for (const { segment, index } of this.#segmenter.segment(text)) {
      state = advance(this.#nodes, state, segment)
      if (this.#counts[state] === 0) {
        continue
      }
      const end = index + segment.length
      // Own terminals are longest, followed by progressively shorter suffixes.
      for (let output = state; output !== -1; output = this.#nodes[output].output) {
        for (const patternIndex of this.#nodes[output].terminals) {
          const { pattern, data } = this.#patterns[patternIndex]
          yield { pattern, patternIndex, start: end - pattern.length, end, data }
        }
      }
    }
  }

  * #select(text: string, strategy: Exclude<MatchStrategy, 'all'>): Generator<Match<T>> {
    const capacity = this.#maxLength
    if (capacity === 0) {
      return
    }
    // One numeric candidate per possible start, never one object per occurrence.
    // Stamps distinguish reused ring slots, including slots skipped by a winner.
    const stamps: number[] = []
    const candidates: number[] = []
    const starts: number[] = []
    let state = 0
    let position = 0
    let cursor = 0
    let lastCandidateStart = -1
    for (const { segment, index } of this.#segmenter.segment(text)) {
      state = advance(this.#nodes, state, segment)
      position++
      if (this.#counts[state] === 0 && cursor > lastCandidateStart) {
        continue
      }
      if (cursor > lastCandidateStart) {
        // Defer empty-window advancement until a candidate actually arrives.
        cursor = Math.max(cursor, position - capacity)
      }
      const end = index + segment.length
      for (let output = this.#counts[state] === 0 ? -1 : state; output !== -1; output = this.#nodes[output].output) {
        for (const patternIndex of this.#nodes[output].terminals) {
          const pattern = this.#patterns[patternIndex]
          const length = this.#lengths[patternIndex]
          const start = position - length
          if (start < cursor) {
            continue
          }
          lastCandidateStart = Math.max(lastCandidateStart, start)
          const slot = start % capacity
          const previous = candidates[slot]
          if (stamps[slot] !== start
            || (strategy === 'leftmost-first'
              ? patternIndex < previous
              : length > this.#lengths[previous]
                || (length === this.#lengths[previous] && patternIndex < previous))) {
            stamps[slot] = start
            candidates[slot] = patternIndex
            starts[slot] = end - pattern.pattern.length
          }
        }
      }
      // No future match can start here once the longest pattern would have ended.
      while (cursor <= position - capacity) {
        const slot = cursor % capacity
        if (stamps[slot] === cursor) {
          const patternIndex = candidates[slot]
          const { pattern, data } = this.#patterns[patternIndex]
          const start = starts[slot]
          cursor += this.#lengths[patternIndex]
          yield { pattern, patternIndex, start, end: start + pattern.length, data }
        }
        else {
          cursor++
        }
      }
    }
    // End of input settles every remaining candidate without further lookahead.
    while (cursor <= lastCandidateStart) {
      const slot = cursor % capacity
      if (stamps[slot] === cursor) {
        const patternIndex = candidates[slot]
        const { pattern, data } = this.#patterns[patternIndex]
        const start = starts[slot]
        cursor += this.#lengths[patternIndex]
        yield { pattern, patternIndex, start, end: start + pattern.length, data }
      }
      else {
        cursor++
      }
    }
  }
}
