import type { AutomatonNode, CompactAutomaton } from './internal.js'
import type { Boundary, BoundaryContext, CompileStats, Match, Matcher, MatcherOptions, MatchStrategy } from './types.js'
import { advanceCompact } from './internal.js'
// Private interoperability across independently bundled optional entries. Neither
// hook returns tables or permits a consumer to change a compiled dictionary.
const profileKey = Symbol.for('modern-ahocorasick.profile.v1')
const scannerKey = Symbol.for('modern-ahocorasick.scanner.v1')
const replacementKey = Symbol.for('modern-ahocorasick.replacement.v1')
export function operationReplacement<T>(replacement: T): T {
  const factory = typeof replacement === 'function' ? Reflect.get(replacement, replacementKey) : undefined
  return typeof factory === 'function' ? factory() : replacement
}
export function replacementFactory<T extends object>(factory: () => T): T {
  const replacement = factory()
  Object.defineProperty(replacement, replacementKey, { value: factory })
  return replacement
}
export interface Backend {
  stats: Pick<CompileStats, 'backend' | 'stateCount' | 'transitionCount' | 'alphabetSize' | 'typedArrayBytes'>
  advance: (state: number, unit: string) => number
  outputs: (state: number) => Iterable<number>
}
export interface Profile {
  units?: (grapheme: string) => string[]
  backend?: (nodes: AutomatonNode[]) => Backend
}
export interface ScanSession<T> {
  readonly safeOffset: number
  /** Earliest original boundary still needed by a future match or candidate. */
  readonly retainOffset: number
  readonly maxLength: number
  feed: (segment: string, start: number, right: string | undefined, protectedText?: boolean) => Match<T>[]
  end: () => Match<T>[]
  destroy?: () => void
}
export function defineProfile(target: object, profile: Profile): void {
  Object.defineProperty(target, profileKey, { value: Object.freeze(profile) })
}
export function getProfile(target: object): Profile {
  return Reflect.get(target, profileKey) ?? {}
}
export function registerScanner<T>(target: object, create: (strategy: MatchStrategy, range?: (start: number, end: number) => boolean) => ScanSession<T>): void {
  Object.defineProperty(target, scannerKey, { value: create })
}
export function scanner<T>(matcher: Matcher<T>, strategy: MatchStrategy, range?: (start: number, end: number) => boolean): ScanSession<T> {
  const create = Reflect.get(matcher, scannerKey)
  if (typeof create !== 'function') {
    throw new TypeError('matcher must be a modern-ahocorasick compiled matcher')
  }
  return create(strategy, range)
}
export { assertText, resolveStrategy } from './options.js'

export function resolveCharacterBoundary(options?: MatcherOptions): Boundary {
  if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) {
    throw new TypeError('options must be an object')
  }
  const boundary = options?.boundary === undefined ? 'none' : options.boundary
  if (typeof boundary !== 'function' && !['none', 'ascii', 'ascii-edge', 'unicode', 'whitespace'].includes(boundary)) {
    throw new TypeError('unknown boundary rule')
  }
  return boundary
}
export function accepts(boundary: Boundary, context: BoundaryContext): boolean {
  if (typeof boundary === 'function') {
    const value = boundary(context)
    if (typeof value !== 'boolean') {
      throw new TypeError('boundary callback must return a boolean')
    }
    return value
  }
  const { left, right, first, last } = context
  const asciiWord = (text: string | undefined) => text !== undefined && /^[a-z0-9]/i.test(text)
  switch (boundary) {
    case 'ascii': return !asciiWord(left) && !asciiWord(right)
    case 'ascii-edge': return (!asciiWord(first) || !asciiWord(left)) && (!asciiWord(last) || !asciiWord(right))
    case 'unicode': return (left === undefined || !/[\p{L}\p{N}\p{M}_]/u.test(left)) && (right === undefined || !/[\p{L}\p{N}\p{M}_]/u.test(right))
    case 'whitespace': return (left === undefined || /^\s+$/u.test(left)) && (right === undefined || /^\s+$/u.test(right))
    default: return true
  }
}
export function compactBackend(table: CompactAutomaton): Backend {
  return {
    stats: {
      backend: 'compact',
      stateCount: table.failures.length,
      transitionCount: table.targets.length,
      alphabetSize: table.symbols.size,
      typedArrayBytes: table.roots.byteLength + table.edges.byteLength + table.labels.byteLength
        + table.targets.byteLength + table.failures.byteLength + table.outputs.byteLength
        + table.terminals.byteLength + table.patterns.byteLength,
    },
    advance: (state, unit) => advanceCompact(table, state, unit),
    * outputs(state) {
      for (let output = state; output !== -1; output = table.outputs[output]) {
        for (let index = table.terminals[output]; index < table.terminals[output + 1]; index++) {
          yield table.patterns[index]
        }
      }
    },
  }
}

interface Start {
  offset: number
  graph: number
  left: string | undefined
  first: string
}
interface Candidate<T> {
  match: Match<T>
  length: number
}
/** A cursor owns all mutable scan state; the compiled backend is read-only. */
export function createScanner<T>(backend: Backend, patterns: readonly {
  pattern: string
  data: T | undefined
}[], lengths: Uint32Array, maxLength: number, boundary: Boundary, units: ((segment: string) => string[]) | undefined, strategy: MatchStrategy, range?: (start: number, end: number) => boolean): ScanSession<T> {
  if (strategy === 'longest-first') {
    throw new TypeError('longest-first requires complete input')
  }
  let state = 0
  let unitPosition = 0
  let position = 0
  let cursor = 0
  let end = 0
  let safeOffset = 0
  let left: string | undefined
  const capacity = maxLength + 1
  const starts: (Start | undefined)[] = []
  const offsets: number[] = [0]
  const candidates = new Map<number, Candidate<T>>()
  function settle(limit: number): Match<T>[] {
    const output: Match<T>[] = []
    while (cursor <= limit) {
      const candidate = candidates.get(cursor)
      if (candidate) {
        const next = cursor + candidate.length
        while (cursor < next) {
          candidates.delete(cursor++)
        }
        // Internal cursors advance before handing the fresh object to user code.
        output.push(candidate.match)
      }
      else {
        cursor++
      }
    }
    safeOffset = cursor >= position ? end : offsets[cursor % capacity]
    return output
  }
  return {
    maxLength,
    get safeOffset() {
      return safeOffset
    },
    get retainOffset() {
      return Math.min(safeOffset, offsets[Math.max(0, position - maxLength) % capacity] ?? 0)
    },
    feed(segment, start, right, protectedText = false) {
      end = start + segment.length
      offsets[position % capacity] = start
      offsets[(position + 1) % capacity] = end
      if (protectedText || maxLength === 0) {
        const output = settle(position - 1)
        state = 0
        // The absolute unit counter continues, but no failure transition can
        // traverse a protected interval after resetting the automaton.
        cursor = ++position
        safeOffset = end
        left = segment
        return output
      }
      const values = units ? units(segment) : [segment]
      const hits: Candidate<T>[] = []
      for (let index = 0; index < values.length; index++) {
        starts[unitPosition % capacity] = index === 0 ? { offset: start, graph: position, left, first: segment } : undefined
        state = backend.advance(state, values[index])
        unitPosition++
        if (index !== values.length - 1) {
          continue
        }
        for (const patternIndex of backend.outputs(state)) {
          const first = starts[(unitPosition - lengths[patternIndex]) % capacity]
          if (!first) {
            continue
          }
          const { pattern, data } = patterns[patternIndex]
          if ((range && !range(first.offset, end)) || !accepts(boundary, { left: first.left, right, first: first.first, last: segment, pattern, patternIndex })) {
            continue
          }
          const match = { pattern, patternIndex, data, start: first.offset, end }
          const length = position - first.graph + 1
          if (strategy === 'all') {
            hits.push({ match, length })
          }
          else if (first.graph >= cursor) {
            const previous = candidates.get(first.graph)
            if (!previous || (strategy === 'leftmost-first'
              ? patternIndex < previous.match.patternIndex
              : length > previous.length || (length === previous.length && patternIndex < previous.match.patternIndex))) {
              candidates.set(first.graph, { match, length })
            }
          }
        }
      }
      position++
      left = segment
      if (strategy === 'all') {
        cursor = position
        safeOffset = end
        return hits.sort((a, b) => b.length - a.length || a.match.patternIndex - b.match.patternIndex).map(hit => hit.match)
      }
      return settle(position - maxLength)
    },
    end() {
      return settle(position - 1)
    },
  }
}
export function* scanText<T>(text: string, segmenter: Intl.Segmenter, session: ScanSession<T>): Generator<Match<T>> {
  const iterator = segmenter.segment(text)[Symbol.iterator]()
  let current = iterator.next()
  while (!current.done) {
    const next = iterator.next()
    yield* session.feed(current.value.segment, current.value.index, next.done ? undefined : next.value.segment)
    current = next
  }
  yield* session.end()
}
/** Offline global length priority, using original graphemes rather than pattern length. */
export function* selectLongest<T>(matches: Iterable<Match<T>>, text: string, segmenter: Intl.Segmenter): Generator<Match<T>> {
  const positions = new Map<number, number>()
  let index = 0
  for (const segment of segmenter.segment(text)) {
    positions.set(segment.index, index++)
  }
  positions.set(text.length, index)
  const candidates = Array.from(matches, match => ({ match, length: positions.get(match.end)! - positions.get(match.start)! }))
  candidates.sort((a, b) => b.length - a.length || a.match.start - b.match.start || a.match.patternIndex - b.match.patternIndex)
  // Coordinate-compressed Fenwick tree stores accepted occupied graphemes.
  const tree = new Float64Array(index + 1)
  const prefix = (end: number) => {
    let total = 0
    for (let i = end; i > 0; i -= i & -i) {
      total += tree[i]
    }
    return total
  }
  const selected: Match<T>[] = []
  for (const { match } of candidates) {
    const start = positions.get(match.start)!
    const end = positions.get(match.end)!
    if (prefix(end) !== prefix(start)) {
      continue
    }
    selected.push(match)
    for (let point = start; point < end; point++) {
      for (let i = point + 1; i < tree.length; i += i & -i) {
        tree[i]++
      }
    }
  }
  yield* selected.sort((a, b) => a.start - b.start)
}
