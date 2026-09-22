---
title: "编译统计"
description: "通过 v3.2.0 新增的 getStats() 读取缓存的标量编译统计。"
---

# 编译统计

通过 v3.2.0 新增的 getStats() 读取缓存的标量编译统计。

## 读取统计

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['he', 'she', 'he'])
const stats = matcher.getStats()
stats.patternCount // 3
stats.backend // 'compact'
Object.isFrozen(stats) // true
stats === matcher.getStats() // true
```

## 字段与存储统计

| 字段              | 含义                               |
| ----------------- | ---------------------------------- |
| `backend`         | `compact` 或 `double-array`        |
| `patternCount`    | 输入词条数，包含重复项             |
| `stateCount`      | 状态数，包含根节点，不含 DAT 空槽  |
| `transitionCount` | Trie 边数                          |
| `alphabetSize`    | 不同编译符号的数量                 |
| `maxPatternUnits` | 以下述单位计量的最长词条长度       |
| `unit`            | `grapheme` 或 `folded-codepoint`   |
| `typedArrayBytes` | 保留的扫描与辅助 TypedArray 字节数 |

折叠单位是 Unicode 折叠后的码点，因此 `ß` 在折叠配置下占两个单位。统计在编译时生成，读取不会遍历自动机。`/text` 是映射适配器，不提供 `getStats()`。

`typedArrayBytes` 包含已分配但未使用的槽位，不含字符串、Map、JS 对象、构建临时分配或原生 ICU，**不是总堆内存**。

### 持久化后的统计

紧凑后端反序列化后统计一致。`/fast` 保存为可移植的紧凑格式，因此恢复后的后端和存储统计描述的是紧凑布局。

## 测量应用内存

这些字段用于检查编译结构，不能估算整个进程的内存。应分别测量构建时间、扫描时间、保留的 JavaScript 堆和 ArrayBuffer 存储。

参见 [后端取舍与实测](/zh/extensions/performance)。
