import type { Match, MatchStrategy, PatternInput, Replacement, ReplaceOptions, SearchOptions } from './types.js'

export type { Match, MatchStrategy, PatternInput, Replacement, ReplaceOptions, SearchOptions } from './types.js'

interface Pattern<T> {
  pattern: string
  data: T | undefined
}

interface Node {
  next: Map<string, number>
  failure: number
  output: number
  terminals: number[]
}

function createNode(): Node {
  return { next: new Map(), failure: 0, output: -1, terminals: [] }
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

function selectMatches<T>(matches: Match<T>[], strategy: MatchStrategy): Match<T>[] {
  if (strategy === 'all') {
    return matches
  }
  matches.sort((a, b) => a.start - b.start
    || (strategy === 'leftmost-longest' ? b.end - a.end : 0)
    || a.patternIndex - b.patternIndex)
  const selected: Match<T>[] = []
  let end = 0
  for (const match of matches) {
    if (match.start >= end) {
      selected.push(match)
      end = match.end
    }
  }
  return selected
}

/** An immutable compiled dictionary for exact grapheme-cluster matching. */
export default class AhoCorasick<T = unknown> {
  readonly #nodes: Node[] = [createNode()]
  readonly #patterns: Pattern<T>[]
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
    this.#build()
  }

  /** All matches, optionally reduced to a non-overlapping selection. */
  search(text: string, options?: SearchOptions): Match<T>[] {
    assertText(text)
    const strategy = resolveStrategy(options, 'all')
    return selectMatches(Array.from(this.#scan(text)), strategy)
  }

  /** Lazily emit all matches in end/length/input order. Validates text immediately. */
  iterate(text: string): IterableIterator<Match<T>> {
    assertText(text)
    return this.#scan(text)
  }

  /** Stop scanning as soon as a match is found. */
  match(text: string): boolean {
    assertText(text)
    return !this.#scan(text).next().done
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
    const selected = selectMatches(Array.from(this.#scan(text)), strategy)
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

  #build(): void {
    for (const [index, { pattern }] of this.#patterns.entries()) {
      let state = 0
      for (const { segment } of this.#segmenter.segment(pattern)) {
        let next = this.#nodes[state].next.get(segment)
        if (next === undefined) {
          next = this.#nodes.length
          this.#nodes[state].next.set(segment, next)
          this.#nodes.push(createNode())
        }
        state = next
      }
      this.#nodes[state].terminals.push(index)
    }

    const queue = [...this.#nodes[0].next.values()]
    for (let head = 0; head < queue.length; head++) {
      const state = queue[head]
      for (const [segment, child] of this.#nodes[state].next) {
        queue.push(child)
        let failure = this.#nodes[state].failure
        while (failure !== 0 && !this.#nodes[failure].next.has(segment)) {
          failure = this.#nodes[failure].failure
        }
        failure = this.#nodes[failure].next.get(segment) ?? 0
        this.#nodes[child].failure = failure
        this.#nodes[child].output = this.#nodes[failure].terminals.length > 0
          ? failure
          : this.#nodes[failure].output
      }
    }
  }

  * #scan(text: string): Generator<Match<T>> {
    if (this.#patterns.length === 0) {
      return
    }
    let state = 0
    for (const { segment, index } of this.#segmenter.segment(text)) {
      let next = this.#nodes[state].next.get(segment)
      while (next === undefined && state !== 0) {
        state = this.#nodes[state].failure
        next = this.#nodes[state].next.get(segment)
      }
      state = next ?? 0
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
}
