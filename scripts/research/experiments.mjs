import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gitBaseline, implementationDigest, readBenchmarkInput, time } from '../benchmark-utils.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const baselineRef = 'd50fcbfad26cc2a9b74c7d9f4379404a02b9df72'
const scenarios = {
  'tiny': { patterns: ['a', 'ab', 'b'], text: 'ab' },
  'sparse': { patterns: ['needle', 'thread'], text: 'ordinary miss. '.repeat(6000) },
  'false-candidates': { patterns: ['needle', 'thread'], text: 'not there. '.repeat(6000) },
  'dense': { patterns: ['a', 'aa', 'aaa'], text: 'a'.repeat(4000) },
  'unicode': { patterns: ['猫', '😀', 'e\u0301'], text: '猫😀e\u0301 '.repeat(2000) },
  'late-hit': { patterns: ['needle'], text: `${'ordinary text '.repeat(5000)}needle` },
  'large-dictionary': { patterns: Array.from({ length: 10000 }, (_, i) => `keyword-${i}-end`), text: Array.from({ length: 2000 }, (_, i) => `keyword-${i * 7 % 10000}-end`).join(' ') },
}

if (process.argv[2] === '--child') {
  const [, , , variant, name] = process.argv
  const Constructor = variant.startsWith('before')
    ? (await import(`data:text/javascript;base64,${Buffer.from(await readBenchmarkInput()).toString('base64')}`)).default
    : (await import(`../../packages/modern-ahocorasick/dist/${variant === 'fast' ? 'fast' : 'index'}.js`)).default
  const { patterns, text } = scenarios[name]
  const matcher = new Constructor(patterns)
  // Conservative experiment: a pattern occurrence necessarily includes its
  // first 1/2 UTF-16 units. This only rejects whole inputs lacking candidates;
  // any candidate invokes the unmodified full matcher. No regex output is a hit.
  const width = variant === 'pair' ? 2 : 1
  const compileFilter = () => new RegExp([...new Set(patterns.map(pattern => pattern.slice(0, width)))].map(value => Array.from({ length: value.length }, (_, index) => `\\u${value.charCodeAt(index).toString(16).padStart(4, '0')}`).join('')).join('|'))
  const filter = variant === 'first' || variant === 'pair' ? compileFilter() : undefined
  const allowed = () => !filter || filter.test(text)
  const expected = matcher.search(text)
  const operations = {
    build: () => new Constructor(patterns),
    search: () => allowed() ? matcher.search(text) : [],
    count: () => allowed() ? matcher.count(text) : 0,
    match: () => allowed() && matcher.match(text),
    first: () => {
      if (!allowed()) {
        return null
      }
      const iterator = matcher.iterate(text)
      const hit = iterator.next().value ?? null
      iterator.return?.()
      return hit
    },
  }
  assert.deepEqual(operations.search(), expected)
  assert.equal(operations.count(), expected.length)
  assert.equal(operations.match(), expected.length > 0)
  const metrics = Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, time(operation, text.length)]))
  if (filter) {
    metrics.filterBuild = time(compileFilter, patterns.length)
  }
  globalThis.gc()
  const before = process.memoryUsage()
  const dictionaries = Array.from({ length: 10 }, () => new Constructor(patterns))
  globalThis.gc()
  const after = process.memoryUsage()
  console.log(JSON.stringify({ variant, scenario: name, metrics, count: expected.length, heapBytes: (after.heapUsed - before.heapUsed) / dictionaries.length, arrayBufferBytes: (after.arrayBuffers - before.arrayBuffers) / dictionaries.length, peakRssBytes: process.resourceUsage().maxRSS * 1024 }))
}
else {
  const sources = { 'before-compact': await gitBaseline(baselineRef, root), 'before-fast': await gitBaseline(baselineRef, root, 'fast') }
  const records = []
  for (let round = 0; round < Number(process.env.EXPERIMENT_ROUNDS ?? 3); round++) {
    for (const scenario of process.env.EXPERIMENT_SCENARIOS?.split(',') ?? Object.keys(scenarios)) {
      const variants = process.env.EXPERIMENT_VARIANTS?.split(',') ?? ['before-compact', 'compact', 'first', 'pair', 'before-fast', 'fast']
      if (round % 2) {
        variants.reverse()
      }
      for (const variant of variants) {
        process.stderr.write(`${scenario} / ${variant} / ${round + 1}\n`)
        const output = execFileSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), '--child', variant, scenario], { cwd: root, input: sources[variant] ?? '', encoding: 'utf8' })
        records.push({ round: round + 1, ...JSON.parse(output) })
      }
    }
  }
  console.log(JSON.stringify({ baselineRef, baselineBundling: 'public-multi-entry', node: process.version, implementationSha256: implementationDigest(fileURLToPath(new URL('../../packages/modern-ahocorasick/dist', import.meta.url))), note: 'Experiment only; first/pair reject complete candidate-free inputs then confirm using the unchanged public API. Filter construction measured separately. Each record is an independent process, batched 7-sample median/MAD, three counterbalanced rounds. Peak RSS is full process high-water after batched construction/scans, not matcher heap. No prefilter is installed in runtime by this script.', scenarios, records }, null, 2))
}
