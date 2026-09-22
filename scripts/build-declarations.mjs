import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)), '-p', 'tsconfig.build.json'], { stdio: 'inherit' })
// The implementation is bundled into index.js/index.cjs. Keep its declaration
// out of the tarball so the existing wildcard export gains no internal path.
for (const name of ['internal', 'runtime', 'double-array', 'persistence', 'legacy-stream', 'options', 'case-folding']) {
  rmSync(`dist/${name}.d.ts`, { force: true })
}

// Named-export modules need a CJS declaration graph, not ESM declarations
// masquerading as .d.cts. Root keeps its hand-written constructor facade.
for (const name of ['types', 'replace', 'stream', 'stream/filters', 'stream/node', 'stream/web']) {
  const declaration = readFileSync(`dist/${name}.d.ts`, 'utf8').replaceAll('.js\'', '.cjs\'')
  writeFileSync(`dist/${name}.d.cts`, declaration)
}
for (const [name, className] of [['unicode', 'UnicodeAhoCorasick'], ['unicode-fast', 'UnicodeFastAhoCorasick'], ['fast', 'FastAhoCorasick'], ['dynamic', 'DynamicDictionary']]) {
  const namespace = name === 'dynamic'
    ? `\ndeclare namespace ${className} {\n  type DictionarySnapshot<T = unknown> = Types.DictionarySnapshot<T>\n  type DictionaryCompiler<T> = Types.DictionaryCompiler<T>\n}\n`
    : ''
  writeFileSync(`dist/${name}.d.cts`, `import type DefaultExport from './${name}.js' with { 'resolution-mode': 'import' }\n${name === 'dynamic' ? `import type * as Types from './${name}.js' with { 'resolution-mode': 'import' }\n` : ''}declare const ${className}: typeof DefaultExport\ntype ${className}<T = unknown> = DefaultExport<T>\n${namespace}export = ${className}\n`)
}
