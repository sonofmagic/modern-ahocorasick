# Engineering roadmap

The target is a lightweight, zero-runtime-dependency JS/TS library for exact
Unicode grapheme matching. Speed, retained memory, construction cost, original
UTF-16 offsets and independently verified semantics all matter. No single-machine
benchmark establishes an industry-wide ranking.

| Stage | Work                                                                                      | Evidence required                                                                                               |
| ----- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| P0    | Safe ASCII construction/count/presence scanning, Unicode conformance, external benchmarks | Native-reference parity, three browser engines, reproducible speed and memory report                            |
| P1    | Compact automaton storage                                                                 | Build peak, retained heap/buffers and scan latency for 10k, 100k and 1m patterns                                |
| P2    | Dedicated non-overlapping selection                                                       | Reduce enumeration of discarded outputs on dense suffixes and duplicates without changing tie-breaking          |
| P3    | Per-pattern counts                                                                        | Aggregate state visits through failure links; avoid occurrence objects and output enumeration                   |
| P4    | Chunked Unicode scanning                                                                  | Whole-input equivalence, cross-chunk graphemes, cancellation, EOF and explicit buffer behavior                  |
| P5    | Optional text-processing extensions                                                       | Separately specified normalization, case folding, word boundaries, original-offset mapping and compiled loading |

P0 is the current implementation scope. Later stages require separate designs;
this table does not reserve public method names or promise release dates.

The default constructor, CommonJS contract, exact matching and independent match
objects remain stable. Large Unicode tables, WASM and platform adapters should
remain optional rather than increasing the default core's initialization cost.

A grapheme may contain an arbitrarily long run of combining characters, so exact
chunked processing cannot promise a fixed-size pending Unicode tail without an
explicit resource policy. Normalization and case folding can change lengths and
need an original-text mapping; simply transforming strings and subtracting a
pattern length is not sufficient.

Version PR preparation runs automatically on main pushes; npm publication remains
manual. Each publishable step records a pnpm change intent and
must pass repository, packed-consumer, type, browser and relevant benchmark checks.
