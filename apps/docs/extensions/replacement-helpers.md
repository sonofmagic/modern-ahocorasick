---
title: "Replacement helpers"
description: "Reuse literal replacement policies in whole-text queries and stream operations (v3.2.0+)."
---

# Replacement helpers

Reuse literal replacement policies in whole-text queries and stream operations (v3.2.0+).

## Mask, map or replace once

```ts
import AhoCorasick from 'modern-ahocorasick'
import { fromMap, mask, once } from 'modern-ahocorasick/replace'

const matcher = new AhoCorasick(['cat', 'dog'])
matcher.replace('cat dog', mask()) // '*** ***'
matcher.replace('cat dog', fromMap({ cat: '猫' })) // '猫 dog'
const first = once('X')
matcher.replace('cat cat', first) // 'X cat'
matcher.replace('cat cat', first) // 'X cat'
```

## Helper contracts

`/replace` supplies `keep()`, `remove()`, `mask(character = '*')`, `fromMap(mapOrRecord)`
and `once(replacement)`. Masks repeat once per original grapheme. Maps are snapshotted,
keyed by the original dictionary pattern, and keep unmapped matches unchanged.
`once()` has independent state for each library replacement operation, even when the
same helper is reused by simultaneous streams. Replacement strings remain literal.

## Selection and safety

Helpers receive only selected matches. They do not evaluate replacement strings or generate HTML. Use `keep()` to retain the original substring and `remove()` to replace it with an empty string.

See [Replacement and tokenization](/api/replace).
