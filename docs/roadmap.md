# Engineering roadmap

The library remains a zero-runtime-dependency JS/TS matcher with exact Unicode
graphemes and original UTF-16 ranges by default. The v3.1.0 baseline remains supported; unreleased optional extensions are documented
in the [extensions guide](https://aho.icebreaker.top/extensions).

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

The additional stages are implemented on top of commit `5f7a0ff`:

| Stage | Unreleased extensions                                                                                    | Verification                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| E1    | Constructor character boundaries, global longest priority, tokenization, `/unicode`, replacement helpers | Independent naive oracle, all 1,585 Unicode 17 common/full folding mappings, original grapheme boundaries              |
| E2    | Stable-ID dynamic dictionaries; sync/async matching, token and replacement sessions; Node/Web adapters   | Every UTF-16 split, randomized chunking, snapshots, buffer limits, callback failures, cancellation and consumer demand |
| E3    | URL/limited Markdown filters, optimistic previews, explicit double-array backend                         | Cross-chunk syntax, EOF, preview convergence, backend parity, Chromium/Firefox/WebKit                                  |

The default constructor, direct CommonJS contract and independent match objects
remain stable. The default entry does not load Unicode folding data or platform
stream modules. `/text` remains the whole-input normalization/Turkic adapter;
`/unicode` adds default full-folding streams without implicit normalization.
`/fast` is opt-in, with construction and scan tradeoffs rather than a speed promise.
See [extension measurements](./benchmarks-extensions.md). Future work can reduce
cursor allocation and temporary construction memory. `longest-first` is deliberately
offline; streaming rejects it instead of retaining the full input.

Ordinary main pushes prepare a version PR. Merging a version commit whose subject
starts with `chore(release): version packages` publishes automatically. Manual
`prepare` and `publish` modes remain recovery options. Keep version PRs open when
publication is not requested. Publishable changes carry pnpm change intents and
pass repository, packed-consumer, declaration, browser and benchmark checks.
