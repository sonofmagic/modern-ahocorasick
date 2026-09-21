import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const script = fileURLToPath(import.meta.url)
const baselineRef = 'a4181b054b2d2c85e83fe4201b1417c879db2f30'
const samples = 5
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
}

function median(values) {
  return values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
}

function time(operation) {
  operation()
  const times = []
  for (let i = 0; i < samples; i++) {
    globalThis.gc()
    const start = performance.now()
    operation()
    times.push(performance.now() - start)
  }
  return median(times)
}

if (process.argv[2] === '--child') {
  const [, , , variant, scenario] = process.argv
  const { patterns, text } = scenarios[scenario]
  const Constructor = variant === 'v2'
    ? (await import(`data:text/javascript;base64,${Buffer.from(readFileSync(0, 'utf8')).toString('base64')}`)).default
    : (await import('../packages/modern-ahocorasick/dist/index.js')).default
  const buildMs = time(() => new Constructor(patterns))
  const ac = new Constructor(patterns)
  const searchMs = time(() => ac.search(text))
  const matchMs = time(() => ac.match(text))
  let iterateMs = null
  let iterateCount = null
  if (variant === 'v3') {
    iterateMs = time(() => {
      let count = 0
      for (const match of ac.iterate(text)) {
        void match
        count++
      }
      iterateCount = count
    })
  }
  // Sample retained heap in an isolated process, after warmup and explicit GC.
  globalThis.gc()
  const beforeDictionary = process.memoryUsage().heapUsed
  const dictionaries = Array.from({ length: 10 }, () => new Constructor(patterns))
  globalThis.gc()
  const dictionaryHeapBytes = Math.max(0, process.memoryUsage().heapUsed - beforeDictionary) / dictionaries.length
  dictionaries.length = 0
  globalThis.gc()
  const beforeResults = process.memoryUsage().heapUsed
  const result = ac.search(text)
  const count = variant === 'v2' ? result.reduce((sum, item) => sum + item[1].length, 0) : result.length
  globalThis.gc()
  const resultHeapBytes = Math.max(0, process.memoryUsage().heapUsed - beforeResults)
  assert.ok(result.length <= count)
  if (variant === 'v3') {
    assert.equal(iterateCount, count)
  }
  console.log(JSON.stringify({ scenario, variant, keywords: patterns.length, utf16Length: text.length, count, buildMs, searchMs, matchMs, iterateMs, dictionaryHeapBytes, resultHeapBytes }))
}
else {
  const baseline = stripTypeScriptTypes(execFileSync('git', ['show', `${baselineRef}:packages/modern-ahocorasick/src/index.ts`], { cwd: root, encoding: 'utf8' }))
  const results = []
  for (const scenario of Object.keys(scenarios)) {
    for (const variant of ['v2', 'v3']) {
      const output = execFileSync(process.execPath, ['--expose-gc', script, '--child', variant, scenario], { cwd: root, input: baseline, encoding: 'utf8' })
      results.push(JSON.parse(output))
    }
    assert.equal(results.at(-1).count, results.at(-2).count, `${scenario}: v2/v3 match counts differ`)
  }
  console.log(JSON.stringify({
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    baselineRef,
    samples,
    note: 'Medians after warmup. Heap deltas after explicit GC are noisy retained JS heap, not peak/RSS or native ICU memory. v2 retains grouped results with shared keyword arrays; v3 retains one independent object per match.',
    results,
  }, null, 2))
}
