---
title: "Full Unicode case folding"
description: "Use /unicode for Unicode 17 common/full folding, including expansions such as ß → ss (v3.2.0+)."
---

# Full Unicode case folding

Use /unicode for Unicode 17 common/full folding, including expansions such as ß → ss (v3.2.0+).

## Match folded text

```ts
import UnicodeAhoCorasick from 'modern-ahocorasick/unicode'

const matcher = new UnicodeAhoCorasick(['STRASSE', 'ss', 's'])
matcher.replace('😀Straße', 'X') // '😀X'
matcher.search('ß').map(match => match.pattern) // ['ss']
```

## Folding contract

Folding uses Unicode 17.0 `CaseFolding.txt` common/full mappings with the bundled
Unicode License v3. It does not normalize text or apply Turkic tailoring. Thus `é`
and `e\u0301` remain distinct; `Σ`, `σ` and `ς` fold together. `İ` folds to `i\u0307`.
Matches must cover whole original graphemes: `ss` matches `ß`, but `s` does not match
half of that expansion. Patterns and metadata are preserved; ranges and replacement
callback text refer to the unmodified input. The folding table is fixed, while
grapheme segmentation still follows the host ICU version.

## Choose the right entry

`/unicode` supports whole-text queries and the `/stream` adapters. `/unicode-fast` adds the optional double-array backend. Neither normalizes text or applies Turkic tailoring. Use `/text` when those transformations are required; it accepts complete strings and has no stream or persistence API.

See [Incremental sessions](/stream/sessions).
