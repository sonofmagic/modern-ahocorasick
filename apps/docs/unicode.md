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

A pattern must match complete graphemes. `e` does not match inside `é`; an individual person emoji does not match inside a ZWJ family. Canonically equivalent spellings are not automatically equal: `é` and `é` are different inputs. No normalization or case folding is performed.

If your application normalizes text, normalize the patterns and text consistently before matching. Returned offsets then refer to the **transformed text**, and cannot safely index the original without a separate mapping.

## Case handling

Matching is case-sensitive. For a simple ASCII-only case-insensitive use case:

```ts
const text = 'Hello WORLD'
const ac = new AhoCorasick(['hello', 'world'])
ac.search(text.toLowerCase())
```

General Unicode lowercasing can change length and segmentation (for example `İ`). Do not assume transformed indices remain valid for the original string. The library deliberately does not add a case-insensitive option.

## Empty inputs

`new AhoCorasick([])` is valid. All scans produce no results. `new AhoCorasick([''])` throws `RangeError`; an empty pattern is not a wildcard. The visualizer trims comma-separated keyword entries and ignores empty entries, but preserves search-text spaces and newlines exactly. Duplicate entries remain distinct.
