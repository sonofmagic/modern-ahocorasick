# Examples

All snippets use the v3 API and `import AhoCorasick from 'modern-ahocorasick'`.

## Overlapping and duplicate patterns

```ts
const ac = new AhoCorasick(['a', 'aa', 'a'])
ac.search('aaa') // 8 results, including duplicates and overlaps
ac.search('aaa', { strategy: 'leftmost-longest' })
// 'aa' at [0, 2), then first 'a' at [2, 3)
```

## Metadata and replacement

```ts
const ac = new AhoCorasick([
  { pattern: 'cat', data: { translation: '猫' } },
  { pattern: 'dog', data: { translation: '狗' } },
])
ac.replace('cat and dog', hit => hit.data?.translation ?? hit.pattern)
// '猫 and 狗'
```

## Safe highlighting

Choose a non-overlapping strategy. Split the original text using the ranges, then render fragments as **text nodes** inside your framework's elements. Never interpolate untrusted text into raw HTML.

```ts
const hits = ac.search(text, { strategy: 'leftmost-longest' })
let cursor = 0
const fragments: { text: string, marked: boolean }[] = []
for (const hit of hits) {
  fragments.push({ text: text.slice(cursor, hit.start), marked: false })
  fragments.push({ text: text.slice(hit.start, hit.end), marked: true })
  cursor = hit.end
}
fragments.push({ text: text.slice(cursor), marked: false })
```

## Presence and lazy output

```ts
const ac = new AhoCorasick(['错误', '警告'])
if (ac.match('这里有警告')) {
  console.log('Review needed')
}
for (const hit of ac.iterate('错误与警告')) {
  console.log(hit)
}
```

Try the built-in overlapping, Chinese, combining-mark and emoji examples in the [visualizer](./visualization).
