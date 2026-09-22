import type { CompactAutomaton } from './internal.js'
import type { Match, MatchStrategy, MatchStream } from './types.js'
import { advanceCompact } from './internal.js'

interface Entry<T> {
  pattern: string
  data: T | undefined
}

/** Internal stream session; no automaton tables escape through its public facade. */
export function createStream<T>(table: CompactAutomaton, patterns: Entry<T>[], lengths: Uint32Array, maxLength: number, strategy: MatchStrategy, maxBufferedUnits: number, wordSegmenter?: Intl.Segmenter): MatchStream<T> {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  let pending = ''
  let offset = 0
  let state = 0
  let position = 0
  let cursor = 0
  let closed = false
  const candidates = new Map<number, { patternIndex: number, start: number, end: number }>()
  const wordStarts = new Set<number>()
  let maxUnits = 0
  if (wordSegmenter) {
    for (const { pattern } of patterns) {
      maxUnits = Math.max(maxUnits, pattern.length)
    }
  }

  function assertOpen(): void {
    if (closed) {
      throw new Error('Stream is finished or cancelled')
    }
  }

  function match(patternIndex: number, start: number, end: number): Match<T> {
    const { pattern, data } = patterns[patternIndex]
    return { pattern, patternIndex, start, end, data }
  }

  function settle(until: number, result: Match<T>[]): void {
    while (cursor <= until) {
      const candidate = candidates.get(cursor)
      if (candidate) {
        const next = cursor + lengths[candidate.patternIndex]
        for (; cursor < next; cursor++) {
          candidates.delete(cursor)
        }
        result.push(match(candidate.patternIndex, candidate.start, candidate.end))
      }
      else {
        cursor++
      }
    }
  }

  function consume(text: string, result: Match<T>[]): void {
    const wordEnds = new Set<number>()
    if (wordSegmenter) {
      for (const part of wordSegmenter.segment(text)) {
        if (part.isWordLike) {
          wordStarts.add(offset + part.index)
          wordEnds.add(offset + part.index + part.segment.length)
        }
      }
    }
    for (const { segment, index } of segmenter.segment(text)) {
      state = advanceCompact(table, state, segment)
      position++
      const end = offset + index + segment.length
      for (let output = state; output !== -1; output = table.outputs[output]) {
        const from = table.terminals[output]
        const to = strategy === 'all' ? table.terminals[output + 1] : Math.min(from + 1, table.terminals[output + 1])
        for (let terminal = from; terminal < to; terminal++) {
          const patternIndex = table.patterns[terminal]
          const start = end - patterns[patternIndex].pattern.length
          if (wordSegmenter && (!wordStarts.has(start) || !wordEnds.has(end))) {
            continue
          }
          if (strategy === 'all') {
            result.push(match(patternIndex, start, end))
            continue
          }
          const at = position - lengths[patternIndex]
          if (at < cursor) {
            continue
          }
          const previous = candidates.get(at)
          if (!previous || (strategy === 'leftmost-first'
            ? patternIndex < previous.patternIndex
            : end > previous.end || (end === previous.end && patternIndex < previous.patternIndex))) {
            candidates.set(at, { patternIndex, start, end })
          }
        }
      }
      if (strategy !== 'all') {
        settle(position - maxLength, result)
      }
    }
    offset += text.length
    // Sets retain only starts that can still participate in a cross-line hit.
    for (const start of wordStarts) {
      if (start < offset - maxUnits) {
        wordStarts.delete(start)
      }
    }
  }

  function cancel(): void {
    closed = true
    pending = ''
    candidates.clear()
    wordStarts.clear()
  }

  return {
    write(chunk) {
      assertOpen()
      if (typeof chunk !== 'string') {
        throw new TypeError('chunk must be a string')
      }
      if (!Number.isSafeInteger(offset + pending.length + chunk.length)) {
        cancel()
        throw new RangeError('stream offset exceeds Number.MAX_SAFE_INTEGER')
      }
      const text = pending + chunk
      let cut = 0
      if (wordSegmenter) {
        // Newline boundaries terminate ICU word context. Hold the last line,
        // including a trailing CR that could still become a CRLF grapheme.
        for (let index = 0; index < text.length; index++) {
          const code = text.charCodeAt(index)
          if (code === 10 || code === 0x2028 || code === 0x2029 || (code === 13 && index + 1 < text.length && text.charCodeAt(index + 1) !== 10)) {
            cut = index + 1
          }
        }
      }
      else {
        let previous = 0
        for (const { index } of segmenter.segment(text)) {
          previous = cut
          cut = index
        }
        // An unpaired high surrogate may become an emoji that joins the
        // preceding ZWJ cluster; retaining only the last segment would lose it.
        const last = text.charCodeAt(text.length - 1)
        if (last >= 0xD800 && last <= 0xDBFF) {
          cut = previous
        }
      }
      if (text.length - cut > maxBufferedUnits) {
        cancel()
        throw new RangeError('unsettled stream tail exceeds maxBufferedUnits')
      }
      const result: Match<T>[] = []
      consume(text.slice(0, cut), result)
      pending = text.slice(cut)
      return result
    },
    finish() {
      assertOpen()
      const result: Match<T>[] = []
      consume(pending, result)
      if (strategy !== 'all') {
        settle(position, result)
      }
      cancel()
      return result
    },
    cancel,
  }
}
