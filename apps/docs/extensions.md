# Optional text-processing extensions

These additions build on the published v3.1 API; the additions themselves are not yet released. The default export remains an immutable,
exact grapheme matcher with original-text UTF-16 ranges. Every optional entry supports
ESM and CommonJS; class entries still return their constructor from `require()`.
Existing `countByPattern()`, persistence, `wholeWord`/`locale`, and `matcher.createStream()` remain supported. There are no runtime dependencies. `queue-microtask` is unrelated to matching and is
not included.

## Capabilities and entry points

| Entry                         | Exports                                                                  | Purpose                                                             |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `modern-ahocorasick`          | default constructor; named types                                         | Exact matching, boundaries, four selection strategies, tokenization |
| `/text`                       | default `TextMatcher`                                                    | Existing whole-text normalization and case folding                  |
| `/unicode`                    | default constructor                                                      | Unicode 17.0 full case folding                                      |
| `/fast`                       | default constructor                                                      | Optional double-array trie                                          |
| `/unicode-fast`               | default constructor                                                      | Full folding with the double-array trie                             |
| `/dynamic`                    | default `DynamicDictionary`; snapshot/compiler types                     | Batched edits and immutable compiled snapshots                      |
| `/replace`                    | `keep`, `remove`, `mask`, `fromMap`, `once`                              | Literal replacement callbacks                                       |
| `/stream`                     | match/token/replace sessions and iterable adapters                       | Incremental Unicode processing                                      |
| `/stream/filters`             | `urls`, `markdown`, `protectedText`                                      | Protect supported syntax from matching                              |
| `/stream/node`, `/stream/web` | `createMatchTransform`, `createTokenTransform`, `createReplaceTransform` | Platform stream adapters                                            |

Paths in this table are package subpaths, not additional packages. Internal tables and
shared implementation chunks are not public entry points. Importing the default
entry does not load the folding table, double-array compiler or Node stream modules.

## Boundaries and selection

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

`longest-first` is an additional offline strategy: sort candidates by original
grapheme length descending, then start and input index ascending; accept each candidate
that overlaps no accepted match, then return results in source order.
For patterns `['ab', 'bcdef', 'f']` in `abcdef`, `leftmost-longest` selects `ab, f`,
while `longest-first` selects `bcdef`. Offline search, iteration, replacement and
tokenization support it. It buffers candidates and original grapheme positions;
it is not a bounded-lookahead iterator and is rejected by all streaming APIs.

`tokenize(text, options?)` defaults to `leftmost-longest` and rejects `all`. It returns
`Token<T>[]`: either `{ type: 'text', text, start, end }` or
`{ type: 'match', text, start, end, match }`. No empty text tokens are generated.
Concatenating `token.text` reconstructs the original input. The library emits no HTML.

## Full Unicode folding

```ts
import UnicodeAhoCorasick from 'modern-ahocorasick/unicode'

const matcher = new UnicodeAhoCorasick(['STRASSE', 'ss', 's'])
matcher.replace('😀Straße', 'X') // '😀X'
matcher.search('ß').map(match => match.pattern) // ['ss']
```

Folding uses Unicode 17.0 `CaseFolding.txt` common/full mappings with the bundled
Unicode License v3. It does not normalize text or apply Turkic tailoring. Thus `é`
and `e\u0301` remain distinct; `Σ`, `σ` and `ς` fold together. `İ` folds to `i\u0307`.
Matches must cover whole original graphemes: `ss` matches `ß`, but `s` does not match
half of that expansion. Patterns and metadata are preserved; ranges and replacement
callback text refer to the unmodified input. The folding table is fixed, while
grapheme segmentation still follows the host ICU version.

## Dynamic dictionaries and replacements

```ts
import DynamicDictionary from 'modern-ahocorasick/dynamic'

const dictionary = new DynamicDictionary(['cat'])
const old = dictionary.compile()
const dogID = dictionary.add('dog')
const current = dictionary.compile()
old.matcher.match('dog') // false
current.matcher.match('dog') // true
dictionary.delete(dogID)
```

`add` returns a stable non-negative ID; duplicate strings get separate IDs. `delete(id)`
returns whether the ID existed. `clear()` never reuses IDs. `compile()` returns the
same cached `{ matcher, ids }` snapshot until an effective edit. The frozen `ids` array
maps each snapshot's dense `patternIndex` to the stable ID. Metadata references remain
caller-owned. Existing iterators and streams keep their original snapshot.

Pass a third constructor argument `(patterns, options) => new UnicodeAhoCorasick(patterns, options)`
to choose another built-in matcher. Compilation is explicit and synchronous; this API
does not promise constant-time online index updates.

`/replace` supplies `keep()`, `remove()`, `mask(character = '*')`, `fromMap(mapOrRecord)`
and `once(replacement)`. Masks repeat once per original grapheme. Maps are snapshotted,
keyed by the original dictionary pattern, and keep unmapped matches unchanged.
`once()` has independent state for each library replacement operation, even when the
same helper is reused by simultaneous streams. Replacement strings remain literal.

## Incremental sessions and iteration

```ts
import AhoCorasick from 'modern-ahocorasick'
import { createTokenStream, replaceChunks, replaceChunksAsync } from 'modern-ahocorasick/stream'

const matcher = new AhoCorasick(['cat'])
const replaced = [...replaceChunks(matcher, ['a ca', 't!'], 'DOG')].join('') // 'a DOG!'

const session = createTokenStream(matcher)
const first = session.write('a ca')
const preview = session.preview() // provisional suffix; never committed replacement output
const rest = [...session.write('t!'), ...session.end()]
const original = [...first, ...rest].map(token => token.text).join('')

for await (const part of replaceChunksAsync(matcher, ['a ca', 't!'], async () => 'DOG')) {
  console.log(part)
}
```

- Sessions: `createMatchStream(matcher, options?)`, `createTokenStream(matcher, options?)`,
  `createReplaceStream(matcher, replacement, options?)`. Each exposes `write(string)`,
  `end()` and `destroy()`. Calls return arrays; output from one caller chunk can be large.
- Iterables: `iterateChunks`, `tokenizeChunks`, `replaceChunks`; their `Async` variants
  accept either `Iterable<string>` or `AsyncIterable<string>`. Argument order is
  `(matcher, source, options?)`, or `(matcher, source, replacement, options?)`.
- Match streams default to `all`; token/replacement streams default to `leftmost-longest`
  and also accept `leftmost-first`. Offsets are absolute UTF-16 input offsets.
- Adjacent text tokens and output strings may be split differently between chunkings.
  Their concatenation and the final selected matches are equivalent to whole-input work.
- Repeated `end()` returns an empty array. Writing after end, or using a destroyed
  session, throws. Processing/replacement failures destroy the session.

`maxBufferLength` defaults to **1,048,576 UTF-16 units of undecided original text**.
Set a positive safe integer or explicitly use `Infinity`. Overflow throws `RangeError`;
the library never truncates text or matches. This is not a total memory limit: the
dictionary, caller chunk, result arrays and replacement output have their own costs.
The scanner retains selection lookahead and up to three trailing graphemes; arbitrarily
long graphemes or undecided inline-code spans can reach the limit.

Async options additionally accept `signal: AbortSignal` and `yieldEvery` (positive safe
integer, default 4096 UTF-16 units). Processing yields through the task queue. Callback
promises are awaited sequentially. Abort propagates `signal.reason`, closes the source
iterator and releases scan state; arbitrary producer/callback code must also cooperate
to cancel its own external work. Pull adapters do not request another source chunk
until current output is consumed. A group of matches at one grapheme can still be large.

`preview()` returns `{ start, text, tokens }` for the entire unconfirmed suffix.
Replace the previous preview on each call; confirmed tokens never change. Preview tokens
interpret the suffix in isolation and may change as boundaries, filters or longer matches
become known. Preview never invokes replacement callbacks; only confirmed output does.

## Protected syntax and platform streams

`urls()` protects HTTP/HTTPS schemes (case insensitive) through whitespace or EOF.
`markdown({ heading?, code? })` defaults both flags to true. It recognizes ATX headings
at the start of a line with 1–6 hashes, inline backtick spans with equal delimiter lengths,
and line-start backtick/tilde fences of length ≥3. Closing fences use the same character,
at least the opening length, and optional trailing spaces/tabs. Indented fences,
escapes, links and other CommonMark rules are outside this syntax profile.
Unclosed inline code becomes ordinary text at EOF; unclosed fenced code stays protected.
`protectedText({ urls: true, markdown: true })` combines both rules.
Protected text passes through unchanged, and a match cannot cross it. If a syntax edge
intersects a grapheme, the entire grapheme is protected.

```ts
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import AhoCorasick from 'modern-ahocorasick'
import { createReplaceTransform } from 'modern-ahocorasick/stream/node'

await pipeline(
  createReadStream('input.txt'),
  createReplaceTransform(new AhoCorasick(['secret']), '[redacted]'),
  createWriteStream('output.txt'),
)
```

Node adapters return a `Duplex` with demand-driven async-generator processing and
incremental UTF-8 byte decoding. Prefer consistent byte or string input; switching
from bytes to strings flushes any incomplete decoder sequence.
Web adapters return a `ReadableWritablePair`, accepted by `pipeThrough()`; they are
not `TransformStream` instances. Decode byte sources with `TextDecoderStream` first.
Both platforms support async replacement callbacks, cancellation and backpressure.

## Performance and comparison

`/fast` is an explicit double-array backend, not a universal speed guarantee. It can
reduce ArrayBuffer storage while increasing JavaScript heap usage; current cursor
overhead may dominate scans. On Node 24.18.0 / Apple M4 Max, the 10,000-pattern ASCII
comparison measured 28.23 ms construction and 4.34 ms search for `/fast`, versus
13.61 ms and 2.00 ms for the default backend. Retained heap was 3.52 MiB versus
0.47 MiB; buffers were 1.18 MiB versus 1.60 MiB. These are three-round medians,
not a prediction for other dictionaries. Boundaries and folding use the
general cursor, so filtered `count()` does enumerate accepted outputs. The default
exact counting and presence paths retain their allocation-light implementation.

The feature comparison targets `@monyone/aho-corasick@1.5.10` and
`@tanishiking/aho-corasick@0.0.1`. Their index, duplicate and Unicode contracts differ;
this package preserves its own ranges and semantics rather than copying defects or
method aliases. Run `pnpm benchmark:external` for the printable-ASCII comparison,
including normalized independent ranges, native results, build costs and memory.

### Compatibility with v3.1

The existing `matcher.createStream({ maxBufferedUnits, wholeWord, locale })` keeps its `write/finish/cancel` lifecycle; repeated `finish()` still throws. The new `/stream` APIs use `write/end/destroy` and `maxBufferLength`. They additionally accept `wholeWord` and `locale`; whole-word streams retain the last undecided line to preserve ICU word context, subject to the buffer limit. Constructor character boundaries and per-query whole-word boundaries are intersected.

`/text` retains normalization and Turkic folding; it is a whole-text adapter. Use `/unicode` for default full-folding streams. `serialize()` remains available on the exact matcher and `/fast` (serialized as the compatible compact format). Constructor boundary rules and folding profiles cannot be serialized; attempting this throws rather than silently losing options.

Imperative async counterparts `createMatchStreamAsync`, `createTokenStreamAsync` and `createReplaceStreamAsync` return `write/end` promises plus synchronous `destroy()`. Await each operation; concurrent writes/ending are rejected rather than queued without a bound. Async replacements and cancellation follow the iterable contract.

### Migrating the reference packages

| Reference capability                         | Public API here                                          | Contract to check                                                |
| -------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| Monyone detection, matching and replacement  | `match`, `search`, `replace`                             | Original UTF-16 ranges; literal replacements                     |
| Monyone dynamic edits and chunked processing | `/dynamic`, `/stream`, platform adapters                 | Compile edits explicitly; old snapshots remain valid             |
| Monyone tokenization, skipping and previews  | `tokenize`, `/stream/filters`, token session `preview()` | Limited syntax and replaceable provisional suffix                |
| Monyone fast backend                         | `/fast`                                                  | Explicit opt-in; measure your dictionary                         |
| Tanishiking `caseInsensitive`                | `/unicode`                                               | Full Unicode folding, including expansions                       |
| Tanishiking `onlyWholeWords`                 | Constructor `boundary: 'ascii'`                          | Character rule; `wholeWord` instead uses ICU word segmentation   |
| Tanishiking `allowOverlaps: false`           | `strategy: 'longest-first'`                              | Original grapheme length priority, then start/index tie-breaking |

For example, migrate a case-insensitive, non-overlapping dictionary like this:

```ts
import UnicodeAhoCorasick from 'modern-ahocorasick/unicode'

const matcher = new UnicodeAhoCorasick(['STRASSE', 'ss'], { boundary: 'ascii' })
const matches = matcher.search('Straße ss', { strategy: 'longest-first' })
// [{ pattern: 'STRASSE', start: 0, end: 6, patternIndex: 0, data: undefined },
//  { pattern: 'ss', start: 7, end: 9, patternIndex: 1, data: undefined }]
```

Use `text.slice(match.start, match.end)` directly: unlike Tanishiking's inclusive
`end`, this package's `end` is exclusive. `pattern` replaces `keyword` in results;
duplicate input entries retain independent `patternIndex` values and metadata.
This is a migration of intent, not a third-party API compatibility layer.
