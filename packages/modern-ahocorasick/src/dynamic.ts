import type { DeserializeOptions, JsonValue, Matcher, MatcherOptions, PatternInput, SerializeOptions } from './types.js'
import AhoCorasick from './index.js'
import { resolveCharacterBoundary } from './runtime.js'

export interface DictionarySnapshot<T = unknown> {
  readonly matcher: Matcher<T>
  /** patternIndex -> stable entry ID. Frozen, independently owned by this snapshot. */
  readonly ids: readonly number[]
}
export type DictionaryCompiler<T> = (patterns: readonly PatternInput<T>[], options: MatcherOptions) => Matcher<T>
export interface CompileAsyncOptions {
  signal?: AbortSignal
}
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
  #revision = 0
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
    this.#revision++
    this.#snapshot = undefined
    return id
  }

  delete(id: number): boolean {
    if (!Number.isSafeInteger(id) || id < 0) {
      throw new TypeError('ID must be a non-negative safe integer')
    }
    const removed = this.#entries.delete(id)
    if (removed) {
      this.#revision++
      this.#snapshot = undefined
    }
    return removed
  }

  clear(): void {
    if (this.#entries.size === 0) {
      return
    }
    this.#entries.clear()
    this.#revision++
    this.#snapshot = undefined
  }

  compile(): DictionarySnapshot<T> {
    this.#snapshot ??= Object.freeze({
      matcher: this.#compile(Array.from(this.#entries.values(), entry => entry.data === undefined ? { pattern: entry.pattern } : { ...entry, data: entry.data }), this.#options),
      ids: Object.freeze([...this.#entries.keys()]),
    })
    return this.#snapshot
  }

  /** Compile a snapshot after yielding once so callers can cancel before the build starts. */
  async compileAsync(options?: CompileAsyncOptions): Promise<DictionarySnapshot<T>> {
    if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) {
      throw new TypeError('options must be an object')
    }
    const signal = options?.signal
    if (signal !== undefined && !(signal instanceof AbortSignal)) {
      throw new TypeError('signal must be an AbortSignal')
    }
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
    }
    if (this.#snapshot) {
      return this.#snapshot
    }
    const revision = this.#revision
    const patterns = Array.from(this.#entries.values(), entry => entry.data === undefined ? { pattern: entry.pattern } : { ...entry, data: entry.data })
    const ids = [...this.#entries.keys()]
    await new Promise<void>(resolve => queueMicrotask(resolve))
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
    }
    const snapshot = Object.freeze({
      matcher: this.#compile(patterns, this.#options),
      ids: Object.freeze(ids),
    })
    if (revision === this.#revision) {
      this.#snapshot = snapshot
    }
    return snapshot
  }

  /** Persist editable entries and stable IDs, including the next-ID frontier. */
  serialize(options?: SerializeOptions<T>): string {
    if (typeof this.#options.boundary === 'function') {
      throw new TypeError('serialize does not support function boundary rules')
    }
    if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) {
      throw new TypeError('options must be an object')
    }
    if (options?.encodeData !== undefined && typeof options.encodeData !== 'function') {
      throw new TypeError('encodeData must be a function')
    }
    const entries = [...this.#entries.entries()].map(([id, entry]) => {
      if (entry.data === undefined) {
        return { id, pattern: entry.pattern }
      }
      const data = options?.encodeData ? options.encodeData(entry.data) : entry.data
      // eslint-disable-next-line ts/no-use-before-define -- helper is declared after the class
      if (!isJson(data)) {
        throw new TypeError('Metadata must be JSON-compatible; provide an encodeData codec')
      }
      return { id, pattern: entry.pattern, data }
    })
    return JSON.stringify({ format: 'modern-ahocorasick/dynamic', version: 1, nextId: this.#nextId, options: this.#options, entries })
  }

  static deserialize<T = unknown>(serialized: string, options?: DeserializeOptions<T>, compiler?: DictionaryCompiler<T>): DynamicDictionary<T> {
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
      throw new TypeError('Invalid serialized dynamic dictionary')
    }
    if (source['format'] !== 'modern-ahocorasick/dynamic' || source['version'] !== 1
      || !Array.isArray(source['entries']) || source['options'] === null || typeof source['options'] !== 'object'
      || !Number.isSafeInteger(source['nextId']) || (source['nextId'] as number) < 0) {
      throw new TypeError('Invalid serialized dynamic dictionary')
    }
    const optionsRecord = source['options'] as MatcherOptions
    const dictionary = new DynamicDictionary<T>([], optionsRecord, compiler)
    let maxId = -1
    for (const entry of source['entries'] as unknown[]) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new TypeError('Invalid serialized dynamic entry')
      }
      const value = entry as { id?: unknown, pattern?: unknown, data?: unknown }
      if (!Number.isSafeInteger(value.id) || (value.id as number) < 0 || typeof value.pattern !== 'string' || value.pattern.length === 0) {
        throw new TypeError('Invalid serialized dynamic entry')
      }
      if (dictionary.#entries.has(value.id as number)) {
        throw new TypeError('Duplicate dynamic entry ID')
      }
      dictionary.#entries.set(value.id as number, {
        pattern: value.pattern,
        data: value.data === undefined ? undefined : options?.decodeData ? options.decodeData(value.data as JsonValue) : value.data as T,
      })
      maxId = Math.max(maxId, value.id as number)
    }
    dictionary.#nextId = Math.max(source['nextId'] as number, maxId + 1)
    dictionary.#revision++
    return dictionary
  }
}

function isJson(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
    return true
  }
  if (typeof value !== 'object' || seen.has(value)
    || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || typeof (value as { toJSON?: unknown }).toJSON === 'function'
    || Object.getOwnPropertySymbols(value).length) {
    return false
  }
  seen.add(value)
  const valid = (Array.isArray(value) ? value : Object.values(value)).every(item => isJson(item, seen))
  seen.delete(value)
  return valid
}
