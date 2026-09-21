import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const packageDir = path.join(root, 'packages/modern-ahocorasick')
const temporary = mkdtempSync(path.join(tmpdir(), 'modern-ahocorasick-'))

function run(command, args, cwd = temporary) {
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

try {
  // npm is only used to pack local files; this test never publishes or installs.
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'pack',
    '--ignore-scripts',
    '--pack-destination',
    temporary,
  ], { cwd: packageDir, stdio: 'inherit', shell: process.platform === 'win32' })
  const tarball = readdirSync(temporary).find(name => name.endsWith('.tgz'))
  assert.ok(tarball, 'pack must produce a tarball')
  const installed = path.join(temporary, 'node_modules/modern-ahocorasick')
  mkdirSync(installed, { recursive: true })
  run('tar', ['-xzf', path.join(temporary, tarball), '-C', installed, '--strip-components=1'])
  for (const file of ['README.md', 'README.zh-CN.md', 'MIGRATION.md', 'LICENSE', 'dist/index.js', 'dist/index.cjs', 'dist/index.d.ts', 'dist/index.d.cts', 'dist/text.js', 'dist/text.cjs', 'dist/text.d.ts', 'dist/text.d.cts', 'UNICODE-LICENSE.txt']) {
    assert.ok(existsSync(path.join(installed, file)), `Missing packed file: ${file}`)
  }
  const manifest = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'))
  assert.equal(manifest.name, 'modern-ahocorasick')
  assert.notEqual(manifest.private, true)
  assert.ok(!existsSync(path.join(installed, 'dist/internal.d.ts')), 'private builder has no package entry')
  for (const file of ['internal', 'persistence', 'stream', 'options', 'case-folding'].flatMap(name => [`dist/${name}.js`, `dist/${name}.cjs`, `dist/${name}.d.ts`])) {
    assert.ok(!existsSync(path.join(installed, file)), 'private scanner has no package entry')
  }
  for (const file of ['dist/index.d.ts', 'dist/index.d.cts', 'dist/text.d.ts', 'dist/text.d.cts']) {
    assert.doesNotMatch(readFileSync(path.join(installed, file), 'utf8'), /asciiPrefix|graphemeRuns|AsciiCursor|buildAutomaton/)
  }
  assert.ok(!existsSync(path.join(installed, 'src')), 'source is not part of the published package')
  assert.doesNotMatch(readFileSync(path.join(installed, 'dist/index.js'), 'utf8'), /0041:0061|function caseFold/)
  const checks = `
const normalized = new TextMatcher(['STRASSE', 'é'], { caseFold: true, normalization: 'NFC' })
assert.equal(normalized.replace('Straße e\\u0301', 'X'), 'X X')
assert.deepEqual(normalized.countByPattern('Straße e\\u0301'), [1, 1])
const ac = new AhoCorasick(['he', 'she', 'hers'])
assert.deepEqual(ac.search('ushers'), [
  { pattern: 'she', patternIndex: 1, start: 1, end: 4, data: undefined },
  { pattern: 'he', patternIndex: 0, start: 2, end: 4, data: undefined },
  { pattern: 'hers', patternIndex: 2, start: 2, end: 6, data: undefined },
])
assert.deepEqual([...ac.iterate('ushers')], ac.search('ushers'))
assert.equal(ac.count('ushers'), 3)
assert.deepEqual(ac.countByPattern('ushers'), [1, 1, 1])
assert.equal(ac.count('ushers', { wholeWord: true, locale: 'en' }), 0)
assert.deepEqual(AhoCorasick.deserialize(ac.serialize()).search('ushers'), ac.search('ushers'))
const stream = ac.createStream({ strategy: 'leftmost-longest' })
assert.deepEqual([...stream.write('ush'), ...stream.write('ers'), ...stream.finish()], ac.search('ushers', { strategy: 'leftmost-longest' }))
for (const strategy of ['all', 'leftmost-first', 'leftmost-longest']) {
  assert.deepEqual([...ac.iterate('ushers', { strategy })], ac.search('ushers', { strategy }))
}
assert.equal(ac.replace('ushers', 'X'), 'uXrs')
assert.equal(new AhoCorasick([{ pattern: 'cat', data: '猫' }]).replace('😀cat', match => match.data), '😀猫')
assert.equal(ac.match('xyz'), false)
assert.equal(ac.match('she'), true)
assert.deepEqual(new AhoCorasick(['👨‍👩‍👧‍👦']).search('😁👨‍👩‍👧‍👦😀'), [{ pattern: '👨‍👩‍👧‍👦', patternIndex: 0, start: 2, end: 13, data: undefined }])
assert.equal(new AhoCorasick(['e']).count('abc e\\u0301'), 0)
assert.deepEqual(new AhoCorasick(['\\r', '\\n', '\\r\\n']).search('a\\r\\nb').map(({ pattern, start, end }) => [pattern, start, end]), [['\\r\\n', 1, 3]])
`
  writeFileSync(path.join(temporary, 'consumer.mjs'), `import assert from 'node:assert/strict'
import AhoCorasick from 'modern-ahocorasick'
import TextMatcher from 'modern-ahocorasick/text'
${checks}`)
  writeFileSync(path.join(temporary, 'consumer.cjs'), `const assert = require('node:assert/strict')
const AhoCorasick = require('modern-ahocorasick')
const TextMatcher = require('modern-ahocorasick/text')
assert.equal(typeof TextMatcher, 'function')
assert.equal(typeof AhoCorasick, 'function')
${checks}`)
  run(process.execPath, ['consumer.mjs'])
  run(process.execPath, ['consumer.cjs'])
  const types = `
const adapter = new TextMatcher([{ pattern: 'é', data: 1 }], { normalization: 'NFC', caseFold: true })
const mapped: Match<number>[] = adapter.search('é')
void mapped
const restored = AhoCorasick.deserialize('serialized', { decodeData: value => Number(value) })
const stream: MatchStream<number> = restored.createStream()
void stream
const boundaries: BoundaryOptions = { wholeWord: true, locale: 'en' }
void boundaries
const ac = new AhoCorasick([{ pattern: 'he', data: { id: 1 } }])
const typed: AhoCorasick<{ id: number }> = ac
const results: Match<{ id: number }>[] = typed.search('he')
const iterator: IterableIterator<Match<{ id: number }>> = ac.iterate('he')
const count: number = ac.count('he')
const frequencies: number[] = ac.countByPattern('he')
void frequencies
const selected: IterableIterator<Match<{ id: number }>> = ac.iterate('he', { strategy: 'leftmost-longest' })
void count
void selected
const replaced: string = ac.replace('he', (match, text) => String(match.data?.id) + text)
void iterator
void replaced
const found: boolean = ac.match('he')
void results
void found
`
  writeFileSync(path.join(temporary, 'consumer.mts'), `import AhoCorasick from 'modern-ahocorasick'
import TextMatcher from 'modern-ahocorasick/text'
import type { BoundaryOptions, Match, MatchStream } from 'modern-ahocorasick'
${types}`)
  writeFileSync(path.join(temporary, 'consumer.cts'), `import AhoCorasick = require('modern-ahocorasick')
import TextMatcher = require('modern-ahocorasick/text')
import type { BoundaryOptions, Match, MatchStream } from 'modern-ahocorasick'
${types}`)
  writeFileSync(path.join(temporary, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', strict: true, noEmit: true, types: [], skipLibCheck: false },
    files: ['consumer.mts', 'consumer.cts'],
  }))
  run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(temporary, 'tsconfig.json')])
  console.log('Packed ESM, CommonJS, declarations and package contents passed.')
}
finally {
  rmSync(temporary, { recursive: true, force: true })
}
