import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { cpus, tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { setImmediate } from 'node:timers/promises'

const samples = 7

// Pair variants under several predetermined V8 string-hash layouts. Repeated
// misses against a tiny alphabet otherwise vary with random bucket collisions.
export function benchmarkHashSeed(round) {
  return 104729 + round * 7919
}

// Amortize runtime/JIT noise over more small dictionaries without multiplying
// large fixtures into excessive retained storage. Both variants use this count.
export function retainedDictionaryCopies(patternCount) {
  return Math.max(10, Math.min(1000, Math.floor(100000 / Math.max(1, patternCount))))
}

/** Allow V8's backing-store disposal to finish before retained-memory samples. */
export async function collectGarbage() {
  for (let pass = 0; pass < 3; pass++) {
    globalThis.gc()
    await setImmediate()
  }
}

/** Resolve metadata before measuring; retain each completed child if a later run fails. */
export function benchmarkJournal(root, name, details = {}) {
  const metadata = {
    startedAt: new Date().toISOString(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    workingTreeDirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0,
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, icu: process.versions.icu, unicode: process.versions.unicode },
    ...details,
  }
  const file = process.env.BENCH_RECORD_FILE ?? path.join(mkdtempSync(path.join(tmpdir(), `aho-${name}-`)), 'runs.jsonl')
  writeFileSync(file, `${JSON.stringify({ kind: 'metadata', ...metadata })}\n`, { flag: 'wx' })
  process.stderr.write(`Raw benchmark records: ${file}\n`)
  return {
    metadata,
    record: (kind, result) => appendFileSync(file, `${JSON.stringify({ kind, ...result })}\n`),
  }
}

/** Bundle historical source graphs, including v3.1's options/persistence/stream modules. */
export async function gitBaseline(ref, root, entry = 'index') {
  const temporary = mkdtempSync(path.join(tmpdir(), 'aho-benchmark-baseline-'))
  try {
    const files = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, 'packages/modern-ahocorasick/src'], { cwd: root, encoding: 'utf8' }).trim().split('\n')
    for (const file of files.filter(file => file.endsWith('.ts'))) {
      const relative = file.slice('packages/modern-ahocorasick/src/'.length)
      const target = path.join(temporary, relative)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, execFileSync('git', ['show', `${ref}:${file}`], { cwd: root }))
    }
    const { build } = await import('tsdown')
    // Match the published multi-entry module topology. A single-entry bundle
    // changes V8 inlining opportunities and can manufacture scanner regressions.
    const entries = ['index', 'text', 'unicode', 'unicode-fast', 'fast', 'dynamic', 'replace', 'stream', 'stream/filters', 'stream/node', 'stream/web']
      .filter(name => existsSync(path.join(temporary, `${name}.ts`)))
    await build({ config: false, entry: Object.fromEntries(entries.map(name => [name, path.join(temporary, `${name}.ts`)])), outDir: path.join(temporary, 'built'), format: 'esm', target: 'es2022', dts: false, exports: false, clean: false, logLevel: 'silent', outExtensions: () => ({ js: '.mjs' }) })
    // Keep modules separate when transferring the graph to isolated child
    // processes. Identical shared-module URLs preserve ESM singleton identity.
    const modules = new Map()
    function source(file) {
      const code = readFileSync(file, 'utf8')
      return code.replace(/(["'])(\.[^"']+\.mjs)\1/g, (_match, _quote, relative) => {
        const dependency = path.resolve(path.dirname(file), relative)
        if (!modules.has(dependency)) {
          modules.set(dependency, `data:text/javascript;base64,${Buffer.from(source(dependency)).toString('base64')}`)
        }
        return JSON.stringify(modules.get(dependency))
      })
    }
    return source(path.join(temporary, `built/${entry}.mjs`))
  }
  finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

/** Hash every ESM chunk, not just the now-small public re-export entry. */
export function implementationDigest(directory) {
  const hash = createHash('sha256')
  for (const file of readdirSync(directory, { recursive: true }).filter(file => file.endsWith('.js')).sort()) {
    hash.update(file)
    hash.update(readFileSync(path.join(directory, file)))
  }
  return hash.digest('hex')
}

export function median(values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
}

let sink
export function time(operation, units) {
  // Batch tiny operations to avoid treating timer resolution as a speedup.
  // Nanosecond presence queries need far more than 4096 iterations to reach
  // the target duration and finish JIT warmup; tiny batches amplify GC noise.
  let iterations = 1
  let warmupMs = 0
  let warmupIterations = 0
  while (true) {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      sink = operation()
    }
    const elapsed = performance.now() - start
    warmupMs += elapsed
    warmupIterations += iterations
    // A slow cold batch must not end warmup before the JIT settles. Keep
    // calibrating as later batches accelerate, including at the batch cap.
    if (warmupMs >= 250 && (elapsed >= 25 || iterations >= 1_048_576)) {
      break
    }
    if (elapsed < 25 && iterations < 1_048_576) {
      iterations *= 2
    }
  }
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
  return { ms, samplesMs: times, madMs: median(times.map(value => Math.abs(value - ms))), iterations, warmupMs, warmupIterations, utf16UnitsPerSecond: units / (ms / 1000) }
}

/** Pipes can be nonblocking on macOS; consume to EOF instead of sync fd reads. */
export async function readBenchmarkInput() {
  process.stdin.setEncoding('utf8')
  let source = ''
  for await (const chunk of process.stdin) {
    source += chunk
  }
  return source
}
