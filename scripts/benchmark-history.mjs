import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const script = fileURLToPath(import.meta.url)
const baselineRef = 'a4181b054b2d2c85e83fe4201b1417c879db2f30'
const v3BaselineRef = '4f6dd786602014bd8e6f46c324ece54ba97a1b50'
const samples = 7
const rounds = Number(process.env.BENCH_ROUNDS ?? 3)
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 9, 'BENCH_ROUNDS must be between 1 and 9')
const strategies = ['all', 'leftmost-first', 'leftmost-longest']
const requestedOperations = process.env.BENCH_OPERATIONS?.split(',')
const operationNames = ['build', 'search', 'match', 'count', ...strategies.map(strategy => `iterate:${strategy}`), ...strategies.slice(1).flatMap(strategy => [`search:${strategy}`, `replace:${strategy}`])]
assert.ok(requestedOperations === undefined || requestedOperations.every(operation => operationNames.includes(operation)), 'Unknown BENCH_OPERATIONS entry')
const scenarios = {
  'ordinary': {
    patterns: Array.from({ length: 200 }, (_, i) => `word${i}`),
    text: Array.from({ length: 2000 }, (_, i) => `line word${i % 200} end`).join(' '),
  },
  'sparse': {
    patterns: Array.from({ length: 500 }, (_, i) => `keyword-${i}`),
    text: 'ordinary text with no dictionary hits. '.repeat(1200),
  },
  'unicode': {
    patterns: Array.from({ length: 100 }, (_, i) => `词${i}😀`),
    text: Array.from({ length: 2000 }, (_, i) => `👨‍👩‍👧‍👦词${i % 100}😀`).join(' '),
  },
  'shared-prefix': {
    patterns: Array.from({ length: 1000 }, (_, i) => `common-prefix-${i}-suffix`),
    text: Array.from({ length: 1000 }, (_, i) => `common-prefix-${i}-suffix`).join(' '),
  },
  'dense-suffix': {
    patterns: Array.from({ length: 96 }, (_, i) => 'a'.repeat(i + 1)),
    text: 'a'.repeat(1000),
  },
  'duplicates': {
    patterns: Array.from({ length: 200 }, (_, i) => `word${i % 10}`),
    text: 'word0 word1 word9 '.repeat(1000),
  },
  'early-hit': { patterns: ['needle'], text: `needle${'ordinary text '.repeat(10_000)}` },
  'late-hit': { patterns: ['needle'], text: `${'ordinary text '.repeat(10_000)}needle` },
  'large-dictionary': {
    patterns: Array.from({ length: 10_000 }, (_, i) => `keyword-${i}-end`),
    text: Array.from({ length: 2000 }, (_, i) => `keyword-${i * 7 % 10_000}-end`).join(' '),
  },
  'long-text': {
    patterns: ['cat', 'dog', '猫', 'e\u0301', '👨‍👩‍👧‍👦', '\r\n'],
    text: 'cat狗 dog猫 e\u0301 👨‍👩‍👧‍👦\r\n'.repeat(20_000),
  },
}

function median(values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
}

let sink
function time(operation, units) {
  // Batch tiny operations to avoid treating timer resolution as a speedup.
  let iterations = 1
  let elapsed
  do {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      sink = operation()
    }
    elapsed = performance.now() - start
    if (elapsed < 25) {
      iterations *= 2
    }
  } while (elapsed < 25 && iterations <= 4096)
  const times = []
  for (let sample = 0; sample < samples; sample++) {
    globalThis.gc()
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      sink = operation()
    }
    times.push((performance.now() - start) / iterations)
  }
  assert.notEqual(sink, undefined)
  sink = undefined
  const ms = median(times)
  return { ms, madMs: median(times.map(value => Math.abs(value - ms))), iterations, utf16UnitsPerSecond: units / (ms / 1000) }
}

function operations(Constructor, variant, patterns, text) {
  const ac = new Constructor(patterns)
  const ops = {
    build: () => new Constructor(patterns),
    search: () => ac.search(text),
    match: () => ac.match(text),
  }
  if (variant !== 'v2') {
    // Baseline equivalents reflect what a consumer could do before these APIs.
    ops.count = () => variant === 'v3' ? ac.count(text) : ac.search(text).length
    for (const strategy of strategies) {
      if (strategy !== 'all') {
        ops[`search:${strategy}`] = () => ac.search(text, { strategy })
        ops[`replace:${strategy}`] = () => ac.replace(text, 'X', { strategy })
      }
      ops[`iterate:${strategy}`] = () => {
        let count = 0
        const iterator = variant === 'v3' || strategy === 'all'
          ? ac.iterate(text, { strategy })
          : ac.search(text, { strategy }).values()
        for (const match of iterator) {
          void match
          count++
        }
        return count
      }
    }
  }
  return { ac, ops }
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

if (process.argv[2] === '--child' || process.argv[2] === '--memory') {
  const [, , mode, variant, scenario, memoryOperation, scale = '1'] = process.argv
  const { patterns } = scenarios[scenario]
  const text = scenarios[scenario].text.repeat(Number(scale))
  const Constructor = variant === 'v3'
    ? (await import('../packages/modern-ahocorasick/dist/index.js')).default
    : (await import(`data:text/javascript;base64,${Buffer.from(readFileSync(0, 'utf8')).toString('base64')}`)).default
  const { ac, ops } = operations(Constructor, variant, patterns, text)
  if (mode === '--memory') {
    // Separate process per operation. OS high-water RSS includes startup, ICU,
    // input and dictionary; it is not an operation-only JavaScript heap delta.
    globalThis.gc()
    const beforeRssBytes = process.memoryUsage().rss
    sink = ops[memoryOperation]()
    assert.notEqual(sink, undefined)
    const afterHeapBytes = process.memoryUsage().heapUsed
    const peakRssBytes = process.resourceUsage().maxRSS * 1024
    globalThis.gc()
    console.log(JSON.stringify({ variant, scenario, operation: memoryOperation, scale: Number(scale), utf16Length: text.length, beforeRssBytes, peakRssBytes, afterHeapBytes, retainedHeapBytes: process.memoryUsage().heapUsed }))
  }
  else {
    const metrics = Object.fromEntries(Object.entries(ops).filter(([name]) => requestedOperations === undefined || requestedOperations.includes(name)).map(([name, operation]) => [name, time(operation, name === 'build' ? patterns.reduce((sum, pattern) => sum + pattern.length, 0) : text.length)]))
    globalThis.gc()
    const beforeDictionary = process.memoryUsage()
    const dictionaries = Array.from({ length: 10 }, () => new Constructor(patterns))
    globalThis.gc()
    const afterDictionary = process.memoryUsage()
    const dictionaryHeapBytes = Math.max(0, afterDictionary.heapUsed - beforeDictionary.heapUsed) / dictionaries.length
    const dictionaryBufferBytes = Math.max(0, afterDictionary.arrayBuffers - beforeDictionary.arrayBuffers) / dictionaries.length
    dictionaries.length = 0
    globalThis.gc()
    const beforeResults = process.memoryUsage().heapUsed
    const result = ac.search(text)
    globalThis.gc()
    const resultHeapBytes = Math.max(0, process.memoryUsage().heapUsed - beforeResults)
    const count = variant === 'v2' ? result.reduce((sum, item) => sum + item[1].length, 0) : result.length
    const checks = variant === 'v2'
      ? {}
      : {
          search: digest(result),
          first: digest(ac.search(text, { strategy: 'leftmost-first' })),
          longest: digest(ac.search(text, { strategy: 'leftmost-longest' })),
          replaceFirst: digest(ac.replace(text, 'X', { strategy: 'leftmost-first' })),
          replaceLongest: digest(ac.replace(text, 'X', { strategy: 'leftmost-longest' })),
        }
    if (variant !== 'v2') {
      assert.equal(ops.count(), count)
      for (const strategy of strategies) {
        assert.equal(ops[`iterate:${strategy}`](), ac.search(text, { strategy }).length)
      }
    }
    console.log(JSON.stringify({ scenario, variant, keywords: patterns.length, utf16Length: text.length, count, metrics, dictionaryHeapBytes, dictionaryBufferBytes, resultHeapBytes, checks }))
  }
}
else {
  const source = (ref, path) => stripTypeScriptTypes(execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8' }))
  const baseline = source(baselineRef, 'packages/modern-ahocorasick/src/index.ts')
  const v3Baseline = `${source(v3BaselineRef, 'packages/modern-ahocorasick/src/internal.ts')}\n${source(v3BaselineRef, 'packages/modern-ahocorasick/src/index.ts').replace(/^import \{ buildAutomaton \} from '\.\/internal\.js';?\s*$/m, '')}`
  const sources = { 'v2': baseline, 'v3-before': v3Baseline, 'v3': '' }
  const results = []
  const selected = process.env.BENCH_SCENARIOS?.split(',') ?? Object.keys(scenarios)
  for (const [scenarioIndex, scenario] of selected.entries()) {
    assert.ok(scenario in scenarios, `Unknown scenario: ${scenario}`)
    const runs = []
    const measure = (variant, round) => {
      process.stderr.write(`Benchmark ${scenario} / ${variant} / round ${round + 1}\n`)
      const output = execFileSync(process.execPath, ['--expose-gc', script, '--child', variant, scenario], { cwd: root, input: sources[variant], encoding: 'utf8' })
      const result = JSON.parse(output)
      runs.push(result)
      return result
    }
    measure('v2', 0)
    for (let round = 0; round < rounds; round++) {
      // Counterbalance order across rounds/scenarios to reduce time-order bias.
      const variants = (round + scenarioIndex) % 2 === 0 ? ['v3-before', 'v3'] : ['v3', 'v3-before']
      const first = measure(variants[0], round)
      const second = measure(variants[1], round)
      assert.equal(first.count, second.count, `${scenario}: v3 occurrence counts differ`)
      assert.equal(first.count, runs[0].count, `${scenario}: v2 occurrence counts differ`)
      assert.deepEqual(first.checks, second.checks, `${scenario}: v3 results differ`)
    }
    for (const variant of ['v2', 'v3-before', 'v3']) {
      const matching = runs.filter(run => run.variant === variant)
      const result = { ...matching[0] }
      result.metrics = Object.fromEntries(Object.keys(result.metrics).map((operation) => {
        const metrics = matching.map(run => run.metrics[operation])
        const roundMediansMs = metrics.map(metric => metric.ms)
        const ms = median(roundMediansMs)
        return [operation, {
          ms,
          madMs: median(metrics.map(metric => metric.madMs)),
          betweenRoundsMadMs: median(roundMediansMs.map(value => Math.abs(value - ms))),
          roundMediansMs,
          utf16UnitsPerSecond: median(metrics.map(metric => metric.utf16UnitsPerSecond)),
        }]
      }))
      result.dictionaryHeapBytes = median(matching.map(run => run.dictionaryHeapBytes))
      result.dictionaryBufferBytes = median(matching.map(run => run.dictionaryBufferBytes))
      result.resultHeapBytes = median(matching.map(run => run.resultHeapBytes))
      results.push(result)
    }
  }
  const memory = []
  for (const scale of process.env.BENCH_MEMORY === '0' ? [] : [1, 10, 100]) {
    for (const variant of ['v3-before', 'v3']) {
      for (const operation of ['count', 'iterate:leftmost-longest', 'replace:leftmost-longest']) {
        process.stderr.write(`Memory dense-suffix x${scale} / ${variant} / ${operation}\n`)
        const output = execFileSync(process.execPath, ['--expose-gc', script, '--memory', variant, 'dense-suffix', operation, String(scale)], { cwd: root, input: sources[variant], encoding: 'utf8' })
        memory.push(JSON.parse(output))
      }
    }
  }
  const regressions = []
  for (const current of results.filter(result => result.variant === 'v3')) {
    const before = results.find(result => result.scenario === current.scenario && result.variant === 'v3-before')
    for (const [operation, metric] of Object.entries(current.metrics)) {
      const reference = before.metrics[operation]
      if (metric.ms > reference.ms * 1.05) {
        regressions.push({ scenario: current.scenario, operation, percent: (metric.ms / reference.ms - 1) * 100, beforeMadMs: reference.madMs, afterMadMs: metric.madMs })
      }
    }
  }
  console.log(JSON.stringify({
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    baselineRef,
    v3BaselineRef,
    implementationSha256: createHash('sha256').update(readFileSync(new URL('../packages/modern-ahocorasick/dist/index.js', import.meta.url))).digest('hex'),
    samples,
    rounds,
    operations: requestedOperations ?? operationNames,
    note: 'Medians across counterbalanced independent processes, each using batched samples after warmup; within/between-round MAD reports noise. v3-before count uses search().length; selected iteration uses search().values(). Presence-query throughput uses total input length despite early exit. Retained JS heap excludes ArrayBuffer backing stores (reported separately) and native ICU. Memory runs are separate cold processes; OS peak RSS includes runtime, input, dictionary and native memory. v2 output grouping differs. Regressions >5% require reproduction and investigation, not an automatic noisy CI gate.',
    results,
    memory,
    regressions,
  }, null, 2))
}
