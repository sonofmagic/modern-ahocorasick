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

## 异步编译与持久化

compileAsync({ signal? }) 会在编译前让出一次执行权，因此已取消的请求不会开始同步构建。
构建等待期间发生的编辑不会进入该快照。serialize() 保存有效词条和稳定 ID；
DynamicDictionary.deserialize() 恢复下一个 ID 的起点，并接受与核心匹配器相同的元数据编解码选项。

## 选择编译器

第三个构造参数可传入 `(patterns, options) => new UnicodeAhoCorasick(patterns, options)`
选择其他内置匹配器。编译会重建不可变快照，不承诺在线索引更新为常数时间；异步方法仍在调用线程
执行实际编译，超大词典应放入 Worker。
