// Repository-internal builder shared with the docs. Bundled into the library; not an npm entry.
export interface AutomatonNode {
  next: Map<string, number>
  failure: number
  output: number
  terminals: number[]
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
  return { nodes, lengths, counts, maxLength }
}
