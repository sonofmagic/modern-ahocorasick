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

export function buildAutomaton(patterns: readonly { pattern: string }[], segmenter: Intl.Segmenter): AutomatonNode[] {
  const nodes: AutomatonNode[] = [createNode()]
  for (const [index, { pattern }] of patterns.entries()) {
    let state = 0
    for (const { segment } of segmenter.segment(pattern)) {
      let next = nodes[state].next.get(segment)
      if (next === undefined) {
        next = nodes.length
        nodes[state].next.set(segment, next)
        nodes.push(createNode())
      }
      state = next
    }
    nodes[state].terminals.push(index)
  }

  const queue = [...nodes[0].next.values()]
  for (let head = 0; head < queue.length; head++) {
    const state = queue[head]
    for (const [segment, child] of nodes[state].next) {
      queue.push(child)
      let failure = nodes[state].failure
      while (failure !== 0 && !nodes[failure].next.has(segment)) {
        failure = nodes[failure].failure
      }
      failure = nodes[failure].next.get(segment) ?? 0
      nodes[child].failure = failure
      nodes[child].output = nodes[failure].terminals.length > 0
        ? failure
        : nodes[failure].output
    }
  }
  return nodes
}
