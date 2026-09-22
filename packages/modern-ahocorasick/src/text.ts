import type { StreamHandle, StreamOptions, TokenStreamHandle, TokenStreamOptions } from './stream.js'
import type { DeserializeOptions, Match, MatchStream, PatternInput, QueryOptions, Replacement, ReplaceOptions, SearchOptions, SerializeOptions, Token } from './types.js'
import { caseFold } from './case-folding.js'
import AhoCorasick from './index.js'
import { assertText, resolveQuery, resolveStrategy } from './options.js'
import { operationReplacement, selectLongest } from './runtime.js'
import { createMatchStream } from './stream.js'

export type { AsyncReplacement, StreamOptions, TokenStreamHandle, TokenStreamOptions } from './stream.js'
export type { BoundaryOptions, Match, PatternInput, QueryOptions, Replacement, ReplaceOptions, SearchOptions, Token } from './types.js'

export interface TextOptions {
  normalization?: 'NFC' | 'NFD' | 'NFKC' | 'NFKD'
  /** Full Unicode 17 case folding; 'turkic' overrides I and İ. */
  caseFold?: boolean | 'turkic'
}

export interface TextDeserializeOptions<T> extends DeserializeOptions<T> { }
export interface TextSerializeOptions<T> extends SerializeOptions<T> { }

function assertJson(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) {
    return
  }
  if (typeof value !== 'object' || seen.has(value)
    || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || typeof (value as { toJSON?: unknown }).toJSON === 'function'
    || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError('Metadata must be JSON-compatible; provide an encodeData codec')
  }
  seen.add(value)
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    assertJson(item, seen)
  }
  seen.delete(value)
}

interface TextStreamState<T> {
  readonly stream: StreamHandle<Match<T>>
  readonly offsets: Map<number, number>
  readonly patterns: readonly { pattern: string, data: T | undefined }[]
  readonly segmenter: Intl.Segmenter
  readonly transform: (source: string) => string
  readonly strategy: Exclude<NonNullable<StreamOptions['strategy']>, 'longest-first'>
  readonly deferSelection: boolean
  readonly matches: Match<T>[]
  pending: string
  raw: string
  originalOffset: number
  transformedOffset: number
  closed: boolean
}

function createTextStreamState<T>(
  matcher: AhoCorasick<unknown>,
  patterns: readonly { pattern: string, data: T | undefined }[],
  transform: (source: string) => string,
  strategy: Exclude<NonNullable<StreamOptions['strategy']>, 'longest-first'>,
  options?: StreamOptions,
): TextStreamState<T> {
  const state: TextStreamState<T> = {
    // Always retain all transformed candidates. A leftmost strategy can select
    // half of an expansion such as `ß` -> `ss` before the complete grapheme is
    // mapped back to an original range.
    stream: createMatchStream<T>(matcher as AhoCorasick<T>, { ...options, strategy: 'all', wholeWord: false }),
    offsets: new Map([[0, 0]]),
    patterns,
    segmenter: new Intl.Segmenter(undefined, { granularity: 'grapheme' }),
    transform,
    strategy,
    deferSelection: strategy !== 'all' || options?.wholeWord === true,
    matches: [],
    pending: '',
    raw: '',
    originalOffset: 0,
    transformedOffset: 0,
    closed: false,
  }
  return state
}

function mapTextMatches<T>(state: TextStreamState<T>, hits: Match<unknown>[]): Match<T>[] {
  const output: Match<T>[] = []
  for (const hit of hits) {
    const start = state.offsets.get(hit.start)
    const end = state.offsets.get(hit.end)
    // Expanded case-folding and normalization must match complete original
    // graphemes. An unmapped transformed boundary is therefore discarded.
    if (start === undefined || end === undefined) {
      continue
    }
    const original = state.patterns[hit.patternIndex]
    if (!original) {
      continue
    }
    output.push({
      pattern: original.pattern,
      patternIndex: hit.patternIndex,
      start,
      end,
      data: original.data,
    })
  }
  return output
}

function feedTextStream<T>(state: TextStreamState<T>, chunk: string, final: boolean): Match<T>[] {
  state.pending += chunk
  const segments = Array.from(state.segmenter.segment(state.pending))
  const count = final ? segments.length : Math.max(0, segments.length - 3)
  let consumed = 0
  let transformed = ''
  for (let index = 0; index < count; index++) {
    const part = segments[index]
    const value = state.transform(part.segment)
    transformed += value
    state.transformedOffset += value.length
    state.offsets.set(state.transformedOffset, state.originalOffset + part.index + part.segment.length)
    consumed = part.index + part.segment.length
  }
  state.originalOffset += consumed
  state.pending = state.pending.slice(consumed)
  const hits = transformed.length ? state.stream.write(transformed) : []
  return mapTextMatches(state, hits)
}

function createMappedTextStream<T>(
  matcher: AhoCorasick<unknown>,
  patterns: readonly { pattern: string, data: T | undefined }[],
  transform: (source: string) => string,
  options?: StreamOptions,
  strategy?: Exclude<NonNullable<StreamOptions['strategy']>, 'longest-first'>,
): MatchStream<T> {
  const resolvedStrategy = strategy ?? 'all'
  const state = createTextStreamState(matcher, patterns, transform, resolvedStrategy, options)
  const select = (): Match<T>[] => {
    const boundary = resolveQuery(state.raw, options, state.segmenter)
    const candidates = state.matches.filter(hit => boundary === undefined || boundary(hit.start, hit.end))
    if (state.strategy === 'all') {
      return candidates
    }
    candidates.sort((a, b) => a.start - b.start
      || (state.strategy === 'leftmost-longest' ? b.end - a.end : 0)
      || a.patternIndex - b.patternIndex)
    const selected: Match<T>[] = []
    let cursor = 0
    for (const hit of candidates) {
      if (hit.start >= cursor) {
        selected.push(hit)
        cursor = hit.end
      }
    }
    return selected
  }
  const append = (chunk: Match<T>[]): Match<T>[] => {
    if (state.deferSelection) {
      state.matches.push(...chunk)
      return []
    }
    return chunk
  }
  return {
    write(chunk) {
      if (state.closed) {
        throw new Error('Stream is finished or cancelled')
      }
      assertText(chunk)
      try {
        state.raw += chunk
        return append(feedTextStream(state, chunk, false))
      }
      catch (error) {
        state.closed = true
        state.stream.destroy()
        throw error
      }
    },
    finish() {
      if (state.closed) {
        throw new Error('Stream is finished or cancelled')
      }
      state.closed = true
      try {
        const final = [...feedTextStream(state, '', true), ...mapTextMatches(state, state.stream.end())]
        if (state.deferSelection) {
          state.matches.push(...final)
          return select()
        }
        return final
      }
      catch (error) {
        state.stream.destroy()
        throw error
      }
    },
    cancel() {
      state.closed = true
      state.stream.destroy()
    },
  }
}

/** Optional whole-text transformations with original grapheme boundary mapping. */
export default class TextMatcher<T = unknown> {
  #matcher: AhoCorasick<unknown>
  readonly #patterns: { pattern: string, data: T | undefined }[]
  readonly #normalization: TextOptions['normalization']
  readonly #fold: TextOptions['caseFold']
  readonly #segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

  constructor(patterns: readonly PatternInput<T>[], options?: TextOptions) {
    if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) {
      throw new TypeError('options must be an object')
    }
    if (options?.normalization !== undefined && !['NFC', 'NFD', 'NFKC', 'NFKD'].includes(options.normalization)) {
      throw new TypeError('Unknown normalization form')
    }
    if (options?.caseFold !== undefined && typeof options.caseFold !== 'boolean' && options.caseFold !== 'turkic') {
      throw new TypeError('caseFold must be a boolean or turkic')
    }
    this.#normalization = options?.normalization
    this.#fold = options?.caseFold
    if (!Array.isArray(patterns)) {
      throw new TypeError('patterns must be an array')
    }
    this.#patterns = Array.from(patterns, (input, index) => {
      const pattern = typeof input === 'string' ? input : input !== null && typeof input === 'object' && !Array.isArray(input) ? input.pattern : undefined
      if (typeof pattern !== 'string') {
        throw new TypeError(`patterns[${index}].pattern must be a string`)
      }
      if (pattern.length === 0) {
        throw new RangeError(`patterns[${index}] must not be empty`)
      }
      return { pattern, data: typeof input === 'string' ? undefined : input.data }
    })
    this.#matcher = new AhoCorasick(this.#patterns.map(({ pattern, data }) => ({ pattern: this.#transform(pattern).text, data })))
  }

  #transform(source: string): { text: string, offsets: Map<number, number> } {
    const parts: string[] = []
    const offsets = new Map([[0, 0]])
    let length = 0
    for (const { segment, index } of this.#segmenter.segment(source)) {
      let value = this.#normalization ? segment.normalize(this.#normalization) : segment
      if (this.#fold) {
        value = caseFold(value, this.#fold === 'turkic')
      }
      if (this.#normalization) {
        value = value.normalize(this.#normalization)
      }
      parts.push(value)
      length += value.length
      offsets.set(length, index + segment.length)
    }
    return { text: parts.join(''), offsets }
  }

  search(text: string, options?: SearchOptions): Match<T>[] {
    return [...this.iterate(text, options)]
  }

  iterate(text: string, options?: SearchOptions): IterableIterator<Match<T>> {
    assertText(text)
    const strategy = resolveStrategy(options, 'all')
    const boundary = resolveQuery(text, options, this.#segmenter)
    const transformed = this.#transform(text)
    const matcher = this.#matcher
    const patterns = this.#patterns
    function* all(): Generator<Match<T>> {
      for (const hit of matcher.iterate(transformed.text)) {
        const start = transformed.offsets.get(hit.start)
        const end = transformed.offsets.get(hit.end)
        if (start === undefined || end === undefined || (boundary && !boundary(start, end))) {
          continue
        }
        const { pattern, data } = patterns[hit.patternIndex]
        yield { pattern, patternIndex: hit.patternIndex, start, end, data }
      }
    }
    if (strategy === 'longest-first') {
      return selectLongest(all(), text, this.#segmenter)
    }
    if (strategy === 'all') {
      return all()
    }
    // Filtering partial expansions and original word boundaries must precede
    // selection. The optional adapter materializes candidates for this path.
    function* selected(): Generator<Match<T>> {
      const candidates = [...all()].sort((a, b) => a.start - b.start
        || (strategy === 'leftmost-longest' ? b.end - a.end : 0)
        || a.patternIndex - b.patternIndex)
      let cursor = 0
      for (const hit of candidates) {
        if (hit.start >= cursor) {
          cursor = hit.end
          yield hit
        }
      }
    }
    return selected()
  }

  findFirst(text: string, options?: SearchOptions): Match<T> | undefined {
    const iterator = this.iterate(text, options)
    const result = iterator.next()
    iterator.return?.()
    return result.done ? undefined : result.value
  }

  findAt(text: string, start: number, options?: Omit<SearchOptions, 'start' | 'anchored'>): Match<T> | undefined {
    if (!Number.isSafeInteger(start) || start < 0 || start > text.length) {
      throw new RangeError('start must be a safe integer within the input')
    }
    return this.findFirst(text, { ...options, start, anchored: true })
  }

  #all(text: string, options?: QueryOptions): IterableIterator<Match<T>> {
    if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) {
      throw new TypeError('options must be an object')
    }
    return this.iterate(text, { ...options, strategy: 'all' })
  }

  match(text: string, options?: QueryOptions): boolean {
    return !this.#all(text, options).next().done
  }

  count(text: string, options?: QueryOptions): number {
    let count = 0
    for (const _hit of this.#all(text, options)) {
      if (!Number.isSafeInteger(++count)) {
        throw new RangeError('match count exceeds Number.MAX_SAFE_INTEGER')
      }
    }
    return count
  }

  countByPattern(text: string, options?: QueryOptions): number[] {
    const counts = Array.from<number>({ length: this.#patterns.length }).fill(0)
    for (const hit of this.#all(text, options)) {
      counts[hit.patternIndex]++
    }
    return counts
  }

  getStats() {
    return this.#matcher.getStats()
  }

  serialize(options?: TextSerializeOptions<T>): string {
    if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) {
      throw new TypeError('options must be an object')
    }
    if (options?.encodeData !== undefined && typeof options.encodeData !== 'function') {
      throw new TypeError('encodeData must be a function')
    }
    const entries = this.#patterns.map(({ pattern, data }) => {
      if (data === undefined) {
        return { pattern }
      }
      const encoded = options?.encodeData ? options.encodeData(data) : data
      assertJson(encoded)
      return { pattern, data: encoded }
    })
    return JSON.stringify({
      format: 'modern-ahocorasick/text',
      version: 1,
      options: { normalization: this.#normalization, caseFold: this.#fold },
      patterns: entries,
      compiled: this.#matcher.serialize(options as SerializeOptions<unknown>),
    })
  }

  static deserialize<T = unknown>(serialized: string, options?: TextDeserializeOptions<T>): TextMatcher<T> {
    if (typeof serialized !== 'string') {
      throw new TypeError('serialized must be a string')
    }
    let source: Record<string, unknown>
    try {
      const parsed = JSON.parse(serialized)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('record expected')
      }
      source = parsed as Record<string, unknown>
    }
    catch {
      throw new TypeError('Invalid serialized text matcher')
    }
    if (source['format'] !== 'modern-ahocorasick/text' || source['version'] !== 1 || !Array.isArray(source['patterns'])
      || typeof source['compiled'] !== 'string' || source['options'] === null || typeof source['options'] !== 'object') {
      throw new TypeError('Invalid serialized text matcher')
    }
    const patterns = (source['patterns'] as unknown[]).map((entry, index) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry) || typeof (entry as { pattern?: unknown }).pattern !== 'string') {
        throw new TypeError(`Invalid serialized pattern at index ${index}`)
      }
      const value = entry as { pattern: string, data?: unknown }
      return value.data === undefined ? { pattern: value.pattern } : { pattern: value.pattern, data: options?.decodeData ? options.decodeData(value.data as never) : value.data as T }
    }) as PatternInput<T>[]
    const textOptions = source['options'] as TextOptions
    const matcher = new TextMatcher(patterns, textOptions)
    matcher.#matcher = AhoCorasick.deserialize(source['compiled'] as string, options as DeserializeOptions<unknown>)
    return matcher
  }

  /** Incremental matching with transformed text mapped back to original ranges. */
  createStream(options?: StreamOptions): MatchStream<T> {
    const strategy = resolveStrategy(options, 'all')
    if (strategy === 'longest-first') {
      throw new TypeError('longest-first requires complete input')
    }
    const transformed = this.#patterns.map(({ pattern, data }) => ({ pattern: this.#transform(pattern).text, data }))
    const matcher = new AhoCorasick<unknown>(transformed)
    return createMappedTextStream(matcher, this.#patterns, source => this.#transform(source).text, options, strategy)
  }

  /** Token stream variant; text is retained until end so every token is exact. */
  createTokenStream(options?: TokenStreamOptions): TokenStreamHandle<T> {
    const strategy = resolveStrategy(options, 'leftmost-longest')
    if (strategy === 'all' || strategy === 'longest-first') {
      throw new TypeError('strategy is not supported by a token stream')
    }
    const matchStream = this.createStream(options)
    let raw = ''
    let closed = false
    return {
      write: (chunk) => {
        if (closed) {
          throw new Error('Stream is finished or cancelled')
        }
        assertText(chunk)
        raw += chunk
        matchStream.write(chunk)
        return []
      },
      end: () => {
        if (closed) {
          throw new Error('Stream is finished or cancelled')
        }
        closed = true
        const matches = matchStream.finish()
        const tokens: Token<T>[] = []
        let cursor = 0
        for (const match of matches) {
          if (cursor < match.start) {
            tokens.push({ type: 'text', text: raw.slice(cursor, match.start), start: cursor, end: match.start })
          }
          tokens.push({ type: 'match', text: raw.slice(match.start, match.end), start: match.start, end: match.end, match })
          cursor = match.end
        }
        if (cursor < raw.length) {
          tokens.push({ type: 'text', text: raw.slice(cursor), start: cursor, end: raw.length })
        }
        raw = ''
        return tokens
      },
      destroy: () => {
        closed = true
        raw = ''
        matchStream.cancel()
      },
      preview: () => ({ start: 0, text: raw, tokens: this.tokenize(raw, { strategy }) }),
    }
  }

  createReplaceStream(replacement: Replacement<T>, options?: TokenStreamOptions): StreamHandle<string> {
    const tokens = this.createTokenStream(options)
    replacement = operationReplacement(replacement)
    if (typeof replacement !== 'string' && typeof replacement !== 'function') {
      throw new TypeError('replacement must be a string or function')
    }
    const replace = (items: Token<T>[]) => items.map((token) => {
      const value = token.type === 'text'
        ? token.text
        : typeof replacement === 'string' ? replacement : replacement(token.match, token.text)
      if (typeof value !== 'string') {
        throw new TypeError('replacement callback must return a string')
      }
      return value
    })
    return {
      write: (chunk) => {
        tokens.write(chunk)
        return []
      },
      end: () => replace(tokens.end()),
      destroy: () => tokens.destroy(),
    }
  }

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
    const parts: string[] = []
    let cursor = 0
    for (const hit of this.iterate(text, { ...options, strategy })) {
      const { start, end } = hit
      const value = typeof replacement === 'string' ? replacement : replacement(hit, text.slice(start, end))
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
}
