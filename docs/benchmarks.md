# Matching performance and memory

Measured on Apple M4 Max, darwin/arm64, Node v24.18.0 (2026-09-21). The current column is this working-tree implementation; pre-optimization v3 is Git commit `4f6dd786602014bd8e6f46c324ece54ba97a1b50`. The historical v2 comparison remains pinned to `a4181b054b2d2c85e83fe4201b1417c879db2f30`.

## Methodology

Run `pnpm benchmark`. Each scenario compares v2 once and the two v3 variants in 3 independent process pairs, alternating execution order across rounds and scenarios. Each process warms up and calibrates batches, then takes 7 timed samples with explicit GC before each batch. Tables report the median of process medians in milliseconds. The [full results](./benchmarks-v3.json) include UTF-16 units/second, within-process MAD, between-process MAD and every process median.

The baseline equivalents for new APIs are `search(text).length` for counting and `search(text, { strategy }).values()` for selected iteration. Existing users could already count `iterate()` results without retaining a result array, but still paid O(z) enumeration; count memory comparisons here specifically use `search(text).length`. All-match iteration uses the existing iterator. Both variants must produce identical occurrence totals, hashes of complete result objects for all three strategies, and replacement strings. Iterator result totals are checked separately; randomized unit tests also compare full iterator output against an independent naive matcher.

The corpus includes ordinary ASCII, absent keywords, Chinese and complex emoji, shared prefixes, nested suffixes, duplicate entries, first/last-position hits, 10,000 keywords, and long mixed Unicode text. `BENCH_SCENARIOS=unicode,long-text` selects a subset, `BENCH_ROUNDS=5` repeats more process pairs, `BENCH_OPERATIONS=build,match` focuses on selected metrics, and `BENCH_MEMORY=0` skips the separate memory experiments for targeted timing investigations.

Retained JavaScript heap is measured after GC: dictionary deltas average ten retained dictionaries; result deltas retain one full search result. ArrayBuffer backing-store deltas are reported separately and included in dictionary totals; native ICU allocations and peak memory are not included. Separate cold processes report the OS high-water RSS for count, selected iteration and replacement at increasing dense-input sizes. Peak RSS includes process startup, runtime, input, dictionary and native memory; it is not a precise operation-only heap delta.

A median slowdown above 5% is reported for investigation. Reproduce it across process rounds before treating it as a regression; noisy timings are not a hard CI gate. Boolean-query throughput uses total input length even when the query exits early, so use its latency rather than interpreting that number as fully scanned throughput.

## Current v3 comparison

### Full search, count and non-overlapping search

| Scenario         | Search before ms | Search now ms | Count before ms | Count now ms | Longest before ms | Longest now ms |
| ---------------- | ---------------: | ------------: | --------------: | -----------: | ----------------: | -------------: |
| ordinary         |            2.407 |         2.081 |           2.281 |        1.645 |             2.496 |          1.940 |
| sparse           |            2.834 |         2.197 |           2.822 |        2.244 |             2.792 |          2.201 |
| unicode          |            0.989 |         0.888 |           0.983 |        0.729 |             1.024 |          0.909 |
| shared-prefix    |            1.541 |         1.243 |           1.525 |        1.106 |             1.557 |          1.298 |
| dense-suffix     |            4.349 |         4.088 |           4.208 |        0.048 |            10.142 |          1.192 |
| duplicates       |            3.342 |         3.112 |           3.322 |        0.837 |             4.092 |          1.535 |
| early-hit        |            8.415 |         7.114 |           8.856 |        6.830 |             8.664 |          7.213 |
| late-hit         |            8.374 |         7.081 |           8.376 |        6.695 |             8.346 |          7.170 |
| large-dictionary |            2.571 |         2.163 |           2.534 |        1.871 |             2.656 |          2.274 |
| long-text        |           27.804 |        24.917 |          25.993 |       15.751 |            28.318 |         24.038 |

### Iteration, replacement and presence queries

Ratios are current / previous latency; below 1 is faster. Both replacement strategies use literal `X`.

| Scenario         | Boolean | Iterate all | Iterate first | Iterate longest | Replace first | Replace longest |
| ---------------- | ------: | ----------: | ------------: | --------------: | ------------: | --------------: |
| ordinary         |   0.887 |       0.867 |         0.787 |           0.766 |         0.814 |           0.783 |
| sparse           |   0.781 |       0.778 |         0.793 |           0.774 |         0.790 |           0.789 |
| unicode          |   0.919 |       0.903 |         0.891 |           0.893 |         0.909 |           0.897 |
| shared-prefix    |   0.918 |       0.809 |         0.825 |           0.831 |         0.831 |           0.835 |
| dense-suffix     |   0.815 |       0.949 |         0.113 |           0.119 |         0.112 |           0.117 |
| duplicates       |   0.914 |       0.954 |         0.373 |           0.366 |         0.385 |           0.378 |
| early-hit        |   0.919 |       0.799 |         0.854 |           0.836 |         0.830 |           0.831 |
| late-hit         |   0.798 |       0.859 |         0.865 |           0.862 |         0.859 |           0.854 |
| large-dictionary |   0.979 |       0.847 |         0.830 |           0.840 |         0.858 |           0.836 |
| long-text        |   1.260 |       0.911 |         0.780 |           0.773 |         0.852 |           0.878 |

### Construction and retained dictionary heap

| Scenario         | Build before ms | Build now ms | Dictionary before KiB | Dictionary now KiB | Now buffers KiB |
| ---------------- | --------------: | -----------: | --------------------: | -----------------: | --------------: |
| ordinary         |           0.299 |        0.289 |               105.066 |            107.917 |           1.582 |
| sparse           |           0.832 |        0.801 |               254.895 |            259.250 |           3.941 |
| unicode          |           0.146 |        0.150 |                81.312 |             82.905 |           1.180 |
| shared-prefix    |           2.328 |        2.338 |              2441.648 |           2477.277 |          35.215 |
| dense-suffix     |           0.311 |        0.320 |                48.904 |             52.547 |           0.754 |
| duplicates       |           0.260 |        0.273 |                17.984 |             19.257 |           0.781 |
| early-hit        |           0.006 |        0.006 |                 2.413 |              2.898 |           0.000 |
| late-hit         |           0.006 |        0.006 |                 2.413 |              2.898 |           0.000 |
| large-dictionary |          21.928 |       21.482 |             15984.986 |          16219.812 |         234.410 |
| long-text        |           0.012 |        0.012 |                 4.763 |              5.278 |           0.000 |

Dictionary totals above include JavaScript heap plus ArrayBuffer backing stores; the final column is the buffer portion already included in the current total. Private Uint32 arrays store aggregate state counts and per-pattern grapheme lengths without enlarging every trie node. Each state count is bounded by the input array length, while the accumulated text count is checked against the safe-integer limit. Result objects and public ownership semantics remain unchanged; this is not a blanket dictionary-memory optimization.

### Dense-input process peak RSS

The dictionary contains 96 nested patterns. Text sizes below contain 91,440; 955,440; and 9,595,440 occurrences respectively. Memory runs are separate from timing runs.

| Text UTF-16 units | Operation                | Before MiB | Now MiB |
| ----------------: | ------------------------ | ---------: | ------: |
|             1,000 | count                    |      80.95 |   60.31 |
|             1,000 | iterate:leftmost-longest |      86.45 |   67.98 |
|             1,000 | replace:leftmost-longest |      86.47 |   67.91 |
|            10,000 | count                    |     205.61 |   62.48 |
|            10,000 | iterate:leftmost-longest |     213.55 |   70.66 |
|            10,000 | replace:leftmost-longest |     213.06 |   70.94 |
|           100,000 | count                    |     972.69 |   70.03 |
|           100,000 | iterate:leftmost-longest |    1046.19 |   71.22 |
|           100,000 | replace:leftmost-longest |    1046.22 |   71.17 |

The selected iterator uses three numeric ring arrays indexed by start grapheme, with at most L slots each for longest pattern length L. It allocates only selected match objects. This bounds candidate state independently of cumulative occurrences; the input still remains alive. Replacement additionally retains output pieces. These peak-RSS measurements illustrate the difference but do not prove a universal RSS cap.

### Regression review

Every full-suite build median stayed within the 5% budget; all ten full-search, count and non-overlapping search scenarios improved. The only full-suite flag was the long-text presence query: 0.03105 ms before versus 0.03910 ms now (+26%). This is an early-exit query, so these latencies do not represent scanning the entire long input.

A separate seven-pair run on the identical implementation measured 0.02986 ms before versus 0.02947 ms now (−1.3%). Pooling all ten independent process medians gives 0.03099 ms before versus 0.03135 ms now (+1.2%). The >5% slowdown did not reproduce consistently; do not treat either the initial slowdown or the small recheck speedup as a stable microsecond-level effect. Both the [full suite](./benchmarks-v3.json) and [targeted recheck](./benchmarks-v3-recheck.json) remain available, including noise estimates and matching implementation SHA-256 hashes.

Reproduce the follow-up with `BENCH_ROUNDS=7 BENCH_SCENARIOS=long-text BENCH_OPERATIONS=match BENCH_MEMORY=0 pnpm benchmark`. These measurements apply to this machine/runtime and corpus; they do not guarantee the same results on every JavaScript engine or workload. A reproducible slowdown above 5% should block merging until resolved; a single noisy timing flag is not an automatic CI failure.

### Reading the historical comparison

The following snapshot predates counting and bounded candidate selection. Its comments about collecting/sorting non-overlapping matches refer only to that older v3 implementation. v2 returns grouped matches with shared keyword arrays, so its full-search output allocation is not equivalent to either v3 version.

## Historical v2 / pre-optimization v3 snapshot

Measured on Apple M4 Max, darwin/arm64, Node v24.18.0. Five timed samples after warmup; medians in milliseconds. Each scenario/version runs in a separate process.

The original benchmark read v2 from Git commit `a4181b054b2d2c85e83fe4201b1417c879db2f30` and compared it with pre-optimization v3, checking occurrence totals. The current command runs the expanded suite described above.

### Timings

| Scenario      | Version | Build ms | Reused search ms | Boolean match ms | Iterate ms |
| ------------- | ------- | -------: | ---------------: | ---------------: | ---------: |
| ordinary      | v2      |    1.144 |            1.911 |            0.026 |          — |
| ordinary      | v3      |    0.301 |            2.747 |            0.012 |      2.376 |
| sparse        | v2      |    2.985 |            2.349 |            2.262 |          — |
| sparse        | v3      |    0.859 |            3.194 |            3.306 |      3.345 |
| unicode       | v2      |    0.603 |            1.128 |            0.029 |          — |
| unicode       | v3      |    0.198 |            1.197 |            0.012 |      1.060 |
| shared-prefix | v2      |    7.628 |            1.347 |            0.027 |          — |
| shared-prefix | v3      |    3.981 |            1.627 |            0.014 |      1.575 |
| dense-suffix  | v2      |    0.874 |            0.140 |            0.017 |          — |
| dense-suffix  | v3      |    0.468 |            6.390 |            0.009 |      3.741 |

### Retained JavaScript heap

Dictionary heap is a post-GC delta averaged across ten retained dictionaries. Result heap is a post-GC delta with one search result retained. These estimates are noisy and exclude native ICU memory; they are not peak memory or process RSS.

| Scenario      | Occurrences | v2 dictionary KiB | v3 dictionary KiB | v2 results KiB | v3 results KiB |
| ------------- | ----------: | ----------------: | ----------------: | -------------: | -------------: |
| ordinary      |        4900 |              56.1 |             105.4 |          359.9 |          344.9 |
| sparse        |           0 |             141.2 |             255.1 |            0.0 |            0.0 |
| unicode       |        2000 |              39.5 |              84.2 |          148.3 |          142.0 |
| shared-prefix |        1000 |            1078.0 |            2440.4 |           72.9 |           91.5 |
| dense-suffix  |       91440 |              64.3 |              46.5 |           73.0 |         6712.4 |

### Interpretation

- Construction was faster in these five samples. Reused full searches were generally slower; Map transitions, generator traversal and independent match objects have costs.
- The dense-suffix case has 96 nested patterns and 91,440 occurrences in 1,000 characters. v2 returns only 1,000 groups and references precomputed keyword arrays. v3 materializes all 91,440 independent range objects. Its search time and result memory therefore measure substantially more output work.
- Output links reduce retained dictionary memory in the dense-suffix case. Maps and richer nodes consume more dictionary memory in the other scenarios; this is not a blanket memory optimization.
- Iteration lets callers process results without retaining the entire result array. It still emits each occurrence and keeps the input and dictionary alive. It does not make high-output scans free.
- Boolean matching stops early when a hit exists. Tiny timings are sensitive to timer resolution and should not be interpreted as stable speedup ratios.
- Non-overlapping selection and replacement collect and sort all candidates. They are not low-memory streaming operations.
- This is one machine and a deterministic synthetic corpus, not a universal performance claim or a CI timing threshold.
