import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInThisContext } from 'node:vm'
import ts from 'typescript'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const examples = [
  { path: 'examples', block: 0, check: 'expect(ac.count(\'aaa\')).toBe(8); expect(ac.search(\'aaa\', { strategy: \'leftmost-longest\' }).map(hit => [hit.pattern, hit.start, hit.end])).toEqual([[\'aa\', 0, 2], [\'a\', 2, 3]])' },
  { path: 'api/search', block: 1, check: 'expect(matcher.search(text).map(hit => [hit.pattern, hit.start, hit.end])).toEqual([[\'she\', 1, 4], [\'he\', 2, 4], [\'hers\', 2, 6]])' },
  { path: 'api/options', block: 2, check: 'expect(matcher.search(\'!abc!\', { start: 2, end: 4, anchored: true }).map(hit => [hit.pattern, hit.start, hit.end])).toEqual([[\'bc\', 2, 4]]); expect(matcher.replace(\'!abc!\', \'X\', { start: 2, end: 4 })).toBe(\'!aX!\')' },
  { path: 'unicode', block: 0, check: 'expect(ac.search(text).map(hit => [hit.start, hit.end])).toEqual([[2, 4], [4, 15]])' },
  { path: 'unicode/normalization', block: 0, check: 'expect(matcher.search(text).map(hit => text.slice(hit.start, hit.end))).toEqual([\'Straße\', \'e\u0301\']); expect(matcher.replace(text, \'X\')).toBe(\'X X\')' },
  { path: 'unicode/case-folding', block: 0, check: 'expect(matcher.search(\'ß\').map(hit => hit.pattern)).toEqual([\'ss\']); expect(matcher.replace(\'😀Straße\', \'X\')).toBe(\'😀X\')' },
  { path: 'stream/core', block: 0, check: 'expect(matches.map(hit => [hit.pattern, hit.start, hit.end])).toEqual([[\'hello\', 0, 5], [\'👩‍😀\', 6, 11]])' },
  { path: 'stream/sessions', block: 0, check: 'expect(replaced).toBe(\'a DOG!\'); expect(original).toBe(\'a cat!\'); expect(session.end()).toEqual([])' },
  { path: 'stream/async', block: 0, check: 'expect(parts.join(\'\')).toBe(\'a DOG!\')' },
  { path: 'stream/filters', block: 0, check: 'expect(result).toBe(\'DOG `cat` https://example.com/cat\')' },
  { path: 'stream/adapters', block: 1, check: 'expect(output).toBe(\'a DOG!\')' },
  { path: 'extensions/replacement-helpers', block: 0, check: 'expect(matcher.replace(\'cat dog\', mask())).toBe(\'*** ***\'); expect(matcher.replace(\'cat dog\', fromMap({ cat: \'猫\' }))).toBe(\'猫 dog\'); expect(matcher.replace(\'cat cat\', first)).toBe(\'X cat\')' },
  { path: 'examples/replacement', block: 0, check: 'expect(ac.replace(\'cat and dog\', hit => hit.data?.translation ?? hit.pattern)).toBe(\'猫 and 狗\')' },
]

for (const prefix of ['', 'zh/']) {
  for (const example of examples) {
    it(`documented example: ${prefix}${example.path} #${example.block}`, async () => {
      const markdown = readFileSync(new URL(`../${prefix}${example.path}.md`, import.meta.url), 'utf8')
      const blocks = [...markdown.matchAll(/```ts\n([\s\S]*?)\n```/g)]
      expect(blocks[example.block], 'The documented code block must exist').toBeDefined()
      const source = `${blocks[example.block][1]}\n${example.check}`
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      })
      // Execute repository-authored documentation against the built public API entrypoints.
      const execute = runInThisContext(`(async (require, expect, exports) => { ${outputText}\n})`) as (
        require: NodeJS.Require,
        assert: typeof expect,
        exports: object,
      ) => Promise<void>
      await execute(require, expect, {})
    })
  }
}
