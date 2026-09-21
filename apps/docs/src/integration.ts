import type { GraphNode } from './graph'
import AhoCorasick from 'modern-ahocorasick'
import { buildAutomaton } from '../../../packages/modern-ahocorasick/src/internal'
import { parseKeywords, trace } from './trace'

/** Repository-only adapter. Public consumers continue to use the workspace package. */
export function prepare(keywords: string, text: string) {
  const patterns = parseKeywords(keywords)
  const matcher = new AhoCorasick(patterns)
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const automaton = buildAutomaton(
    patterns.map(pattern => ({ pattern })),
    segmenter,
  )
  const nodes: GraphNode[] = automaton.map((node, id) => {
    const patternIndices: number[] = []
    for (let output = id; output !== -1; output = automaton[output].output) {
      patternIndices.push(...automaton[output].terminals)
    }
    return {
      id,
      failure: node.failure,
      terminal: node.terminals.length > 0,
      patternIndices,
      output: patternIndices.map(index => patterns[index]),
      edges: [...node.next].map(([label, target]) => ({ label, target })),
    }
  })
  return {
    patterns,
    nodes,
    steps: trace(nodes, patterns, text),
    segments: [...segmenter.segment(text)],
    expected: matcher.search(text),
  }
}
