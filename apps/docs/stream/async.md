---
title: "Async processing and cancellation"
description: "Consume async sources or await replacement callbacks while preserving input order."
---

# Async processing and cancellation

Consume async sources or await replacement callbacks while preserving input order.

## Async iterables

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

`iterateChunksAsync`, `tokenizeChunksAsync`, and `replaceChunksAsync` accept `Iterable<string>` or `AsyncIterable<string>`. Argument order is `(matcher, source, options?)`, or `(matcher, source, replacement, options?)` for replacement.

## Cancellation and backpressure

Async options additionally accept `signal: AbortSignal` and `yieldEvery` (positive safe
integer, default 4096 UTF-16 units). Processing yields through the task queue. Callback
promises are awaited sequentially. Abort propagates `signal.reason`, closes the source
iterator and releases scan state; arbitrary producer/callback code must also cooperate
to cancel its own external work. Pull adapters do not request another source chunk
until current output is consumed. A group of matches at one grapheme can still be large.

## Imperative async sessions

Imperative async counterparts `createMatchStreamAsync`, `createTokenStreamAsync` and `createReplaceStreamAsync` return `write/end` promises plus synchronous `destroy()`. Await each operation; concurrent writes/ending are rejected rather than queued without a bound. Async replacements and cancellation follow the iterable contract.

See [Shared buffering and selection rules](/stream/sessions).
