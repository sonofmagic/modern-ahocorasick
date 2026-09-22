---
title: "异步处理与取消"
description: "消费异步输入或等待替换回调，同时保留输入顺序。"
---

# 异步处理与取消

消费异步输入或等待替换回调，同时保留输入顺序。

## 异步迭代

```ts
import AhoCorasick from 'modern-ahocorasick'
import { replaceChunksAsync } from 'modern-ahocorasick/stream'

const controller = new AbortController()
const matcher = new AhoCorasick(['cat'])
const parts: string[] = []
for await (const part of replaceChunksAsync(
  matcher,
  ['a ca', 't!'],
  async () => 'DOG',
  { signal: controller.signal, yieldEvery: 4096 },
)) {
  parts.push(part)
}
parts.join('') // 'a DOG!'
// controller.abort() cancels an active operation.
```

`iterateChunksAsync`、`tokenizeChunksAsync` 和 `replaceChunksAsync` 接受 `Iterable<string>` 或 `AsyncIterable<string>`。参数顺序为 `(matcher, source, options?)`；替换接口为 `(matcher, source, replacement, options?)`。

## 取消与背压

异步选项还包括 `signal: AbortSignal` 和 `yieldEvery`（正安全整数，默认 4096 个 UTF-16
单元）。扫描通过任务队列让出执行权，异步回调按顺序等待。取消传播 `signal.reason`，
关闭源迭代器并释放扫描状态；任意生产者或回调内的外部工作仍需自行配合取消。
拉取式适配器在当前输出消费前不会请求下一输入块，但单个字素产生的匹配组仍可能很大。

## 命令式异步会话

命令式异步版本 `createMatchStreamAsync`、`createTokenStreamAsync`、`createReplaceStreamAsync` 的 `write/end` 返回 Promise，`destroy()` 同步取消。必须等待当前操作完成；并发写入或结束会被拒绝，不使用无上限队列。异步替换和取消遵循迭代接口的契约。

参见 [共用的缓冲与选择规则](/zh/stream/sessions)。
