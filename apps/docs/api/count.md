---
title: "Presence and counting"
description: "Choose a boolean, a total, or a count for each dictionary entry without retaining a result array."
---

# Presence and counting

Choose a boolean, a total, or a count for each dictionary entry without retaining a result array.

## match(text, options?)

Returns a boolean and stops after the first hit without creating a match object. Use it when you only need presence, not every result.

## count(text, options?)

Returns the total number of occurrences, including overlaps and duplicate entries, equal to `search(text).length`. It uses aggregate state counts without creating match objects or walking output links. Empty text or an empty dictionary returns `0`. Invalid text throws `TypeError`; a count exceeding `Number.MAX_SAFE_INTEGER` throws `RangeError`. No strategy option is accepted.

```ts
import AhoCorasick from 'modern-ahocorasick'

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

## Filtered queries

All three methods accept `QueryOptions`: `wholeWord`, `locale`, `start`, `end`, and `anchored`; none accepts a selection strategy. Counts include overlaps and duplicate entries among the accepted matches. Aggregate scan costs above describe default exact matching. Word or constructor boundary filters and transformed matchers may enumerate occurrences and allocate additional state.

See [Query options](/api/options).
