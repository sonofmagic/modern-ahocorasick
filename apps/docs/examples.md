---
title: "Practical examples"
description: "Choose an example by the result you want: ranges, counts, highlights or replacement text."
---

# Practical examples

Choose an example by the result you want: ranges, counts, highlights or replacement text.

## Overlapping and duplicate patterns

```ts
import AhoCorasick from 'modern-ahocorasick'

const ac = new AhoCorasick(['a', 'aa', 'a'])
ac.search('aaa') // 8 results, including duplicates and overlaps
ac.search('aaa', { strategy: 'leftmost-longest' })
// 'aa' at [0, 2), then first 'a' at [2, 3)
```

## Metadata and replacement

[Translate entries using metadata →](/examples/replacement)

## Safe highlighting

[Render safe text nodes →](/examples/highlighting)

## Presence and lazy output

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['cat', 'dog'])
matcher.match('a cat') // true
matcher.countByPattern('cat cat dog') // [2, 1]
for (const hit of matcher.iterate('cat dog')) {
  console.log(hit.pattern)
  if (hit.pattern === 'cat') {
    break
  }
}
```

See [Processing files and browser streams](/stream/adapters).
