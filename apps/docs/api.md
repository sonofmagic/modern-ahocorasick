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

Non-overlapping strategies skip candidates overlapping a selected match. Adjacent matches are allowed. They collect and sort all candidates, which costs memory proportional to the total number of matches.

```ts
ac.search(text, { strategy: 'leftmost-longest' })
```

## match(text)

Returns a boolean and stops after the first hit. Use it when you only need presence, not every result.

## iterate(text)

Lazily emits all matches in the same order as default `search()`. It accepts a complete string, not chunks. Iteration avoids retaining an entire result array; the input text and dictionary remain alive.

```ts
for (const hit of ac.iterate(text)) {
  console.log(hit.pattern, text.slice(hit.start, hit.end))
}
```

## replace(text, replacement, options?)

Replaces non-overlapping original ranges once. Default strategy is `leftmost-longest`; `leftmost-first` is also accepted, `all` is rejected. A callback receives `(match, originalSubstring)` and must return a string. String replacements are literal: `$&` has no special meaning. Inserted text is not searched again.

```ts
new AhoCorasick(['cat']).replace('cat cat', '$&') // '$& $&'
```

## Private state

The goto table, failure links, output links and builder are implementation details. No `gotoFn`, `failure`, `output`, or public `trace()` API exists in v3. The visualizer uses a repository-internal integration, not a supported consumer API.
