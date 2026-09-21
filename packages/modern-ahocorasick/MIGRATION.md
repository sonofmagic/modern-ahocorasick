# Migrating from v2 to v3

v3 is a major API change. ESM default imports, direct CommonJS `require()` and
`match(text): boolean` remain supported. This guide describes the pending v3
release; it does not imply that 3.0.0 has already been published.

## Replace grouped tuples with match objects

v2 returned `[endingGraphemeIndex, keywords[]][]`. v3 returns one object per match:

```ts
const matcher = new AhoCorasick(['he', 'she'])
matcher.search('she')
// v2: [[2, ['she', 'he']]]
// v3:
// [
//   { pattern: 'she', patternIndex: 1, start: 0, end: 3, data: undefined },
//   { pattern: 'he', patternIndex: 0, start: 1, end: 3, data: undefined },
// ]
```

Update consumers that destructure tuples or expect keywords grouped by position.
All-match ordering is now explicit: end ascending, length descending, input index
ascending. Duplicate input patterns remain distinct via `patternIndex`.

## Use UTF-16 ranges for slicing

`start` and exclusive `end` are offsets into the original JavaScript string.
For `😀cat`, matching `cat` returns `[2, 5)`, so `text.slice(start, end)` works.
The old inclusive grapheme index cannot be substituted for either new offset.
Matching still requires whole, exactly equal grapheme clusters.

If your UI needs grapheme counts, convert ranges at the UI boundary:

```ts
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const graphemeStart = [...segmenter.segment(text.slice(0, match.start))].length
const graphemeEndExclusive = [...segmenter.segment(text.slice(0, match.end))].length
```

## Stop accessing internal tables

`gotoFn`, `output`, `failure` and `_buildTables` are no longer public or mutable.
Construct a new matcher to change the dictionary. Use `search`, `iterate`, `count` and
`match` for queries. Mutating returned results cannot modify the dictionary.

## Validate empty and invalid keywords

`new AhoCorasick([])` still works and never matches. An empty keyword now produces
a deliberate `RangeError` identifying its array index, rather than an internal
`push` exception. Invalid runtime inputs produce `TypeError`; no string coercion
is performed.

## Adopt metadata and replacement as needed

Pass `{ pattern, data }` objects to attach IDs or replacement values. `data` is
referenced, not deep-copied. Duplicate patterns can therefore represent different
application entries. Non-overlapping replacement chooses the earliest start and,
by default, the longest keyword at that start. Set `strategy: 'leftmost-first'`
when dictionary order should decide ties instead.

`iterate(text, options?)` lazily emits the same results as `search(text, options)`.
It defaults to all-match iteration and also supports both non-overlapping
strategies. It accepts complete strings, not chunks, and does not normalize or
fold case. With `all`, the first result is the first-ending match, not necessarily
the leftmost match. Selected strategies may look ahead by the longest keyword's
grapheme length before settling a result, using a bounded candidate window.

Use `count(text)` instead of `search(text).length` when only the number of
occurrences matters. It includes overlaps and duplicates without creating match
objects. Counts above `Number.MAX_SAFE_INTEGER` throw `RangeError`.

## TypeScript and CommonJS

ESM consumers can import `Match`, `PatternInput`, `MatchStrategy`, `SearchOptions`,
`ReplaceOptions` and `Replacement` with `import type`.

```ts
import type { Match } from 'modern-ahocorasick'
import AhoCorasick = require('modern-ahocorasick')

const matcher: AhoCorasick<{ id: number }> = new AhoCorasick([
  { pattern: 'cat', data: { id: 1 } },
])
const results: Match<{ id: number }>[] = matcher.search('cat')
```

The declarations use type-only resolution-mode attributes to share types between
ESM and CommonJS; TypeScript 5.3 or newer is required. JavaScript runtime support
continues to depend on ES2022 and `Intl.Segmenter`, not on the development toolchain's
Node.js version requirement.
