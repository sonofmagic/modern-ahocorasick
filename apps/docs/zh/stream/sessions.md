---
title: "增量会话、迭代与预览"
description: "通过 /stream 对已解码字符串块进行匹配、分词和替换（v3.2.0+）。"
---

# 增量会话、迭代与预览

通过 /stream 对已解码字符串块进行匹配、分词和替换（v3.2.0+）。

## 处理分块

```ts
import AhoCorasick from 'modern-ahocorasick'
import { createTokenStream, replaceChunks } from 'modern-ahocorasick/stream'

const matcher = new AhoCorasick(['cat'])
const replaced = [...replaceChunks(matcher, ['a ca', 't!'], 'DOG')].join('')
// 'a DOG!'
const session = createTokenStream(matcher)
const first = session.write('a ca')
const preview = session.preview()
const rest = [...session.write('t!'), ...session.end()]
const original = [...first, ...rest].map(token => token.text).join('')
// 'a cat!'
```

## 生命周期与选择

- 会话：`createMatchStream(matcher, options?)`、`createTokenStream(matcher, options?)`、
  `createReplaceStream(matcher, replacement, options?)`，均有 `write(string)`、`end()`、
  `destroy()`。调用返回数组，单个输入块的输出仍可能很大。
- 迭代：`iterateChunks`、`tokenizeChunks`、`replaceChunks`；同步输入为 `Iterable<string>`。参数顺序为 `(matcher, source, options?)`，
  替换接口为 `(matcher, source, replacement, options?)`。
- 匹配流默认 `all`；分词与替换流默认 `leftmost-longest`，也接受 `leftmost-first`。
  所有坐标都是完整输入的 UTF-16 偏移。
- 不同分块可能产生不同的相邻普通文本 token 或输出字符串切片；拼接结果与最终匹配
  与整段操作一致。
- 重复 `end()` 返回空数组；结束后写入或使用已销毁会话会抛错。处理或替换失败会销毁会话。

输入结束时调用 `end()` 输出待定后缀。所有流式 API 都拒绝 `longest-first` 与离线范围选项 `start`、`end`、`anchored`。构造器字符边界与 `wholeWord`/`locale` 同时生效；整词模式保留未完成行以提供 ICU 上下文。这些适配器支持默认、`/fast`、`/unicode` 和 `/unicode-fast` 编译匹配器，不支持 `/text`。

## 缓冲上限

`maxBufferLength` 默认限制 **1,048,576 个尚未确认的原文 UTF-16 单元**。
可设为正安全整数，或显式使用 `Infinity`。超限抛出 `RangeError`，不截断文本或匹配。
这不是总内存上限：词典、调用方输入块、结果数组和替换输出另有开销。扫描器保留选择前瞻窗口
及最多三个尾部字素；任意长字素或未确认的行内代码都可能触及上限。

## 暂定预览

`preview()` 返回整个未确认后缀的 `{ start, text, tokens }`。每次整体替换旧预览，
已确认 token 永不撤销。预览独立解释这个后缀，可能随边界、过滤规则或更长匹配的到达而改变。
预览不调用替换回调，只有确认后的输出才执行回调。

参见 [异步处理与取消](/zh/stream/async)。
