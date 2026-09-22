/** A keyword, optionally paired with caller-owned metadata. */
export type PatternInput<T = unknown> = string | { pattern: string, data?: T }

/** UTF-16 offsets into the original text; end is exclusive. */
export interface Match<T = unknown> {
  pattern: string
  patternIndex: number
  start: number
  end: number
  data: T | undefined
}

export type MatchStrategy = 'all' | 'leftmost-first' | 'leftmost-longest' | 'longest-first'

export interface BoundaryOptions {
  /** Require starts/ends of word-like Intl.Segmenter segments. */
  wholeWord?: boolean
  /** BCP 47 locale for word segmentation; defaults to the runtime locale. */
  locale?: string
}

export interface QueryOptions extends BoundaryOptions {
  /** Original UTF-16 half-open range, at grapheme boundaries. */
  start?: number
  end?: number
  /** Only accept matches beginning at start (default 0). */
  anchored?: boolean
}

/** Cached scalar diagnostics; typedArrayBytes is not total retained heap. */
export interface CompileStats {
  readonly backend: 'compact' | 'double-array'
  readonly patternCount: number
  readonly stateCount: number
  readonly transitionCount: number
  readonly alphabetSize: number
  readonly maxPatternUnits: number
  readonly unit: 'grapheme' | 'folded-codepoint'
  readonly typedArrayBytes: number
}

/** Offline ranges are intentionally unavailable on a stream. */
export interface StreamingBoundaryOptions extends BoundaryOptions {
  start?: never
  end?: never
  anchored?: never
}

export interface SearchOptions extends QueryOptions {
  strategy?: MatchStrategy
}

export interface ReplaceOptions extends QueryOptions {
  strategy?: Exclude<MatchStrategy, 'all'>
}

export type Replacement<T = unknown> = string | ((match: Match<T>, text: string) => string)

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface SerializeOptions<T> {
  encodeData?: (data: T) => JsonValue
}

export interface DeserializeOptions<T> {
  decodeData?: (data: JsonValue) => T
}

export interface StreamOptions extends StreamingBoundaryOptions {
  strategy?: Exclude<MatchStrategy, 'longest-first'>
  /** Maximum unsettled UTF-16 tail; defaults to 1,048,576. */
  maxBufferedUnits?: number
}

export interface MatchStream<T = unknown> {
  write: (chunk: string) => Match<T>[]
  finish: () => Match<T>[]
  cancel: () => void
}

export interface BoundaryContext {
  /** Adjacent original graphemes; undefined denotes the start/end of input. */
  left: string | undefined
  right: string | undefined
  first: string
  last: string
  pattern: string
  patternIndex: number
}
export type Boundary = 'none' | 'ascii' | 'ascii-edge' | 'unicode' | 'whitespace' | ((context: BoundaryContext) => boolean)
export interface MatcherOptions {
  boundary?: Boundary
}
export type Token<T = unknown> = {
  type: 'text'
  text: string
  start: number
  end: number
} | {
  type: 'match'
  text: string
  start: number
  end: number
  match: Match<T>
}
/** The public operations accepted by dynamic dictionaries and stream adapters. */
export interface Matcher<T = unknown> {
  search: (text: string, options?: SearchOptions) => Match<T>[]
  iterate: (text: string, options?: SearchOptions) => IterableIterator<Match<T>>
  /** Return the first match in the selected iteration order. */
  findFirst?: (text: string, options?: SearchOptions) => Match<T> | undefined
  /** Return a match whose original range starts at the supplied grapheme boundary. */
  findAt?: (text: string, start: number, options?: Omit<SearchOptions, 'start' | 'anchored'>) => Match<T> | undefined
  match: (text: string, options?: QueryOptions) => boolean
  count: (text: string, options?: QueryOptions) => number
  countByPattern: (text: string, options?: QueryOptions) => number[]
  replace: (text: string, replacement: Replacement<T>, options?: ReplaceOptions) => string
  tokenize: (text: string, options?: ReplaceOptions) => Token<T>[]
}
