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
  for (const file of ['README.md', 'LICENSE', 'dist/index.js', 'dist/index.cjs', 'dist/index.d.ts', 'dist/index.d.cts']) {
    assert.ok(existsSync(path.join(installed, file)), `Missing packed file: ${file}`)
  }
  const manifest = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'))
  assert.equal(manifest.name, 'modern-ahocorasick')
  assert.notEqual(manifest.private, true)
  assert.ok(!existsSync(path.join(installed, 'src')), 'source is not part of the published package')
  const checks = `
const ac = new AhoCorasick(['he', 'she', 'hers'])
assert.deepEqual(ac.search('ushers'), [[3, ['she', 'he']], [5, ['hers']]])
assert.equal(ac.match('xyz'), false)
assert.equal(ac.match('she'), true)
assert.deepEqual(new AhoCorasick(['👨‍👩‍👧‍👦']).search('😁👨‍👩‍👧‍👦😀'), [[1, ['👨‍👩‍👧‍👦']]])
`
  writeFileSync(path.join(temporary, 'consumer.mjs'), `import assert from 'node:assert/strict'
import AhoCorasick from 'modern-ahocorasick'
${checks}`)
  writeFileSync(path.join(temporary, 'consumer.cjs'), `const assert = require('node:assert/strict')
const AhoCorasick = require('modern-ahocorasick')
assert.equal(typeof AhoCorasick, 'function')
${checks}`)
  run(process.execPath, ['consumer.mjs'])
  run(process.execPath, ['consumer.cjs'])
  const types = `
const ac = new AhoCorasick(['he'])
const results: [number, string[]][] = ac.search('he')
const found: boolean = ac.match('he')
void results
void found
`
  writeFileSync(path.join(temporary, 'consumer.mts'), `import AhoCorasick from 'modern-ahocorasick'
${types}`)
  writeFileSync(path.join(temporary, 'consumer.cts'), `import AhoCorasick = require('modern-ahocorasick')
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
