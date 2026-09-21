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

## match(text)

Returns a boolean and stops after the first hit without creating a match object. Use it when you only need presence, not every result.

## count(text)

Returns the total number of occurrences, including overlaps and duplicate entries, equal to `search(text).length`. It uses aggregate state counts without creating match objects or walking output links. Empty text or an empty dictionary returns `0`. Invalid text throws `TypeError`; a count exceeding `Number.MAX_SAFE_INTEGER` throws `RangeError`. No strategy option is accepted.

```ts
new AhoCorasick(['a', 'aa', 'a']).count('aaa') // 8
```

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
