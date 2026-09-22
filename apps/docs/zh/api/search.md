---
title: "搜索与惰性迭代"
description: "需要范围数组时使用 search()；希望逐个消费结果时使用 iterate()。"
---

# 搜索与惰性迭代

需要范围数组时使用 search()；希望逐个消费结果时使用 iterate()。

## search(text, options?)

返回独立的扁平匹配对象：

```ts
interface Match<T> {
  pattern: string
  patternIndex: number
  start: number
  end: number
  data: T | undefined
}
```

`start`、`end` 是原文的 UTF-16 偏移，采用左闭右开区间。`text.slice(start, end)` 即命中文本。

```ts
import AhoCorasick from 'modern-ahocorasick'

const text = 'ushers'
const matcher = new AhoCorasick(['he', 'she', 'hers'])
matcher.search(text).map(hit => [hit.pattern, hit.start, hit.end])
// [['she', 1, 4], ['he', 2, 4], ['hers', 2, 6]]
```

## iterate(text, options?)

`iterate(text, options?)` 返回独立的 `IterableIterator<Match<T>>`，顺序与 `search()` 相同。调用时立即校验输入并保存策略。它接受完整字符串，不接受分块输入。

```ts
import AhoCorasick from 'modern-ahocorasick'

const text = 'ushers'
const matcher = new AhoCorasick(['he', 'she', 'hers'])
for (const hit of matcher.iterate(text, { strategy: 'leftmost-longest' })) {
  console.log(text.slice(hit.start, hit.end)) // 'she'
}
```

## findFirst(text, options?) 与 findAt(text, start, options?)

findFirst() 按 iterate() 的顺序返回首个匹配，不创建结果数组。findAt() 在原始字素边界上
执行锚定查询，返回从指定位置开始的首个匹配。

```ts
matcher.findFirst('ushers')?.pattern // 'she'
matcher.findAt('ushers', 1)?.pattern // 'she'
```

## 选择策略与内存

两种方法均接受 `all`（默认）、`leftmost-first`、`leftmost-longest` 和 `longest-first`。迭代期间仍持有原文和词典。两种 leftmost 策略使用 O(L) 候选窗口，L 为最长关键词的字素数；`longest-first` 则会缓存并排序候选。`search()` 还会保存结果数组。

参见 [策略、边界与范围](/zh/api/options)；另见 [分块匹配](/zh/stream/core)。
