import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { benchmarkHashSeed, benchmarkJournal, collectGarbage, implementationDigest, median, retainedDictionaryCopies, time } from './benchmark-utils.mjs'
import { compare, digest, normalizer, reference, scenarios, selection } from './benchmark-versions-utils.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const script = fileURLToPath(import.meta.url)
const variants = ['v1', 'v2', 'current']
const entries = {
  v1: import.meta.resolve('modern-ahocorasick-v1'),
  v2: import.meta.resolve('modern-ahocorasick-v2'),
  current: new URL('../packages/modern-ahocorasick/dist/index.js', import.meta.url).href,
}
const environment = { node: process.version, pnpm: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).packageManager, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, icu: process.versions.icu, unicode: process.versions.unicode }
const runnerSha256 = digest(['benchmark-versions.mjs', 'benchmark-versions-utils.mjs', 'benchmark-utils.mjs'].map(file => [file, readFileSync(new URL(file, import.meta.url), 'utf8')]))
const operations = selection(process.env.BENCH_OPERATIONS, ['build', 'search', 'match', 'normalizedSearch'], 'BENCH_OPERATIONS')
const recheck = process.argv[2] === '--recheck'
  ? JSON.parse(readFileSync(process.argv[3], 'utf8'))
  : undefined
if (recheck) {
  assert.equal(recheck.schemaVersion, 1, 'Unsupported recheck input')
  assert.deepEqual(recheck.environment, environment, 'Recheck environment changed')
  assert.equal(recheck.runnerSha256, runnerSha256, 'Recheck benchmark methodology changed; run a new full comparison')
  assert.equal(recheck.corpusSha256, digest(scenarios), 'Recheck corpus changed')
  for (const variant of variants) {
    assert.equal(recheck.versions[variant].implementationSha256, implementationDigest(fileURLToPath(new URL('./', entries[variant]))), `Recheck ${variant} implementation changed`)
  }
}
const selected = selection(process.env.BENCH_SCENARIOS, recheck
  ? [...new Set(recheck.comparisons.filter(item => item.recheck).map(item => item.scenario))]
  : Object.keys(scenarios), 'BENCH_SCENARIOS')
function operationsFor(scenario) {
  return recheck
    ? operations.filter(operation => recheck.comparisons.some(item => item.scenario === scenario && item.operation === operation && item.recheck))
    : operations
}
const rounds = Number(process.env.BENCH_ROUNDS ?? (recheck ? 7 : 5))
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 9, 'BENCH_ROUNDS must be between 1 and 9')
assert.equal(typeof globalThis.gc, 'function', 'Run Node with --expose-gc')

// A global root keeps the measured objects alive across explicit GC.
let retained
async function retention(operation, divisor = 1) {
  retained = undefined
  await collectGarbage()
  const before = process.memoryUsage()
  retained = operation()
  await collectGarbage()
  const after = process.memoryUsage()
  assert.notEqual(retained, undefined)
  const value = {
    heapBytes: (after.heapUsed - before.heapUsed) / divisor,
    arrayBufferBytes: (after.arrayBuffers - before.arrayBuffers) / divisor,
  }
  retained = undefined
  await collectGarbage()
  return value
}

function correctness(matcher, normalize, fixture) {
  const { patterns, text } = fixture
  const actual = normalize(matcher.search(text), text)
  return compare(actual, reference(patterns, text), matcher.match(text))
}

if (process.argv[2] === '--child' || process.argv[2] === '--memory') {
  const [, , mode, variant, scenario] = process.argv
  assert.ok(variants.includes(variant) && selected.includes(scenario), 'Unknown child variant/scenario')
  const Constructor = (await import(entries[variant])).default
  const fixture = scenarios[scenario]
  const { patterns, text } = fixture
  if (mode === '--memory') {
    // A fresh process avoids retained correctness/normalization fixtures affecting timings.
    // Warm the constructor and each result representation before the post-GC deltas.
    retained = new Constructor(patterns)
    retained = undefined
    const dictionaryCopies = retainedDictionaryCopies(patterns.length)
    const dictionary = await retention(() => Array.from({ length: dictionaryCopies }, () => new Constructor(patterns)), dictionaryCopies)
    const matcher = new Constructor(patterns)
    retained = matcher.search(text)
    retained = undefined
    const nativeResults = await retention(() => matcher.search(text))
    const normalize = normalizer(variant, patterns)
    retained = normalize(matcher.search(text), text)
    retained = undefined
    const normalizedResults = await retention(() => normalize(matcher.search(text), text))
    console.log(JSON.stringify({ variant, scenario, dictionaryCopies, dictionary, nativeResults, normalizedResults }))
  }
  else {
    const matcher = new Constructor(patterns)
    const normalize = normalizer(variant, patterns)
    const checks = correctness(matcher, normalize, fixture)
    checks.expectedMismatch = variant === 'v1' && fixture.expectedV1Mismatch === true
    assert.equal(checks.correct, !checks.expectedMismatch, `${variant}/${scenario}: unexpected correctness result`)
    globalThis.gc()
    const ops = {
      build: () => new Constructor(patterns),
      search: () => matcher.search(text),
      match: () => matcher.match(text),
      normalizedSearch: () => normalize(matcher.search(text), text),
    }
    const metrics = Object.fromEntries(operations.map((name) => {
      const metric = time(ops[name], name === 'build' ? patterns.reduce((sum, p) => sum + p.length, 0) : text.length)
      if (name === 'match') {
        delete metric.utf16UnitsPerSecond
      }
      return [name, metric]
    }))
    console.log(JSON.stringify({ variant, scenario, checks, metrics }))
  }
}
else {
  const packageInfo = (url) => {
    const pkg = JSON.parse(readFileSync(url, 'utf8'))
    return { name: pkg.name, version: pkg.version }
  }
  const journal = benchmarkJournal(root, 'versions', {
    environment,
    hashSeeds: Array.from({ length: rounds }, (_, round) => benchmarkHashSeed(round)),
    versions: {
      v1: { ...packageInfo(new URL(import.meta.resolve('modern-ahocorasick-v1/package.json'))), implementationSha256: implementationDigest(fileURLToPath(new URL('./', entries.v1))) },
      v2: { ...packageInfo(new URL(import.meta.resolve('modern-ahocorasick-v2/package.json'))), implementationSha256: implementationDigest(fileURLToPath(new URL('./', entries.v2))) },
      current: { ...packageInfo(new URL('../packages/modern-ahocorasick/package.json', import.meta.url)), implementationSha256: implementationDigest(fileURLToPath(new URL('./', entries.current))) },
    },
    runnerSha256,
    lockfileSha256: digest(readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8')),
    corpusSha256: digest(scenarios),
    timingMethod: 'Each operation has at least 250 ms of cumulative warmup, calibrated batches targeting 25 ms up to 1,048,576 iterations, and seven GC-separated samples.',
  })
  const start = performance.now()
  const rawRuns = []
  const memoryRuns = []
  for (const [scenarioIndex, scenario] of selected.entries()) {
    for (let round = 0; round < rounds; round++) {
      const offset = (round + scenarioIndex) % variants.length
      const order = [...variants.slice(offset), ...variants.slice(0, offset)]
      if (round % 2) {
        order.reverse()
      }
      for (const variant of order) {
        process.stderr.write(`Versions ${scenario} / ${variant} / round ${round + 1}/${rounds}\n`)
        for (const [mode, destination] of (recheck ? [['--child', rawRuns]] : [['--child', rawRuns], ['--memory', memoryRuns]])) {
          const hashSeed = benchmarkHashSeed(round)
          const result = JSON.parse(execFileSync(process.execPath, [`--hash-seed=${hashSeed}`, '--expose-gc', script, mode, variant, scenario], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, BENCH_OPERATIONS: operationsFor(scenario).join(',') } }))
          journal.record(mode === '--child' ? 'timing' : 'memory', { round: round + 1, hashSeed, ...result })
          destination.push({ round: round + 1, hashSeed, ...result })
        }
      }
    }
  }
  const results = selected.flatMap(scenario => variants.map((variant) => {
    const runs = rawRuns.filter(run => run.scenario === scenario && run.variant === variant)
    const memory = memoryRuns.filter(run => run.scenario === scenario && run.variant === variant)
    for (const run of runs) {
      assert.deepEqual(run.checks, runs[0].checks, 'Correctness changed between rounds')
    }
    return {
      scenario,
      variant,
      keywords: scenarios[scenario].patterns.length,
      utf16Length: scenarios[scenario].text.length,
      unicode: scenarios[scenario].unicode === true,
      checks: runs[0].checks,
      dictionaryCopies: recheck ? null : memory[0].dictionaryCopies,
      metrics: Object.fromEntries(operationsFor(scenario).map((operation) => {
        const values = runs.map(run => run.metrics[operation])
        const roundMediansMs = values.map(value => value.ms)
        const ms = median(roundMediansMs)
        return [operation, {
          ms,
          withinRoundMadMs: median(values.map(value => value.madMs)),
          betweenRoundsMadMs: median(roundMediansMs.map(value => Math.abs(value - ms))),
          roundMediansMs,
          ...(operation === 'match' ? {} : { utf16UnitsPerSecond: median(values.map(value => value.utf16UnitsPerSecond)) }),
        }]
      })),
      memory: recheck
        ? null
        : Object.fromEntries(['dictionary', 'nativeResults', 'normalizedResults'].map(kind => [kind, {
            heapBytes: median(memory.map(run => run[kind].heapBytes)),
            arrayBufferBytes: median(memory.map(run => run[kind].arrayBufferBytes)),
          }])),
    }
  }))
  const comparisons = []
  for (const current of results.filter(result => result.variant === 'current')) {
    for (const variant of ['v1', 'v2']) {
      const baseline = results.find(result => result.scenario === current.scenario && result.variant === variant)
      for (const operation of operationsFor(current.scenario)) {
        const comparable = baseline.checks.correct && current.checks.correct
        const ratio = comparable ? current.metrics[operation].ms / baseline.metrics[operation].ms : null
        comparisons.push({ scenario: current.scenario, baseline: variant, operation, comparable, currentOverBaseline: ratio, recheck: ratio !== null && ratio > 1.05 })
      }
    }
  }
  console.log(JSON.stringify({
    ...journal.metadata,
    schemaVersion: 1,
    recheckOf: recheck ? { startedAt: recheck.startedAt, reportSha256: digest(recheck) } : null,
    elapsedSeconds: (performance.now() - start) / 1000,
    rounds,
    samples: 7,
    operations,
    scenarios: selected,
    notes: [
      'Current is the local default ESM build; v1/v2 are exact published ESM artifacts, pinned by npm aliases and lockfile.',
      'Native search returns grouped arrays for v1/v2 and independent ranges for current; output work differs. normalizedSearch includes historical flattening and v2 per-query grapheme-to-UTF-16 segmentation; dictionary index maps are prepared outside timing. Current already returns the target format. Canonical sorting is correctness-only.',
      'Correctness uses independent boundary-aware substring searches, including duplicate multiplicity. Known v1 Unicode defects are recorded, never repaired or used for ratios. Unexpected mismatches fail the run.',
      'Five rounds by default; at least 250 ms of cumulative warmup followed by seven calibrated batched samples per operation, GC outside timings, fresh processes with rotated version order. match has no throughput because it can exit early.',
      'Memory uses separate processes each round: deltas after three GC/task turns to settle backing-store disposal, 10–1000 retained native dictionaries depending on pattern count (dictionaryCopies records the divisor), and one retained native/normalized result. Shared keyword arrays in historical native results are already owned by the dictionary; adapter maps are excluded. Signed deltas retain GC noise; buffers are separate from JS heap. Neither native ICU memory nor peak RSS is measured.',
      'Ratios are current milliseconds / baseline milliseconds; below one is faster. Flags above 1.05 request a seven-round recheck, not an automatic performance failure.',
    ],
    results,
    comparisons,
    rawRuns,
    memoryRuns,
  }, null, 2))
}
