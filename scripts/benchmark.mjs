import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { cpus } from 'node:os'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { benchmarkHashSeed, benchmarkJournal, collectGarbage, gitBaseline, implementationDigest, median, readBenchmarkInput, retainedDictionaryCopies, time } from './benchmark-utils.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const script = fileURLToPath(import.meta.url)
const baselineRef = process.env.BENCH_BASELINE_REF ?? 'a78f4c8d6b2e511a74271409c30f66d3f8057197'
const samples = 7
const rounds = Number(process.env.BENCH_ROUNDS ?? 5)
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 9, 'BENCH_ROUNDS must be between 1 and 9')
const strategies = ['all', 'leftmost-first', 'leftmost-longest']
const requestedOperations = process.env.BENCH_TIMINGS === '0' ? [] : process.env.BENCH_OPERATIONS?.split(',')
const operationNames = ['build', 'load', 'search', 'match', 'count', 'countByPattern', ...strategies.map(strategy => `iterate:${strategy}`), ...strategies.slice(1).flatMap(strategy => [`search:${strategy}`, `replace:${strategy}`])]
assert.ok(requestedOperations === undefined || requestedOperations.every(operation => operationNames.includes(operation)), 'Unknown BENCH_OPERATIONS entry')
const scenarios = {
  'ascii-tiny': { patterns: ['a', 'ab', 'b'], text: 'ab' },
  'crlf': { patterns: ['a', '\r', '\n', '\r\n', 'a\r\nb'], text: 'a\r\nb '.repeat(8000) },
  'ascii-combining': { patterns: ['a', 'e', 'e\u0301', 'cat'], text: 'abc e\u0301 cat '.repeat(4000) },
  'unicode-start': { patterns: ['猫', 'word', '😀'], text: '猫word😀 '.repeat(5000) },
  'ascii-prefix': { patterns: ['word', 'e\u0301'], text: `${'no hits here. '.repeat(4000)}e\u0301 word` },
  'ascii-early-unicode': { patterns: ['needle'], text: `needle${'x'.repeat(100000)}e\u0301` },
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
  'output-heavy-miss': {
    patterns: [...Array.from({ length: 40 }).fill('a'), 'needle'],
    text: 'x'.repeat(100000),
  },
  'output-heavy-sparse': {
    patterns: [...Array.from({ length: 40 }).fill('a'), 'needle'],
    text: `${'x'.repeat(100000)}needle`,
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

let sink

function operations(Constructor, patterns, text) {
  const ac = new Constructor(patterns)
  const saved = ac.serialize?.()
  const ops = {
    load: () => saved === undefined ? new Constructor(patterns) : Constructor.deserialize(saved),
    countByPattern: () => {
      if (ac.countByPattern) {
        return ac.countByPattern(text)
      }
      const counts = Array.from({ length: patterns.length }).fill(0)
      for (const hit of ac.iterate(text)) {
        counts[hit.patternIndex]++
      }
      return counts
    },
    build: () => new Constructor(patterns),
    search: () => ac.search(text),
    match: () => ac.match(text),
    count: () => ac.count(text),
  }
  for (const strategy of strategies) {
    if (strategy !== 'all') {
      ops[`search:${strategy}`] = () => ac.search(text, { strategy })
      ops[`replace:${strategy}`] = () => ac.replace(text, 'X', { strategy })
    }
    ops[`iterate:${strategy}`] = () => {
      let count = 0
      for (const match of ac.iterate(text, { strategy })) {
        void match
        count++
      }
      return count
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
    : (await import(`data:text/javascript;base64,${Buffer.from(await readBenchmarkInput()).toString('base64')}`)).default
  const { ac, ops } = operations(Constructor, patterns, text)
  if (mode === '--memory') {
    // Separate process per operation. OS high-water RSS includes startup, ICU,
    // input and dictionary; it is not an operation-only JavaScript heap delta.
    await collectGarbage()
    const beforeRssBytes = process.memoryUsage().rss
    sink = ops[memoryOperation]()
    assert.notEqual(sink, undefined)
    const afterHeapBytes = process.memoryUsage().heapUsed
    const peakRssBytes = process.resourceUsage().maxRSS * 1024
    await collectGarbage()
    console.log(JSON.stringify({ variant, scenario, operation: memoryOperation, scale: Number(scale), utf16Length: text.length, beforeRssBytes, peakRssBytes, afterHeapBytes, retainedHeapBytes: process.memoryUsage().heapUsed }))
  }
  else {
    const metrics = Object.fromEntries(Object.entries(ops).filter(([name]) => requestedOperations === undefined || requestedOperations.includes(name)).map(([name, operation]) => [name, time(operation, name === 'build' ? patterns.reduce((sum, pattern) => sum + pattern.length, 0) : text.length)]))
    await collectGarbage()
    const beforeDictionary = process.memoryUsage()
    const dictionaryCopies = retainedDictionaryCopies(patterns.length)
    const dictionaries = Array.from({ length: dictionaryCopies }, () => new Constructor(patterns))
    await collectGarbage()
    const afterDictionary = process.memoryUsage()
    const dictionaryHeapBytes = Math.max(0, afterDictionary.heapUsed - beforeDictionary.heapUsed) / dictionaries.length
    const dictionaryBufferBytes = Math.max(0, afterDictionary.arrayBuffers - beforeDictionary.arrayBuffers) / dictionaries.length
    dictionaries.length = 0
    await collectGarbage()
    const beforeResults = process.memoryUsage().heapUsed
    const result = ac.search(text)
    await collectGarbage()
    const resultHeapBytes = Math.max(0, process.memoryUsage().heapUsed - beforeResults)
    const count = result.length
    const checks = {
      search: digest(result),
      frequencies: digest(ops.countByPattern()),
      first: digest(ac.search(text, { strategy: 'leftmost-first' })),
      longest: digest(ac.search(text, { strategy: 'leftmost-longest' })),
      replaceFirst: digest(ac.replace(text, 'X', { strategy: 'leftmost-first' })),
      replaceLongest: digest(ac.replace(text, 'X', { strategy: 'leftmost-longest' })),
    }
    assert.equal(ops.count(), count)
    assert.equal(ops.match(), count > 0)
    for (const strategy of strategies) {
      assert.equal(digest([...ac.iterate(text, { strategy })]), digest(ac.search(text, { strategy })))
    }
    console.log(JSON.stringify({ scenario, variant, keywords: patterns.length, utf16Length: text.length, count, metrics, dictionaryCopies, dictionaryHeapBytes, dictionaryBufferBytes, resultHeapBytes, checks }))
  }
}
else {
  const baseline = await gitBaseline(baselineRef, root)
  const journal = benchmarkJournal(root, 'scanner', {
    baselineRef,
    hashSeeds: Array.from({ length: rounds }, (_, round) => benchmarkHashSeed(round)),
    baselineBundling: 'public-multi-entry',
    baselineSourceSha256: createHash('sha256').update(baseline).digest('hex'),
    implementationSha256: implementationDigest(fileURLToPath(new URL('../packages/modern-ahocorasick/dist', import.meta.url))),
    runnerSha256: digest(['benchmark.mjs', 'benchmark-utils.mjs'].map(file => [file, readFileSync(new URL(file, import.meta.url), 'utf8')])),
    corpusSha256: digest(scenarios),
    timingMethod: 'When enabled, each operation has at least 250 ms of cumulative warmup, calibrated batches targeting 25 ms up to 1,048,576 iterations, and seven GC-separated samples.',
    dictionaryMemoryMethod: 'Post-GC deltas use 10–1000 retained dictionaries with the same pattern-count-based dictionaryCopies divisor for both variants; each measurement follows three GC/task turns.',
  })
  const sources = { 'v3-before': baseline, 'v3': '' }
  const results = []
  const selected = process.env.BENCH_SCENARIOS?.split(',') ?? Object.keys(scenarios)
  for (const [scenarioIndex, scenario] of selected.entries()) {
    assert.ok(scenario in scenarios, `Unknown scenario: ${scenario}`)
    const runs = []
    const measure = (variant, round) => {
      process.stderr.write(`Benchmark ${scenario} / ${variant} / round ${round + 1}\n`)
      const hashSeed = benchmarkHashSeed(round)
      const output = execFileSync(process.execPath, [`--hash-seed=${hashSeed}`, '--expose-gc', script, '--child', variant, scenario], { cwd: root, input: sources[variant], encoding: 'utf8' })
      const result = JSON.parse(output)
      journal.record('timing', { round: round + 1, hashSeed, ...result })
      runs.push(result)
      if (process.env.BENCH_RAW_FILE) {
        appendFileSync(process.env.BENCH_RAW_FILE, `${JSON.stringify({ round: round + 1, hashSeed, ...result })}\n`)
      }
      return result
    }
    for (let round = 0; round < rounds; round++) {
      // Counterbalance order across rounds/scenarios to reduce time-order bias.
      const variants = (round + scenarioIndex) % 2 === 0 ? ['v3-before', 'v3'] : ['v3', 'v3-before']
      const first = measure(variants[0], round)
      const second = measure(variants[1], round)
      assert.equal(first.count, second.count, `${scenario}: v3 occurrence counts differ`)
      assert.deepEqual(first.checks, second.checks, `${scenario}: v3 results differ`)
    }
    for (const variant of ['v3-before', 'v3']) {
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
        const hashSeed = benchmarkHashSeed(0)
        const output = execFileSync(process.execPath, [`--hash-seed=${hashSeed}`, '--expose-gc', script, '--memory', variant, 'dense-suffix', operation, String(scale)], { cwd: root, input: sources[variant], encoding: 'utf8' })
        const result = { hashSeed, ...JSON.parse(output) }
        journal.record('memory', result)
        memory.push(result)
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
    ...journal.metadata,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    icu: process.versions.icu,
    unicode: process.versions.unicode,
    samples,
    rounds,
    operations: requestedOperations ?? operationNames,
    note: 'v3-before is the implementation at baselineRef. Medians across counterbalanced independent processes, each using batched samples after warmup; within/between-round MAD reports noise. load uses validated restoration when available, otherwise rebuilds from patterns; saving is excluded. countByPattern uses the native method when available, otherwise iterator tallying. Presence-query throughput uses total input length despite early exit. Retained-memory samples follow three GC/task turns to settle backing-store disposal. JS heap excludes ArrayBuffer backing stores (reported separately) and native ICU. Memory runs are separate cold processes; OS peak RSS includes runtime, input, dictionary and native memory; historical modules are transported as data URLs, so loader storage also differs. BENCH_TIMINGS=0 measures retained storage and correctness without timing operations. Regressions >5% require reproduction and investigation, not an automatic noisy CI gate.',
    results,
    memory,
    regressions,
  }, null, 2))
}
