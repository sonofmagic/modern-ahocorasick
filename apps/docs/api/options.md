---
title: "Strategies, boundaries and ranges"
description: "Select matches after checking original-text ranges and boundaries. These options do not change the coordinate system."
---

# Strategies, boundaries and ranges

Select matches after checking original-text ranges and boundaries. These options do not change the coordinate system.

## Selection strategies

| Strategy           | Selection                                                                          |
| ------------------ | ---------------------------------------------------------------------------------- |
| `all` (default)    | Include overlaps. End ascending, then pattern length descending, then input order. |
| `leftmost-first`   | Earliest start; input order breaks ties.                                           |
| `leftmost-longest` | Earliest start; longest match wins, then input order.                              |
| `longest-first`    | Globally longest original-grapheme match first; see the offline rule below.        |

The two leftmost strategies skip candidates overlapping a selected match. Adjacent matches are allowed. They retain one best candidate per start in a window bounded by the longest keyword in graphemes, without collecting and sorting all occurrences. Search still retains its selected result array.

`longest-first` is an additional offline strategy: sort candidates by original
grapheme length descending, then start and input index ascending; accept each candidate
that overlaps no accepted match, then return results in source order.
For patterns `['ab', 'bcdef', 'f']` in `abcdef`, `leftmost-longest` selects `ab, f`,
while `longest-first` selects `bcdef`. Offline search, iteration, replacement and
tokenization support it. It buffers candidates and original grapheme positions;
it is not a bounded-lookahead iterator and is rejected by all streaming APIs.

## Constructor character boundaries

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['cat'], { boundary: 'ascii' })
matcher.replace('cat category', 'DOG') // 'DOG category'
```

The optional constructor setting `boundary` defaults to `none` and applies to every
operation, before overlap selection:

| Rule         | Accepted adjacent original graphemes                                                 |
| ------------ | ------------------------------------------------------------------------------------ |
| `none`       | Any                                                                                  |
| `ascii`      | Neither neighbour begins with ASCII A–Z, a–z or 0–9                                  |
| `ascii-edge` | Enforce the ASCII rule only on pattern edges that begin with an ASCII word character |
| `unicode`    | Neither neighbour contains a Unicode letter, number, mark or underscore              |
| `whitespace` | Both neighbours are whitespace or input boundaries                                   |
| function     | `(context: BoundaryContext) => boolean`                                              |

The callback receives `left`, `right`, `first`, `last`, `pattern` and `patternIndex`.
`left`/`right` are `undefined` at input boundaries; all text fields are original
graphemes. Callbacks must return a boolean and should be pure. Callback exceptions
propagate. These are character boundary rules, not language word segmentation.
Unicode property and grapheme behavior follows the runtime's Unicode version.

## Whole-word matching

Whole-word matching is available since v3.1.0.

All queries accept `{ wholeWord: true, locale: 'en' }`. `locale` is a BCP 47
language tag; omitting it uses the runtime's default. A match must start at the
start of an `isWordLike` segment and end at the end of an `isWordLike` segment
from `Intl.Segmenter` with `granularity: 'word'`. Phrases may span several words
and punctuation. Punctuation-only patterns do not qualify. Underscores generally
belong to a word; Chinese segmentation follows the runtime's language rules.
Specify a locale for consistent intent, but ICU versions can still differ.

```ts
import AhoCorasick from 'modern-ahocorasick'

const words = new AhoCorasick(['cat', 'cat_dog'])
words.countByPattern('concatenate cat cat_dog', { wholeWord: true, locale: 'en' })
// [1, 1]
```

Boundaries are checked **before** non-overlapping selection. Word mode segments
the complete original input up front and keeps boundary sets. Its `count()`,
`countByPattern()` and `match()` paths filter occurrences, so they do not have the
allocation/aggregation guarantees of the default exact scans. Invalid option
objects, non-boolean `wholeWord` or non-string `locale` throw `TypeError`; malformed
locale tags throw `RangeError`. `count()`, `countByPattern()` and `match()` always
consider all occurrences, with no strategy parameter.

Constructor character boundaries and per-query whole-word boundaries are intersected.

## Ranges and anchoring

Every whole-text query accepts `start`, `end` and `anchored`. Offsets are original UTF-16 positions in a half-open range; defaults are `0`, `text.length` and `false`. Coordinates must be safe integers within the input, ordered and at original grapheme boundaries, otherwise a `RangeError` is thrown. A non-boolean `anchored` throws `TypeError`. An empty range has no matches. Anchoring accepts only hits beginning exactly at `start`.

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['abc', 'bc'])
matcher.search('!abc!', { start: 2, end: 4, anchored: true })
// [{ pattern: 'bc', patternIndex: 1, start: 2, end: 4, data: undefined }]
matcher.replace('!abc!', 'X', { start: 2, end: 4 }) // '!aX!'
```

`search`, `iterate`, `match`, `count`, `countByPattern`, `replace` and `tokenize` share the contract, including `/unicode`, `/fast`, `/unicode-fast` and `/text`. Range filtering happens before overlap selection; whole-word and constructor boundary rules still inspect the complete input. Replacement and tokens retain text outside the range. Folding/normalization never changes the coordinate system. This is a semantic range filter; it does not promise work proportional only to the selected span. Streams reject these offline options (even `anchored: false`).
