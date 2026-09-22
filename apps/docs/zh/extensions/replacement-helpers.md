---
title: "替换工具"
description: "在整段查询与流式操作中复用字面替换规则（v3.2.0+）。"
---

# 替换工具

在整段查询与流式操作中复用字面替换规则（v3.2.0+）。

## 掩码、映射与单次替换

```ts
import AhoCorasick from 'modern-ahocorasick'
import { fromMap, mask, once } from 'modern-ahocorasick/replace'

const matcher = new AhoCorasick(['cat', 'dog'])
matcher.replace('cat dog', mask()) // '*** ***'
matcher.replace('cat dog', fromMap({ cat: '猫' })) // '猫 dog'
const first = once('X')
matcher.replace('cat cat', first) // 'X cat'
matcher.replace('cat cat', first) // 'X cat'
```

## 工具契约

`/replace`提供 `keep()`、`remove()`、`mask(character = '*')`、`fromMap(mapOrRecord)` 和
`once(replacement)`。掩码按原文字素重复；映射表在创建时快照，以原始词条为键，未映射的匹配
保留原文。`once()` 的状态按每次库替换操作隔离，同一个工具可用于多个并发会话。
替换字符串仍按字面处理。

## 选择与安全

工具仅处理被选中的匹配，不执行替换字符串，也不生成 HTML。`keep()` 保留原始子串；`remove()` 将其替换为空字符串。

参见 [替换与分词](/zh/api/replace)。
