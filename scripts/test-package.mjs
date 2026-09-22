import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
  for (const file of ['internal', 'persistence', 'legacy-stream', 'options', 'case-folding'].flatMap(name => [`dist/${name}.js`, `dist/${name}.cjs`, `dist/${name}.d.ts`])) {
    assert.ok(!existsSync(path.join(installed, file)), 'private scanner has no package entry')
  }
  for (const file of ['dist/index.d.ts', 'dist/index.d.cts', 'dist/text.d.ts', 'dist/text.d.cts']) {
    assert.doesNotMatch(readFileSync(path.join(installed, file), 'utf8'), /asciiPrefix|graphemeRuns|AsciiCursor|buildAutomaton/)
  }
  assert.ok(!existsSync(path.join(installed, 'src')), 'source is not part of the published package')
  assert.doesNotMatch(readFileSync(path.join(installed, 'dist/index.js'), 'utf8'), /0041:0061|function caseFold/)
  for (const name of ['runtime', 'double-array', 'legacy-stream']) {
    assert.ok(!existsSync(path.join(installed, `dist/${name}.d.ts`)), 'private declarations must not be published')
  }
  assert.ok(existsSync(path.join(installed, 'UNICODE-LICENSE.txt')))
  assert.equal(manifest.exports['./dist/_private/*'], null)
  assert.equal(manifest.dependencies, undefined, 'package remains dependency-free')
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
  const extensionChecks = `
const folded = new Unicode(['STRASSE', 'ss', 's'])
assert.equal(folded.replace('Straße', 'X'), 'X')
assert.deepEqual(folded.search('ß').map(m => m.pattern), ['ss'])
assert.deepEqual(new Fast(['cat']).search('cat'), new AhoCorasick(['cat']).search('cat'))
assert.equal(new UnicodeFast(['SS']).match('ß'), true)
const dictionary = new Dynamic(['cat'])
const snapshot = dictionary.compile()
dictionary.add('dog')
assert.equal(snapshot.matcher.match('dog'), false)
assert.equal(dictionary.compile().matcher.match('dog'), true)
assert.equal([...stream.replaceChunks(folded, ['Stra', 'ße'], 'X')].join(''), 'X')
assert.equal([...stream.replaceChunks(new AhoCorasick(['cat']), ['cat https://cat'], 'X', { filter: filters.urls() })].join(''), 'X https://cat')
assert.equal(new AhoCorasick(['cat']).replace('cat cat', replacements.once('X')), 'X cat')
assert.equal(typeof nodeStreams.createReplaceTransform, 'function')
assert.equal(typeof webStreams.createReplaceTransform, 'function')
`
  const entries = { Unicode: 'unicode', UnicodeFast: 'unicode-fast', Fast: 'fast', Dynamic: 'dynamic', stream: 'stream', filters: 'stream/filters', replacements: 'replace', nodeStreams: 'stream/node', webStreams: 'stream/web' }
  const constructors = new Set(['Unicode', 'UnicodeFast', 'Fast', 'Dynamic'])
  writeFileSync(path.join(temporary, 'extensions.mjs'), `import assert from 'node:assert/strict'\nimport AhoCorasick from 'modern-ahocorasick'\n${Object.entries(entries).map(([local, entry]) => `import ${constructors.has(local) ? local : `* as ${local}`} from 'modern-ahocorasick/${entry}'`).join('\n')}\n${extensionChecks}`)
  writeFileSync(path.join(temporary, 'extensions.cjs'), `const assert = require('node:assert/strict')\nconst AhoCorasick = require('modern-ahocorasick')\n${Object.entries(entries).map(([local, entry]) => `const ${local} = require('modern-ahocorasick/${entry}')`).join('\n')}\n${extensionChecks}\nassert.throws(() => require('modern-ahocorasick/dist/_private/anything.cjs'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })`)
  run(process.execPath, ['extensions.mjs'])
  run(process.execPath, ['extensions.cjs'])
  writeFileSync(path.join(temporary, 'default-only.cjs'), `const assert = require('node:assert/strict')\nrequire('modern-ahocorasick')\nassert.ok(Object.keys(require.cache).every(file => !/case-folding|string_decoder/.test(file)))`)
  run(process.execPath, ['default-only.cjs'])
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
  const extensionTypes = `
const matcher: Matcher = new Unicode(['SS'])
const options: MatcherOptions = { boundary: 'unicode' }
const token: Token[] = new Fast(['cat'], options).tokenize('cat')
const snapshot: DictionarySnapshot = new Dynamic(['cat']).compile()
const replaced: IterableIterator<string> = stream.replaceChunks(matcher, ['ß'], replacements.mask(), { filter: filters.markdown() })
const pair: ReadableWritablePair<string, string> = webStreams.createReplaceTransform(matcher, 'X')
void token; void snapshot; void replaced; void pair
`
  for (const format of ['mts', 'cts']) {
    const imports = Object.entries(entries).filter(([, entry]) => entry !== 'stream/node').map(([local, entry]) => format === 'cts'
      ? `import ${local} = require('modern-ahocorasick/${entry}')`
      : `import ${constructors.has(local) ? local : `* as ${local}`} from 'modern-ahocorasick/${entry}'`).join('\n')
    writeFileSync(path.join(temporary, `extensions.${format}`), `${imports}\nimport type { Matcher, MatcherOptions, Token } from 'modern-ahocorasick'\nimport type { DictionarySnapshot } from 'modern-ahocorasick/dynamic'\n${extensionTypes}`)
  }
  writeFileSync(path.join(temporary, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', strict: true, noEmit: true, types: [], skipLibCheck: false },
    files: ['consumer.mts', 'consumer.cts', 'extensions.mts', 'extensions.cts'],
  }))
  run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(temporary, 'tsconfig.json')])
  // Node declarations are checked separately so browser consumers remain free
  // of ambient Node types and built-in imports.
  symlinkSync(path.join(root, 'node_modules/@types'), path.join(temporary, 'node_modules/@types'), 'dir')
  for (const format of ['mts', 'cts']) {
    writeFileSync(path.join(temporary, `node-consumer.${format}`), `import AhoCorasick from 'modern-ahocorasick'\nimport { createReplaceTransform } from 'modern-ahocorasick/stream/node'\nimport type { Duplex } from 'node:stream'\nconst transform: Duplex = createReplaceTransform(new AhoCorasick(['cat']), async () => 'X')\nvoid transform\n`)
  }
  writeFileSync(path.join(temporary, 'tsconfig.node.json'), JSON.stringify({
    compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', strict: true, noEmit: true, types: ['node'], skipLibCheck: false },
    files: ['node-consumer.mts', 'node-consumer.cts'],
  }))
  run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(temporary, 'tsconfig.node.json')])
  console.log('Packed ESM, CommonJS, declarations and package contents passed.')
}
finally {
  rmSync(temporary, { recursive: true, force: true })
}
