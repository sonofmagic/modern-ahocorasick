---
title: "Protected text filters"
description: "Keep supported URL and Markdown syntax unchanged while replacing surrounding text."
---

# Protected text filters

Keep supported URL and Markdown syntax unchanged while replacing surrounding text.

## Attach a filter

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

## Recognized syntax

`urls()` protects HTTP/HTTPS schemes (case insensitive) through whitespace or EOF.
`markdown({ heading?, code? })` defaults both flags to true. It recognizes ATX headings
at the start of a line with 1–6 hashes, inline backtick spans with equal delimiter lengths,
and line-start backtick/tilde fences of length ≥3. Closing fences use the same character,
at least the opening length, and optional trailing spaces/tabs. Indented fences,
escapes, links and other CommonMark rules are outside this syntax profile.
Unclosed inline code becomes ordinary text at EOF; unclosed fenced code stays protected.
`protectedText({ urls: true, markdown: true })` combines both rules.
Protected text passes through unchanged, and a match cannot cross it. If a syntax edge
intersects a grapheme, the entire grapheme is protected.

## Buffering and EOF

An unfinished syntax span can retain undecided text until EOF and reach `maxBufferLength`. Always finish the session or consume the iterable to completion. Filters are a documented syntax subset, not a full Markdown parser.

See [Session buffer limits](/stream/sessions).
