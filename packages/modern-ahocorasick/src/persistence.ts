import type { CompactAutomaton } from './internal.js'
import type { DeserializeOptions, JsonValue, SerializeOptions } from './types.js'
import { advanceCompact, createAsciiSymbols, graphemeRuns } from './internal.js'

interface Entry<T> {
  pattern: string
  data: T | undefined
}

function invalid(): never {
  throw new TypeError('Invalid or incompatible compiled dictionary')
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalid()
  }
  return value as Record<string, unknown>
}

function numbers(value: unknown, min: number, max: number): number[] {
  if (!Array.isArray(value) || value.some(item => !Number.isInteger(item) || item < min || item > max)) {
    return invalid()
  }
  return value as number[]
}

/** Do not silently lose metadata through JSON's coercion or toJSON hooks. */
function assertJson(value: unknown, seen = new Set<object>()): asserts value is JsonValue {
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

function codec(options: unknown, key: string): void {
  if (options === undefined) {
    return
  }
  const value = record(options)[key]
  if (value !== undefined && typeof value !== 'function') {
    throw new TypeError(`${key} must be a function`)
  }
}

export function serialize<T>(table: CompactAutomaton, patterns: Entry<T>[], options?: SerializeOptions<T>): string {
  codec(options, 'encodeData')
  const entries = patterns.map(({ pattern, data }) => {
    if (data === undefined) {
      return { pattern }
    }
    const encoded = options?.encodeData ? options.encodeData(data) : data
    assertJson(encoded)
    return { pattern, data: encoded }
  })
  return JSON.stringify({
    format: 'modern-ahocorasick',
    version: 1,
    segmentation: 'Intl.Segmenter:grapheme',
    symbols: [...table.symbols.keys()],
    edges: [...table.edges],
    labels: [...table.labels],
    targets: [...table.targets],
    failures: [...table.failures],
    outputs: [...table.outputs],
    terminals: [...table.terminals],
    patternIndices: [...table.patterns],
    patterns: entries,
  })
}

export function deserialize<T>(serialized: string, segmenter: Intl.Segmenter, options?: DeserializeOptions<T>): {
  table: CompactAutomaton
  patterns: Entry<T>[]
  lengths: Uint32Array
  counts: Uint32Array
  order: Uint32Array
  maxLength: number
} {
  codec(options, 'decodeData')
  if (typeof serialized !== 'string') {
    return invalid()
  }
  let source: Record<string, unknown>
  try {
    source = record(JSON.parse(serialized))
  }
  catch {
    return invalid()
  }
  if (source['format'] !== 'modern-ahocorasick' || source['version'] !== 1 || source['segmentation'] !== 'Intl.Segmenter:grapheme') {
    return invalid()
  }
  if (!Array.isArray(source['symbols']) || !source['symbols'].every(symbol => typeof symbol === 'string' && symbol.length > 0)
    || !Array.isArray(source['patterns'])) {
    return invalid()
  }
  const symbolNames = source['symbols'] as string[]
  const symbols = new Map<string, number>(symbolNames.map((symbol, index) => [symbol, index]))
  if (symbols.size !== source['symbols'].length) {
    return invalid()
  }
  const failures = Uint32Array.from(numbers(source['failures'], 0, 0xFFFFFFFF))
  const size = failures.length
  if (size === 0) {
    return invalid()
  }
  const table: CompactAutomaton = {
    symbols,
    asciiSymbols: createAsciiSymbols(symbols),
    roots: new Uint32Array(symbols.size),
    edges: Uint32Array.from(numbers(source['edges'], 0, size - 1)),
    labels: Uint32Array.from(numbers(source['labels'], 0, symbols.size - 1)),
    targets: Uint32Array.from(numbers(source['targets'], 1, size - 1)),
    failures,
    outputs: Int32Array.from(numbers(source['outputs'], -1, size - 1)),
    terminals: Uint32Array.from(numbers(source['terminals'], 0, source['patterns'].length)),
    patterns: Uint32Array.from(numbers(source['patternIndices'], 0, source['patterns'].length - 1)),
  }
  if (table.edges.length !== size + 1 || table.terminals.length !== size + 1 || table.outputs.length !== size
    || table.targets.length !== size - 1 || table.labels.length !== size - 1 || table.patterns.length !== source['patterns'].length
    || table.edges[0] !== 0 || table.edges[size] !== size - 1 || table.terminals[0] !== 0 || table.terminals[1] !== 0
    || table.terminals[size] !== source['patterns'].length || failures[0] !== 0 || table.outputs[0] !== -1) {
    return invalid()
  }
  for (let state = 0; state < size; state++) {
    if (table.edges[state] > table.edges[state + 1] || table.terminals[state] > table.terminals[state + 1]) {
      return invalid()
    }
    for (let edge = table.edges[state] + 1; edge < table.edges[state + 1]; edge++) {
      if (table.labels[edge - 1] >= table.labels[edge]) {
        return invalid()
      }
    }
  }
  const parents = new Int32Array(size).fill(-1)
  const labels = new Uint32Array(size)
  const depths = new Uint32Array(size)
  const queue = [0]
  parents[0] = 0
  for (let head = 0; head < queue.length; head++) {
    const state = queue[head]
    for (let edge = table.edges[state]; edge < table.edges[state + 1]; edge++) {
      const child = table.targets[edge]
      if (parents[child] !== -1) {
        return invalid()
      }
      parents[child] = state
      labels[child] = table.labels[edge]
      depths[child] = depths[state] + 1
      queue.push(child)
      if (state === 0) {
        table.roots[table.labels[edge]] = child
      }
    }
  }
  if (queue.length !== size) {
    return invalid()
  }
  const counts = new Uint32Array(size)
  const terminals = new Int32Array(source['patterns'].length).fill(-1)
  for (const state of queue.slice(1)) {
    const parent = parents[state]
    const failure = parent === 0 ? 0 : advanceCompact(table, failures[parent], symbolNames[labels[state]])
    if (failures[state] !== failure || table.outputs[state] !== (table.terminals[failure] < table.terminals[failure + 1] ? failure : table.outputs[failure])) {
      return invalid()
    }
    const start = table.terminals[state]
    const end = table.terminals[state + 1]
    counts[state] = end - start + counts[failure]
    for (let index = start; index < end; index++) {
      const patternIndex = table.patterns[index]
      if (terminals[patternIndex] !== -1 || (index > start && table.patterns[index - 1] >= patternIndex)) {
        return invalid()
      }
      terminals[patternIndex] = state
    }
  }
  const lengths = new Uint32Array(source['patterns'].length)
  let maxLength = 0
  // Validate dictionary segmentation in the loading runtime, rather than
  // guessing compatibility from a locale or a small Unicode fingerprint.
  const patterns = source['patterns'].map((value, index) => {
    const entry = record(value)
    if (typeof entry['pattern'] !== 'string' || entry['pattern'].length === 0 || terminals[index] === -1) {
      return invalid()
    }
    let state = 0
    let depth = 0
    for (const segments of graphemeRuns(entry['pattern'], segmenter)) {
      for (const { segment } of segments) {
        state = advanceCompact(table, state, segment)
        depth++
        if (depths[state] !== depth) {
          return invalid()
        }
      }
    }
    if (state !== terminals[index]) {
      return invalid()
    }
    lengths[index] = depth
    maxLength = Math.max(maxLength, depth)
    if (entry['data'] !== undefined) {
      assertJson(entry['data'])
    }
    return { pattern: entry['pattern'], data: entry['data'] === undefined ? undefined : options?.decodeData ? options.decodeData(entry['data']) : entry['data'] as T }
  })
  return { table, patterns, lengths, counts, order: Uint32Array.from(queue.slice(1)), maxLength }
}
