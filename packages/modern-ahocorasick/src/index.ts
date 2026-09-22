import type { CompactAutomaton } from './internal.js'
import type { Boundary as WordBoundary } from './options.js'
import type { Backend, Profile } from './runtime.js'
import type { Boundary, CompileStats, DeserializeOptions, Match, MatcherOptions, MatchStrategy, MatchStream, PatternInput, QueryOptions, Replacement, ReplaceOptions, SearchOptions, SerializeOptions, StreamOptions, Token } from './types.js'
import { advanceCompact, asciiPrefix, buildAutomaton, compactAutomaton, graphemeRuns } from './internal.js'
import { createStream } from './legacy-stream.js'
import { assertStreamRange, assertText, resolveBoundary, resolveQuery, resolveStrategy } from './options.js'
import { deserialize, serialize } from './persistence.js'
import { compactBackend, createScanner, getProfile, operationReplacement, registerScanner, resolveCharacterBoundary, scanText, selectLongest } from './runtime.js'
import { createMatchStream } from './stream.js'

export type { Boundary, BoundaryContext, BoundaryOptions, CompileStats, DeserializeOptions, JsonValue, Match, Matcher, MatcherOptions, MatchStrategy, MatchStream, PatternInput, QueryOptions, Replacement, ReplaceOptions, SearchOptions, SerializeOptions, StreamOptions, Token } from './types.js'

interface Pattern<T> {
  pattern: string
  data: T | undefined
}

/** An immutable compiled dictionary for exact grapheme-cluster matching. */
export default class AhoCorasick<T = unknown> {
  readonly #boundary: Boundary
  readonly #profile: Profile
  readonly #generalScan: boolean
  #stats: CompileStats
  #backend: Backend
  #nodes: CompactAutomaton
  #patterns: Pattern<T>[]
  #maxLength: number
  /** Pattern lengths in graphemes; string.length and public ranges use UTF-16. */
  #lengths: Uint32Array
  #counts: Uint32Array
  #order: Uint32Array
  readonly #segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

  constructor(patterns: readonly PatternInput<T>[], options?: MatcherOptions) {
    this.#boundary = resolveCharacterBoundary(options)
    this.#profile = getProfile(new.target)
    this.#generalScan = this.#boundary !== 'none' || !!this.#profile.units || !!this.#profile.backend
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
    const { nodes, lengths, counts, order, maxLength } = buildAutomaton(this.#patterns, this.#segmenter, this.#profile.units)
    this.#nodes = compactAutomaton(this.#profile.backend ? [{ next: new Map(), failure: 0, output: -1, terminals: [] }] : nodes, this.#profile.backend ? 0 : this.#patterns.length)
    this.#backend = this.#profile.backend ? this.#profile.backend(nodes) : compactBackend(this.#nodes)
    this.#lengths = lengths
    this.#counts = counts
    this.#order = order
    this.#maxLength = maxLength
    this.#stats = this.#compileStats()
    registerScanner(this, (strategy, range) => createScanner(this.#backend, this.#patterns, this.#lengths, this.#maxLength, this.#boundary, this.#profile.units, strategy, range))
  }

  #compileStats(): CompileStats {
    const layout = this.#backend.stats
    // The compact placeholder remains allocated for DAT matchers as well.
    const placeholderBytes = this.#profile.backend ? compactBackend(this.#nodes).stats.typedArrayBytes : 0
    return Object.freeze({
      ...layout,
      patternCount: this.#patterns.length,
      maxPatternUnits: this.#maxLength,
      unit: this.#profile.units ? 'folded-codepoint' : 'grapheme',
      typedArrayBytes: layout.typedArrayBytes + placeholderBytes + this.#lengths.byteLength + this.#counts.byteLength + this.#order.byteLength,
    })
  }

  /** Constant-time immutable diagnostics; byte count excludes JS heap objects. */
  getStats(): CompileStats {
    return this.#stats
  }

  /** Incremental matching with absolute original-text UTF-16 ranges. */
  createStream(options?: StreamOptions): MatchStream<T> {
    const strategy = resolveStrategy(options, 'all')
    if (strategy === 'longest-first') {
      throw new TypeError('longest-first requires complete input')
    }
    resolveBoundary('', options)
    assertStreamRange(options)
    const maxBufferedUnits = options?.maxBufferedUnits === undefined ? 1_048_576 : options.maxBufferedUnits
    if (!Number.isSafeInteger(maxBufferedUnits) || maxBufferedUnits < 1) {
      throw new RangeError('maxBufferedUnits must be a positive safe integer')
    }
    if (this.#generalScan) {
      const handle = createMatchStream(this, { ...options, strategy, maxBufferLength: maxBufferedUnits })
      let closed = false
      const assertOpen = () => {
        if (closed) {
          throw new Error('Stream is finished or cancelled')
        }
      }
      return {
        write: (chunk) => {
          assertOpen()
          return handle.write(chunk)
        },
        finish: () => {
          assertOpen()
          closed = true
          return handle.end()
        },
        cancel: () => {
          closed = true
          handle.destroy()
        },
      }
    }
    const wordSegmenter = options?.wholeWord ? new Intl.Segmenter(options.locale, { granularity: 'word' }) : undefined
    return createStream(this.#nodes, this.#patterns, this.#lengths, this.#maxLength, strategy, maxBufferedUnits, wordSegmenter)
  }

  /** Persist a versioned compiled dictionary; metadata must be JSON-compatible. */
  serialize(options?: SerializeOptions<T>): string {
    if (this.#profile.units || this.#boundary !== 'none') {
      throw new TypeError('serialize supports exact matchers without constructor boundary rules')
    }
    if (this.#profile.backend) {
      const patterns = this.#patterns.map(({ pattern, data }) => data === undefined ? { pattern } : { pattern, data })
      return new AhoCorasick(patterns).serialize(options)
    }
    return serialize(this.#nodes, this.#patterns, options)
  }

  /** Load and validate scan tables without rebuilding a trie. */
  static deserialize<T = unknown>(serialized: string, options?: DeserializeOptions<T>): AhoCorasick<T> {
    const matcher = new AhoCorasick<T>([])
    const restored = deserialize(serialized, matcher.#segmenter, options)
    matcher.#nodes = restored.table
    matcher.#backend = compactBackend(restored.table)
    matcher.#patterns = restored.patterns
    matcher.#lengths = restored.lengths
    matcher.#counts = restored.counts
    matcher.#order = restored.order
    matcher.#maxLength = restored.maxLength
    matcher.#stats = matcher.#compileStats()
    return matcher
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
    const boundary = options === undefined ? undefined : resolveQuery(text, options, this.#segmenter)
    return this.#iterate(text, strategy, boundary)
  }

  /** Reuse validated original-context filters; counting must not rebuild them. */
  #iterate(text: string, strategy: MatchStrategy, boundary: WordBoundary): IterableIterator<Match<T>> {
    if (strategy === 'longest-first') {
      return selectLongest(this.#iterate(text, 'all', boundary), text, this.#segmenter)
    }
    if (this.#generalScan) {
      return scanText(text, this.#segmenter, createScanner(this.#backend, this.#patterns, this.#lengths, this.#maxLength, this.#boundary, this.#profile.units, strategy, boundary))
    }
    return strategy === 'all' ? this.#scan(text, boundary) : this.#select(text, strategy, boundary)
  }

  /** Count all occurrences, including overlaps and duplicate dictionary entries. */
  count(text: string, options?: QueryOptions): number {
    assertText(text)
    const boundary = options === undefined ? undefined : resolveQuery(text, options, this.#segmenter)
    if (boundary || this.#generalScan) {
      return this.#countMatches(this.#iterate(text, 'all', boundary))
    }
    if (this.#patterns.length === 0) {
      return 0
    }
    let state = 0
    let count = 0
    const ascii = asciiPrefix(text)
    if (ascii !== undefined) {
      for (const { segment } of ascii) {
        state = advanceCompact(this.#nodes, state, segment)
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
      state = advanceCompact(this.#nodes, state, segment)
      count += this.#counts[state]
      if (!Number.isSafeInteger(count)) {
        throw new RangeError('match count exceeds Number.MAX_SAFE_INTEGER')
      }
    }
    return count
  }

  #countMatches(matches: Iterable<Match<T>>): number {
    let count = 0
    for (const _match of matches) {
      if (!Number.isSafeInteger(++count)) {
        throw new RangeError('match count exceeds Number.MAX_SAFE_INTEGER')
      }
    }
    return count
  }

  /** Count occurrences per input pattern without enumerating individual hits. */
  countByPattern(text: string, options?: QueryOptions): number[] {
    assertText(text)
    const boundary = options === undefined ? undefined : resolveQuery(text, options, this.#segmenter)
    const result = Array.from<number>({ length: this.#patterns.length }).fill(0)
    if (text.length === 0 || result.length === 0) {
      return result
    }
    if (boundary || this.#generalScan) {
      for (const match of this.#iterate(text, 'all', boundary)) {
        result[match.patternIndex]++
      }
      return result
    }
    const visits = new Float64Array(this.#nodes.failures.length)
    let state = 0
    for (const segments of graphemeRuns(text, this.#segmenter)) {
      for (const { segment } of segments) {
        state = advanceCompact(this.#nodes, state, segment)
        visits[state]++
      }
    }
    // Children precede their failure ancestors in reverse breadth-first order.
    // Each pattern occurs at most text.length times, so its count stays exact.
    for (let index = this.#order.length - 1; index >= 0; index--) {
      const current = this.#order[index]
      for (let index = this.#nodes.terminals[current]; index < this.#nodes.terminals[current + 1]; index++) {
        result[this.#nodes.patterns[index]] = visits[current]
      }
      visits[this.#nodes.failures[current]] += visits[current]
    }
    return result
  }

  /** Stop scanning as soon as a match is found. */
  match(text: string, options?: QueryOptions): boolean {
    assertText(text)
    const boundary = options === undefined ? undefined : resolveQuery(text, options, this.#segmenter)
    if (boundary || this.#generalScan) {
      const iterator = this.#iterate(text, 'all', boundary)
      const found = !iterator.next().done
      iterator.return?.()
      return found
    }
    if (this.#patterns.length === 0) {
      return false
    }
    let state = 0
    const ascii = asciiPrefix(text)
    if (ascii !== undefined) {
      for (const { segment } of ascii) {
        state = advanceCompact(this.#nodes, state, segment)
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
      state = advanceCompact(this.#nodes, state, segment)
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
    replacement = operationReplacement(replacement)
    const selected = this.iterate(text, { ...options, strategy })
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

  /** Partition original text into non-empty literal and selected match tokens. */
  tokenize(text: string, options?: ReplaceOptions): Token<T>[] {
    assertText(text)
    const strategy = resolveStrategy(options, 'leftmost-longest')
    if (strategy === 'all') {
      throw new TypeError('tokenize requires a non-overlapping strategy')
    }
    const tokens: Token<T>[] = []
    let cursor = 0
    for (const match of this.iterate(text, { ...options, strategy })) {
      if (cursor < match.start) {
        tokens.push({ type: 'text', text: text.slice(cursor, match.start), start: cursor, end: match.start })
      }
      tokens.push({ type: 'match', text: text.slice(match.start, match.end), start: match.start, end: match.end, match })
      cursor = match.end
    }
    if (cursor < text.length) {
      tokens.push({ type: 'text', text: text.slice(cursor), start: cursor, end: text.length })
    }
    return tokens
  }

  * #scan(text: string, boundary?: WordBoundary): Generator<Match<T>> {
    if (this.#patterns.length === 0) {
      return
    }
    let state = 0
    for (const { segment, index } of this.#segmenter.segment(text)) {
      state = advanceCompact(this.#nodes, state, segment)
      if (this.#counts[state] === 0) {
        continue
      }
      const end = index + segment.length
      // Own terminals are longest, followed by progressively shorter suffixes.
      for (let output = state; output !== -1; output = this.#nodes.outputs[output]) {
        for (let terminal = this.#nodes.terminals[output]; terminal < this.#nodes.terminals[output + 1]; terminal++) {
          const patternIndex = this.#nodes.patterns[terminal]
          const { pattern, data } = this.#patterns[patternIndex]
          const start = end - pattern.length
          if (!boundary || boundary(start, end)) {
            yield { pattern, patternIndex, start, end, data }
          }
        }
      }
    }
  }

  * #select(text: string, strategy: Exclude<MatchStrategy, 'all' | 'longest-first'>, boundary?: WordBoundary): Generator<Match<T>> {
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
    let earliest = -1
    let earliestEnd = -1
    for (const { segment, index } of this.#segmenter.segment(text)) {
      state = advanceCompact(this.#nodes, state, segment)
      position++
      if (this.#counts[state] === 0 && cursor > lastCandidateStart) {
        continue
      }
      if (cursor > lastCandidateStart) {
        // Defer empty-window advancement until a candidate actually arrives.
        cursor = Math.max(cursor, position - capacity)
      }
      const end = index + segment.length
      for (let output = this.#counts[state] === 0 ? -1 : state; output !== -1; output = this.#nodes.outputs[output]) {
        const terminal = this.#nodes.terminals[output]
        if (terminal === this.#nodes.terminals[output + 1]) {
          continue
        }
        // Identical patterns share a terminal; input order wins every tie.
        const patternIndex = this.#nodes.patterns[terminal]
        const pattern = this.#patterns[patternIndex]
        if (boundary && !boundary(end - pattern.pattern.length, end)) {
          continue
        }
        const length = this.#lengths[patternIndex]
        const start = position - length
        if (start < cursor || (start > earliest && start < earliestEnd)) {
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
        if (earliest === -1 || start < earliest) {
          earliest = start
        }
        if (start === earliest) {
          earliestEnd = start + this.#lengths[candidates[slot]]
        }
        // Later outputs begin inside this earliest candidate. Any future
        // candidate that displaces it ends at least as late, so these suffixes
        // can never be selected. Do not enumerate them or their duplicates.
        if (earliestEnd === position) {
          break
        }
      }
      // No future match can start here once the longest pattern would have ended.
      while (cursor <= position) {
        if (cursor > position - capacity
          && !(strategy === 'leftmost-first' && earliest === cursor && candidates[cursor % capacity] === 0)) {
          break
        }
        const slot = cursor % capacity
        if (stamps[slot] === cursor) {
          const patternIndex = candidates[slot]
          const { pattern, data } = this.#patterns[patternIndex]
          const start = starts[slot]
          cursor += this.#lengths[patternIndex]
          earliest = -1
          earliestEnd = -1
          for (let next = cursor; next <= lastCandidateStart; next++) {
            if (stamps[next % capacity] === next) {
              earliest = next
              earliestEnd = next + this.#lengths[candidates[next % capacity]]
              break
            }
          }
          if (cursor === position) {
            // No future selected match may begin inside an emitted range.
            state = 0
          }
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
