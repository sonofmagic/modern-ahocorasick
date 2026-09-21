import type { Match, MatchStrategy } from 'modern-ahocorasick'
import type { Inputs } from './storage'
import { compile, scan } from './integration'
import { limits } from './limits'

export { limits } from './limits'

export interface ExperimentInputs extends Inputs {
  strategy: MatchStrategy
  replacement: string
  showFailure: boolean
}
export const experimentDefaults = {
  strategy: 'all' as const,
  replacement: '[match]',
  showFailure: false,
}

export function validateInputs(value: unknown): ExperimentInputs {
  if (!value || typeof value !== 'object') {
    throw new TypeError('configuration')
  }
  const input = value as ExperimentInputs
  if (
    typeof input.keywords !== 'string'
    || typeof input.text !== 'string'
    || !Number.isFinite(input.speed)
    || input.speed < 0.5
    || input.speed > 10
    || !['all', 'leftmost-first', 'leftmost-longest'].includes(input.strategy)
    || typeof input.replacement !== 'string'
    || typeof input.showFailure !== 'boolean'
  ) {
    throw new TypeError('configuration')
  }
  if (
    input.keywords.length > limits.keywords
    || input.keywords.split(',').length > limits.patterns
    || input.text.length > limits.text
    || input.replacement.length > limits.replacement
  ) {
    throw new RangeError('input limit')
  }
  return {
    keywords: input.keywords,
    text: input.text,
    speed: input.speed,
    strategy: input.strategy,
    replacement: input.replacement,
    showFailure: input.showFailure,
  }
}

/** Bound the complete export before allocating a potentially huge JSON string. */
function assertExportBudget(
  input: ExperimentInputs,
  result: { selected: Match[], replaced: string },
): void {
  const encoder = new TextEncoder()
  const size = (value: unknown) => encoder.encode(JSON.stringify(value)).length
  let bytes = size(input) + size(result.replaced) + 1024
  const patternSizes = new Map<string, number>()
  for (const match of result.selected) {
    let patternSize = patternSizes.get(match.pattern)
    if (patternSize === undefined) {
      patternSize = size(match.pattern)
      patternSizes.set(match.pattern, patternSize)
    }
    // Room for indentation, field names and all numeric range fields per match.
    bytes += patternSize + 200
    if (bytes > limits.exportBytes) {
      throw new RangeError('export budget')
    }
  }
  if (bytes > limits.exportBytes) {
    throw new RangeError('export budget')
  }
}

/** Lives in a worker. Text/strategy edits reuse the compiled dictionary and trace. */
export class Experiment {
  private keywords: string | undefined
  private text: string | undefined
  private dictionary: ReturnType<typeof compile> | undefined
  private model: ReturnType<typeof scan> | undefined
  run(input: ExperimentInputs) {
    validateInputs(input)
    if (!this.dictionary || input.keywords !== this.keywords) {
      this.dictionary = compile(input.keywords)
      this.keywords = input.keywords
      this.model = undefined
    }
    if (!this.model || this.text !== input.text) {
      this.model = scan(this.dictionary, input.text)
      this.text = input.text
    }
    const replacementStrategy
      = input.strategy === 'all' ? 'leftmost-longest' : input.strategy
    const result = {
      model: this.model,
      selected: this.dictionary.matcher.search(input.text, {
        strategy: input.strategy,
      }),
      replaced: this.dictionary.matcher.replace(input.text, input.replacement, {
        strategy: replacementStrategy,
      }),
      replacementStrategy,
    }
    assertExportBudget(input, result)
    return result
  }
}
export type ExperimentResult = ReturnType<Experiment['run']>
export type WorkerResult
  = | { result: ExperimentResult }
    | { error: 'limit' | 'error' }

export function snippet(input: ExperimentInputs): string {
  const patterns = input.keywords
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  const strategy
    = input.strategy === 'all' ? 'leftmost-longest' : input.strategy
  return `import AhoCorasick from 'modern-ahocorasick'\n\nconst matcher = new AhoCorasick(${JSON.stringify(patterns)})\nconst text = ${JSON.stringify(input.text)}\nconst matches = matcher.search(text, { strategy: '${input.strategy}' })\nconst replaced = matcher.replace(text, ${JSON.stringify(input.replacement)}, { strategy: '${strategy}' })\nconsole.log(matches, replaced)\n`
}

export function serialize(
  input: ExperimentInputs,
  result?: ExperimentResult,
): string {
  if (result) {
    assertExportBudget(input, result)
  }
  return JSON.stringify(
    {
      version: 1,
      input: validateInputs(input),
      ...(result
        ? { results: result.selected, replaced: result.replaced }
        : {}),
    },
    null,
    2,
  )
}
export function deserialize(json: string): ExperimentInputs {
  // Exports can include results; only the validated input is ever trusted/replayed.
  if (json.length > limits.exportBytes) {
    throw new RangeError('file limit')
  }
  const value = JSON.parse(json)
  if (value?.version !== 1) {
    throw new TypeError('version')
  }
  return validateInputs(value.input)
}
export function shareHash(input: ExperimentInputs): string {
  return `#workbench=${encodeURIComponent(serialize(input))}`
}
export function fromHash(hash: string): ExperimentInputs | undefined {
  if (!hash.startsWith('#workbench=')) {
    return undefined
  }
  if (hash.length > limits.hash) {
    throw new RangeError('link limit')
  }
  return deserialize(decodeURIComponent(hash.slice('#workbench='.length)))
}

/** Upper bound: how many hits have been emitted at this cursor? */
export function hitCount(hits: { cursor: number }[], cursor: number): number {
  let low = 0
  let high = hits.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (hits[middle].cursor <= cursor) {
      low = middle + 1
    }
    else {
      high = middle
    }
  }
  return low
}

/** Merge overlapping ranges for a single, safe text-node highlight layer. */
export function highlights(text: string, matches: Match[], selected?: Match) {
  const ranges: { start: number, end: number }[] = []
  for (const match of [...matches].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  )) {
    const last = ranges.at(-1)
    if (last && match.start <= last.end) {
      last.end = Math.max(last.end, match.end)
    }
    else {
      ranges.push({ start: match.start, end: match.end })
    }
  }
  const boundaries = [
    ...new Set([
      0,
      text.length,
      ...ranges.flatMap(range => [range.start, range.end]),
      ...(selected ? [selected.start, selected.end] : []),
    ]),
  ].sort((a, b) => a - b)
  let rangeIndex = 0
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1]
    while (ranges[rangeIndex] && ranges[rangeIndex].end <= start) {
      rangeIndex++
    }
    return {
      start,
      end,
      text: text.slice(start, end),
      hit: !!ranges[rangeIndex] && ranges[rangeIndex].start <= start,
      selected: !!selected && start >= selected.start && end <= selected.end,
    }
  })
}
