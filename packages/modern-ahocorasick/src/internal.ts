// Repository-internal builder shared with the docs. Bundled into the library; not an npm entry.
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

// Building failure links and scanning text exercise different state profiles.
// Keep this loop separate from advanceCompact so construction does not train
// the scanner's JIT feedback toward root-only transitions.
function advanceBuildSymbol(table: CompactAutomaton, state: number, symbol: number): number {
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

export function advanceCompact(table: CompactAutomaton, state: number, segment: string): number {
  const symbol = table.symbols.get(segment)
  if (symbol === undefined) {
    return 0
  }
  // Intentionally independent of the construction-only numeric transition.
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

// A state usually has zero or one edge. Only branching states need a Map;
// after a small first block grows to capacity, fixed blocks avoid copying the
// full trie and allocating one object per state.
const blockBits = 10
const blockSize = 1 << blockBits
const blockMask = blockSize - 1
const branching = 0xFFFFFFFF
const patternMemoLimit = 256

export function buildAutomaton(patterns: readonly { pattern: string }[], segmenter: Intl.Segmenter, units?: (segment: string) => string[]): {
  compact: CompactAutomaton
  lengths: Uint32Array
  counts: Uint32Array
  order: Uint32Array
  maxLength: number
} {
  const symbols = new Map<string, number>()
  let firstCapacity = 16
  const labelBlocks: (Uint32Array | undefined)[] = [new Uint32Array(firstCapacity)]
  const targetBlocks: (Uint32Array | undefined)[] = [new Uint32Array(firstCapacity)]
  const forks: (Map<number, number> | undefined)[] = []
  const lengths = new Uint32Array(patterns.length)
  // Repeated strings share their compiled route, never their public metadata.
  // Bound this temporary index so unique million-pattern inputs cannot grow it.
  const patternMemo = patterns.length > 1 ? new Map<string, number>() : undefined
  let terminalStates = new Uint32Array(patterns.length)
  let size = 1
  let maxLength = 0
  function append(state: number, segment: string): number {
    let symbol = symbols.get(segment)
    if (symbol === undefined) {
      symbol = symbols.size
      symbols.set(segment, symbol)
    }
    const block = state >>> blockBits
    const offset = state & blockMask
    const labels = labelBlocks[block]!
    const targets = targetBlocks[block]!
    const label = labels[offset]
    if (label === symbol + 1) {
      return targets[offset]
    }
    const fork = label === branching ? forks[targets[offset]] : undefined
    if (fork) {
      const child = fork.get(symbol)
      if (child !== undefined) {
        return child
      }
    }
    const child = size++
    if (fork) {
      fork.set(symbol, child)
    }
    else if (label === 0) {
      labels[offset] = symbol + 1
      targets[offset] = child
    }
    else {
      const branch = new Map<number, number>()
      branch.set(label - 1, targets[offset])
      branch.set(symbol, child)
      labels[offset] = branching
      targets[offset] = forks.length
      forks.push(branch)
    }
    // Store the parent edge before copying the first block: labels/targets
    // above may still reference the old arrays while a fork is being promoted.
    if (child === firstCapacity && firstCapacity < blockSize) {
      firstCapacity *= 2
      const grownLabels = new Uint32Array(firstCapacity)
      const grownTargets = new Uint32Array(firstCapacity)
      grownLabels.set(labelBlocks[0]!)
      grownTargets.set(targetBlocks[0]!)
      labelBlocks[0] = grownLabels
      targetBlocks[0] = grownTargets
    }
    else if ((child & blockMask) === 0) {
      labelBlocks.push(new Uint32Array(blockSize))
      targetBlocks.push(new Uint32Array(blockSize))
    }
    return child
  }
  for (let index = 0; index < patterns.length; index++) {
    const { pattern } = patterns[index]
    const previous = patternMemo?.get(pattern)
    if (previous !== undefined) {
      terminalStates[index] = terminalStates[previous]
      lengths[index] = lengths[previous]
      continue
    }
    let state = 0
    let length = 0
    for (const segments of graphemeRuns(pattern, segmenter)) {
      for (const { segment } of segments) {
        if (units) {
          for (const unit of units(segment)) {
            state = append(state, unit)
            length++
          }
        }
        else {
          state = append(state, segment)
          length++
        }
      }
    }
    terminalStates[index] = state
    lengths[index] = length
    maxLength = Math.max(maxLength, length)
    if (patternMemo && patternMemo.size < patternMemoLimit) {
      patternMemo.set(pattern, index)
    }
  }
  patternMemo?.clear()

  const edges = new Uint32Array(size + 1)
  const labels = new Uint32Array(size - 1)
  const targets = new Uint32Array(size - 1)
  let edge = 0
  for (let block = 0; block < labelBlocks.length; block++) {
    const blockLabels = labelBlocks[block]!
    const blockTargets = targetBlocks[block]!
    const start = block * blockSize
    const end = Math.min(size - start, blockSize)
    for (let offset = 0; offset < end; offset++) {
      edges[start + offset] = edge
      const label = blockLabels[offset]
      if (label === branching) {
        const forkIndex = blockTargets[offset]
        const fork = forks[forkIndex]!
        const sorted = Array.from(fork.keys()).sort((a, b) => a - b)
        for (const symbol of sorted) {
          labels[edge] = symbol
          targets[edge++] = fork.get(symbol)!
        }
        forks[forkIndex] = undefined
      }
      else if (label !== 0) {
        labels[edge] = label - 1
        targets[edge++] = blockTargets[offset]
      }
    }
    // Release blocks as soon as their edges have entered the final CSR arrays.
    labelBlocks[block] = undefined
    targetBlocks[block] = undefined
  }
  edges[size] = edge
  const roots = new Uint32Array(symbols.size)
  for (let edge = edges[0]; edge < edges[1]; edge++) {
    roots[labels[edge]] = targets[edge]
  }
  const terminals = new Uint32Array(size + 1)
  for (const state of terminalStates) {
    terminals[state + 1]++
  }
  const counts = new Uint32Array(size)
  for (let state = 0; state < size; state++) {
    terminals[state + 1] += terminals[state]
    // Reuse the final counts array as terminal write cursors before BFS.
    counts[state] = terminals[state]
  }
  const patternIndices = new Uint32Array(patterns.length)
  for (let index = 0; index < terminalStates.length; index++) {
    patternIndices[counts[terminalStates[index]]++] = index
  }
  terminalStates = new Uint32Array(0)
  const failures = new Uint32Array(size)
  const outputs = new Int32Array(size).fill(-1)
  const compact = { symbols, roots, edges, labels, targets, failures, outputs, terminals, patterns: patternIndices }
  const order = new Uint32Array(size - 1)
  let tail = 0
  for (let edge = edges[0]; edge < edges[1]; edge++) {
    order[tail++] = targets[edge]
  }
  counts[0] = 0
  for (let head = 0; head < order.length; head++) {
    const state = order[head]
    counts[state] = terminals[state + 1] - terminals[state] + counts[failures[state]]
    for (let edge = edges[state]; edge < edges[state + 1]; edge++) {
      const child = targets[edge]
      order[tail++] = child
      const failure = advanceBuildSymbol(compact, failures[state], labels[edge])
      failures[child] = failure
      outputs[child] = terminals[failure] < terminals[failure + 1] ? failure : outputs[failure]
    }
  }
  return { compact, lengths, counts, order, maxLength }
}
