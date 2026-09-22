# Optional extensions: correctness and performance

Measured 2026-09-22 on Apple M4 Max, macOS arm64, Node 24.18.0, ICU 78.3,
Unicode 17.0. Baseline: `5f7a0ff` (released v3.1.0), fetched before implementation.
This is an unreleased feature expansion, not a claim of a universal speedup.

本次扩展基于最新 v3.1.0，实现边界、全局最长选择、分词、完整折叠、动态词典、
流式处理及可选双数组后端。默认后端保持紧凑表。实测双数组的搜索和构建较慢、
保留堆较大，数组缓冲较小；因此继续作为显式可选入口。默认后端的主要整段操作
在复测中接近基线，但极短的提前命中有额外耗时，详见下表。没有发布 npm 包。

## Reproduction and raw evidence

```sh
BENCH_BASELINE_REF=5f7a0ff BENCH_ROUNDS=3 pnpm benchmark
BENCH_ROUNDS=3 pnpm benchmark:external
BENCH_BASELINE_REF=5f7a0ff BENCH_ROUNDS=5 BENCH_MEMORY=0 BENCH_SCENARIOS=unicode-start,ordinary,dense-suffix,early-hit BENCH_OPERATIONS=build,load,search,match,count pnpm benchmark
```

- [Complete baseline run](./benchmarks-extensions.json): 16 scenarios, three
  counterbalanced process rounds, seven timed samples per operation, 18 separate
  memory processes. Search/selection/replacement/frequency digests agree.
- [Focused recheck](./benchmarks-extensions-recheck.json): five process rounds on
  the largest observed query changes. Preserve the original run, including its flags.
- [External comparison](./benchmarks-extensions-external.json): seven printable
  ASCII scenarios, seven variants, three process rounds. Each normalized result,
  duplicate occurrence count and presence answer is checked before timing.

Each artifact records runtime, corpus/build digests, medians and dispersion. Build
hashes include optional entries: adapter cancellation and replacement-helper cleanup
between runs changed those entries, without changing the measured compact/DAT scan
chunks. The baseline bundle is built from its Git source graph, not current source.

## Default backend against latest main

The five-round recheck below reports milliseconds and current/baseline changes.
Construction/restoration add profile setup; default counting/presence still use their
existing fast loops. Ordinary input differs between the core and external corpora,
so do not compare their absolute search times directly.

| Scenario      | Search baseline → current (ms) | Change | Count baseline → current (ms) | Change |
| ------------- | ------------------------------ | ------ | ----------------------------- | ------ |
| unicode-start | 2.3954 → 2.4148                | +0.8%  | 1.7782 → 1.7689               | -0.5%  |
| ordinary      | 1.9801 → 1.9970                | +0.9%  | 0.4928 → 0.5155               | +4.6%  |
| dense-suffix  | 2.3698 → 2.4225                | +2.2%  | 0.0130 → 0.0132               | +1.0%  |
| early-hit     | 7.1780 → 7.4683                | +4.0%  | 2.1926 → 2.1533               | -1.8%  |

The first run's Unicode-start search (+10.5%) and dense-suffix count (+8.6%) did
not reproduce at that magnitude. Early-hit search changed from +7.5% to +4.0%.
The scan loops themselves are unchanged; entry dispatch and module layout changed.
These results justify retaining the exact paths, not claiming zero overhead.

The short presence probes need separate treatment: ordinary `match()` reproduced
0.176 → 0.297 **microseconds** (+68.6%), and early-hit 0.271 → 0.326 microseconds
(+20.3%). Their absolute increases are about 0.121 and 0.055 microseconds. The
ordinary current within-round MAD is 0.102 microseconds, and dense-suffix presence
swung from +21.0% to −50.7%. Profile dispatch/JIT effects and timer batching matter
at this scale. Keep the observed costs visible; do not derive full-input throughput
from a boolean query that exits near the start.

Retained default dictionary storage, from the full run:

| Dictionary       | Baseline JS heap (bytes) | Current JS heap (bytes) | ArrayBuffer bytes, both |
| ---------------- | ------------------------ | ----------------------- | ----------------------- |
| ordinary         | 14258                    | 14642                   | 8156                    |
| dense-suffix     | 8224                     | 9258                    | 3868                    |
| large-dictionary | 496493                   | 497505                  | 1680360                 |

Additional retained heap is approximately 0.4–1.0 KiB in these cases; compact array
storage is unchanged. For the 100,000-unit dense-suffix cold processes, current peak
RSS was 66.3 MiB (count), 71.1 MiB (selected iteration), 71.9 MiB (replacement),
versus 66.7, 72.0 and 71.3 MiB. These include Node, ICU, dictionary and input; they
are not operation-only heap deltas or a guarantee for arbitrary dictionaries.

## Double-array and external comparison

The 10,000-pattern ASCII corpus is normalized to independent original UTF-16
ranges, including one occurrence per duplicate input index. All matches overlap
by default. Times include adapters where needed; raw native search is recorded
separately in JSON and has a different output contract.

| Variant                             | Build (ms) | Search (ms) | First result (ms) | Retained heap (MiB) | ArrayBuffers (MiB) | Process peak RSS (MiB) |
| ----------------------------------- | ---------- | ----------- | ----------------- | ------------------- | ------------------ | ---------------------- |
| `modern`                            | 13.611     | 2.005       | 0.00689           | 0.474               | 1.603              | 955.3                  |
| `modern-fast`                       | 28.227     | 4.336       | 0.00722           | 3.520               | 1.183              | 1387.5                 |
| `@monyone/aho-corasick@1.5.10`      | 11.618     | 1.670       | 1.68379           | 16.777              | 0.000              | 388.2                  |
| `@monyone/aho-corasick/fast@1.5.10` | 1350.826   | 0.739       | 0.74087           | 6.411               | 0.000              | 349.4                  |
| `@tanishiking/aho-corasick@0.0.1`   | 5.427      | 2.959       | 2.68302           | 17.314              | 0.000              | 311.5                  |
| `ahocorasick@1.0.2`                 | 8.428      | 0.807       | 0.80902           | 9.216               | 0.000              | 297.9                  |
| `indexOf`                           | 0.001      | 111.761     | 111.65829         | 0.077               | 0.000              | 133.6                  |

For the ordinary 200-pattern corpus, modern default/DAT construction was
0.075/0.102 ms and search 0.954/2.266 ms. DAT currently uses the common mapped
cursor and retains terminal lists. It is slower and uses more JavaScript heap in
these measurements, although its numeric buffers are smaller. Keep it opt-in;
its name is not a recommendation to switch the default backend.

First-result timing uses a lazy iterator only for the two modern variants. The
other adapters materialize a result before reading its first item. Likewise,
Monyone/Tanishiking `count` uses normalized search, Tanishiking presence uses full
search, and the older `ahocorasick` uses grouped search. These operations have
separate contracts and must not become a single performance ranking. One-keyword
`indexOf` has a very different tradeoff from rescanning for 10,000 keywords.

The external peak RSS is the high-water mark of **the entire warmed benchmark
process**, including repeated builds, first-result probes, normalization and result
allocation. Some modern runs reach 0.7–1.8 GiB during batching. This cannot be read
as the memory requirement of one dictionary or one query; the separately measured
retained heap, buffers and cold query processes answer different questions. No
claim of low peak construction memory is made. A 1,048,576-unit stream tail cap
limits undecided original text only, not total runtime or result memory.

Unicode folding, grapheme-boundary behavior, metadata, dynamic snapshots and
protected syntax are validated independently rather than ranked against packages
with different semantics. `/unicode` uses the existing licensed Unicode 17.0 table;
`queue-microtask` is neither imported nor part of this feature set.

## Delivery verification

- `pnpm exec repo doctor --strict`: 13 checks pass.
- `pnpm exec repo check --full`: lint, types, 190 tests and builds pass.
- `pnpm tsd` and `pnpm test:package`: default constructor, all public ESM/CJS
  entries, browser/Node declarations and private-file boundaries pass.
- `pnpm test:docs:e2e`: 26 checks across desktop/mobile and three browser engines.
- Three minor pnpm change intents describe matching, dynamic/streaming, and optional
  filters/backends separately. No publication or deployment was performed.
