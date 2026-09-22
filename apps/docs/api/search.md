---
title: "Search and lazy iteration"
description: "Use search() for an array of ranges, or iterate() to consume results as they become available."
---

# Search and lazy iteration

Use search() for an array of ranges, or iterate() to consume results as they become available.

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

```ts
import AhoCorasick from 'modern-ahocorasick'

const text = 'ushers'
const matcher = new AhoCorasick(['he', 'she', 'hers'])
matcher.search(text).map(hit => [hit.pattern, hit.start, hit.end])
// [['she', 1, 4], ['he', 2, 4], ['hers', 2, 6]]
```

## iterate(text, options?)

`iterate(text, options?)` returns an independent `IterableIterator<Match<T>>` in the same order as `search()`. Validation happens at call time and the strategy is captured immediately. It accepts a complete string, not chunks.

```ts
import AhoCorasick from 'modern-ahocorasick'

const text = 'ushers'
const matcher = new AhoCorasick(['he', 'she', 'hers'])
for (const hit of matcher.iterate(text, { strategy: 'leftmost-longest' })) {
  console.log(text.slice(hit.start, hit.end)) // 'she'
}
```

## findFirst(text, options?) and findAt(text, start, options?)

findFirst() returns the first match in the same order as iterate() without
allocating a result array. findAt() applies an anchored query at an original
grapheme boundary and returns the first match beginning there.

```ts
matcher.findFirst('ushers')?.pattern // 'she'
matcher.findAt('ushers', 1)?.pattern // 'she'
```

## Selection and memory

Both methods accept `all` (default), `leftmost-first`, `leftmost-longest` and `longest-first`. Iteration retains the input and dictionary. The two leftmost strategies use an O(L) candidate window, where L is the longest keyword in graphemes; `longest-first` instead buffers and sorts candidates. `search()` also retains its result array.

See [Strategies, boundaries and ranges](/api/options); see [Chunked matching](/stream/core).
