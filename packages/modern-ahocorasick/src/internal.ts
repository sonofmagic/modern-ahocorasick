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
    for (const { segment } of segmenter.segment(pattern)) {
      length++
      let next = nodes[state].next.get(segment)
      if (next === undefined) {
        next = nodes.length
        nodes[state].next.set(segment, next)
        nodes.push(createNode())
      }
      state = next
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
