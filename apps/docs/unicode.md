---
title: "Graphemes and UTF-16 indices"
description: "Match complete graphemes and slice the original JavaScript string with UTF-16 ranges."
---

# Graphemes and UTF-16 indices

Match complete graphemes and slice the original JavaScript string with UTF-16 ranges.

## Graphemes are the matching unit

`Intl.Segmenter` splits text into user-perceived grapheme clusters. A family emoji such as `👨‍👩‍👧‍👦` is one grapheme but 11 UTF-16 code units. `é` (e + combining acute accent) is one grapheme but two code units. JavaScript `slice()` counts UTF-16 code units.

```ts
import AhoCorasick from 'modern-ahocorasick'

const text = '😀é👨‍👩‍👧‍👦'
const ac = new AhoCorasick(['é', '👨‍👩‍👧‍👦'])
ac.search(text)
// é: start 2, end 4; family: start 4, end 15
```

The workbench displays grapheme end indices `1` and `2` for these matches. The library returns `[2, 4)` and `[4, 15)`. Both representations describe the same hits, but only the latter can be passed directly to `slice()`.

## Exact boundaries and spelling

A pattern must match complete graphemes. `e` does not match inside `é`; an individual person emoji does not match inside a ZWJ family. Canonically equivalent spellings are not automatically equal: `é` and `é` are different inputs. The core constructor performs no normalization or case folding.

See [Opt-in normalization](/unicode/normalization); see [Full case folding](/unicode/case-folding).

## Empty inputs

`new AhoCorasick([])` is valid. All scans produce no results. `new AhoCorasick([''])` throws `RangeError`; an empty pattern is not a wildcard. The visualizer trims comma-separated keyword entries and ignores empty entries, but preserves search-text spaces and newlines exactly. Duplicate entries remain distinct.

## ASCII acceleration and runtime versions

Unicode segmentation follows the host ICU version, so newly introduced characters may behave differently across runtimes. ASCII shortcuts preserve the same exact grapheme semantics, including CRLF and combining sequences. Library conformance tests cover Node and the native segmenters in Chromium, Firefox and WebKit.

See [Performance and runtime costs](/extensions/performance).
