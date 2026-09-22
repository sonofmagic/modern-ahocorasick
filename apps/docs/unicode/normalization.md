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

## Capabilities and cost

The adapter provides `search`, `iterate`, `match`, `count`, `countByPattern`, `replace` and `tokenize`, with the same query options and argument validation. It processes a
complete string and builds an offset map before scanning; selected iteration
materializes and sorts valid candidates. It does not expose compiled persistence
or streaming. Use the core matcher for those APIs. These optional conversions
carry extra memory and scanning costs and do not perform fuzzy matching,
transliteration or locale-specific collation.

See [Folding with stream support](/unicode/case-folding).
