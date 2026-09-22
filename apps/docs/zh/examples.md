---
title: "实战示例"
description: "按所需结果选择示例：范围、次数、高亮或替换文本。"
---

# 实战示例

按所需结果选择示例：范围、次数、高亮或替换文本。

## 重叠与重复关键词

```ts
import AhoCorasick from 'modern-ahocorasick'

const ac = new AhoCorasick(['a', 'aa', 'a'])
ac.search('aaa') // 8 条结果，包含重复项和重叠命中
ac.search('aaa', { strategy: 'leftmost-longest' })
// 'aa' 位于 [0, 2)，随后首个 'a' 位于 [2, 3)
```

## 元数据与替换

[用元数据替换词条 →](/zh/examples/replacement)

## 安全高亮

[安全渲染文本节点 →](/zh/examples/highlighting)

## 存在性判断与惰性输出

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['cat', 'dog'])
matcher.match('a cat') // true
matcher.countByPattern('cat cat dog') // [2, 1]
for (const hit of matcher.iterate('cat dog')) {
  console.log(hit.pattern)
  if (hit.pattern === 'cat') {
    break
  }
}
```

参见 [处理文件与浏览器流](/zh/stream/adapters)。
