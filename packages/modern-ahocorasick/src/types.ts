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

export interface SearchOptions {
  strategy?: MatchStrategy
}

export interface ReplaceOptions {
  strategy?: Exclude<MatchStrategy, 'all'>
}

export type Replacement<T = unknown> = string | ((match: Match<T>, text: string) => string)
