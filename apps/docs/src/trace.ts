import type { Match } from 'modern-ahocorasick'
import type { GraphNode } from './graph'
import type { Language } from './i18n'
import { limits } from './limits'

export interface TraceStep {
  kind: 'transition' | 'fallback' | 'skip' | 'hit'
  from: number
  to: number
  grapheme: number
  segment: string
  match?: Match
}
export function parseKeywords(value: string): string[] {
  return value
    .split(',')
    .map(pattern => pattern.trim())
    .filter(Boolean)
}

/** Pure scan over a read-only display snapshot. Never builds or mutates tables. */
export function trace(
  nodes: GraphNode[],
  patterns: readonly string[],
  text: string,
  segments: Iterable<{ segment: string, index: number }> = new Intl.Segmenter(
    undefined,
    { granularity: 'grapheme' },
  ).segment(text),
): TraceStep[] {
  const steps: TraceStep[] = []
  const transitions = nodes.map(
    node => new Map(node.edges.map(edge => [edge.label, edge.target])),
  )
  const append = (step: TraceStep) => {
    if (steps.length >= limits.steps) {
      throw new RangeError('trace limit')
    }
    steps.push(step)
  }
  let state = 0
  let grapheme = 0
  for (const { segment, index } of segments) {
    let next = transitions[state].get(segment)
    while (next === undefined && state !== 0) {
      const to = nodes[state].failure
      append({ kind: 'fallback', from: state, to, grapheme, segment })
      state = to
      next = transitions[state].get(segment)
    }
    const to = next ?? 0
    append({
      kind: next === undefined ? 'skip' : 'transition',
      from: state,
      to,
      grapheme,
      segment,
    })
    state = to
    const end = index + segment.length
    for (const patternIndex of nodes[state].patternIndices) {
      const pattern = patterns[patternIndex]
      append({
        kind: 'hit',
        from: state,
        to: state,
        grapheme,
        segment,
        match: {
          pattern,
          patternIndex,
          start: end - pattern.length,
          end,
          data: undefined,
        },
      })
    }
    grapheme++
  }
  return steps
}

export function groupedMatches(
  steps: readonly TraceStep[],
): [number, string[]][] {
  const groups: [number, string[]][] = []
  for (const step of steps) {
    if (!step.match) {
      continue
    }
    const last = groups[groups.length - 1]
    if (last?.[0] === step.grapheme) {
      last[1].push(step.match.pattern)
    }
    else {
      groups.push([step.grapheme, [step.match.pattern]])
    }
  }
  return groups
}

export function explain(step: TraceStep, language: Language): string {
  const char = JSON.stringify(step.segment)
  if (language === 'zh') {
    switch (step.kind) {
      case 'transition':
        return `转移：读取 ${char}，状态 ${step.from} → ${step.to}。`
      case 'fallback':
        return `回退：${char} 没有转移边，状态 ${step.from} → ${step.to}；保留当前字素再试。`
      case 'skip':
        return `根节点跳过：${char} 没有转移边，消耗该字素并停留在状态 0。`
      case 'hit':
        return `命中：${JSON.stringify(step.match?.pattern)}（关键词 #${step.match?.patternIndex}），UTF-16 [${step.match?.start}, ${step.match?.end})。`
    }
  }
  switch (step.kind) {
    case 'transition':
      return `Transition: consume ${char}, state ${step.from} → ${step.to}.`
    case 'fallback':
      return `Failure: no edge for ${char}, state ${step.from} → ${step.to}. Retry the same grapheme.`
    case 'skip':
      return `Root skip: no edge for ${char}. Consume it and stay at state 0.`
    case 'hit':
      return `Match: ${JSON.stringify(step.match?.pattern)} (pattern #${step.match?.patternIndex}), UTF-16 [${step.match?.start}, ${step.match?.end}).`
  }
}
