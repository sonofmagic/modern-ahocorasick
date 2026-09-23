import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { benchmarkJournal, gitBaseline, implementationDigest, median, readBenchmarkInput } from './benchmark-utils.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const baselineRef = process.env.BENCH_BASELINE_REF ?? 'b01c9f22b2566b3a6058b41b05564b214899c8d7'
const rounds = Number(process.env.BENCH_ROUNDS ?? 3)
const checkpoints = [500, 1500, 5000]
const chunk = 'Straße e\u0301\n'.repeat(8)
const strategies = ['all', 'leftmost-longest']
assert.ok(Number.isSafeInteger(rounds) && rounds >= 1 && rounds <= 9)
assert.equal(typeof globalThis.gc, 'function', 'Run Node with --expose-gc')

// Keep the closed stream alive too: release must not depend on collecting its handle.
let retained
if (process.argv[2] === '--child') {
  const [, , , variant, strategy] = process.argv
  assert.ok(['baseline', 'current'].includes(variant) && strategies.includes(strategy))
  const Constructor = variant === 'current'
    ? (await import('../packages/modern-ahocorasick/dist/text.js')).default
    : (await import(`data:text/javascript;base64,${Buffer.from(await readBenchmarkInput()).toString('base64')}`)).default
  const matcher = new Constructor(['strasse', 'ss', 'é'], { caseFold: true, normalization: 'NFC' })
  const stream = matcher.createStream({ strategy, maxBufferedUnits: 2048 })
  retained = stream
  const hash = createHash('sha256')
  let count = 0
  function consume(matches) {
    for (const hit of matches) {
      hash.update(`${hit.patternIndex}:${hit.start}:${hit.end}\n`)
      count++
    }
  }
  globalThis.gc()
  const before = process.memoryUsage()
  const samples = []
  for (let index = 1; index <= checkpoints.at(-1); index++) {
    consume(stream.write(chunk))
    if (checkpoints.includes(index)) {
      globalThis.gc()
      const memory = process.memoryUsage()
      samples.push({ chunks: index, utf16Units: index * chunk.length, emitted: count, heapBytes: memory.heapUsed - before.heapUsed, arrayBufferBytes: memory.arrayBuffers - before.arrayBuffers })
    }
  }
  consume(stream.finish())
  assert.equal(count, checkpoints.at(-1) * 8 * (strategy === 'all' ? 3 : 2))
  stream.cancel()
  globalThis.gc()
  const after = process.memoryUsage()
  assert.equal(retained, stream)
  console.log(JSON.stringify({ variant, strategy, count, checks: hash.digest('hex'), samples, closedHeapBytes: after.heapUsed - before.heapUsed, closedBufferBytes: after.arrayBuffers - before.arrayBuffers }))
}
else {
  const baseline = await gitBaseline(baselineRef, root, 'text')
  const journal = benchmarkJournal(root, 'stream', {
    baselineRef,
    baselineSourceSha256: createHash('sha256').update(baseline).digest('hex'),
    implementationSha256: implementationDigest(fileURLToPath(new URL('../packages/modern-ahocorasick/dist', import.meta.url))),
  })
  const rawRuns = []
  for (const [index, strategy] of strategies.entries()) {
    for (let round = 0; round < rounds; round++) {
      for (const variant of ((round + index) % 2 ? ['current', 'baseline'] : ['baseline', 'current'])) {
        process.stderr.write(`Stream ${strategy} / ${variant} / round ${round + 1}/${rounds}\n`)
        const result = JSON.parse(execFileSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), '--child', variant, strategy], { cwd: root, input: variant === 'baseline' ? baseline : '', encoding: 'utf8' }))
        const run = { round: round + 1, ...result }
        journal.record('stream', run)
        rawRuns.push(run)
      }
    }
    assert.equal(new Set(rawRuns.filter(run => run.strategy === strategy).map(run => run.checks)).size, 1, 'Streaming results differ')
  }
  const results = strategies.flatMap(strategy => ['baseline', 'current'].map((variant) => {
    const runs = rawRuns.filter(run => run.strategy === strategy && run.variant === variant)
    return {
      variant,
      strategy,
      samples: checkpoints.map((chunks, index) => ({
        chunks,
        utf16Units: chunks * chunk.length,
        emitted: runs[0].samples[index].emitted,
        heapBytes: median(runs.map(run => run.samples[index].heapBytes)),
        arrayBufferBytes: median(runs.map(run => run.samples[index].arrayBufferBytes)),
      })),
      closedHeapBytes: median(runs.map(run => run.closedHeapBytes)),
      closedBufferBytes: median(runs.map(run => run.closedBufferBytes)),
    }
  }))
  console.log(JSON.stringify({ ...journal.metadata, rounds, note: 'Post-GC retained memory in independent processes; consume outputs immediately and retain the stream handle after finish/cancel. Dictionary and input chunk predate the baseline. Deltas include JIT/runtime heap noise and exclude native ICU and peak RSS. Original ranges and input-index multiplicity are checked by matching full output digests.', results, rawRuns }, null, 2))
}
