// Repository-internal builder shared with the docs. Bundled into the library; not an npm entry.
export interface AutomatonNode {
  next: Map<string, number>
  failure: number
  output: number
  terminals: number[]
}

/** Retained scan tables: interned graphemes and contiguous sparse transitions. */
export interface CompactAutomaton {
  symbols: Map<string, number>
  roots: Uint32Array
  edges: Uint32Array
  labels: Uint32Array
  targets: Uint32Array
  failures: Uint32Array
  outputs: Int32Array
  terminals: Uint32Array
  patterns: Uint32Array
}

export function compactAutomaton(nodes: AutomatonNode[], patternCount: number): CompactAutomaton {
  const symbols = new Map<string, number>()
  const edges = new Uint32Array(nodes.length + 1)
  const labels = new Uint32Array(nodes.length - 1)
  const targets = new Uint32Array(nodes.length - 1)
  const failures = new Uint32Array(nodes.length)
  const outputs = new Int32Array(nodes.length)
  const terminals = new Uint32Array(nodes.length + 1)
  const patterns = new Uint32Array(patternCount)
  let edge = 0
  let terminal = 0
  const intern = (segment: string): number => {
    let symbol = symbols.get(segment)
    if (symbol === undefined) {
      symbol = symbols.size
      symbols.set(segment, symbol)
    }
    return symbol
  }
  for (let state = 0; state < nodes.length; state++) {
    const node = nodes[state]
    edges[state] = edge
    if (node.next.size <= 1) {
      for (const [segment, target] of node.next) {
        labels[edge] = intern(segment)
        targets[edge++] = target
      }
    }
    else {
      const children = Array.from(node.next, ([segment, target]) => ({ symbol: intern(segment), target }))
        .sort((a, b) => a.symbol - b.symbol)
      for (const { symbol, target } of children) {
        labels[edge] = symbol
        targets[edge++] = target
      }
    }
    failures[state] = node.failure
    outputs[state] = node.output
    terminals[state] = terminal
    for (const patternIndex of node.terminals) {
      patterns[terminal++] = patternIndex
    }
  }
  edges[nodes.length] = edge
  terminals[nodes.length] = terminal
  const roots = new Uint32Array(symbols.size)
  for (let index = edges[0]; index < edges[1]; index++) {
    roots[labels[index]] = targets[index]
  }
  return { symbols, roots, edges, labels, targets, failures, outputs, terminals, patterns }
}

export function advanceCompact(table: CompactAutomaton, state: number, segment: string): number {
  const symbol = table.symbols.get(segment)
  if (symbol === undefined) {
    return 0
  }
  while (state !== 0) {
    let low = table.edges[state]
    let high = table.edges[state + 1] - 1
    while (low <= high) {
      const middle = (low + high) >>> 1
      const label = table.labels[middle]
      if (label === symbol) {
        return table.targets[middle]
      }
      if (label < symbol) {
        low = middle + 1
      }
      else {
        high = middle - 1
      }
    }
    state = table.failures[state]
  }
  return table.roots[symbol]
}

function createNode(): AutomatonNode {
  return { next: new Map(), failure: 0, output: -1, terminals: [] }
}

/** Internal only: consumers must read each value before advancing the cursor. */
class AsciiCursor implements IterableIterator<Intl.SegmentData> {
  position = 0
  private readonly result: IteratorYieldResult<Intl.SegmentData>

  constructor(private readonly text: string) {
    // Reused on the ASCII path, never exposed through the public match API.
    this.result = { done: false, value: { segment: '', index: 0, input: text } }
  }

  [Symbol.iterator](): IterableIterator<Intl.SegmentData> {
    return this
  }

  next(): IteratorResult<Intl.SegmentData> {
    const start = this.position
    if (start === this.text.length) {
      return { done: true, value: undefined }
    }
    const code = this.text.charCodeAt(start)
    const end = start + (code === 13 && this.text.charCodeAt(start + 1) === 10 ? 2 : 1)
    // ASCII has only one internal non-break: CR × LF. A following non-ASCII
    // code unit may extend this cluster, so leave it unsettled and let ICU
    // segment from this known boundary. Never preflight the entire string.
    if (code > 0x7F || (end < this.text.length && this.text.charCodeAt(end) > 0x7F)) {
      return { done: true, value: undefined }
    }
    this.position = end
    this.result.value.segment = this.text.slice(start, end)
    this.result.value.index = start
    return this.result
  }
}

/**
 * Bounded startup probe, never a full-text preflight. Short mixed prefixes
 * cannot amortize cursor setup before an early native hit, so use the original
 * string directly. Longer ASCII prefixes stop at the first unsettled boundary.
 */
export function asciiPrefix(text: string): AsciiCursor | undefined {
  for (let index = 0, length = Math.min(8, text.length); index < length; index++) {
    if (text.charCodeAt(index) > 0x7F) {
      return undefined
    }
  }
  return new AsciiCursor(text)
}

function* asciiRuns(text: string, segmenter: Intl.Segmenter, ascii: AsciiCursor): Generator<Iterable<Intl.SegmentData>> {
  yield ascii
  if (ascii.position < text.length) {
    yield segmenter.segment(text.slice(ascii.position))
  }
}

/**
 * At most two runs: reusable ASCII values, then unwrapped native iteration.
 * Aggregate scans only need tokens; native suffix offsets remain run-relative.
 */
export function graphemeRuns(text: string, segmenter: Intl.Segmenter): Iterable<Iterable<Intl.SegmentData>> {
  const ascii = asciiPrefix(text)
  if (ascii === undefined) {
    return [segmenter.segment(text)]
  }
  return asciiRuns(text, segmenter, ascii)
}

/** Shared transition rule; no iterator or match allocation on the scan hot path. */
export function advance(nodes: AutomatonNode[], state: number, segment: string): number {
  let next = nodes[state].next.get(segment)
  while (next === undefined && state !== 0) {
    state = nodes[state].failure
    next = nodes[state].next.get(segment)
  }
  return next ?? 0
}

export function buildAutomaton(patterns: readonly { pattern: string }[], segmenter: Intl.Segmenter): {
  nodes: AutomatonNode[]
  lengths: Uint32Array
  counts: Uint32Array
  order: Uint32Array
  maxLength: number
} {
  const nodes: AutomatonNode[] = [createNode()]
  const lengths = new Uint32Array(patterns.length)
  let maxLength = 0
  for (let index = 0; index < patterns.length; index++) {
    const { pattern } = patterns[index]
    let state = 0
    let length = 0
    for (const segments of graphemeRuns(pattern, segmenter)) {
      for (const { segment } of segments) {
        length++
        let next = nodes[state].next.get(segment)
        if (next === undefined) {
          next = nodes.length
          nodes[state].next.set(segment, next)
          nodes.push(createNode())
        }
        state = next
      }
    }
    nodes[state].terminals.push(index)
    lengths[index] = length
    maxLength = Math.max(maxLength, length)
  }

  const counts = new Uint32Array(nodes.length)
  const queue = [...nodes[0].next.values()]
  for (let head = 0; head < queue.length; head++) {
    const node = nodes[queue[head]]
    counts[queue[head]] = node.terminals.length + counts[node.failure]
    for (const [segment, child] of node.next) {
      queue.push(child)
      const failure = advance(nodes, node.failure, segment)
      nodes[child].failure = failure
      nodes[child].output = nodes[failure].terminals.length > 0
        ? failure
        : nodes[failure].output
    }
  }
  return { nodes, lengths, counts, order: Uint32Array.from(queue), maxLength }
}
