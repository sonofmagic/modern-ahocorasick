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
const baselineRef = process.env.BENCH_BASELINE_REF ?? 'c15a10e8f7ed44143edc0e74202064cb9c7b81c7'
const sizes = [10_000, 100_000, 1_000_000]

if (process.argv[2] === '--child') {
  const variant = process.argv[3]
  const size = Number(process.argv[4])
  assert.ok(sizes.includes(size))
  const Constructor = variant === 'current'
    ? (await import('../packages/modern-ahocorasick/dist/index.js')).default
    : (await import(`data:text/javascript;base64,${Buffer.from(readFileSync(0, 'utf8')).toString('base64')}`)).default
  const patterns = Array.from({ length: size }, (_, i) => `keyword-${i}-end`)
  const text = Array.from({ length: 1000 }, (_, i) => patterns[i * 7919 % size]).join(' ')
  globalThis.gc()
  const before = process.memoryUsage()
  const start = performance.now()
  const dictionary = new Constructor(patterns)
  const buildMs = performance.now() - start
  const buildPeakRssBytes = process.resourceUsage().maxRSS * 1024
  globalThis.gc()
  const after = process.memoryUsage()
  // Warm up the scan before measuring, retaining only scalar totals.
  for (let i = 0; i < 10; i++) {
    assert.equal(dictionary.count(text), 1000)
  }
  const scanStart = performance.now()
  for (let i = 0; i < 100; i++) {
    assert.equal(dictionary.count(text), 1000)
  }
  const countMs = (performance.now() - scanStart) / 100
  assert.equal(dictionary.search(text).length, 1000)
  console.log(JSON.stringify({
    variant,
    size,
    buildMs,
    countMs,
    dictionaryHeapBytes: after.heapUsed - before.heapUsed,
    dictionaryBufferBytes: after.arrayBuffers - before.arrayBuffers,
    buildPeakRssBytes,
  }))
}
else {
  const source = path => stripTypeScriptTypes(execFileSync('git', ['show', `${baselineRef}:${path}`], { cwd: root, encoding: 'utf8' }), { mode: 'transform' })
  const baseline = `${source('packages/modern-ahocorasick/src/internal.ts')}\n${source('packages/modern-ahocorasick/src/index.ts').replace(/^import \{[^}]+\} from '\.\/internal\.js';?\s*$/m, '')}`
  const results = []
  for (const size of sizes) {
    for (const variant of ['baseline', 'current']) {
      process.stderr.write(`Scale ${size} / ${variant}\n`)
      results.push(JSON.parse(execFileSync(process.execPath, ['--max-old-space-size=8192', '--expose-gc', fileURLToPath(import.meta.url), '--child', variant, String(size)], {
        cwd: root,
        input: baseline,
        encoding: 'utf8',
      })))
    }
  }
  console.log(JSON.stringify({
    node: process.version,
    cpu: cpus()[0]?.model,
    icu: process.versions.icu,
    unicode: process.versions.unicode,
    baselineRef,
    implementationSha256: createHash('sha256').update(readFileSync(new URL('../packages/modern-ahocorasick/dist/index.js', import.meta.url))).digest('hex'),
    note: 'One fresh process per size/variant; construction is a cold single observation, count averages 100 scans after warmup. Retained heap excludes input strings and includes a single dictionary; ArrayBuffer storage is separate. Build peak RSS includes runtime, input, temporary builder and compact tables. This is a scale/feasibility measurement, not a universal performance ranking.',
    results,
  }, null, 2))
}
