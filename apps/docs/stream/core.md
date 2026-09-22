---
title: "Core createStream"
description: "Use matcher.createStream() for incremental matching with the v3.1 lifecycle."
---

# Core createStream

Use matcher.createStream() for incremental matching with the v3.1 lifecycle.

## Create and consume

Creates an independent `MatchStream<T>` with `write(chunk): Match<T>[]`,
`finish(): Match<T>[]` and `cancel(): void`. Options include the three search
strategies, `wholeWord`, `locale` and `maxBufferedUnits` (default 1,048,576).
Concatenating every returned array yields the same ordered matches as searching
the concatenated chunks. Offsets are absolute original UTF-16 offsets. Feed decoded
strings; byte decoding is the caller's responsibility.

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

## Chunk boundaries and EOF

A write may return no matches while a trailing grapheme or selected match remains
unsettled. Surrogate pairs, CRLF, combining sequences, regional indicators and ZWJ
emoji may cross chunk boundaries. Non-overlapping strategies also keep a candidate
window bounded by the longest pattern. Whole-word mode settles complete lines
(LF, CR, U+2028 or U+2029) so ICU has complete word context, retaining the unfinished
line; phrases can still match across lines. Always call `finish()` at EOF to flush
the final tail and candidates.

## Buffer limit and lifecycle

The unsettled tail is segmented again on each write; tiny chunks with a long
unfinished grapheme or line require more work. An unsettled grapheme or line can
be arbitrarily long. Exceeding the configured
positive safe-integer UTF-16 buffer limit cancels the stream and throws `RangeError`;
no silent truncation occurs. The limit applies to the unsettled tail, not chunk
size, returned match arrays or the dictionary. Empty writes are allowed. Invalid
chunks throw `TypeError` without consuming input. `cancel()` is idempotent; writes
or finishes after cancellation/finish throw `Error`. Offset overflow also cancels
with `RangeError`. A cancelled or finished stream cannot be reused.

Supported strategies are `all`, `leftmost-first` and `leftmost-longest`. Streams reject `longest-first` and offline `start`, `end`, `anchored` options, including `anchored: false`. For tokenization, replacement, async work and platform streams, use [the /stream entry](/stream/sessions).
