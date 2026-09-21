import type { GraphNode } from './graph'
import AhoCorasick from 'modern-ahocorasick'
import { buildAutomaton } from '../../../packages/modern-ahocorasick/src/internal'
import { parseKeywords, trace } from './trace'

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Repository-only adapter; compile once per dictionary, never expose tables in npm. */
export function compile(keywords: string) {
  const patterns = parseKeywords(keywords)
  const matcher = new AhoCorasick(patterns)
  const { nodes: automaton } = buildAutomaton(
    patterns.map(pattern => ({ pattern })),
    segmenter,
  )
  const prefixes = ['']
  // Trie parents always precede their children in the builder's node array.
  const nodes: GraphNode[] = automaton.map((node, id) => {
    for (const [label, target] of node.next) {
      prefixes[target] = prefixes[id] + label
    }
    const patternIndices: number[] = []
    for (let output = id; output !== -1; output = automaton[output].output) {
      patternIndices.push(...automaton[output].terminals)
    }
    return {
      id,
      prefix: prefixes[id],
      ownPatternIndices: [...node.terminals],
      failure: node.failure,
      terminal: node.terminals.length > 0,
      patternIndices,
      output: patternIndices.map(index => patterns[index]),
      edges: [...node.next].map(([label, target]) => ({ label, target })),
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
