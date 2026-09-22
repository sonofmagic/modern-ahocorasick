---
title: "核心 createStream"
description: "使用 matcher.createStream() 按 v3.1 生命周期进行增量匹配。"
---

# 核心 createStream

使用 matcher.createStream() 按 v3.1 生命周期进行增量匹配。

## 创建与消费

创建独立的 `MatchStream<T>`，提供 `write(chunk): Match<T>[]`、
`finish(): Match<T>[]` 和 `cancel(): void`。选项包括三种匹配策略、`wholeWord`、
`locale`，以及默认值为 1,048,576 的 `maxBufferedUnits`。依次拼接每次返回的数组，
结果和顺序与搜索拼接后的完整输入一致。位置为原文的绝对 UTF-16 偏移。输入必须是
已解码字符串；字节流的解码由调用方负责。

```ts
import AhoCorasick from 'modern-ahocorasick'

const stream = new AhoCorasick(['hello', '👩‍😀']).createStream()
const matches = [
  ...stream.write('hel'),
  ...stream.write('lo 👩‍'),
  ...stream.write('😀!'),
  ...stream.finish(),
]
```

## 分块边界与结束

尾部字素或不重叠候选尚未确定时，写入可能返回空数组。代理对、CRLF、组合字符、旗帜和
ZWJ emoji 均可跨块。不重叠策略还会保留由最长关键词限制的候选窗口。完整词模式在完整
行结束处（LF、CR、U+2028、U+2029）确定词边界，并暂存未完成的一行，保证 ICU 得到完整
分词上下文；关键词仍然可以跨行匹配。输入结束时必须调用 `finish()` 输出剩余结果。

## 缓冲上限与生命周期

每次写入都会重新处理待定尾部；块很小、未完成字素或行很长时，需要更多处理时间。
单个字素或一行可能任意长。未确定尾部超过指定的正安全整数 UTF-16 缓冲上限时，会取消
流并抛出 `RangeError`，不会静默截断。限制针对待定尾部，不限制单块大小、结果数组或
词库大小。允许空字符串写入；非法块抛出 `TypeError`，且不消费输入。`cancel()` 可重复
调用；完成或取消后再写入或完成会抛出 `Error`。总位置超过安全整数也会取消并抛出
`RangeError`。完成或取消后的流不可复用。

支持 `all`、`leftmost-first` 和 `leftmost-longest`。流式接口拒绝 `longest-first` 以及离线的 `start`、`end`、`anchored` 选项，包括 `anchored: false`。需要分词、替换、异步及平台流时，使用 [/stream 入口](/zh/stream/sessions)。
