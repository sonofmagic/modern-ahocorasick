import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const samples = 7

/** Bundle historical source graphs, including v3.1's options/persistence/stream modules. */
export async function gitBaseline(ref, root) {
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
    await build({ config: false, entry: [path.join(temporary, 'index.ts')], outDir: path.join(temporary, 'built'), format: 'esm', target: 'es2022', dts: false, exports: false, clean: false, logLevel: 'silent', outExtensions: () => ({ js: '.mjs' }) })
    return readFileSync(path.join(temporary, 'built/index.mjs'), 'utf8')
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
