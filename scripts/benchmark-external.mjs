import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { cpus } from 'node:os'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import Upstream from 'ahocorasick'
import { median, time } from './benchmark-utils.mjs'

const { default: Modern } = await import('../packages/modern-ahocorasick/dist/index.js')
const rounds = Number(process.env.BENCH_ROUNDS ?? 5)
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 9)
const variants = ['modern', 'ahocorasick@1.0.2', 'indexOf']
const scenarios = {
  'ordinary': { patterns: Array.from({ length: 200 }, (_, i) => `word${i}`), text: Array.from({ length: 2000 }, (_, i) => `word${i % 200}`).join(' ') },
  'sparse': { patterns: Array.from({ length: 500 }, (_, i) => `keyword-${i}`), text: 'ordinary text with no hits. '.repeat(1500) },
  'dense-suffix': { patterns: Array.from({ length: 96 }, (_, i) => 'a'.repeat(i + 1)), text: 'a'.repeat(1000) },
  'duplicates': { patterns: Array.from({ length: 200 }, (_, i) => `word${i % 10}`), text: 'word0 word1 word9 '.repeat(1000) },
  'early-hit': { patterns: ['needle'], text: `needle${'ordinary text '.repeat(10000)}` },
  'late-hit': { patterns: ['needle'], text: `${'ordinary text '.repeat(10000)}needle` },
  'large-dictionary': { patterns: Array.from({ length: 10000 }, (_, i) => `keyword-${i}-end`), text: Array.from({ length: 2000 }, (_, i) => `keyword-${i * 7 % 10000}-end`).join(' ') },
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const order = (a, b) => a.end - b.end || b.pattern.length - a.pattern.length || a.patternIndex - b.patternIndex

function compile(variant, patterns) {
  if (variant === 'modern') {
    return new Modern(patterns)
  }
  if (variant === 'indexOf') {
    const dictionary = [...patterns]
    return {
      match: text => dictionary.some(pattern => text.includes(pattern)),
      count: (text) => {
        let count = 0
        for (const pattern of dictionary) {
          for (let start = text.indexOf(pattern); start !== -1; start = text.indexOf(pattern, start + 1)) {
            count++
          }
        }
        return count
      },
      search: (text) => {
        const matches = []
        for (const [patternIndex, pattern] of dictionary.entries()) {
          for (let start = text.indexOf(pattern); start !== -1; start = text.indexOf(pattern, start + 1)) {
            matches.push({ pattern, patternIndex, start, end: start + pattern.length, data: undefined })
          }
        }
        return matches.sort(order)
      },
    }
  }
  const matcher = new Upstream(patterns)
  const indices = new Map()
  patterns.forEach((pattern, index) => {
    if (!indices.has(pattern)) {
      indices.set(pattern, [])
    }
    indices.get(pattern).push(index)
  })
  return {
    rawSearch: text => matcher.search(text),
    match: text => matcher.search(text).length > 0,
    count: text => matcher.search(text).reduce((sum, [, words]) => sum + words.length, 0),
    search: (text) => {
      const matches = []
      for (const [last, words] of matcher.search(text)) {
        // Upstream already repeats duplicate keywords. Expand each distinct
        // string to its input indices once, not once per repeated output.
        for (const pattern of new Set(words)) {
          for (const patternIndex of indices.get(pattern)) {
            matches.push({ pattern, patternIndex, start: last + 1 - pattern.length, end: last + 1, data: undefined })
          }
        }
      }
      return matches.sort(order)
    },
  }
}

if (process.argv[2] === '--child') {
  const [, , , variant, scenario] = process.argv
  const { patterns, text } = scenarios[scenario]
  assert.ok([...patterns, text].every(value => /^[\x20-\x7E]*$/.test(value)), 'External comparison requires printable ASCII')
  const matcher = compile(variant, patterns)
  const expected = new Modern(patterns).search(text)
  assert.deepEqual(matcher.search(text), expected)
  assert.equal(matcher.count(text), expected.length)
  assert.equal(matcher.match(text), expected.length > 0)
  const operations = { build: () => compile(variant, patterns), search: () => matcher.search(text), count: () => matcher.count(text), match: () => matcher.match(text) }
  if (matcher.rawSearch) {
    operations.rawSearch = () => matcher.rawSearch(text)
  }
  const metrics = Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, time(operation, name === 'build' ? patterns.reduce((sum, p) => sum + p.length, 0) : text.length)]))
  globalThis.gc()
  const before = process.memoryUsage()
  const dictionaries = Array.from({ length: 10 }, () => compile(variant, patterns))
  globalThis.gc()
  const after = process.memoryUsage()
  const dictionaryHeapBytes = Math.max(0, after.heapUsed - before.heapUsed) / dictionaries.length
  const dictionaryBufferBytes = Math.max(0, after.arrayBuffers - before.arrayBuffers) / dictionaries.length
  dictionaries.length = 0
  globalThis.gc()
  const resultBefore = process.memoryUsage().heapUsed
  const result = matcher.search(text)
  globalThis.gc()
  const resultHeapBytes = Math.max(0, process.memoryUsage().heapUsed - resultBefore)
  console.log(JSON.stringify({ variant, scenario, patterns: patterns.length, utf16Length: text.length, count: result.length, checks: digest(result), metrics, dictionaryHeapBytes, dictionaryBufferBytes, resultHeapBytes }))
}
else {
  const results = []
  for (const [scenarioIndex, scenario] of Object.keys(scenarios).entries()) {
    const runs = []
    for (let round = 0; round < rounds; round++) {
      // Rotate which implementation runs first, then reverse alternate rounds.
      const offset = (round + scenarioIndex) % variants.length
      const order = [...variants.slice(offset), ...variants.slice(0, offset)]
      if (round % 2) {
        order.reverse()
      }
      for (const variant of order) {
        process.stderr.write(`External ${scenario} / ${variant} / round ${round + 1}\n`)
        runs.push(JSON.parse(execFileSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), '--child', variant, scenario], { encoding: 'utf8' })))
      }
    }
    assert.equal(new Set(runs.map(run => run.checks)).size, 1)
    for (const variant of variants) {
      const matching = runs.filter(run => run.variant === variant)
      const result = { ...matching[0] }
      result.metrics = Object.fromEntries(Object.keys(result.metrics).map((operation) => {
        const metrics = matching.map(run => run.metrics[operation])
        const roundMediansMs = metrics.map(metric => metric.ms)
        const ms = median(roundMediansMs)
        return [operation, { ms, madMs: median(metrics.map(metric => metric.madMs)), betweenRoundsMadMs: median(roundMediansMs.map(value => Math.abs(value - ms))), roundMediansMs }]
      }))
      for (const key of ['dictionaryHeapBytes', 'dictionaryBufferBytes', 'resultHeapBytes']) {
        result[key] = median(matching.map(run => run[key]))
      }
      results.push(result)
    }
  }
  console.log(JSON.stringify({ node: process.version, icu: process.versions.icu, unicode: process.versions.unicode, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, rounds, samples: 7, corpusSha256: digest(scenarios), implementationSha256: createHash('sha256').update(readFileSync(new URL('../packages/modern-ahocorasick/dist/index.js', import.meta.url))).digest('hex'), externalVersion: JSON.parse(readFileSync(new URL('../node_modules/ahocorasick/package.json', import.meta.url))).version, note: 'Printable ASCII only; overlaps and input-index duplicates preserved. Search includes conversion to independent UTF-16 range objects and canonical sorting; upstream rawSearch is reported separately and is not equivalent output. Upstream count/match use grouped search (no native count/early-exit API); indexOf rescans per keyword. Build includes adapter preparation. Boolean latency, not nominal full-input throughput, is meaningful for early exits. Retained dictionary heap includes adapters, with buffers separate. No universal ranking.', results }, null, 2))
}
