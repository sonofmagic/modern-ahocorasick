import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { cpus, tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'tsdown'

const root = fileURLToPath(new URL('../', import.meta.url))
const script = fileURLToPath(import.meta.url)
const scenarios = {
  classic: { keywords: 'he,she,his,hers', text: 'ushers '.repeat(100) },
  unicode: { keywords: '中国,中国人,人,é,👨‍👩‍👧‍👦,😀', text: '中国人 é 👨‍👩‍👧‍👦 😀 '.repeat(100) },
  dense: { keywords: 'a,aa,aaa,a', text: 'a'.repeat(2000) },
  dictionary: { keywords: Array.from({ length: 150 }, (_, i) => `word${i}`).join(','), text: 'word149 word50 '.repeat(100) },
}
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]

if (process.argv[2] === '--child') {
  const [, , , bundle, scenario, variant] = process.argv
  const { Experiment } = await import(pathToFileURL(bundle).href)
  const input = { ...scenarios[scenario], speed: 2, strategy: 'all', replacement: '[match]', showFailure: false }
  const engine = new Experiment()
  let iteration = 0
  const operation = () => {
    const instance = variant === 'cold' ? new Experiment() : engine
    // Force a text rescan while retaining the dictionary in the reused variant.
    const text = input.text + (iteration++ % 2 ? '!' : '?')
    return instance.run({ ...input, text })
  }
  for (let i = 0; i < 3; i++) {
    // Warm the engine before timing steady-state samples.
    operation()
  }
  const samples = []
  for (let i = 0; i < 7; i++) {
    globalThis.gc()
    const start = performance.now()
    operation()
    samples.push(performance.now() - start)
  }
  // A separate fresh engine measures one live model and a structured-cloned UI copy.
  globalThis.gc()
  const before = process.memoryUsage().heapUsed
  const retainedEngine = new Experiment()
  const retained = retainedEngine.run(input)
  globalThis.gc()
  const workerHeap = process.memoryUsage().heapUsed - before
  const copyStart = performance.now()
  const copied = structuredClone(retained)
  const cloneMs = performance.now() - copyStart
  globalThis.gc()
  const copiedHeap = process.memoryUsage().heapUsed - before - workerHeap
  assert.deepEqual(copied.selected, retained.selected)
  assert.equal(retainedEngine.run(input).model, retained.model)
  console.log(JSON.stringify({ scenario, variant, medianMs: median(samples), workerHeap, copiedHeap, cloneMs, steps: retained.model.steps.length, hits: retained.selected.length }))
}
else {
  const directory = await mkdtemp(join(tmpdir(), 'ahocorasick-docs-bench-'))
  try {
    await writeFile(join(directory, 'package.json'), '{"type":"module"}')
    await build({ config: false, cwd: root, entry: { experiment: 'apps/docs/src/experiment.ts' }, outDir: directory, clean: false, dts: false, deps: { alwaysBundle: ['modern-ahocorasick'] }, logLevel: 'silent' })
    const entry = (await readdir(directory)).find(name => /^experiment\.[cm]?js$/.test(name))
    assert(entry, 'benchmark bundle must exist')
    const bundle = join(directory, entry)
    const rows = []
    for (const scenario of Object.keys(scenarios)) {
      for (const variant of ['cold', 'reuse']) {
        rows.push(JSON.parse(execFileSync(process.execPath, ['--expose-gc', script, '--child', bundle, scenario, variant], { cwd: root, encoding: 'utf8' })))
      }
    }
    console.log(JSON.stringify({ node: process.version, cpu: cpus()[0].model, samples: 7, rows }, null, 2))
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}
