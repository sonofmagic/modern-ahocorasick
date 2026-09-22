---
title: "构造函数与元数据"
description: "将字符串或携带业务数据的词条编译为可复用的词典。"
---

# 构造函数与元数据

将字符串或携带业务数据的词条编译为可复用的词典。

## 创建匹配器

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick([
  'cat',
  { pattern: 'dog', data: { id: 7 } },
], { boundary: 'none' })
matcher.search('dog')[0]?.data // { id: 7 }
```

字符串与元数据对象可以混用。`patternIndex` 对应输入数组下标，因此可区分重复关键词。构造时保存关键词内容，元数据保留引用。修改输入或返回的匹配对象，不会改变自动机的匹配状态。

空列表 `[]` 合法且不会命中。空关键词 `''` 抛出含输入下标的 `RangeError`。非法运行时参数抛出 `TypeError`。

## 选项与类型

签名为 `new AhoCorasick<T>(patterns: readonly PatternInput<T>[], options?: MatcherOptions)`。可选的 `boundary` 规则默认为 `none`。

```ts
import type { Match, PatternInput } from 'modern-ahocorasick'
import AhoCorasick from 'modern-ahocorasick'

const patterns: PatternInput<{ id: number }>[] = [{ pattern: 'cat', data: { id: 1 } }]
const matches: Match<{ id: number }>[] = new AhoCorasick(patterns).search('cat')
```

参见 [边界规则](/zh/api/options)。

## 状态归属

goto 表、failure 链接、output 链接与构建方法属于实现细节。v3 没有公开的 `gotoFn`、`failure`、`output` 或 `trace()`。可视化通过仓库内部集成工作，不构成消费者 API。

参见 [动态词典](/zh/extensions/dynamic)。
