import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
assert.match(commit, /^[a-f0-9]{40}$/)
// Stamp after the cached build so deployment always identifies the checked-out commit.
await writeFile(new URL('../apps/docs/.vitepress/dist/build-info.json', import.meta.url), `${JSON.stringify({ commit }, null, 2)}\n`)
console.log(`Documentation build: ${commit}`)
