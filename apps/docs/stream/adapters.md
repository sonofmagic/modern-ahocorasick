---
title: "Node and Web streams"
description: "Connect match, token or replacement processing to platform streams with backpressure."
---

# Node and Web streams

Connect match, token or replacement processing to platform streams with backpressure.

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

## Decoding and cancellation

Node adapters return a `Duplex` with demand-driven async-generator processing and
incremental UTF-8 byte decoding. Prefer consistent byte or string input; switching
from bytes to strings flushes any incomplete decoder sequence.
Web adapters return a `ReadableWritablePair`, accepted by `pipeThrough()`; they are
not `TransformStream` instances. Decode byte sources with `TextDecoderStream` first.
Both platforms support async replacement callbacks, cancellation and backpressure.

Both entries export `createMatchTransform(matcher, options?)`, `createTokenTransform(matcher, options?)`, and `createReplaceTransform(matcher, replacement, options?)`. Node match/token adapters emit objects; replacement emits text. Web adapters emit matches, tokens, or strings respectively.

See [Async cancellation contracts](/stream/async).
