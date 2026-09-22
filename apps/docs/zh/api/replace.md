---
title: "替换与分词"
description: "替换选中的范围，或将原文拆为普通文本与命中 token。"
---

# 替换与分词

替换选中的范围，或将原文拆为普通文本与命中 token。

## replace(text, replacement, options?)

在原文范围上执行一次非重叠替换。默认 `leftmost-longest`，也接受 `leftmost-first` 和 `longest-first`，不接受 `all`。回调收到 `(match, originalSubstring)`，必须返回字符串。字符串替换按字面值处理，`$&` 没有特殊含义，不重新扫描替换内容。选中匹配逐步消费，但输出文本和中间字符串片段仍占用内存。

```ts
import AhoCorasick from 'modern-ahocorasick'

new AhoCorasick(['cat']).replace('cat cat', '$&') // '$& $&'
```

## tokenize(text, options?)

`tokenize(text, options?)` 默认使用 `leftmost-longest`，拒绝 `all`。返回 `Token<T>[]`：
普通文本为 `{ type: 'text', text, start, end }`，匹配文本为
`{ type: 'match', text, start, end, match }`。不生成空文本 token；拼接所有 `token.text`
可还原输入。库不会生成 HTML。

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['cat'])
const tokens = matcher.tokenize('a cat!')
tokens.map(token => [token.type, token.text])
// [['text', 'a '], ['match', 'cat'], ['text', '!']]
tokens.map(token => token.text).join('') // 'a cat!'
```

## 选择与输出

两种方法均接受三种非重叠策略。`longest-first` 缓存候选；leftmost 策略通过有限前瞻确定候选。输出字符串和 token 数组仍占用内存。查询范围只过滤匹配，范围外原文仍会保留。

参见 [安全高亮](/zh/examples/highlighting)；另见 [替换工具](/zh/extensions/replacement-helpers)。
