import type { GraphNode } from './graph'
import AhoCorasick from 'modern-ahocorasick'
import { buildAutomaton } from '../../../packages/modern-ahocorasick/src/internal'
import { parseKeywords, trace } from './trace'

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Repository-only adapter; compile once per dictionary, never expose tables in npm. */
export function compile(keywords: string) {
  const patterns = parseKeywords(keywords)
  const matcher = new AhoCorasick(patterns)
  const { compact: automaton } = buildAutomaton(
    patterns.map(pattern => ({ pattern })),
    segmenter,
  )
  const prefixes = ['']
  const symbols = [...automaton.symbols.keys()]
  // Trie parents always precede their children in the builder's state IDs.
  const nodes: GraphNode[] = Array.from({ length: automaton.failures.length }, (_, id) => {
    const edges = []
    for (let edge = automaton.edges[id]; edge < automaton.edges[id + 1]; edge++) {
      const label = symbols[automaton.labels[edge]]
      const target = automaton.targets[edge]
      prefixes[target] = prefixes[id] + label
      edges.push({ label, target })
    }
    // The visual graph keeps dictionary insertion order, independent of the
    // sorted numeric labels used for binary search in the scanner.
    edges.sort((a, b) => a.target - b.target)
    const ownPatternIndices = Array.from(automaton.patterns.subarray(automaton.terminals[id], automaton.terminals[id + 1]))
    const patternIndices: number[] = []
    for (let output = id; output !== -1; output = automaton.outputs[output]) {
      for (let index = automaton.terminals[output]; index < automaton.terminals[output + 1]; index++) {
        patternIndices.push(automaton.patterns[index])
      }
    }
    return {
      id,
      prefix: prefixes[id],
      ownPatternIndices,
      failure: automaton.failures[id],
      terminal: ownPatternIndices.length > 0,
      patternIndices,
      output: patternIndices.map(index => patterns[index]),
      edges,
    }
  })
  return { patterns, nodes, matcher }
}

export function scan(dictionary: ReturnType<typeof compile>, text: string) {
  const segments = Array.from(
    segmenter.segment(text),
    ({ segment, index }) => ({ segment, index }),
  )
  const steps = trace(dictionary.nodes, dictionary.patterns, text, segments)
  const hits = steps.flatMap((step, index) =>
    step.match
      ? [{ cursor: index + 1, match: step.match, grapheme: step.grapheme }]
      : [],
  )
  return {
    patterns: dictionary.patterns,
    nodes: dictionary.nodes,
    steps,
    segments,
    hits,
  }
}

export function prepare(keywords: string, text: string) {
  return scan(compile(keywords), text)
}
export type ScanModel = ReturnType<typeof scan>
