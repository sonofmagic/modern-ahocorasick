import type { BoundaryOptions, MatchStrategy, SearchOptions } from './types.js'

export function assertText(text: string): void {
  if (typeof text !== 'string') {
    throw new TypeError('text must be a string')
  }
}

export function resolveStrategy(options: SearchOptions | undefined, fallback: MatchStrategy): MatchStrategy {
  if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) {
    throw new TypeError('options must be an object')
  }
  const strategy = options?.strategy === undefined ? fallback : options.strategy
  if (strategy !== 'all' && strategy !== 'leftmost-first' && strategy !== 'leftmost-longest' && strategy !== 'longest-first') {
    throw new TypeError(`Unknown match strategy: ${String(strategy)}`)
  }
  return strategy
}

export type Boundary = ((start: number, end: number) => boolean) | undefined

export function resolveBoundary(text: string, options: BoundaryOptions | undefined): Boundary {
  if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) {
    throw new TypeError('options must be an object')
  }
  if (options?.wholeWord !== undefined && typeof options.wholeWord !== 'boolean') {
    throw new TypeError('wholeWord must be a boolean')
  }
  if (options?.locale !== undefined && typeof options.locale !== 'string') {
    throw new TypeError('locale must be a string')
  }
  // Validate explicit locale tags even when boundary matching is disabled.
  const locales = options?.locale === undefined ? undefined : Intl.getCanonicalLocales(options.locale)
  if (!options?.wholeWord) {
    return undefined
  }
  const starts = new Set<number>()
  const ends = new Set<number>()
  for (const { index, segment, isWordLike } of new Intl.Segmenter(locales, { granularity: 'word' }).segment(text)) {
    if (isWordLike) {
      starts.add(index)
      ends.add(index + segment.length)
    }
  }
  return (start, end) => starts.has(start) && ends.has(end)
}
