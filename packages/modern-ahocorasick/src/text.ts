import type { BoundaryOptions, Match, PatternInput, Replacement, ReplaceOptions, SearchOptions } from './types.js'
import { caseFold } from './case-folding.js'
import AhoCorasick from './index.js'
import { assertText, resolveBoundary, resolveStrategy } from './options.js'

export type { BoundaryOptions, Match, PatternInput, Replacement, ReplaceOptions, SearchOptions } from './types.js'

export interface TextOptions {
  normalization?: 'NFC' | 'NFD' | 'NFKC' | 'NFKD'
  /** Full Unicode 17 case folding; 'turkic' overrides I and İ. */
  caseFold?: boolean | 'turkic'
}

/** Optional whole-text transformations with original grapheme boundary mapping. */
export default class TextMatcher<T = unknown> {
  readonly #matcher: AhoCorasick
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
    this.#matcher = new AhoCorasick(this.#patterns.map(({ pattern }) => this.#transform(pattern).text))
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
    const boundary = resolveBoundary(text, options)
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

  #all(text: string, options?: BoundaryOptions): IterableIterator<Match<T>> {
    if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) {
      throw new TypeError('options must be an object')
    }
    return this.iterate(text, { ...options, strategy: 'all' })
  }

  match(text: string, options?: BoundaryOptions): boolean {
    return !this.#all(text, options).next().done
  }

  count(text: string, options?: BoundaryOptions): number {
    let count = 0
    for (const _hit of this.#all(text, options)) {
      if (!Number.isSafeInteger(++count)) {
        throw new RangeError('match count exceeds Number.MAX_SAFE_INTEGER')
      }
    }
    return count
  }

  countByPattern(text: string, options?: BoundaryOptions): number[] {
    const counts = Array.from<number>({ length: this.#patterns.length }).fill(0)
    for (const hit of this.#all(text, options)) {
      counts[hit.patternIndex]++
    }
    return counts
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
}
