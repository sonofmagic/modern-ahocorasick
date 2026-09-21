import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

const samples = 7

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
