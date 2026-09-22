---
title: "元数据驱动替换"
description: "将业务数据与词条放在一起，在替换选中匹配时使用。"
---

# 元数据驱动替换

将业务数据与词条放在一起，在替换选中匹配时使用。

## 替换词典内容

```ts
import AhoCorasick from 'modern-ahocorasick'

const ac = new AhoCorasick([
  { pattern: 'cat', data: { translation: '猫' } },
  { pattern: 'dog', data: { translation: '狗' } },
])
ac.replace('cat and dog', hit => hit.data?.translation ?? hit.pattern)
// '猫 and 狗'
```

## 原文与字面字符串

回调收到 `(match, originalSubstring)`。在折叠或归一化后仍需原始拼写时，使用第二个参数。替换字符串按字面处理，`$&` 不会展开，也不会再次搜索插入内容。

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['cat'])
matcher.replace('cat cat', '$&') // '$& $&'
matcher.replace('cat', 'cat cat') // 'cat cat'
```

## 重复词条与选择

重复字符串保留各自的 `patternIndex` 和元数据。非重叠替换在同一范围只选择一个词条，长度相同时由输入顺序决定。元数据由调用方持有，不进行深拷贝。

参见 [可复用替换工具](/zh/extensions/replacement-helpers)。
