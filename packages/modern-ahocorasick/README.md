# modern-ahocorasick

Aho–Corasick multi-pattern matching for Unicode text, with sliceable ranges,
keyword metadata, allocation-light counting, lazy iteration and non-overlapping replacement.

**v3 is in development and is not published yet.** The committed package version
is the release baseline; the pending major change intent prepares 3.0.0 when a
release is explicitly requested. See [Migrating from v2](./MIGRATION.md).

Originally forked from [BrunoRB/ahocorasick](https://github.com/BrunoRB/ahocorasick).
Based on “Efficient string matching: an aid to bibliographic search”.

## Installation and modules

```sh
pnpm add modern-ahocorasick
```

The examples below describe the upcoming v3 API. The package provides ESM,
CommonJS and TypeScript declarations. Its runtime requires `Intl.Segmenter` and
ES2022 support; it does not bundle a Unicode polyfill.

```ts
import type { Match, PatternInput, SearchOptions } from 'modern-ahocorasick'
import AhoCorasick from 'modern-ahocorasick'
```

```js
const AhoCorasick = require('modern-ahocorasick')

const matcher = new AhoCorasick(['cat'])
```

## Match ranges

```ts
const matcher = new AhoCorasick(['cat', '猫'])
const text = '😀cat和猫'

matcher.search(text)
// [
//   { pattern: 'cat', patternIndex: 0, start: 2, end: 5, data: undefined },
//   { pattern: '猫', patternIndex: 1, start: 6, end: 7, data: undefined },
// ]

for (const { start, end } of matcher.search(text)) {
  console.log(text.slice(start, end)) // 'cat', then '猫'
}
```

Ranges use zero-based **UTF-16 offsets**, just like JavaScript string slicing.
`start` is inclusive and `end` is exclusive. Matching itself operates on complete
Unicode grapheme clusters: a family emoji or a base letter with combining marks
is a single matching unit. Matching is case-sensitive and performs no Unicode
normalization. For example, `é` and `e\u0301` are different patterns, and `e`
does not match inside `e\u0301`.

## Dictionary and metadata

```ts
const patterns = [
  'cat',
  { pattern: 'dog', data: { id: 'animal-dog', replacement: '狗' } },
] as const
const matcher = new AhoCorasick(patterns)
```

The constructor accepts a readonly array of strings and/or `{ pattern, data? }`
objects. It snapshots the array, pattern strings and metadata references.
Changing the original array or pattern records does not reconfigure the matcher.
Metadata remains caller-owned and is not deep-cloned: changes inside the metadata
object remain visible in subsequent results, but cannot alter matching state.

Each input entry keeps its zero-based `patternIndex`. Duplicate keywords produce
separate matches, including when their metadata differs. Use `data` for an
application-specific ID. Every result is a fresh object; changing it or its result
array does not affect future searches.

An empty dictionary is valid. Empty keywords throw `RangeError` with their input
index. Invalid dictionaries, entries, text, options and replacement values throw
`TypeError`. Text is validated immediately when calling any public method.

## API

### `search(text, options?)`

Returns `Match<T>[]`, with fields `pattern`, `patternIndex`, `start`, `end` and
`data: T | undefined`. The optional `strategy` controls overlap selection:

| Strategy           | Selection                                                             | Result order                                                              |
| ------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `all` (default)    | Every occurrence, including overlaps and duplicates                   | End ascending, then pattern length descending, then input index ascending |
| `leftmost-first`   | Earliest start; same-start ties use input order                       | Start ascending, non-overlapping                                          |
| `leftmost-longest` | Earliest start; same-start ties use longest pattern, then input order | Start ascending, non-overlapping                                          |

After selecting a non-overlapping match, candidates starting before its end are
skipped. Adjacent matches are retained. “Longest” only breaks ties at the same
start; it does not choose the globally longest match.

```ts
const matcher = new AhoCorasick(['a', 'ab', 'bc'])
matcher.search('abc', { strategy: 'leftmost-first' }).map(m => m.pattern)
// ['a', 'bc']
matcher.search('abc', { strategy: 'leftmost-longest' }).map(m => m.pattern)
// ['ab']
```

### `iterate(text, options?)`

Returns an `IterableIterator<Match<T>>` in the same order as `search(text, options)`.
It accepts the same three strategies and defaults to `all`. It scans lazily and
does not collect all matches. Non-overlapping strategies may look ahead by up to
the longest keyword in graphemes before settling a result. Each iterator has
independent scan state; stopping one does not affect the matcher or other iterators.
The input is a complete string, not a stream of chunks.

```ts
for (const match of matcher.iterate(text)) {
  console.log(match)
  if (match.pattern === 'cat') {
    break
  }
}
```

With `all`, the first emitted match is the earliest-ending match, which can differ
from the leftmost match. Use a non-overlapping iteration or search strategy when
start priority matters. Text and options are validated immediately, and the
strategy is captured when `iterate()` is called.

### `count(text)`

Returns the total number of occurrences, including overlaps and duplicate entries,
just like `search(text).length`, without constructing match objects or traversing
output links. An empty dictionary or empty text returns `0`. Invalid text throws
`TypeError`; a total above `Number.MAX_SAFE_INTEGER` throws `RangeError` rather
than returning a rounded count. This method always counts the `all` strategy.

```ts
new AhoCorasick(['a', 'aa', 'a']).count('aaa') // 8
```

### `match(text)`

Returns a boolean and stops scanning on its first hit without constructing a match object. Its signature is unchanged
from v2. An empty dictionary or empty text returns `false`.

### `replace(text, replacement, options?)`

Returns a new string. `replacement` is either a literal string or a function
`(match: Match<T>, originalText: string) => string`. The callback receives the
matched original substring, not the entire input.

The default strategy is `leftmost-longest`; `leftmost-first` is also accepted.
`all` is rejected. Replacements operate on original ranges once, without scanning
inserted text. `$&`, `$1` and `$$` have no special meaning. Callbacks run in source
order; non-string returns throw `TypeError`, and callback exceptions propagate.

```ts
const matcher = new AhoCorasick([
  { pattern: 'cat', data: '猫' },
  { pattern: 'dog', data: '狗' },
])
matcher.replace('cat and dog', match => match.data!) // '猫 and 狗'
matcher.replace('cat', '$&') // '$&'
```

For highlighting, use selected ranges and escape text according to your rendering
framework. The library does not generate HTML.

## Performance and memory

The dictionary is compiled once into private trie nodes, failure links and output
links. Inherited matches are not copied into every node. Private integer arrays also store aggregate
occurrence counts per state and grapheme lengths per pattern, trading dictionary
memory for queries that do not enumerate outputs. All methods share the transition
rule and reuse the instance's segmenter.

Dictionary construction, `count()` and `match()` scan a leading ASCII run without
allocating a segment object per character. CRLF remains one grapheme. Before a possible ASCII/Unicode join,
it leaves the boundary unsettled and hands the suffix to `Intl.Segmenter`; it
does not re-enter the fast path. A bounded probe of at most eight UTF-16 units routes short mixed prefixes
directly to native segmentation, avoiding cursor setup before a nearby Unicode hit.
There is no whole-input ASCII preflight, so early-exit queries and iterators remain
lazy. This changes no matching, normalization, case or offset semantics.
`search()`, `iterate()` and `replace()` retain native segmentation: cursor-based
result generation did not meet the performance regression budget.
Unicode behavior follows the runtime's ICU/Unicode version; engines may disagree
on newly introduced characters.

For `g` input graphemes, `z` occurrences, `k` selected results and longest keyword
length `L` in graphemes (excluding engine-dependent Unicode segmentation costs):

- `count()` scans in O(g) time and O(1) additional scan state; `match()` can stop early.
- All-match search/iteration takes O(g + z) time. `search()` retains O(z) results;
  `iterate()` does not retain a result array.
- Non-overlapping strategies process candidates in O(g + z) time with an O(L)
  candidate window, without collecting or sorting all occurrences. Iteration creates
  only selected match objects; `search()` additionally retains O(k) results.
- `replace()` consumes selected matches incrementally, but still allocates its
  output string and intermediate pieces. It is not a bounded-memory output stream.

All iterators retain the input string and dictionary. Early exit avoids subsequent
scanning; selected strategies may need up to L graphemes of lookahead. Inputs are
complete strings, not chunks. High-output scans are not free, and segmentation
for Unicode suffixes is provided by the runtime's `Intl.Segmenter`.

Run `pnpm benchmark` to compare the current build with pinned pre-ASCII v3.
`pnpm benchmark:external` compares printable ASCII with `ahocorasick@1.0.2` and
per-pattern `indexOf`; `pnpm benchmark:history` retains the older v3/v2 comparison. See `docs/benchmarks.md` in the source repository for
methodology, throughput, retained heap and separate process peak-RSS measurements.
No universal speedup is promised.

## License

[MIT](./LICENSE)
