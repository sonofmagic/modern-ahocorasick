---
title: "Sessions, iterables and previews"
description: "Use /stream to match, tokenize or replace decoded string chunks (v3.2.0+)."
---

# Sessions, iterables and previews

Use /stream to match, tokenize or replace decoded string chunks (v3.2.0+).

## Process chunks

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

## Lifecycle and selection

- Sessions: `createMatchStream(matcher, options?)`, `createTokenStream(matcher, options?)`,
  `createReplaceStream(matcher, replacement, options?)`. Each exposes `write(string)`,
  `end()` and `destroy()`. Calls return arrays; output from one caller chunk can be large.
- Iterables: `iterateChunks`, `tokenizeChunks`, `replaceChunks`; synchronous sources are `Iterable<string>`. Argument order is
  `(matcher, source, options?)`, or `(matcher, source, replacement, options?)`.
- Match streams default to `all`; token/replacement streams default to `leftmost-longest`
  and also accept `leftmost-first`. Offsets are absolute UTF-16 input offsets.
- Adjacent text tokens and output strings may be split differently between chunkings.
  Their concatenation and the final selected matches are equivalent to whole-input work.
- Repeated `end()` returns an empty array. Writing after end, or using a destroyed
  session, throws. Processing/replacement failures destroy the session.

Call `end()` at EOF to flush the pending suffix. All streaming APIs reject `longest-first` and the offline range options `start`, `end`, `anchored`. Constructor character boundaries and `wholeWord`/`locale` apply together; whole-word mode retains the unfinished line for ICU context. These adapters support the default, `/fast`, `/unicode`, and `/unicode-fast` compiled matchers, not `/text`.

## Buffer limits

`maxBufferLength` defaults to **1,048,576 UTF-16 units of undecided original text**.
Set a positive safe integer or explicitly use `Infinity`. Overflow throws `RangeError`;
the library never truncates text or matches. This is not a total memory limit: the
dictionary, caller chunk, result arrays and replacement output have their own costs.
The scanner retains selection lookahead and up to three trailing graphemes; arbitrarily
long graphemes or undecided inline-code spans can reach the limit.

## Provisional previews

`preview()` returns `{ start, text, tokens }` for the entire unconfirmed suffix.
Replace the previous preview on each call; confirmed tokens never change. Preview tokens
interpret the suffix in isolation and may change as boundaries, filters or longer matches
become known. Preview never invokes replacement callbacks; only confirmed output does.

See [Asynchronous processing and cancellation](/stream/async).
