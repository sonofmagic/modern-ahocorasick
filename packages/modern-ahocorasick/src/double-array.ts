import type { AutomatonNode } from './internal.js'
import type { Backend } from './runtime.js'
/** Compile an explicit double-array trie, then release the Map-based build graph. */
export function doubleArray(nodes: AutomatonNode[]): Backend {
  const alphabet = new Map<string, number>()
  for (const node of nodes) {
    for (const unit of node.next.keys()) {
      if (!alphabet.has(unit)) {
        alphabet.set(unit, alphabet.size + 1)
      }
    }
  }
  const slots: number[] = [0]
  const check: number[] = [0]
  const base: number[] = [0]
  let free = 1
  for (let id = 0; id < nodes.length; id++) {
    const edges = Array.from(nodes[id].next, ([unit, child]) => ({ code: alphabet.get(unit)!, child })).sort((a, b) => a.code - b.code)
    if (edges.length === 0) {
      continue
    }
    let offset = Math.max(0, free - edges[0].code)
    while (edges.some(edge => check[offset + edge.code] !== undefined)) {
      offset++
    }
    base[slots[id]] = offset
    for (const { code, child } of edges) {
      const slot = offset + code
      check[slot] = slots[id]
      slots[child] = slot
    }
    while (check[free] !== undefined) {
      free++
    }
  }
  const bases = Int32Array.from({ length: check.length }, (_, i) => base[i] ?? 0)
  const parents = Int32Array.from({ length: check.length }, (_, i) => check[i] ?? -1)
  const failures = new Int32Array(check.length)
  const outputs = new Int32Array(check.length).fill(-1)
  const terminals: number[][] = []
  for (let id = 0; id < nodes.length; id++) {
    const slot = slots[id]
    failures[slot] = slots[nodes[id].failure]
    outputs[slot] = nodes[id].output === -1 ? -1 : slots[nodes[id].output]
    terminals[slot] = [...nodes[id].terminals]
  }
  return {
    advance(state, unit) {
      const code = alphabet.get(unit)
      if (code === undefined) {
        return 0
      }
      while (true) {
        const next = bases[state] + code
        if (parents[next] === state) {
          return next
        }
        if (state === 0) {
          return 0
        }
        state = failures[state]
      }
    },
    * outputs(state) {
      for (let output = state; output !== -1; output = outputs[output]) {
        yield* terminals[output] ?? []
      }
    },
  }
}
