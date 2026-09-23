import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { benchmarkHashSeed, benchmarkJournal, collectGarbage, gitBaseline, implementationDigest, median, readBenchmarkInput, time } from './benchmark-utils.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const baselineRef = process.env.BENCH_BASELINE_REF ?? 'b01c9f22b2566b3a6058b41b05564b214899c8d7'
const availableSizes = [10_000, 100_000, 1_000_000]
const sizes = process.env.BENCH_SIZES?.split(',').map(Number) ?? availableSizes
const rounds = Number(process.env.BENCH_ROUNDS ?? 3)
assert.ok(sizes.length > 0 && new Set(sizes).size === sizes.length && sizes.every(size => availableSizes.includes(size)))
assert.ok(Number.isSafeInteger(rounds) && rounds >= 1 && rounds <= 9)
assert.equal(typeof globalThis.gc, 'function', 'Run Node with --expose-gc')

if (process.argv[2] === '--child') {
  const variant = process.argv[3]
  const size = Number(process.argv[4])
  assert.ok(['baseline', 'current'].includes(variant) && sizes.includes(size))
  const Constructor = variant === 'current'
    ? (await import('../packages/modern-ahocorasick/dist/index.js')).default
    : (await import(`data:text/javascript;base64,${Buffer.from(await readBenchmarkInput()).toString('base64')}`)).default
  const patterns = Array.from({ length: size }, (_, i) => `keyword-${i}-end`)
  const text = Array.from({ length: 1000 }, (_, i) => patterns[i * 7919 % size]).join(' ')
  await collectGarbage()
  const before = process.memoryUsage()
  const start = performance.now()
  const dictionary = new Constructor(patterns)
  const buildMs = performance.now() - start
  const buildPeakRssBytes = process.resourceUsage().maxRSS * 1024
  await collectGarbage()
  const after = process.memoryUsage()
  const countTiming = time(() => {
    assert.equal(dictionary.count(text), 1000)
    return 1000
  }, text.length)
  const matches = dictionary.search(text)
  assert.equal(matches.length, 1000)
  assert.ok(matches.every(hit => text.slice(hit.start, hit.end) === hit.pattern))
  console.log(JSON.stringify({
    variant,
    size,
    buildMs,
    countMs: countTiming.ms,
    countTiming,
    dictionaryHeapBytes: after.heapUsed - before.heapUsed,
    dictionaryBufferBytes: after.arrayBuffers - before.arrayBuffers,
    beforeRssBytes: before.rss,
    buildPeakRssBytes,
    checks: createHash('sha256').update(JSON.stringify(matches)).digest('hex'),
  }))
}
else {
  const baseline = await gitBaseline(baselineRef, root)
  const journal = benchmarkJournal(root, 'scale', {
    baselineRef,
    hashSeeds: Array.from({ length: rounds }, (_, round) => benchmarkHashSeed(round)),
    baselineBundling: 'public-multi-entry',
    baselineSourceSha256: createHash('sha256').update(baseline).digest('hex'),
    implementationSha256: implementationDigest(fileURLToPath(new URL('../packages/modern-ahocorasick/dist', import.meta.url))),
    runnerSha256: createHash('sha256').update(JSON.stringify(['benchmark-scale.mjs', 'benchmark-utils.mjs'].map(file => [file, readFileSync(new URL(file, import.meta.url), 'utf8')]))).digest('hex'),
    timingMethod: 'Construction is one cold observation per child. Count has at least 250 ms of cumulative warmup, calibrated batches targeting 25 ms up to 1,048,576 iterations, and seven GC-separated samples.',
  })
  const rawRuns = []
  for (const [sizeIndex, size] of sizes.entries()) {
    for (let round = 0; round < rounds; round++) {
      const variants = (round + sizeIndex) % 2 ? ['current', 'baseline'] : ['baseline', 'current']
      for (const variant of variants) {
        process.stderr.write(`Scale ${size} / ${variant} / round ${round + 1}/${rounds}\n`)
        const hashSeed = benchmarkHashSeed(round)
        const result = JSON.parse(execFileSync(process.execPath, [`--hash-seed=${hashSeed}`, '--max-old-space-size=8192', '--expose-gc', fileURLToPath(import.meta.url), '--child', variant, String(size)], {
          cwd: root,
          input: variant === 'baseline' ? baseline : '',
          encoding: 'utf8',
        }))
        const run = { round: round + 1, hashSeed, ...result }
        journal.record('scale', run)
        rawRuns.push(run)
      }
    }
  }
  const results = sizes.flatMap(size => ['baseline', 'current'].map((variant) => {
    const runs = rawRuns.filter(run => run.size === size && run.variant === variant)
    assert.equal(new Set(rawRuns.filter(run => run.size === size).map(run => run.checks)).size, 1, 'Results changed between variants or rounds')
    const metrics = ['buildMs', 'countMs', 'dictionaryHeapBytes', 'dictionaryBufferBytes', 'beforeRssBytes', 'buildPeakRssBytes']
    return {
      variant,
      size,
      ...Object.fromEntries(metrics.map(key => [key, median(runs.map(run => run[key]))])),
      mad: Object.fromEntries(metrics.map((key) => {
        const values = runs.map(run => run[key])
        const center = median(values)
        return [key, median(values.map(value => Math.abs(value - center)))]
      })),
    }
  }))
  console.log(JSON.stringify({
    ...journal.metadata,
    rounds,
    note: 'Medians of independent cold processes with alternating variant order. Count uses seven calibrated batched samples after at least 250 ms of cumulative warmup. Retained memory follows three GC/task turns so backing-store disposal can settle; heap excludes preexisting input strings and ArrayBuffer storage is separate. Build peak RSS is captured before those GCs and includes runtime, input, native allocations, temporary builder and final tables. Historical modules use data URLs, so loader storage differs. This is a scale experiment, not a universal ranking.',
    results,
    rawRuns,
  }, null, 2))
}
