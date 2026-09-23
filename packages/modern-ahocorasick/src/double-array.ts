import type { CompactAutomaton } from './internal.js'
import type { Backend } from './runtime.js'
/** Keep temporary placement arrays outside the retained scanner closure scope. */
function compileDoubleArray(table: CompactAutomaton) {
  const alphabet = table.symbols
  const slots = new Uint32Array(table.failures.length)
  const check: number[] = [0]
  const base: number[] = [0]
  let free = 1
  for (let id = 0; id < slots.length; id++) {
    const start = table.edges[id]
    const end = table.edges[id + 1]
    if (start === end) {
      continue
    }
    let offset = Math.max(0, free - table.labels[start] - 1)
    let edge = start
    while (edge < end) {
      if (check[offset + table.labels[edge] + 1] !== undefined) {
        offset++
        edge = start
      }
      else {
        edge++
      }
    }
    base[slots[id]] = offset
    for (let edge = start; edge < end; edge++) {
      const slot = offset + table.labels[edge] + 1
      check[slot] = slots[id]
      slots[table.targets[edge]] = slot
    }
    while (check[free] !== undefined) {
      free++
    }
  }
  const bases = Int32Array.from({ length: check.length }, (_, i) => base[i] ?? 0)
  const parents = Int32Array.from({ length: check.length }, (_, i) => check[i] ?? -1)
  const failures = new Int32Array(check.length)
  const outputs = new Int32Array(check.length).fill(-1)
  const terminals = new Uint32Array(check.length + 1)
  for (let id = 0; id < slots.length; id++) {
    terminals[slots[id] + 1] = table.terminals[id + 1] - table.terminals[id]
  }
  for (let slot = 1; slot < terminals.length; slot++) {
    terminals[slot] += terminals[slot - 1]
  }
  const patterns = new Uint32Array(table.patterns.length)
  for (let id = 0; id < slots.length; id++) {
    const slot = slots[id]
    failures[slot] = slots[table.failures[id]]
    outputs[slot] = table.outputs[id] === -1 ? -1 : slots[table.outputs[id]]
    const start = table.terminals[id]
    const end = table.terminals[id + 1]
    if (start !== end) {
      patterns.set(table.patterns.subarray(start, end), terminals[slot])
    }
  }
  return { alphabet, bases, parents, failures, outputs, terminals, patterns }
}

/** Compile an explicit double-array trie from the shared compact builder. */
export function doubleArray(table: CompactAutomaton): Backend {
  const { alphabet, bases, parents, failures, outputs, terminals, patterns } = compileDoubleArray(table)
  return {
    stats: {
      backend: 'double-array',
      stateCount: table.failures.length,
      transitionCount: table.targets.length,
      alphabetSize: alphabet.size,
      typedArrayBytes: bases.byteLength + parents.byteLength + failures.byteLength
        + outputs.byteLength + terminals.byteLength + patterns.byteLength,
    },
    advance(state, unit) {
      const symbol = alphabet.get(unit)
      if (symbol === undefined) {
        return 0
      }
      const code = symbol + 1
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
        for (let index = terminals[output]; index < terminals[output + 1]; index++) {
          yield patterns[index]
        }
      }
    },
  }
}
