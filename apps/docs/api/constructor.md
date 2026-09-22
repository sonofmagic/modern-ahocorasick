---
title: "Constructor and metadata"
description: "Compile a reusable dictionary from strings or entries with application data."
---

# Constructor and metadata

Compile a reusable dictionary from strings or entries with application data.

## Create a matcher

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick([
  'cat',
  { pattern: 'dog', data: { id: 7 } },
], { boundary: 'none' })
matcher.search('dog')[0]?.data // { id: 7 }
```

Strings and metadata objects can be mixed. `patternIndex` refers to the original input position, so duplicates remain distinguishable. Input patterns are captured at construction; metadata retains its original reference. Mutating inputs or returned match objects does not change compiled matching state.

An empty list `[]` is valid and never matches. An empty pattern `''` throws `RangeError` naming its input index. Invalid runtime arguments throw `TypeError`.

## Options and types

The signature is `new AhoCorasick<T>(patterns: readonly PatternInput<T>[], options?: MatcherOptions)`. The optional `boundary` rule defaults to `none`.

```ts
import type { Match, PatternInput } from 'modern-ahocorasick'
import AhoCorasick from 'modern-ahocorasick'

const patterns: PatternInput<{ id: number }>[] = [{ pattern: 'cat', data: { id: 1 } }]
const matches: Match<{ id: number }>[] = new AhoCorasick(patterns).search('cat')
```

See [Boundary rules](/api/options).

## State ownership

The goto table, failure links, output links and builder are implementation details. No `gotoFn`, `failure`, `output`, or public `trace()` API exists in v3. The visualizer uses a repository-internal integration, not a supported consumer API.

See [Dynamic dictionaries](/extensions/dynamic).
