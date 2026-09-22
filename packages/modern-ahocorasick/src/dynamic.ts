import type { Matcher, MatcherOptions, PatternInput } from './types.js'
import AhoCorasick from './index.js'
import { resolveCharacterBoundary } from './runtime.js'

export interface DictionarySnapshot<T = unknown> {
  readonly matcher: Matcher<T>
  /** patternIndex -> stable entry ID. Frozen, independently owned by this snapshot. */
  readonly ids: readonly number[]
}
export type DictionaryCompiler<T> = (patterns: readonly PatternInput<T>[], options: MatcherOptions) => Matcher<T>
/** Collect edits, then explicitly compile an immutable dictionary snapshot. */
export default class DynamicDictionary<T = unknown> {
  readonly #entries = new Map<number, {
    pattern: string
    data: T | undefined
  }>()

  readonly #options: MatcherOptions
  readonly #compile: DictionaryCompiler<T>
  #nextId = 0
  #snapshot: DictionarySnapshot<T> | undefined
  constructor(patterns: readonly PatternInput<T>[] = [], options?: MatcherOptions, compiler: DictionaryCompiler<T> = (patterns, options) => new AhoCorasick(patterns, options)) {
    if (!Array.isArray(patterns)) {
      throw new TypeError('patterns must be an array')
    }
    if (typeof compiler !== 'function') {
      throw new TypeError('compiler must be a function')
    }
    this.#options = Object.freeze({ boundary: resolveCharacterBoundary(options) })
    this.#compile = compiler
    for (const input of patterns) {
      this.add(input)
    }
  }

  get size(): number {
    return this.#entries.size
  }

  add(input: PatternInput<T>): number {
    const pattern = typeof input === 'string' ? input : input !== null && typeof input === 'object' && !Array.isArray(input) ? input.pattern : undefined
    if (typeof pattern !== 'string') {
      throw new TypeError('pattern must be a string')
    }
    if (pattern.length === 0) {
      throw new RangeError('pattern must not be empty')
    }
    if (!Number.isSafeInteger(this.#nextId)) {
      throw new RangeError('entry ID exceeds Number.MAX_SAFE_INTEGER')
    }
    const id = this.#nextId++
    this.#entries.set(id, { pattern, data: typeof input === 'string' ? undefined : input.data })
    this.#snapshot = undefined
    return id
  }

  delete(id: number): boolean {
    if (!Number.isSafeInteger(id) || id < 0) {
      throw new TypeError('ID must be a non-negative safe integer')
    }
    const removed = this.#entries.delete(id)
    if (removed) {
      this.#snapshot = undefined
    }
    return removed
  }

  clear(): void {
    if (this.#entries.size === 0) {
      return
    }
    this.#entries.clear()
    this.#snapshot = undefined
  }

  compile(): DictionarySnapshot<T> {
    this.#snapshot ??= Object.freeze({
      matcher: this.#compile(Array.from(this.#entries.values(), entry => entry.data === undefined ? { pattern: entry.pattern } : { ...entry, data: entry.data }), this.#options),
      ids: Object.freeze([...this.#entries.keys()]),
    })
    return this.#snapshot
  }
}
