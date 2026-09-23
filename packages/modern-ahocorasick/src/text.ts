import type { ScanSession } from './runtime.js'
import type { StreamHandle, StreamOptions, TokenStreamHandle, TokenStreamOptions } from './stream.js'
import type { DeserializeOptions, Match, MatchStream, PatternInput, QueryOptions, Replacement, ReplaceOptions, SearchOptions, SerializeOptions, Token } from './types.js'
import { caseFold } from './case-folding.js'
import AhoCorasick from './index.js'
import { assertText, resolveQuery, resolveStrategy } from './options.js'
import { operationReplacement, registerScanner, scanner, selectLongest } from './runtime.js'
import { createMatchStream, createReplaceStream, createTokenStream } from './stream.js'

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

/** Map a transformed scanner without retaining already-consumed original text. */
function mappedScanner<T>(
  matcher: AhoCorasick<unknown>,
  patterns: readonly { pattern: string, data: T | undefined }[],
  transform: (grapheme: string) => string,
  strategy: NonNullable<SearchOptions['strategy']>,
  acceptsRange?: (start: number, end: number) => boolean,
): ScanSession<T> {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const offsets = new Map<number, number>()
  let boundaries: number[] = []
  let head = 0
  let protectedRanges: { start: number, end: number }[] = []
  let pending = ''
  let pendingBase = 0
  let transformedEnd = 0
  let originalEnd = 0
  let safeOffset = 0
  let retainOffset = 0
  let initialized = false
  let inner: ScanSession<unknown> | undefined = scanner(matcher, strategy, (start, end) => {
    const from = offsets.get(start)
    const to = offsets.get(end)
    // Reject partial expansions before the inner scanner selects overlaps.
    return from !== undefined && to !== undefined && (!acceptsRange || acceptsRange(from, to))
  })
  const maxLength = inner.maxLength
  function boundary(transformed: number, original: number) {
    offsets.set(transformed, original)
    boundaries.push(transformed)
  }
  function floor(transformed: number): number {
    let low = head
    let high = boundaries.length - 1
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (boundaries[middle] <= transformed) {
        low = middle
      }
      else {
        high = middle - 1
      }
    }
    return offsets.get(boundaries[low]) ?? originalEnd
  }
  function map(hits: Match<unknown>[], output: Match<T>[]) {
    for (const hit of hits) {
      const { pattern, data } = patterns[hit.patternIndex]
      output.push({ pattern, patternIndex: hit.patternIndex, data, start: offsets.get(hit.start)!, end: offsets.get(hit.end)! })
    }
  }
  function advance(final: boolean): Match<T>[] {
    const output: Match<T>[] = []
    const segments = Array.from(segmenter.segment(pending))
    // Transformations can join adjacent source graphemes (e.g. compatibility
    // Hangul jamo). Segment the concatenated transformed tail a second time.
    const count = final ? segments.length : Math.max(0, segments.length - 3)
    let consumed = 0
    let protectedIndex = 0
    for (let index = 0; index < count; index++) {
      const part = segments[index]
      const start = pendingBase + part.index
      const end = start + part.segment.length
      while (protectedIndex < protectedRanges.length && protectedRanges[protectedIndex].end <= start) {
        protectedIndex++
      }
      const protectedText = protectedIndex < protectedRanges.length && protectedRanges[protectedIndex].start < end
      map(inner!.feed(part.segment, start, segments[index + 1]?.segment, protectedText), output)
      consumed = part.index + part.segment.length
    }
    pending = pending.slice(consumed)
    pendingBase += consumed
    protectedRanges = protectedRanges.filter(range => range.end > pendingBase)
    if (final) {
      map(inner!.end(), output)
    }
    safeOffset = final ? originalEnd : floor(inner!.safeOffset)
    retainOffset = floor(Math.min(inner!.retainOffset, pendingBase))
    // Preserve the floor boundary as well as every still-relevant exact map.
    const cutoff = Math.min(inner!.safeOffset, inner!.retainOffset, pendingBase)
    while (head + 1 < boundaries.length && boundaries[head + 1] <= cutoff) {
      offsets.delete(boundaries[head++])
    }
    if (head >= 256 && head * 2 >= boundaries.length) {
      boundaries = boundaries.slice(head)
      head = 0
    }
    return output
  }
  return {
    maxLength,
    get safeOffset() { return safeOffset },
    get retainOffset() { return retainOffset },
    feed(segment, start, _right, protectedText = false) {
      if (!initialized) {
        initialized = true
        originalEnd = safeOffset = retainOffset = start
        boundary(0, start)
      }
      const value = transform(segment)
      const end = transformedEnd + value.length
      if (!Number.isSafeInteger(end)) {
        throw new RangeError('transformed stream offset exceeds Number.MAX_SAFE_INTEGER')
      }
      if (protectedText) {
        const previous = protectedRanges.at(-1)
        if (previous?.end === transformedEnd) {
          previous.end = end
        }
        else {
          protectedRanges.push({ start: transformedEnd, end })
        }
      }
      transformedEnd = end
      originalEnd = start + segment.length
      boundary(transformedEnd, originalEnd)
      pending += value
      return advance(false)
    },
    end: () => advance(true),
    destroy() {
      inner?.destroy?.()
      inner = undefined
      pending = ''
      offsets.clear()
      boundaries = []
      protectedRanges = []
    },
  }
}

/** Preserve the text entry's strict close contract over shared stream handles. */
function strictStream<T>(handle: StreamHandle<T>): StreamHandle<T> {
  let closed = false
  function assertOpen() {
    if (closed) {
      throw new Error('Stream is finished or cancelled')
    }
  }
  return {
    write(chunk) {
      assertOpen()
      return handle.write(chunk)
    },
    end() {
      assertOpen()
      closed = true
      return handle.end()
    },
    destroy() {
      closed = true
      handle.destroy()
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
    registerScanner(this, (strategy, range) => mappedScanner(this.#matcher, this.#patterns, segment => this.#transformGrapheme(segment), strategy, range))
  }

  #transformGrapheme(segment: string): string {
    let value = this.#normalization ? segment.normalize(this.#normalization) : segment
    if (this.#fold) {
      value = caseFold(value, this.#fold === 'turkic')
    }
    return this.#normalization ? value.normalize(this.#normalization) : value
  }

  #transform(source: string): { text: string, offsets: Map<number, number> } {
    const parts: string[] = []
    const offsets = new Map([[0, 0]])
    let length = 0
    for (const { segment, index } of this.#segmenter.segment(source)) {
      const value = this.#transformGrapheme(segment)
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
    const handle = strictStream(createMatchStream(this, options))
    return { write: handle.write, finish: handle.end, cancel: handle.destroy }
  }

  /** Tokenize incrementally with original-text filtering and bounded lookahead. */
  createTokenStream(options?: TokenStreamOptions): TokenStreamHandle<T> {
    const handle = createTokenStream(this, options)
    const strict = strictStream(handle)
    let closed = false
    return {
      write: strict.write,
      end() {
        closed = true
        return strict.end()
      },
      destroy() {
        closed = true
        strict.destroy()
      },
      preview: () => closed ? { start: 0, text: '', tokens: [] } : handle.preview(),
    }
  }

  createReplaceStream(replacement: Replacement<T>, options?: TokenStreamOptions): StreamHandle<string> {
    return strictStream(createReplaceStream(this, replacement, options))
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
