---
title: "How it works"
description: "Aho–Corasick compiles many patterns into a trie and scans text with failure links. This implementation treats each **grapheme cluster** as an edge label."
---

# How it works

Aho–Corasick compiles many patterns into a trie and scans text with failure links. This implementation treats each **grapheme cluster** as an edge label.

## Three pieces of state

1. **Goto edges** consume a matching grapheme and move to a child state.
2. **Failure links** point to the longest proper suffix that is also a trie prefix. A fallback does not consume the grapheme, so one grapheme can cause several fallback steps.
3. **Output links** connect terminal suffix states. Each node keeps its own terminal pattern indices, avoiding copied inherited result arrays.

At the root, a missing edge consumes and skips the grapheme. The visualizer draws this as a root self-loop, labelled ∅.

## Walk through ushers

With `he,she,his,hers`, the initial `u` stays at root. `s → h → e` reaches `she`, emitting `she` and its suffix `he`. On `r`, follow a failure link to the `he` state before consuming `r`. The final `s` emits `hers`.

The visualizer's educational grouping is `[[3, ['she', 'he']], [5, ['hers']]]`. These numbers are zero-based **grapheme end indices**, not v3 slice offsets.

## Reading the workbench

[Read controls, trace interpretation and input limits →](/workbench/guide)

## Cost and scope

The default backend retains interned symbols and sparse numeric arrays. Scanning uses a direct root lookup and binary search for other transitions. For g text graphemes, z matches and maximum transition degree d, enumeration costs O(g log(d + 1) + z), excluding segmentation. The two leftmost strategies use an O(L) candidate window; global `longest-first` collects and sorts candidates. Output arrays and strings need additional storage.

See [Counting costs](/api/count); see [Measured backend tradeoffs](/extensions/performance).

Reference: Aho and Corasick, _Efficient string matching: an aid to bibliographic search_ (1975). Derived from [BrunoRB/ahocorasick](https://github.com/BrunoRB/ahocorasick).
