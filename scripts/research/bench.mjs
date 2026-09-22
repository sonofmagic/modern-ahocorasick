import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import process from 'node:process'

const { default: AhoCorasick } = await import('../../packages/modern-ahocorasick/dist/index.js')

const patterns = readFileSync(process.argv[2], 'utf8').trimEnd().split('\n')
const text = readFileSync(process.argv[3], 'utf8')
globalThis.gc()
const before = process.memoryUsage()
let t = performance.now()
const matcher = new AhoCorasick(patterns)
const buildMs = performance.now() - t
globalThis.gc()
const after = process.memoryUsage()
function scan() {
  let count = 0
  let checksum = 0
  for (const hit of matcher.iterate(text)) {
    count++
    checksum += hit.start + hit.end + hit.patternIndex
  }
  return { count, checksum }
}
for (let i = 0; i < 20; i++) {
  scan()
  const iterator = matcher.iterate(text)
  iterator.next()
  iterator.return?.()
}
t = performance.now()
const result = scan()
const queryMs = performance.now() - t
t = performance.now()
const iterator = matcher.iterate(text)
iterator.next()
iterator.return?.()
const firstMs = performance.now() - t
console.log(JSON.stringify({ buildMs, queryMs, firstMs, ...result, retainedHeapBytes: after.heapUsed - before.heapUsed, arrayBufferBytes: after.arrayBuffers - before.arrayBuffers }))
