---
title: "动态词典"
description: "批量编辑词典，再编译用于查询的不可变快照（v3.2.0+）。"
---

# 动态词典

批量编辑词典，再编译用于查询的不可变快照（v3.2.0+）。

## 编辑与编译

```ts
import DynamicDictionary from 'modern-ahocorasick/dynamic'

const dictionary = new DynamicDictionary(['cat'])
const old = dictionary.compile()
const dogID = dictionary.add('dog')
const current = dictionary.compile()
old.matcher.match('dog') // false
current.matcher.match('dog') // true
dictionary.delete(dogID)
```

## 稳定 ID 与快照

`add` 返回稳定的非负 ID，重复字符串具有不同 ID；`delete(id)` 返回是否删除了条目。
`clear()` 不复用 ID。有效编辑发生前，`compile()` 复用同一个 `{ matcher, ids }` 快照。
冻结的 `ids` 数组将快照内连续的 `patternIndex` 映射回稳定 ID。元数据引用仍由调用方持有。
已有迭代器和流继续使用旧快照。

## 选择编译器

第三个构造参数可传入 `(patterns, options) => new UnicodeAhoCorasick(patterns, options)`
选择其他内置匹配器。编译是显式同步操作，不承诺在线索引更新为常数时间。
