# Unicode & indices

## Graphemes are the matching unit

`Intl.Segmenter` splits text into user-perceived grapheme clusters. A family emoji such as `👨‍👩‍👧‍👦` is one grapheme but 11 UTF-16 code units. `é` (e + combining acute accent) is one grapheme but two code units. JavaScript `slice()` counts UTF-16 code units.

```ts
const text = '😀é👨‍👩‍👧‍👦'
const ac = new AhoCorasick(['é', '👨‍👩‍👧‍👦'])
ac.search(text)
// é: start 2, end 4; family: start 4, end 15
```

The workbench displays grapheme end indices `1` and `2` for these matches. The library returns `[2, 4)` and `[4, 15)`. Both representations describe the same hits, but only the latter can be passed directly to `slice()`.

## Exact boundaries and spelling

A pattern must match complete graphemes. `e` does not match inside `é`; an individual person emoji does not match inside a ZWJ family. Canonically equivalent spellings are not automatically equal: `é` and `é` are different inputs. The core constructor performs no normalization or case folding.

For opt-in normalization and full Unicode case folding with original offsets, use
`TextMatcher` from `modern-ahocorasick/text` (v3.1.0+):

```ts
import TextMatcher from 'modern-ahocorasick/text'

const matcher = new TextMatcher(['STRASSE', 'é'], { normalization: 'NFC', caseFold: true })
const text = 'Straße e\u0301'
matcher.search(text).map(hit => text.slice(hit.start, hit.end))
// ['Straße', 'e\u0301']
```

Unlike manually lowercasing input, the adapter retains original boundaries. It
rejects matches covering only part of an expanded grapheme, so `s` does not match
half of `ß`. See [transformation semantics and costs](./api#optional-normalization-and-case-folding).
The core constructor remains case-sensitive and performs no normalization.

## Empty inputs

`new AhoCorasick([])` is valid. All scans produce no results. `new AhoCorasick([''])` throws `RangeError`; an empty pattern is not a wildcard. The visualizer trims comma-separated keyword entries and ignores empty entries, but preserves search-text spaces and newlines exactly. Duplicate entries remain distinct.

## ASCII acceleration and runtime versions

Dictionary construction, `count()` and `match()` scan leading ASCII lazily
without creating native segment objects. CRLF
still forms one grapheme. If a non-ASCII character could extend the current
cluster, the unresolved cluster and remaining suffix are delegated to
`Intl.Segmenter`. The scanner does not return to ASCII mode within that suffix.
For example, `e` still cannot match inside `abc e\u0301`, even with an ASCII-only
dictionary. A bounded probe of at most eight UTF-16 units routes short mixed
prefixes directly to native segmentation; there is no whole-string ASCII preflight.

`search()`, `iterate()` and `replace()` retain native segmentation because the
experimental cursor-based result generators exceeded the regression budget.
This is an implementation optimization, not a new matching mode. Exact matching,
case sensitivity, no normalization, and original UTF-16 ranges remain unchanged.
Unicode rules follow the host runtime; newly introduced characters may segment
differently across ICU/Unicode versions. Node conformance tests use versioned
Unicode GraphemeBreakTest data. Chromium, Firefox and WebKit run the same library
contract and differential suite against their own native segmenters.
