---
title: "Node 与 Web 流适配"
description: "将匹配、分词或替换处理接入支持背压的平台流。"
---

# Node 与 Web 流适配

将匹配、分词或替换处理接入支持背压的平台流。

## Node pipeline

```ts
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import AhoCorasick from 'modern-ahocorasick'
import { createReplaceTransform } from 'modern-ahocorasick/stream/node'

await pipeline(
  createReadStream('input.txt'),
  createReplaceTransform(new AhoCorasick(['secret']), '[redacted]'),
  createWriteStream('output.txt'),
)
```

## Web pipeThrough

```ts
import AhoCorasick from 'modern-ahocorasick'
import { createReplaceTransform } from 'modern-ahocorasick/stream/web'

const source = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('a cat!'))
    controller.close()
  },
})
const result = source
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(createReplaceTransform(new AhoCorasick(['cat']), 'DOG'))
const output = await new Response(result.pipeThrough(new TextEncoderStream())).text()
output
// 'a DOG!'
```

## 解码与取消

Node 适配器返回 `Duplex`，通过异步生成器按消费需求处理，并增量解码 UTF-8 字节。
建议输入统一使用字节或字符串；从字节切换至字符串时，会先结算解码器里未完成的序列。
Web 适配器返回可供 `pipeThrough()` 使用的 `ReadableWritablePair`，不是
`TransformStream` 实例；字节输入先通过 `TextDecoderStream`。
两种平台均支持异步替换回调、取消和背压。

两个入口均导出 `createMatchTransform(matcher, options?)`、`createTokenTransform(matcher, options?)` 和 `createReplaceTransform(matcher, replacement, options?)`。Node 匹配与分词适配器输出对象，替换适配器输出文本；Web 适配器分别输出匹配、token 或字符串。

参见 [异步取消契约](/zh/stream/async)。
