---
title: "Metadata-driven replacement"
description: "Keep business data next to each pattern and use it when replacing selected matches."
---

# Metadata-driven replacement

Keep business data next to each pattern and use it when replacing selected matches.

## Translate dictionary entries

```ts
import AhoCorasick from 'modern-ahocorasick'

const ac = new AhoCorasick([
  { pattern: 'cat', data: { translation: '猫' } },
  { pattern: 'dog', data: { translation: '狗' } },
])
ac.replace('cat and dog', hit => hit.data?.translation ?? hit.pattern)
// '猫 and 狗'
```

## Original text and literal strings

The callback receives `(match, originalSubstring)`. Use the second argument when you need the original spelling after folding or normalization. Replacement strings are literal: `$&` is not expanded, and inserted text is not searched again.

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['cat'])
matcher.replace('cat cat', '$&') // '$& $&'
matcher.replace('cat', 'cat cat') // 'cat cat'
```

## Duplicates and selection

Duplicate strings retain their own `patternIndex` and metadata. A non-overlapping replacement picks only one at a given range; input order breaks equal-length ties. Metadata is caller-owned and is not deep-copied.

See [Reusable replacement helpers](/extensions/replacement-helpers).
