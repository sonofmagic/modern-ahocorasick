# API

## Constructor

```text
new AhoCorasick<T>(patterns: readonly (string | { pattern: string, data?: T })[])
```

Strings and metadata objects can be mixed. `patternIndex` refers to the original input position, so duplicates remain distinguishable. Input patterns are captured at construction; metadata retains its original reference. Mutating inputs or returned match objects does not change compiled matching state.

An empty list `[]` is valid and never matches. An empty pattern `''` throws `RangeError` naming its input index. Invalid runtime arguments throw `TypeError`.

## search(text, options?)

Returns independent flat match objects:

```ts
interface Match<T> {
  pattern: string
  patternIndex: number
  start: number
  end: number
  data: T | undefined
}
```

`start` and `end` are original-text UTF-16 offsets, with an exclusive end. `text.slice(start, end)` is the matched text.

| Strategy           | Selection                                                                          |
| ------------------ | ---------------------------------------------------------------------------------- |
| `all` (default)    | Include overlaps. End ascending, then pattern length descending, then input order. |
| `leftmost-first`   | Earliest start; input order breaks ties.                                           |
| `leftmost-longest` | Earliest start; longest match wins, then input order.                              |

Non-overlapping strategies skip candidates overlapping a selected match. Adjacent matches are allowed. They retain one best candidate per start in a window bounded by the longest keyword in graphemes, without collecting and sorting all occurrences. Search still retains its selected result array.

```ts
ac.search(text, { strategy: 'leftmost-longest' })
```

## match(text, options?)

Returns a boolean and stops after the first hit without creating a match object. Use it when you only need presence, not every result.

## count(text, options?)

Returns the total number of occurrences, including overlaps and duplicate entries, equal to `search(text).length`. It uses aggregate state counts without creating match objects or walking output links. Empty text or an empty dictionary returns `0`. Invalid text throws `TypeError`; a count exceeding `Number.MAX_SAFE_INTEGER` throws `RangeError`. No strategy option is accepted.

```ts
new AhoCorasick(['a', 'aa', 'a']).count('aaa') // 8
```

## countByPattern(text, options?)

Returns a fresh `number[]` in original input order. Counts include overlaps;
missing patterns have zero counts, and duplicate entries retain separate slots.
For example, `new AhoCorasick(['a', 'aa', 'a', 'b']).countByPattern('aaa')`
returns `[3, 2, 3, 0]`. Empty dictionaries return `[]`; invalid text throws
`TypeError`.

The scanner aggregates state visits through failure links without enumerating
occurrences. Excluding segmentation, time is O(g log(d + 1) + s + p) and temporary memory
is O(s + p), for g text graphemes, s states, p input patterns and maximum transition degree d. Use `count()`
when only a total is needed: it avoids the state-sized temporary array.

## iterate(text, options?)

Lazily emits matches in the same order as `search(text, options)`, with the same three strategies and `all` as default. Text and options are validated immediately, and the strategy is captured at call time. It accepts a complete string, not chunks. Iteration avoids retaining an entire result array; the input text and dictionary remain alive. Non-overlapping strategies use an O(L) candidate window and may look ahead up to the longest keyword's L graphemes to settle a result. Each iterator has independent state.

```ts
for (const hit of ac.iterate(text, { strategy: 'leftmost-longest' })) {
  console.log(hit.pattern, text.slice(hit.start, hit.end))
}
```

## replace(text, replacement, options?)

Replaces non-overlapping original ranges once. Default strategy is `leftmost-longest`; `leftmost-first` is also accepted, `all` is rejected. A callback receives `(match, originalSubstring)` and must return a string. String replacements are literal: `$&` has no special meaning. Inserted text is not searched again. Selected matches are consumed incrementally, although output text and intermediate string pieces still require memory.

```ts
new AhoCorasick(['cat']).replace('cat cat', '$&') // '$& $&'
```

## Private state

The goto table, failure links, output links and builder are implementation details. No `gotoFn`, `failure`, `output`, or public `trace()` API exists in v3. The visualizer uses a repository-internal integration, not a supported consumer API.

## Whole-word matching

New options and methods in this section require v3.1.0 or later.

All queries accept `{ wholeWord: true, locale: 'en' }`. `locale` is a BCP 47
language tag; omitting it uses the runtime's default. A match must start at the
start of an `isWordLike` segment and end at the end of an `isWordLike` segment
from `Intl.Segmenter` with `granularity: 'word'`. Phrases may span several words
and punctuation. Punctuation-only patterns do not qualify. Underscores generally
belong to a word; Chinese segmentation follows the runtime's language rules.
Specify a locale for consistent intent, but ICU versions can still differ.

```ts
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

## Compiled dictionaries

`serialize(options?)` returns an opaque versioned string; use
`AhoCorasick.deserialize(serialized, options?)` to load it. Store the string in a
file, database or Worker message using your platform's APIs. Loading validates
and copies numeric scan tables without rebuilding the trie. It checks trie
structure, failure/output links, terminal identities and each dictionary pattern's
grapheme segmentation against the current runtime. A segmentation mismatch or
invalid/unsupported payload throws `TypeError`. This validates dictionary
compatibility, not equality of every ICU rule for arbitrary future input.

```ts
const saved = new AhoCorasick([{ pattern: 'cat', data: { id: 7 } }]).serialize()
const loaded = AhoCorasick.deserialize(saved)
loaded.count('cat cat') // 2
```

Metadata must contain only JSON-compatible values: finite numbers, strings,
booleans, null, arrays and plain objects. Undefined metadata is preserved as
absent; undefined nested values, functions, symbols, bigint, cycles, Date and Map
are rejected instead of silently discarded. Metadata can use explicit codecs:

```ts
const dates = new AhoCorasick([{ pattern: 'today', data: new Date('2026-09-22') }])
const saved = dates.serialize({ encodeData: date => date.toISOString() })
const loaded = AhoCorasick.deserialize(saved, {
  decodeData: value => new Date(String(value)),
})
```

Without a decoder, loaded metadata has type `unknown`; validate it in your decoder
before treating persisted external data as an application type. Codecs run only
for defined metadata and their errors propagate. Treat the payload as opaque:
version 1 is supported, but its internal keys are not a public table API. Loading
still validates every pattern and costs time proportional to dictionary size;
benchmark it for your dictionary rather than assuming constant-time startup.

## createStream(options?)

Creates an independent `MatchStream<T>` with `write(chunk): Match<T>[]`,
`finish(): Match<T>[]` and `cancel(): void`. Options include the three search
strategies, `wholeWord`, `locale` and `maxBufferedUnits` (default 1,048,576).
Concatenating every returned array yields the same ordered matches as searching
the concatenated chunks. Offsets are absolute original UTF-16 offsets. Feed decoded
strings; byte decoding is the caller's responsibility.

```ts
const stream = new AhoCorasick(['hello', '👩‍😀']).createStream()
const matches = [
  ...stream.write('hel'),
  ...stream.write('lo 👩‍'),
  ...stream.write('😀!'),
  ...stream.finish(),
]
```

A write may return no matches while a trailing grapheme or selected match remains
unsettled. Surrogate pairs, CRLF, combining sequences, regional indicators and ZWJ
emoji may cross chunk boundaries. Non-overlapping strategies also keep a candidate
window bounded by the longest pattern. Whole-word mode settles complete lines
(LF, CR, U+2028 or U+2029) so ICU has complete word context, retaining the unfinished
line; phrases can still match across lines. Always call `finish()` at EOF to flush
the final tail and candidates.

The unsettled tail is segmented again on each write; tiny chunks with a long
unfinished grapheme or line require more work. An unsettled grapheme or line can
be arbitrarily long. Exceeding the configured
positive safe-integer UTF-16 buffer limit cancels the stream and throws `RangeError`;
no silent truncation occurs. The limit applies to the unsettled tail, not chunk
size, returned match arrays or the dictionary. Empty writes are allowed. Invalid
chunks throw `TypeError` without consuming input. `cancel()` is idempotent; writes
or finishes after cancellation/finish throw `Error`. Offset overflow also cancels
with `RangeError`. A cancelled or finished stream cannot be reused.

## Optional normalization and case folding

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

Patterns and text are transformed one original grapheme at a time: normalize,
fold, then normalize again if requested. Results retain the original input
`pattern`, `patternIndex` and metadata; ranges and replacement callback text refer
to the original input. Only matches spanning complete original graphemes are
accepted. Thus `ss` matches `ß` under folding, but `s` does not match half of it;
`fi` matches `ﬁ` under NFKC, but `f` does not. Apply word boundaries on original
text before selection. `all` orders by end, earlier start, then input order;
selected strategies use original ranges and the existing tie rules.

The adapter provides `search`, `iterate`, `match`, `count`, `countByPattern` and
`replace`, with the same query options and argument validation. It processes a
complete string and builds an offset map before scanning; selected iteration
materializes and sorts valid candidates. It does not expose compiled persistence
or streaming. Use the core matcher for those APIs. These optional conversions
carry extra memory and scanning costs and do not perform fuzzy matching,
transliteration or locale-specific collation.
