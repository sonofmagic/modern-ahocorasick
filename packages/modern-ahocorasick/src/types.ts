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

export type MatchStrategy = 'all' | 'leftmost-first' | 'leftmost-longest'

export interface BoundaryOptions {
  /** Require starts/ends of word-like Intl.Segmenter segments. */
  wholeWord?: boolean
  /** BCP 47 locale for word segmentation; defaults to the runtime locale. */
  locale?: string
}

export interface SearchOptions extends BoundaryOptions {
  strategy?: MatchStrategy
}

export interface ReplaceOptions extends BoundaryOptions {
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

export interface StreamOptions extends SearchOptions {
  /** Maximum unsettled UTF-16 tail; defaults to 1,048,576. */
  maxBufferedUnits?: number
}

export interface MatchStream<T = unknown> {
  write: (chunk: string) => Match<T>[]
  finish: () => Match<T>[]
  cancel: () => void
}
