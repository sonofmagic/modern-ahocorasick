---
title: "Normalization and TextMatcher"
description: "Opt into normalization or Turkic folding for complete strings with the /text entry (v3.1.0+)."
---

# Normalization and TextMatcher

Opt into normalization or Turkic folding for complete strings with the /text entry (v3.1.0+).

## Configure transformations

Import `TextMatcher` from `modern-ahocorasick/text`. The default entry never loads
its Unicode table. `TextMatcher<T>` accepts the same pattern inputs plus
`{ normalization?: 'NFC' | 'NFD' | 'NFKC' | 'NFKD', caseFold?: boolean | 'turkic' }`.
Both transformations are off by default. `caseFold: true` uses full, locale-independent
Unicode 17 folding; `'turkic'` applies the Unicode dotted/dotless I overrides.
Normalization uses the runtime's Unicode implementation.

```ts
import TextMatcher from 'modern-ahocorasick/text'

const matcher = new TextMatcher(['STRASSE', 'é'], {
  caseFold: true,
  normalization: 'NFC',
})
const text = 'Straße e\u0301'
matcher.search(text).map(hit => text.slice(hit.start, hit.end))
// ['Straße', 'e\u0301']
matcher.replace(text, 'X') // 'X X'
```

## Original ranges

Patterns and text are transformed one original grapheme at a time: normalize,
fold, then normalize again if requested. Results retain the original input
`pattern`, `patternIndex` and metadata; ranges and replacement callback text refer
to the original input. Only matches spanning complete original graphemes are
accepted. Thus `ss` matches `ß` under folding, but `s` does not match half of it;
`fi` matches `ﬁ` under NFKC, but `f` does not. Apply word boundaries on original
text before selection. `all` orders by end, earlier start, then input order;
selected strategies use original ranges and the existing tie rules.

## Streaming, persistence and cost

The adapter provides `search`, `iterate`, `match`, `count`, `countByPattern`, `replace` and `tokenize`, with the same query options and argument validation. It processes a
complete string and builds an offset map before scanning; selected iteration
materializes and sorts valid candidates. `createStream()` applies the same
per-grapheme transformation to chunks, segments the combined transformed text,
and maps matches back to original UTF-16 ranges. Partial transformation expansions
are rejected before selecting non-overlapping results. `createTokenStream()` and
`createReplaceStream()` use the same incremental stream core. Stable results are
emitted before EOF: consume every `write()` result as well as `finish()` (matching)
or `end()` (tokens and replacement).

```ts
const stream = matcher.createReplaceStream('X')
const output = [
  ...stream.write('Stra'),
  ...stream.write('ße!'),
  ...stream.end(),
].join('') // 'X!'
```

Streams discard committed source and obsolete offset mappings. The maximum
undecided original-text tail is `maxBufferLength ?? maxBufferedUnits ?? 1_048_576`
UTF-16 units; `Infinity` explicitly disables this limit. It includes unfinished
graphemes, transformation tails, pending selections, word context and protected
syntax. A large input chunk is processed incrementally and is not itself a tail
overflow. This is a tail limit, not a cap on total process memory or returned
results. Exceeding it throws `RangeError` and closes the stream. Whole-word
matching may wait for a newline or EOF to settle its original word context.

Filters classify original text before transformation. Token `preview()` describes
the undecided original suffix using absolute offsets, without advancing the live
scanner; its tokens remain provisional. Cancelling, finishing or failing releases
the stream's retained scanning state. Keep separate streams for interleaved input.

`serialize()` and `TextMatcher.deserialize()` persist the
transformation profile, original patterns and compiled transformed dictionary.
These optional conversions carry extra memory and scanning costs and do not
perform fuzzy matching, transliteration or locale-specific collation.

See [Folding with stream support](/unicode/case-folding).
