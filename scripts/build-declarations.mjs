import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)), '-p', 'tsconfig.build.json'], { stdio: 'inherit' })
// The implementation is bundled into index.js/index.cjs. Keep its declaration
// out of the tarball so the existing wildcard export gains no internal path.
for (const name of ['internal', 'persistence', 'stream', 'options', 'case-folding']) {
  rmSync(`dist/${name}.d.ts`, { force: true })
}
