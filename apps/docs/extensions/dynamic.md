---
title: "Dynamic dictionaries"
description: "Batch dictionary edits and compile an immutable snapshot for queries (v3.2.0+)."
---

# Dynamic dictionaries

Batch dictionary edits and compile an immutable snapshot for queries (v3.2.0+).

## Edit and compile

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

## Stable IDs and snapshots

`add` returns a stable non-negative ID; duplicate strings get separate IDs. `delete(id)`
returns whether the ID existed. `clear()` never reuses IDs. `compile()` returns the
same cached `{ matcher, ids }` snapshot until an effective edit. The frozen `ids` array
maps each snapshot's dense `patternIndex` to the stable ID. Metadata references remain
caller-owned. Existing iterators and streams keep their original snapshot.

## Choose a compiler

Pass a third constructor argument `(patterns, options) => new UnicodeAhoCorasick(patterns, options)`
to choose another built-in matcher. Compilation is explicit and synchronous; this API
does not promise constant-time online index updates.
