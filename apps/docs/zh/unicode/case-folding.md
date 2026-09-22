---
title: "完整 Unicode 大小写折叠"
description: "使用 /unicode 进行 Unicode 17 common/full 折叠，包括 ß → ss 这样的展开映射（v3.2.0+）。"
---

# 完整 Unicode 大小写折叠

使用 /unicode 进行 Unicode 17 common/full 折叠，包括 ß → ss 这样的展开映射（v3.2.0+）。

## 匹配折叠文本

```ts
import UnicodeAhoCorasick from 'modern-ahocorasick/unicode'

const matcher = new UnicodeAhoCorasick(['STRASSE', 'ss', 's'])
matcher.replace('😀Straße', 'X') // '😀X'
matcher.search('ß').map(match => match.pattern) // ['ss']
```

## 折叠规则

使用 Unicode 17.0 `CaseFolding.txt` 的 common/full 映射，随包附带 Unicode License v3。
不做归一化或土耳其语定制，因此 `é` 与 `e\u0301` 仍不同；`Σ`、`σ`、`ς` 折叠后相同，
`İ` 折叠为 `i\u0307`。匹配必须覆盖完整原文字素：`ss` 可以匹配 `ß`，`s` 不能只匹配
展开后的半个字符。词条和元数据保持原样，范围及替换回调文本来自未修改的输入。
折叠数据版本固定，字素分割仍跟随宿主 ICU。

## 选择入口

`/unicode` 支持整段查询和 `/stream` 适配器；`/unicode-fast` 使用可选的双数组后端。两者均不做归一化或土耳其语定制。需要这些转换时使用 `/text`；它接受完整字符串，不提供流式或持久化接口。

参见 [增量会话](/zh/stream/sessions)。
