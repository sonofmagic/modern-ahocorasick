---
title: "Compilation statistics"
description: "Inspect cached scalar diagnostics with getStats(), available since v3.2.0."
---

# Compilation statistics

Inspect cached scalar diagnostics with getStats(), available since v3.2.0.

## Read statistics

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['he', 'she', 'he'])
const stats = matcher.getStats()
stats.patternCount // 3
stats.backend // 'compact'
Object.isFrozen(stats) // true
stats === matcher.getStats() // true
```

## Fields and storage accounting

| Field             | Meaning                                           |
| ----------------- | ------------------------------------------------- |
| `backend`         | `compact` or `double-array`                       |
| `patternCount`    | Input entries, including duplicates               |
| `stateCount`      | States including root, excluding unused DAT slots |
| `transitionCount` | Trie edges                                        |
| `alphabetSize`    | Distinct compiled symbols                         |
| `maxPatternUnits` | Longest pattern in the units below                |
| `unit`            | `grapheme` or `folded-codepoint`                  |
| `typedArrayBytes` | Retained typed scan and auxiliary arrays          |

Folded units are codepoints after Unicode folding, so `ß` occupies two units in a folded profile. Statistics are computed at compilation; reads do not traverse the automaton. `/text` is a mapping adapter and has no `getStats()` method.

`typedArrayBytes` includes allocated but unused slots. It excludes strings, Maps, JS objects, temporary build allocations and native ICU, and is **not total heap usage**.

### Statistics after persistence

Compact deserialization recreates the same statistics. `/fast` saves the portable compact format, so the restored backend and storage statistics describe compact storage.

## Measure application memory

Use these fields to inspect compiled structure, not to estimate total process memory. Measure build time, scan time, retained JavaScript heap and ArrayBuffer storage separately.

See [Backend tradeoffs and measurements](/extensions/performance).
