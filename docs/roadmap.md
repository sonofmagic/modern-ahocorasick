# Engineering roadmap

The library remains a zero-runtime-dependency JS/TS matcher with exact Unicode
graphemes and original UTF-16 ranges by default. New APIs target v3.1.0; their
semantics and limitations are documented in the [API guide](https://aho.icebreaker.top/api).

| Stage | Implemented behavior                                             | Verification                                                                                           |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| P0    | Safe ASCII construction/count/presence                           | Native-reference, Unicode corpus and three-browser conformance                                         |
| P1    | Interned symbols and compact numeric scan tables                 | 10k/100k/1m retained heap, buffers, build peak RSS and scan latency                                    |
| P2    | Duplicate and dominated-output pruning in selected scans         | Randomized sort/greedy oracle, lazy lookahead, dense suffix/duplicate benchmarks                       |
| P3    | `countByPattern()` via state-visit propagation                   | Independent Unicode occurrence counts, duplicate and absent entries                                    |
| P4    | `createStream()` with EOF, cancellation and explicit tail limits | Every UTF-16 split, Unicode corpus, random streams and original offsets                                |
| P5    | Word boundaries, compiled persistence and optional text adapter  | Boundary-before-selection, structural validation, Unicode 17 folding corpus and original-range mapping |

See [enhancement measurements](./benchmarks-enhancements.md) and the
[implementation design](./plans/2026-09-22-matcher-enhancements.md). Memory savings
refer to the retained dictionary, not the temporary build peak. Smaller dictionaries
may pay extra construction/lookup costs; no universal speedup is claimed.

The default constructor, direct CommonJS contract and independent match objects
remain stable. Unicode folding data lives only in `modern-ahocorasick/text`.
The optional adapter processes complete strings; core streams preserve exact
Unicode matching and support word boundaries with line buffering. Future work can
extend streaming to mapped transformations and reduce temporary construction
memory, but neither is implied by the current APIs.

Ordinary main pushes prepare a version PR. Merging a version commit whose subject
starts with `chore(release): version packages` publishes automatically. Manual
`prepare` and `publish` modes remain recovery options. Keep version PRs open when
publication is not requested. Publishable changes carry pnpm change intents and
pass repository, packed-consumer, declaration, browser and benchmark checks.
