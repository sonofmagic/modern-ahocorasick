# modern-ahocorasick

Native extensions add dynamic dictionaries, Unicode folding streams, character boundaries, tokenization/replacement streams, Node/Web adapters, filters, previews and a double-array backend. See the [extension guide](https://aho.icebreaker.top/extensions). No runtime dependencies are added.

Match many keywords in Unicode text with Aho–Corasick. Compile a dictionary once,
then find, count or replace matches using ranges that work with JavaScript's `slice()`.

[![npm](https://img.shields.io/npm/v/modern-ahocorasick)](https://www.npmjs.com/package/modern-ahocorasick)
[![CI](https://github.com/icelib/modern-ahocorasick/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/icelib/modern-ahocorasick/actions/workflows/test.yml)
[![MIT license](https://img.shields.io/npm/l/modern-ahocorasick)](https://github.com/icelib/modern-ahocorasick/blob/main/LICENSE)

**English** · [简体中文](https://github.com/icelib/modern-ahocorasick/blob/main/README.zh-CN.md)

[Documentation](https://aho.icebreaker.top/) · [Interactive workbench](https://aho.icebreaker.top/visualization) · [API reference](https://aho.icebreaker.top/api)

## Install and find matches

```sh
npm install modern-ahocorasick
# or: pnpm add modern-ahocorasick
```

```js
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['cat', '猫'])
const text = '😀cat和猫'

const matches = matcher.search(text)
// [
//   { pattern: 'cat', patternIndex: 0, start: 2, end: 5, data: undefined },
//   { pattern: '猫', patternIndex: 1, start: 6, end: 7, data: undefined },
// ]

matches.map(({ start, end }) => text.slice(start, end))
// ['cat', '猫']
```

Matching respects complete Unicode grapheme clusters, including emoji and combining
characters. Results use original-text **UTF-16 offsets**: `start` is inclusive and
`end` is exclusive. Reuse the matcher across texts; construct a new one to change
its dictionary.

## Choose a method

| You need                            | Method                                          | Result                                                |
| ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Check whether any keyword occurs    | `match(text)`                                   | Boolean; stops at the first hit                       |
| Count every occurrence              | `count(text)`                                   | Number; includes overlaps and duplicate entries       |
| Count each dictionary entry         | `countByPattern(text)`                          | Counts in input order; includes zeroes and duplicates |
| Match incoming chunks               | `createStream(options?)`                        | Stateful writes, EOF flush and cancellation           |
| Return one match without collecting | `findFirst()` / `findAt()`                      | Low-allocation first-hit queries                      |
| Save or load a dictionary           | `serialize()` / `AhoCorasick.deserialize()`     | Versioned, validated compiled data                    |
| Distribute a compiled artifact      | `serializeArtifact()` / `deserializeArtifact()` | Profile-validated Worker/Serverless payload           |
| Collect matched ranges              | `search(text, options?)`                        | Array of independent match objects                    |
| Read matches as needed              | `iterate(text, options?)`                       | Lazy iterator over match objects                      |
| Replace non-overlapping matches     | `replace(text, replacement, options?)`          | New string                                            |

`count()` avoids creating match objects. `iterate()` avoids collecting a result
array and stops scanning when you stop consuming it. It accepts a complete string,
not a stream of chunks; the iterator retains the text and dictionary.

```js
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['he', 'she', 'hers'])

matcher.match('ushers') // true
matcher.count('ushers') // 3 — 'she', 'he' and 'hers' overlap
matcher.countByPattern('ushers') // [1, 1, 1]

for (const hit of matcher.iterate('ushers')) {
  console.log(hit.pattern) // 'she'
  if (hit.pattern === 'she') {
    break
  }
}
```

For full signatures and validation behavior, see the [API reference](https://aho.icebreaker.top/api).

## Additional matching tools

`countByPattern()`, whole-word options, streams, compiled persistence and the
optional text adapter require v3.1.0 or later.

```ts
matcher.countByPattern('ushers') // [1, 1, 1]
new AhoCorasick(['cat']).match('concatenate', { wholeWord: true, locale: 'en' }) // false
const restored = AhoCorasick.deserialize(matcher.serialize())
const stream = restored.createStream()
const hits = [...stream.write('ush'), ...stream.write('ers'), ...stream.finish()]
```

For normalization or full Unicode case folding, import the separate
`TextMatcher` constructor from `modern-ahocorasick/text`. It maps results back to
original UTF-16 ranges, including expansions such as `ß` → `ss`. It also provides
transformed `createStream()`, `createTokenStream()`, `createReplaceStream()`,
`serialize()` and `deserialize()`. The default entry keeps exact matching and
does not load the folding table.

See the [API guide](https://aho.icebreaker.top/api#whole-word-matching) for word
boundary rules, metadata codecs, stream buffering/cancellation and conversion
costs. Stream tails are bounded explicitly and never silently truncated.

## Select overlaps deliberately

`search()` and `iterate()` default to `all`. Use a leftmost strategy when ranges
must not overlap, for example before highlighting text.

| Strategy           | Selection                                                              | Order                                                           |
| ------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| `all`              | Every occurrence, including overlaps and duplicate entries             | End ascending; then pattern length descending; then input order |
| `leftmost-first`   | Earliest start; input order breaks same-start ties                     | Start ascending, non-overlapping                                |
| `leftmost-longest` | Earliest start; longest pattern wins same-start ties, then input order | Start ascending, non-overlapping                                |

```js
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['a', 'ab', 'bc'])

matcher.search('abc', { strategy: 'leftmost-first' }).map(hit => hit.pattern)
// ['a', 'bc']
matcher.search('abc', { strategy: 'leftmost-longest' }).map(hit => hit.pattern)
// ['ab']
```

“Longest” breaks ties at the same start; it does not choose the longest match
anywhere in the text. Adjacent matches are retained. With `all`, the first result
is the earliest-ending match, which is not necessarily the leftmost one.
Non-overlapping iteration may look ahead by the longest keyword's grapheme length.

## Attach metadata and replace text

Dictionary entries can be strings or `{ pattern, data }` records. Each input entry
keeps its `patternIndex`, so duplicate keywords remain distinct. Metadata is
caller-owned and retained by reference, not deep-cloned. Changing input records or
returned match objects does not reconfigure the matcher.

```js
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick([
  { pattern: 'cat', data: { replacement: '猫' } },
  { pattern: 'dog', data: { replacement: '狗' } },
])

matcher.replace('cat and dog', hit => hit.data.replacement)
// '猫 and 狗'
matcher.replace('cat', '$&') // '$&' — string replacements are literal
```

`replace()` defaults to `leftmost-longest` and also accepts `leftmost-first`.
It rejects `all`. A callback receives `(match, originalSubstring)` and must return
a string. Replacement runs once over the original ranges; inserted text is not
searched again. The library produces strings and ranges, not HTML; escape text
according to your rendering framework when highlighting.

## Unicode and compatibility

Matching is case-sensitive and does not normalize Unicode. `é` and `e\u0301` are
different patterns, and `e` does not match inside `e\u0301`. Grapheme boundaries
follow the runtime's ICU/Unicode version. Read [Unicode and indices](https://aho.icebreaker.top/unicode)
for examples and coordinate conventions.

| Environment        | Requirement                                              |
| ------------------ | -------------------------------------------------------- |
| JavaScript runtime | ES2022 support and `Intl.Segmenter`; no bundled polyfill |
| Modules            | ESM default import or direct CommonJS `require()`        |
| TypeScript         | 5.3+ for the bundled declarations                        |

```js
const AhoCorasick = require('modern-ahocorasick')

const matcher = new AhoCorasick(['cat'])
matcher.match('cat') // true
```

```ts
import type { Match, PatternInput } from 'modern-ahocorasick'
import AhoCorasick from 'modern-ahocorasick'

const patterns: PatternInput<{ id: string }>[] = [
  { pattern: 'cat', data: { id: 'animal-cat' } },
]
const matcher = new AhoCorasick(patterns)
const matches: Match<{ id: string }>[] = matcher.search('cat')
```

An empty dictionary is valid. Empty keywords throw `RangeError`; invalid runtime
arguments throw `TypeError`. Counts above `Number.MAX_SAFE_INTEGER` throw
`RangeError`. Development Node.js requirements are separate from consumer runtime
requirements.

## Upgrade from v2

v3 is available on npm. `search()` now returns individual match objects with UTF-16
ranges instead of grouped tuples. The default constructor export, direct
CommonJS `require()` and `match(text): boolean` remain supported.

Follow the [v2 → v3 migration guide](https://github.com/icelib/modern-ahocorasick/blob/main/packages/modern-ahocorasick/MIGRATION.md)
and consult the [changelog](https://github.com/icelib/modern-ahocorasick/blob/main/packages/modern-ahocorasick/CHANGELOG.md).

## Performance

Aho–Corasick compiles a reusable dictionary. For `g` input graphemes and `z`
occurrences, all-match search takes O(g log(d + 1) + z) time, excluding runtime segmentation
costs; d is the maximum transition degree. `count()` uses aggregate counts in O(g log(d + 1)) scan time; `match()` can stop early.
Search retains its result array, while non-overlapping selection uses a candidate
window bounded by the longest keyword. Replacement still allocates output text.

Performance depends on the dictionary, input, output density and runtime. See the
[reproducible benchmarks](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks-ascii.md)
for workload-specific results, memory measurements and comparison limitations.

## Contribute

See the [contributing guide](https://github.com/icelib/modern-ahocorasick/blob/main/CONTRIBUTING.md)
for local development, validation, releases and documentation deployment.
[Report a bug](https://github.com/icelib/modern-ahocorasick/issues) with a small
reproduction and your runtime version.

## License and credits

[MIT](https://github.com/icelib/modern-ahocorasick/blob/main/LICENSE).
Originally forked from [BrunoRB/ahocorasick](https://github.com/BrunoRB/ahocorasick),
based on Aho and Corasick's “Efficient string matching: an aid to bibliographic search”.
Modern library maintained by [SonOfMagic](https://github.com/sonofmagic).

The optional text adapter includes Unicode 17 case-folding data under the
[Unicode License V3](https://github.com/icelib/modern-ahocorasick/blob/main/packages/modern-ahocorasick/UNICODE-LICENSE.txt).
