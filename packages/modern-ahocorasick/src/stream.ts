import type { FilterPart, StreamFilter } from './stream/filters.js'
import type { Match, Matcher, MatchStrategy, Replacement, StreamingBoundaryOptions, Token } from './types.js'
import { assertStreamRange, resolveBoundary } from './options.js'
import { assertText, operationReplacement, resolveStrategy, scanner } from './runtime.js'

export type StreamStrategy = Exclude<MatchStrategy, 'longest-first'>
export interface StreamOptions extends StreamingBoundaryOptions {
  strategy?: StreamStrategy
  /** Maximum undecided original UTF-16 units. Infinity explicitly disables the limit. */
  maxBufferLength?: number
  filter?: StreamFilter
}
export interface AsyncStreamOptions extends StreamOptions {
  signal?: AbortSignal
  /** UTF-16 units processed between task-queue yields; default 4096. */
  yieldEvery?: number
}
export interface TokenStreamOptions extends StreamOptions {
  strategy?: Exclude<StreamStrategy, 'all'>
}
export interface AsyncTokenStreamOptions extends AsyncStreamOptions {
  strategy?: Exclude<StreamStrategy, 'all'>
}
export interface StreamHandle<T> {
  write: (chunk: string) => T[]
  end: () => T[]
  destroy: () => void
}
export interface StreamPreview<T> {
  start: number
  text: string
  /** Provisional interpretation of the entire undecided suffix; replace on every preview. */
  tokens: Token<T>[]
}
export interface TokenStreamHandle<T> extends StreamHandle<Token<T>> {
  preview: () => StreamPreview<T>
}
export type AsyncReplacement<T = unknown> = string | ((match: Match<T>, text: string) => string | PromiseLike<string>)
function validateOptions(options: StreamOptions | undefined, tokenMode: boolean) {
  resolveBoundary('', options)
  assertStreamRange(options)
  const strategy = resolveStrategy(options, tokenMode ? 'leftmost-longest' : 'all')
  if (strategy === 'longest-first' || (tokenMode && strategy === 'all')) {
    throw new TypeError('strategy is not supported by this stream')
  }
  const maxBufferLength = options?.maxBufferLength === undefined ? 1048576 : options.maxBufferLength
  if (maxBufferLength !== Number.POSITIVE_INFINITY && (!Number.isSafeInteger(maxBufferLength) || maxBufferLength < 1)) {
    throw new RangeError('maxBufferLength must be a positive safe integer or Infinity')
  }
  if (options?.filter !== undefined && typeof options.filter?.create !== 'function') {
    throw new TypeError('filter must provide create()')
  }
  return { strategy, maxBufferLength, filter: options?.filter }
}
/** Incremental segmentation, filtering and output accounting shared by every adapter. */
function core<T>(matcher: Matcher<T>, options: StreamOptions | undefined, tokenMode: boolean) {
  const { strategy, maxBufferLength, filter } = validateOptions(options, tokenMode)
  const wordSegmenter = options?.wholeWord ? new Intl.Segmenter(options.locale, { granularity: 'word' }) : undefined
  const wordStarts = new Set<number>()
  const wordEnds = new Set<number>()
  const history: number[] = []
  let graphemes = 0
  let session = scanner(matcher, strategy, wordSegmenter ? (start, end) => wordStarts.has(start) && wordEnds.has(end) : undefined)
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const parser = filter?.create()
  let raw = ''
  let rawBase = 0
  let tail = ''
  let tailBase = 0
  let classifiedEnd = 0
  let protectedRanges: {
    start: number
    end: number
  }[] = []
  let lifecycle: 'open' | 'ended' | 'destroyed' = 'open'
  function destroy() {
    lifecycle = 'destroyed'
    raw = tail = ''
    protectedRanges = []
    wordStarts.clear()
    wordEnds.clear()
    history.length = 0
    parser?.destroy()
    // Drop candidates and grapheme rings as well as original text.
    session = undefined as unknown as typeof session
  }
  function process(parts: FilterPart[], final: boolean): (Token<T> | Match<T>)[] {
    for (const part of parts) {
      if (part.protected && part.text.length) {
        protectedRanges.push({ start: classifiedEnd, end: classifiedEnd + part.text.length })
      }
      tail += part.text
      classifiedEnd += part.text.length
    }
    const output: (Token<T> | Match<T>)[] = []
    let settledText = tail
    if (wordSegmenter && !final) {
      let cut = 0
      for (let i = 0; i < tail.length; i++) {
        const code = tail.charCodeAt(i)
        if (code === 10 || code === 0x2028 || code === 0x2029 || (code === 13 && i + 1 < tail.length && tail.charCodeAt(i + 1) !== 10)) {
          cut = i + 1
        }
      }
      settledText = tail.slice(0, cut)
    }
    const segments = Array.from(segmenter.segment(settledText))
    if (wordSegmenter) {
      wordEnds.clear()
      for (const part of wordSegmenter.segment(settledText)) {
        if (part.isWordLike) {
          wordStarts.add(tailBase + part.index)
          wordEnds.add(tailBase + part.index + part.segment.length)
        }
      }
    }
    // Keep a right-neighbour grapheme plus surrogate-pair lookbehind. A trailing
    // high surrogate may become a combining code point and extend its predecessor.
    const count = final || wordSegmenter ? segments.length : Math.max(0, segments.length - 3)
    let consumed = 0
    let range = 0
    const hits: Match<T>[] = []
    for (let index = 0; index < count; index++) {
      const { segment, index: offset } = segments[index]
      const start = tailBase + offset
      const end = start + segment.length
      if (wordSegmenter) {
        history[graphemes++ % (session.maxLength + 1)] = start
      }
      while (range < protectedRanges.length && protectedRanges[range].end <= start) {
        range++
      }
      const protectedText = range < protectedRanges.length && protectedRanges[range].start < end
      for (const hit of session.feed(segment, start, segments[index + 1]?.segment, protectedText)) {
        hits.push(hit)
      }
      consumed = offset + segment.length
    }
    if (final) {
      for (const hit of session.end()) {
        hits.push(hit)
      }
    }
    if (tokenMode) {
      let cursor = rawBase
      for (const match of hits) {
        if (cursor < match.start) {
          output.push({ type: 'text', text: raw.slice(cursor - rawBase, match.start - rawBase), start: cursor, end: match.start })
        }
        output.push({ type: 'match', text: raw.slice(match.start - rawBase, match.end - rawBase), start: match.start, end: match.end, match })
        cursor = match.end
      }
      if (cursor < session.safeOffset) {
        output.push({ type: 'text', text: raw.slice(cursor - rawBase, session.safeOffset - rawBase), start: cursor, end: session.safeOffset })
      }
    }
    else {
      for (const hit of hits) {
        output.push(hit)
      }
    }
    if (wordSegmenter && graphemes > session.maxLength) {
      const cutoff = history[(graphemes - session.maxLength - 1) % (session.maxLength + 1)]
      for (const start of wordStarts) {
        if (start < cutoff) {
          wordStarts.delete(start)
        }
      }
    }
    raw = raw.slice(session.safeOffset - rawBase)
    rawBase = session.safeOffset
    tail = tail.slice(consumed)
    tailBase += consumed
    protectedRanges = protectedRanges.filter(range => range.end > tailBase)
    if (raw.length > maxBufferLength) {
      throw new RangeError('undecided original text exceeds maxBufferLength')
    }
    return output
  }
  function requireOpen() {
    if (lifecycle !== 'open') {
      throw new Error(`stream is ${lifecycle}`)
    }
  }
  return {
    write(chunk: string): (Token<T> | Match<T>)[] {
      requireOpen()
      assertText(chunk)
      try {
        if (!Number.isSafeInteger(rawBase + raw.length + chunk.length)) {
          throw new RangeError('stream offset exceeds Number.MAX_SAFE_INTEGER')
        }
        const output: (Token<T> | Match<T>)[] = []
        // A large caller chunk is not itself an undecided-buffer overflow.
        for (let offset = 0; offset < chunk.length; offset += 4096) {
          const piece = chunk.slice(offset, offset + 4096)
          raw += piece
          const parts = parser ? parser.write(piece) : [{ text: piece, protected: false }]
          for (const item of process(parts, false)) {
            output.push(item)
          }
        }
        return output
      }
      catch (error) {
        destroy()
        throw error
      }
    },
    end(): (Token<T> | Match<T>)[] {
      if (lifecycle === 'ended') {
        return []
      }
      requireOpen()
      try {
        const result = process(parser ? parser.write('', true) : [], true)
        destroy()
        lifecycle = 'ended'
        return result
      }
      catch (error) {
        destroy()
        throw error
      }
    },
    destroy,
    preview(): StreamPreview<T> {
      if (lifecycle === 'destroyed') {
        throw new Error('stream is destroyed')
      }
      const tokens = matcher.tokenize(raw, { strategy: strategy === 'all' ? 'leftmost-longest' : strategy }).map((token): Token<T> => token.type === 'text'
        ? { ...token, start: token.start + rawBase, end: token.end + rawBase }
        : { ...token, start: token.start + rawBase, end: token.end + rawBase, match: { ...token.match, start: token.match.start + rawBase, end: token.match.end + rawBase } })
      return { start: rawBase, text: raw, tokens }
    },
  }
}
export function createMatchStream<T>(matcher: Matcher<T>, options?: StreamOptions): StreamHandle<Match<T>> {
  return core(matcher, options, false) as StreamHandle<Match<T>>
}
export function createTokenStream<T>(matcher: Matcher<T>, options?: TokenStreamOptions): TokenStreamHandle<T> {
  return core(matcher, options, true) as TokenStreamHandle<T>
}
function validateReplacement<T>(replacement: AsyncReplacement<T>): void {
  if (typeof replacement !== 'string' && typeof replacement !== 'function') {
    throw new TypeError('replacement must be a string or function')
  }
}
function replacementValue(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('replacement callback must return a string')
  }
  return value
}
export function createReplaceStream<T>(matcher: Matcher<T>, replacement: Replacement<T>, options?: TokenStreamOptions): StreamHandle<string> {
  validateReplacement(replacement)
  replacement = operationReplacement(replacement)
  const handle = createTokenStream(matcher, options)
  function replace(tokens: Token<T>[]): string[] {
    try {
      return tokens.map(token => token.type === 'text' ? token.text : replacementValue(typeof replacement === 'string' ? replacement : replacement(token.match, token.text)))
    }
    catch (error) {
      handle.destroy()
      throw error
    }
  }
  return { write: chunk => replace(handle.write(chunk)), end: () => replace(handle.end()), destroy: () => handle.destroy() }
}
function* consume<T>(source: Iterable<string>, handle: StreamHandle<T>): Generator<T> {
  try {
    for (const chunk of source) {
      yield* handle.write(chunk)
    }
    yield* handle.end()
  }
  finally {
    handle.destroy()
  }
}
export function iterateChunks<T>(matcher: Matcher<T>, source: Iterable<string>, options?: StreamOptions): IterableIterator<Match<T>> {
  return consume(source, createMatchStream(matcher, options))
}
export function tokenizeChunks<T>(matcher: Matcher<T>, source: Iterable<string>, options?: TokenStreamOptions): IterableIterator<Token<T>> {
  return consume(source, createTokenStream(matcher, options))
}
export function replaceChunks<T>(matcher: Matcher<T>, source: Iterable<string>, replacement: Replacement<T>, options?: TokenStreamOptions): IterableIterator<string> {
  return consume(source, createReplaceStream(matcher, replacement, options))
}
function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}
/** Race pending sources/callbacks without retaining an abort listener after settlement. */
async function abortable<T>(promise: PromiseLike<T> | T, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise
  }
  if (signal.aborted) {
    void Promise.resolve(promise).catch(() => { })
    throw abortReason(signal)
  }
  let remove = () => { }
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        const abort = () => reject(abortReason(signal))
        signal.addEventListener('abort', abort, { once: true })
        remove = () => signal.removeEventListener('abort', abort)
      }),
    ])
  }
  finally {
    remove()
  }
}
async function* consumeAsync<T>(source: Iterable<string> | AsyncIterable<string>, handle: StreamHandle<T>, options?: AsyncStreamOptions): AsyncGenerator<T> {
  const step = options?.yieldEvery === undefined ? 4096 : options.yieldEvery
  if (!Number.isSafeInteger(step) || step < 1) {
    handle.destroy()
    throw new RangeError('yieldEvery must be a positive safe integer')
  }
  const signal = options?.signal
  const iterator = Symbol.asyncIterator in source ? source[Symbol.asyncIterator]() : source[Symbol.iterator]()
  let complete = false
  let processed = 0
  try {
    while (true) {
      if (signal?.aborted) {
        throw abortReason(signal)
      }
      const next = await abortable(iterator.next(), signal)
      if (next.done) {
        complete = true
        break
      }
      assertText(next.value)
      for (let start = 0; start < next.value.length; start += step) {
        if (signal?.aborted) {
          throw abortReason(signal)
        }
        const piece = next.value.slice(start, start + step)
        for (const item of handle.write(piece)) {
          if (signal?.aborted) {
            throw abortReason(signal)
          }
          yield item
        }
        processed += piece.length
        if (processed >= step) {
          await abortable(new Promise<void>(resolve => setTimeout(resolve, 0)), signal)
          processed = 0
        }
      }
    }
    for (const item of handle.end()) {
      if (signal?.aborted) {
        throw abortReason(signal)
      }
      yield item
    }
  }
  finally {
    handle.destroy()
    if (!complete && iterator.return) {
      const closing = Promise.resolve(iterator.return())
      if (signal?.aborted) {
        void closing.catch(() => { })
      }
      else {
        await closing
      }
    }
  }
}
export function iterateChunksAsync<T>(matcher: Matcher<T>, source: Iterable<string> | AsyncIterable<string>, options?: AsyncStreamOptions): AsyncIterableIterator<Match<T>> {
  return consumeAsync(source, createMatchStream(matcher, options), options)
}
export function tokenizeChunksAsync<T>(matcher: Matcher<T>, source: Iterable<string> | AsyncIterable<string>, options?: AsyncTokenStreamOptions): AsyncIterableIterator<Token<T>> {
  return consumeAsync(source, createTokenStream(matcher, options), options)
}
export function replaceChunksAsync<T>(matcher: Matcher<T>, source: Iterable<string> | AsyncIterable<string>, replacement: AsyncReplacement<T>, options?: AsyncTokenStreamOptions): AsyncIterableIterator<string> {
  validateReplacement(replacement)
  replacement = operationReplacement(replacement)
  const tokens = tokenizeChunksAsync(matcher, source, options)
  return (async function* () {
    for await (const token of tokens) {
      yield token.type === 'text' ? token.text : replacementValue(await abortable(typeof replacement === 'string' ? replacement : replacement(token.match, token.text), options?.signal))
    }
  })()
}

export interface AsyncStreamHandle<T> {
  /** Await a write before starting another write or end. */
  write: (chunk: string) => Promise<T[]>
  end: () => Promise<T[]>
  destroy: () => void
}

function asyncSession<I, O>(handle: StreamHandle<I>, convert: (item: I) => O | PromiseLike<O>, options?: AsyncStreamOptions): AsyncStreamHandle<O> {
  const step = options?.yieldEvery === undefined ? 4096 : options.yieldEvery
  if (!Number.isSafeInteger(step) || step < 1) {
    handle.destroy()
    throw new RangeError('yieldEvery must be a positive safe integer')
  }
  const controller = new AbortController()
  const signal = options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
  let busy = false
  const destroy = () => {
    controller.abort()
    handle.destroy()
  }
  async function run(chunk: string | undefined, final: boolean): Promise<O[]> {
    if (busy) {
      throw new Error('await the pending stream operation before writing or ending')
    }
    busy = true
    try {
      if (signal.aborted) {
        throw abortReason(signal)
      }
      const result: O[] = []
      async function append(items: I[]) {
        for (const item of items) {
          if (signal.aborted) {
            throw abortReason(signal)
          }
          result.push(await abortable(convert(item), signal))
        }
      }
      if (final) {
        await append(handle.end())
      }
      else {
        assertText(chunk as string)
        const input = chunk!
        if (input.length === 0) {
          await append(handle.write(''))
        }
        for (let start = 0; start < input.length; start += step) {
          if (signal.aborted) {
            throw abortReason(signal)
          }
          await append(handle.write(input.slice(start, start + step)))
          await abortable(new Promise<void>(resolve => setTimeout(resolve, 0)), signal)
        }
      }
      return result
    }
    catch (error) {
      destroy()
      throw error
    }
    finally {
      busy = false
    }
  }
  return { write: chunk => run(chunk, false), end: () => run(undefined, true), destroy }
}

export function createMatchStreamAsync<T>(matcher: Matcher<T>, options?: AsyncStreamOptions): AsyncStreamHandle<Match<T>> {
  return asyncSession(createMatchStream(matcher, options), item => item, options)
}
export function createTokenStreamAsync<T>(matcher: Matcher<T>, options?: AsyncTokenStreamOptions): AsyncStreamHandle<Token<T>> {
  return asyncSession(createTokenStream(matcher, options), item => item, options)
}
export function createReplaceStreamAsync<T>(matcher: Matcher<T>, replacement: AsyncReplacement<T>, options?: AsyncTokenStreamOptions): AsyncStreamHandle<string> {
  validateReplacement(replacement)
  replacement = operationReplacement(replacement)
  return asyncSession(createTokenStream(matcher, options), async token => token.type === 'text'
    ? token.text
    : replacementValue(await (typeof replacement === 'string' ? replacement : replacement(token.match, token.text))), options)
}
