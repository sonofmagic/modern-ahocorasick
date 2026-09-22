---
title: "Version and package migration"
description: "Check result coordinates, selection semantics and stream lifecycles when moving existing code."
---

# Version and package migration

Check result coordinates, selection semantics and stream lifecycles when moving existing code.

## From v2 to v3

v2 grouped results as `[endingGraphemeIndex, keywords[]][]`. v3 returns independent `Match` objects with original UTF-16 `start` and exclusive `end`. Update tuple destructuring and use `text.slice(hit.start, hit.end)` directly. Duplicate entries remain distinct through `patternIndex`.

```ts
import AhoCorasick from 'modern-ahocorasick'

const text = '😀cat'
const hit = new AhoCorasick(['cat']).search(text)[0]!
console.log([hit.start, hit.end]) // [2, 5]
text.slice(hit.start, hit.end) // 'cat'
```

Empty patterns now throw `RangeError`; invalid runtime arguments throw `TypeError`. Internal tables and the builder are private. ESM default imports, direct CommonJS constructors and named type imports remain supported.

The detailed [v2 → v3 migration guide](https://github.com/icelib/modern-ahocorasick/blob/main/packages/modern-ahocorasick/MIGRATION.md) describes the original breaking changes.

## From v3.1 to v3.2

The existing `matcher.createStream({ maxBufferedUnits, wholeWord, locale })` keeps its `write/finish/cancel` lifecycle; repeated `finish()` still throws. The new `/stream` APIs use `write/end/destroy` and `maxBufferLength`. They additionally accept `wholeWord` and `locale`; whole-word streams retain the last undecided line to preserve ICU word context, subject to the buffer limit. Constructor character boundaries and per-query whole-word boundaries are intersected.

`/text` retains normalization and Turkic folding; it is a whole-text adapter. Use `/unicode` for default full-folding streams. `serialize()` remains available on the exact matcher and `/fast` (serialized as the compatible compact format). Constructor boundary rules and folding profiles cannot be serialized; attempting this throws rather than silently losing options.

See [Core streams](/stream/core); see [New sessions](/stream/sessions).

## From reference packages

| Reference capability                         | Public API here                                          | Contract to check                                                |
| -------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| Monyone detection, matching and replacement  | `match`, `search`, `replace`                             | Original UTF-16 ranges; literal replacements                     |
| Monyone dynamic edits and chunked processing | `/dynamic`, `/stream`, platform adapters                 | Compile edits explicitly; old snapshots remain valid             |
| Monyone tokenization, skipping and previews  | `tokenize`, `/stream/filters`, token session `preview()` | Limited syntax and replaceable provisional suffix                |
| Monyone fast backend                         | `/fast`                                                  | Explicit opt-in; measure your dictionary                         |
| Tanishiking `caseInsensitive`                | `/unicode`                                               | Full Unicode folding, including expansions                       |
| Tanishiking `onlyWholeWords`                 | Constructor `boundary: 'ascii'`                          | Character rule; `wholeWord` instead uses ICU word segmentation   |
| Tanishiking `allowOverlaps: false`           | `strategy: 'longest-first'`                              | Original grapheme length priority, then start/index tie-breaking |

For example, migrate a case-insensitive, non-overlapping dictionary like this:

```ts
import UnicodeAhoCorasick from 'modern-ahocorasick/unicode'

const matcher = new UnicodeAhoCorasick(['STRASSE', 'ss'], { boundary: 'ascii' })
const matches = matcher.search('Straße ss', { strategy: 'longest-first' })
// [{ pattern: 'STRASSE', start: 0, end: 6, patternIndex: 0, data: undefined },
//  { pattern: 'ss', start: 7, end: 9, patternIndex: 1, data: undefined }]
```

Use `text.slice(match.start, match.end)` directly: unlike Tanishiking's inclusive
`end`, this package's `end` is exclusive. `pattern` replaces `keyword` in results;
duplicate input entries retain independent `patternIndex` values and metadata.
This is a migration of intent, not a third-party API compatibility layer.
