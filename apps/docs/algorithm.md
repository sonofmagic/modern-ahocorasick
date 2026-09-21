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

The text tape highlights the grapheme currently being considered. Solid blue edges are goto transitions; dashed orange edges are failure links. The active fallback remains visible even when other failure links are hidden. Double-ring nodes are terminal states. Tables use numeric state order and show inherited outputs without changing compiled state.

Each match event appends exactly one structured result. A reset cancels playback and clears results; continuing resumes from the next event. Changing inputs rebuilds the trace and cancels the old timer.

## Cost and scope

Building uses a node array, Map edges and breadth-first failure construction with a queue cursor. Scanning follows failure/output links; emitting many matches necessarily costs time proportional to the output. The workbench materializes the entire trace and lays out the whole dictionary, so it is intended for learning with small examples, not benchmarking large corpora.

Read the [measured v2/v3 tradeoffs](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks.md). No blanket speedup is promised.

Reference: Aho and Corasick, _Efficient string matching: an aid to bibliographic search_ (1975). This library is derived from [BrunoRB/ahocorasick](https://github.com/BrunoRB/ahocorasick); the workbench reimplements the capabilities of [the original visualization](https://brunorb.github.io/ahocorasick/visualization.html).
