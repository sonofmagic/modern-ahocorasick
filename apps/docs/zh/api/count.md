---
title: "存在性与计数"
description: "按需要返回布尔值、总次数或每个词条的次数，无需保存完整结果数组。"
---

# 存在性与计数

按需要返回布尔值、总次数或每个词条的次数，无需保存完整结果数组。

## match(text, options?)

返回布尔值，首次命中即停止，不创建匹配对象。只需判断是否命中时使用。

## count(text, options?)

返回全部出现次数，包含重叠与重复词条，等于 `search(text).length`。直接累加状态的命中总数，不创建匹配对象，也不遍历 output 链。空文本或空词典返回 `0`。非法文本抛出 `TypeError`；计数超过 `Number.MAX_SAFE_INTEGER` 时抛出 `RangeError`。不接受策略选项。

```ts
import AhoCorasick from 'modern-ahocorasick'

new AhoCorasick(['a', 'aa', 'a']).count('aaa') // 8
```

## countByPattern(text, options?)

返回新的 `number[]`，顺序与输入词条一致。次数包含重叠匹配，未命中的词条为零，
重复词条各自保留一个位置。例如
`new AhoCorasick(['a', 'aa', 'a', 'b']).countByPattern('aaa')`
返回 `[3, 2, 3, 0]`。空字典返回 `[]`，非法文本抛出 `TypeError`。

扫描器通过 failure 链汇总状态访问次数，不枚举每次命中。不计分段成本，时间为
O(g log(d + 1) + s + p)，临时空间为 O(s + p)，其中 g 为文本字素数、s 为状态数、p 为词条数、d 为最大转移分支数。
只需要总数时使用 `count()`，可以避免分配与状态数成正比的临时数组。

## 带过滤的查询

这三个方法接受 `QueryOptions`：`wholeWord`、`locale`、`start`、`end` 和 `anchored`，均不接受选择策略。通过过滤的重叠命中和重复词条都会计数。上述汇总扫描的开销适用于默认精确匹配；整词、构造器边界过滤及转换匹配器可能枚举命中并分配额外状态。

参见 [查询选项](/zh/api/options)。
