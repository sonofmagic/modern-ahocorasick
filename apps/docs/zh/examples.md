# 使用示例

以下示例采用 v3 API，并假设已执行 `import AhoCorasick from 'modern-ahocorasick'`。

## 重叠与重复关键词

```ts
const ac = new AhoCorasick(['a', 'aa', 'a'])
ac.search('aaa') // 8 条结果，包含重复项和重叠命中
ac.search('aaa', { strategy: 'leftmost-longest' })
// 'aa' 位于 [0, 2)，随后首个 'a' 位于 [2, 3)
```

## 元数据与替换

```ts
const ac = new AhoCorasick([
  { pattern: 'cat', data: { translation: '猫' } },
  { pattern: 'dog', data: { translation: '狗' } },
])
ac.replace('cat and dog', hit => hit.data?.translation ?? hit.pattern)
// '猫 and 狗'
```

## 安全高亮

使用非重叠策略，根据范围分割原文，再通过框架将片段作为**文本节点**渲染。不要将用户输入拼接成原始 HTML。

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

## 存在性判断与惰性输出

```ts
const ac = new AhoCorasick(['错误', '警告'])
if (ac.match('这里有警告')) {
  console.log('需要检查')
}
for (const hit of ac.iterate('错误与警告')) {
  console.log(hit)
}
```

在[可视化工作台](./visualization)中尝试重叠、中文、组合字符和 emoji 示例。
