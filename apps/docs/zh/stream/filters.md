---
title: "受保护文本过滤"
description: "替换周围文本时，原样保留受支持的 URL 和 Markdown 语法。"
---

# 受保护文本过滤

替换周围文本时，原样保留受支持的 URL 和 Markdown 语法。

## 使用过滤器

```ts
import AhoCorasick from 'modern-ahocorasick'
import { replaceChunks } from 'modern-ahocorasick/stream'
import { protectedText } from 'modern-ahocorasick/stream/filters'

const matcher = new AhoCorasick(['cat'])
const result = [...replaceChunks(
  matcher,
  ['cat `cat` https://example.com/cat'],
  'DOG',
  { filter: protectedText({ urls: true, markdown: true }) },
)].join('')
// 'DOG `cat` https://example.com/cat'
```

## 识别的语法

`urls()` 从 HTTP/HTTPS 协议头（忽略大小写）保护到空白或 EOF。
`markdown({ heading?, code? })` 两项默认均启用：识别行首 1–6 个井号的 ATX 标题、
起止反引号数量相同的行内代码，以及行首至少三个反引号或波浪线的围栏代码。
关闭围栏必须使用相同字符、长度不少于开始围栏，并仅允许尾随空格或制表符。
缩进围栏、转义、链接及其他 CommonMark 规则不在该语法子集内。
未闭合行内代码在 EOF 恢复普通文本，未闭合围栏继续保护到 EOF。
`protectedText({ urls: true, markdown: true })` 可组合两种规则。
受保护文本原样输出，匹配不能跨越；语法边缘若落在字素内部，则保护整个字素。

## 缓冲与结束

未完成的语法片段可能将待定文本保留到 EOF，并触及 `maxBufferLength`。务必结束会话或消费完整迭代器。过滤器只实现这里列出的语法子集，并非完整 Markdown 解析器。

参见 [会话缓冲上限](/zh/stream/sessions)。
