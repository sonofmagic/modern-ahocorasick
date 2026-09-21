# Exact ASCII scanning: methodology and results

The reference is pre-ASCII v3 commit
`a78f4c8d6b2e511a74271409c30f66d3f8057197`. Public results, duplicate entries,
ordering, replacement behavior and original UTF-16 ranges must remain identical.
The [older v3/v2 measurements](./benchmarks.md) are preserved separately.

## Reproduction

```sh
pnpm benchmark
pnpm benchmark:external
```

Both suites default to five rounds in independent processes. Each process warms
up, calibrates batches toward 25 ms (capped at 8,192 iterations), and measures seven samples with explicit
GC before each sample. Process order is alternated or rotated. Results include
process medians, within-process MAD and between-process MAD; all raw round
medians are retained. Small early-exit timings are latency measurements, not
evidence of scanning the whole input at the reported nominal throughput.

The main suite preserves the previous ten corpora and adds tiny ASCII, CRLF,
ASCII followed by combining marks, Unicode-at-start, a long ASCII prefix and an
early ASCII hit before a Unicode tail. `BENCH_SCENARIOS`, `BENCH_OPERATIONS`,
`BENCH_ROUNDS` (1–9) and `BENCH_MEMORY=0` support targeted investigations. Formal
reports require at least five rounds. The external suite accepts `BENCH_ROUNDS`.
`pnpm benchmark:history` retains the original comparison runner; running it today
compares the current working tree against the older pinned implementations.

The main comparison verifies complete search results, replacement strings and
full iterator output for all three strategies, plus count and presence behavior.
Performance timing is not a flaky PR CI gate: a reproducible slowdown above 5%
requires investigation. The acceptance target is at least 20% improvement in
ASCII full-scan `count()` and absent-keyword `match()` queries, with 2× as a research goal.

## What is measured

Node, ICU, Unicode, OS, architecture, CPU, corpus hash, baseline source hash and
current built ESM hash identify each main result set. Retained dictionary memory
is a post-GC delta across ten retained instances. JavaScript heap and ArrayBuffer
backing stores are separate; dictionary totals add both. Result retention keeps
one complete output array. These measurements exclude native ICU allocations.

Separate cold processes measure dense-input count, selected iteration and
replacement at three text sizes. Their peak RSS includes runtime startup, input,
dictionary, native allocations and output; it is not operation-only memory.

The external comparison pins the MIT package `ahocorasick@1.0.2` in development
dependencies only. It and the per-pattern `indexOf` implementation are compared
only on printable ASCII, where all three have the same boundaries. All-match
overlaps and original input-index duplicates are preserved. Search timing
includes adaptation to independent range objects and canonical ordering. The
upstream native grouped `rawSearch` is also timed separately; its shared arrays
are a different output contract. Its count and presence adapters call grouped
search because the upstream API has neither a count nor an early-exit method.
Build/retained dictionary measurements include adapter setup. Small dictionaries
can favor native `indexOf`; these results do not establish a universal ranking.

## Design and correctness

Dictionary construction, `count()` and `match()` process at most two runs: a leading ASCII cursor that reuses one
private segment value, then an unwrapped native Unicode iterator. CRLF stays one
grapheme. The last unsettled ASCII cluster is included in the native suffix, so
combining marks and other Unicode continuations cannot create partial matches.
The result-producing search, iteration and replacement paths retain their original
native segmentation and original-text positions. Enabling a cursor there caused
reproducible regressions in dense output and mixed text, so it is not enabled. The cursor
is not public, and returned match objects remain independent.

Counting uses separate ASCII and native iteration sites to avoid a mixed-iterator
hot-loop penalty in V8. State carries across the boundary, and safe-integer
overflow checks remain in both loops.

No full-input ASCII preflight occurs. Early boolean hits can terminate before creating
the native suffix iterator. Result iteration preserves its existing lazy native
scan and bounded selection lookahead. A startup probe of at most eight UTF-16 units routes short mixed prefixes directly
to the native segmenter without allocating a cursor. The
fallback may create a suffix string; actual string storage and ICU allocation
remain engine-dependent. Dictionary structure and retained tables are unchanged.

The suite includes versioned Unicode GraphemeBreakTest data (15.0, 15.1, 16.0,
17.0), all 128 ASCII characters before Unicode joins, seeded random dictionaries,
and independent native-reference checks. Chromium, Firefox and WebKit run the
same 1,078 contract/differential cases against the built ESM. Browser conformance
does not imply that different Unicode versions agree on newly assigned characters.

## Measurements (2026-09-21)

Measured on Apple M4 Max, darwin/arm64, Node v24.18.0, ICU 78.3, Unicode 17.0.
The [full main results](./benchmarks-ascii.json) and [external results](./benchmarks-ascii-external.json) retain all process medians and noise estimates. Both use the same built implementation:

`4e49c65fba019fc808d22222281a987f0098c485b7ad53f7a98c4193eb0a5e3b`

### Construction, count and presence

Milliseconds are medians of five independent process medians. Presence is shown in microseconds; first-hit cases stop early.

| Scenario            | Build before ms | Build now ms | Count before ms | Count now ms | Count speedup | Presence before µs | Presence now µs |
| ------------------- | --------------: | -----------: | --------------: | -----------: | ------------: | -----------------: | --------------: |
| ascii-tiny          |           0.008 |        0.005 |        0.000711 |     0.000051 |        14.06× |              0.657 |           0.091 |
| crlf                |           0.011 |        0.006 |           1.689 |        0.589 |         2.87× |              5.744 |           0.093 |
| ascii-combining     |           0.010 |        0.007 |           2.234 |        2.189 |         1.02× |              4.943 |           4.952 |
| unicode-start       |           0.009 |        0.008 |           1.816 |        1.804 |         1.01× |              4.207 |           4.430 |
| ascii-prefix        |           0.007 |        0.007 |           2.787 |        0.813 |         3.43× |           2776.289 |         792.436 |
| ascii-early-unicode |           0.006 |        0.005 |           4.313 |        1.166 |         3.70× |              9.115 |           0.124 |
| ordinary            |           0.280 |        0.058 |           1.632 |        0.460 |         3.55× |              5.435 |           0.159 |
| sparse              |           0.774 |        0.158 |           2.213 |        0.693 |         3.19× |           2198.076 |         673.731 |
| unicode             |           0.143 |        0.144 |           0.739 |        0.727 |         1.02× |              3.894 |           4.022 |
| shared-prefix       |           2.275 |        0.974 |           1.095 |        0.395 |         2.77× |              5.378 |           0.344 |
| dense-suffix        |           0.308 |        0.071 |           0.047 |        0.016 |         2.96× |              0.963 |           0.105 |
| duplicates          |           0.261 |        0.033 |           0.819 |        0.270 |         3.03× |              3.481 |           0.103 |
| early-hit           |           0.006 |        0.005 |           6.753 |        1.938 |         3.48× |             16.189 |           0.127 |
| late-hit            |           0.006 |        0.005 |           6.664 |        1.900 |         3.51× |           6554.667 |        1889.063 |
| large-dictionary    |          21.507 |       12.232 |           1.868 |        0.843 |         2.22× |              6.237 |           0.217 |
| long-text           |           0.012 |        0.010 |          15.901 |       15.725 |         1.01× |             29.285 |          40.276 |

### Result-producing queries

Ratios are current / baseline latency; below 1 is faster. These methods retain native segmentation, so small differences are not an advertised optimization.

| Scenario            | Search all | Iterate all | Select first | Select longest | Replace first | Replace longest |
| ------------------- | ---------: | ----------: | -----------: | -------------: | ------------: | --------------: |
| ascii-tiny          |      0.991 |       0.985 |        1.013 |          1.016 |         1.022 |           0.994 |
| crlf                |      1.009 |       0.989 |        0.992 |          1.001 |         0.988 |           0.990 |
| ascii-combining     |      0.981 |       0.992 |        0.981 |          0.980 |         0.988 |           0.999 |
| unicode-start       |      1.006 |       1.003 |        0.994 |          0.998 |         0.995 |           0.995 |
| ascii-prefix        |      0.944 |       0.946 |        0.955 |          0.946 |         0.961 |           0.947 |
| ascii-early-unicode |      1.039 |       1.038 |        1.028 |          1.002 |         1.001 |           1.004 |
| ordinary            |      0.988 |       1.000 |        0.991 |          0.988 |         0.997 |           0.986 |
| sparse              |      1.012 |       1.006 |        1.011 |          1.034 |         1.006 |           1.015 |
| unicode             |      0.994 |       0.995 |        0.988 |          0.999 |         1.004 |           1.001 |
| shared-prefix       |      1.003 |       0.993 |        0.991 |          0.978 |         0.993 |           0.989 |
| dense-suffix        |      1.005 |       1.011 |        1.004 |          1.014 |         1.005 |           1.008 |
| duplicates          |      0.998 |       0.996 |        1.000 |          0.987 |         0.997 |           0.991 |
| early-hit           |      0.964 |       0.969 |        0.990 |          0.968 |         0.991 |           0.967 |
| late-hit            |      0.990 |       0.998 |        0.993 |          0.996 |         0.983 |           0.981 |
| large-dictionary    |      0.991 |       0.989 |        0.978 |          1.007 |         0.983 |           1.018 |
| long-text           |      0.997 |       1.005 |        0.977 |          0.996 |         0.985 |           0.995 |

### Retained memory

Dictionary totals include JavaScript heap plus ArrayBuffer backing stores. The buffer column is already included in the current dictionary total. Small post-GC differences are estimates, not structural memory savings. Result deltas include other runtime heap activity: a nonzero delta for an empty result is not the size of an empty array. No result-memory reduction is claimed.

| Scenario            | Dictionary before KiB | Dictionary now KiB | Now buffers KiB | Result delta before KiB | Result delta now KiB |
| ------------------- | --------------------: | -----------------: | --------------: | ----------------------: | -------------------: |
| ascii-tiny          |                 2.468 |              2.498 |           0.000 |                   0.320 |                0.383 |
| crlf                |                 3.864 |              3.871 |           0.000 |                1783.109 |             1783.945 |
| ascii-combining     |                 3.497 |              3.527 |           0.000 |                1176.375 |             1182.469 |
| unicode-start       |                 3.304 |              3.334 |           0.000 |                1055.031 |             1058.375 |
| ascii-prefix        |                 2.835 |              2.835 |           0.000 |                   0.258 |                0.258 |
| ascii-early-unicode |                 2.898 |              2.898 |           0.000 |                   0.195 |               14.594 |
| ordinary            |               107.909 |            105.553 |           1.582 |                 358.336 |              358.336 |
| sparse              |               259.250 |            260.699 |           3.941 |                   0.000 |               32.258 |
| unicode             |                86.241 |             82.905 |           1.180 |                 148.000 |              148.000 |
| shared-prefix       |              2477.277 |           2482.073 |          35.215 |                  72.570 |               35.781 |
| dense-suffix        |                47.511 |             47.964 |           0.754 |                6609.273 |             6609.273 |
| duplicates          |                19.257 |             20.260 |           0.781 |                4346.094 |             4346.094 |
| early-hit           |                 2.898 |              2.928 |           0.000 |                   0.258 |               29.570 |
| late-hit            |                 2.898 |              2.928 |           0.000 |                   0.258 |               29.102 |
| large-dictionary    |             16219.812 |          16223.374 |         234.410 |                 148.016 |              148.016 |
| long-text           |                 5.278 |              5.285 |           0.000 |                8856.945 |             8891.594 |

### Cold-process peak RSS

The 96-pattern dense-suffix dictionary and input sizes are identical in both variants. These one-process-per-cell high-water values include native/runtime memory and are not a precise scan-only delta.

| Text UTF-16 units | Operation                | Before MiB | Now MiB |
| ----------------: | ------------------------ | ---------: | ------: |
|             1,000 | count                    |      64.52 |   59.75 |
|             1,000 | iterate:leftmost-longest |      70.47 |   68.00 |
|             1,000 | replace:leftmost-longest |      70.92 |   67.44 |
|            10,000 | count                    |      65.64 |   61.67 |
|            10,000 | iterate:leftmost-longest |      71.11 |   70.50 |
|            10,000 | replace:leftmost-longest |      70.98 |   70.36 |
|           100,000 | count                    |      70.81 |   65.77 |
|           100,000 | iterate:leftmost-longest |      71.23 |   71.05 |
|           100,000 | replace:leftmost-longest |      71.30 |   70.42 |

The current built ESM is 11,065 bytes (3,213 bytes gzip). The packed consumer check contains nine files, no private scanner entrypoint, no test fixtures and no runtime dependencies.

### Printable-ASCII external comparison

Search values include independent range construction and canonical ordering. “Upstream groups” is its separate native output contract and must not be ranked as equivalent work. All times are milliseconds.

| Scenario         | Modern search | Upstream ranges | Upstream groups | indexOf ranges |
| ---------------- | ------------: | --------------: | --------------: | -------------: |
| ordinary         |         1.047 |           0.511 |           0.284 |          2.504 |
| sparse           |         1.897 |           0.368 |           0.370 |          0.348 |
| dense-suffix     |         4.030 |           3.320 |           0.007 |          5.831 |
| duplicates       |         3.079 |           1.617 |           0.324 |          6.552 |
| early-hit        |         6.855 |           1.562 |           1.547 |          0.059 |
| late-hit         |         6.808 |           1.544 |           1.540 |          0.060 |
| large-dictionary |         2.109 |           0.791 |           0.639 |        111.771 |

| Scenario         | Modern count ms | Upstream grouped-count ms | indexOf count ms |
| ---------------- | --------------: | ------------------------: | ---------------: |
| ordinary         |           0.247 |                     0.310 |            2.289 |
| sparse           |           0.502 |                     0.368 |            0.347 |
| dense-suffix     |           0.015 |                     0.011 |            2.021 |
| duplicates       |           0.260 |                     0.341 |            3.539 |
| early-hit        |           1.485 |                     1.535 |            0.059 |
| late-hit         |           1.615 |                     1.543 |            0.060 |
| large-dictionary |           0.788 |                     0.650 |          111.592 |

| Scenario         | Modern build ms | Upstream build ms | Modern dictionary KiB | Upstream dictionary KiB | indexOf dictionary KiB |
| ---------------- | --------------: | ----------------: | --------------------: | ----------------------: | ---------------------: |
| ordinary         |           0.060 |             0.048 |               105.298 |                  98.214 |                  1.973 |
| sparse           |           0.161 |             0.147 |               259.155 |                 243.910 |                  4.316 |
| dense-suffix     |           0.070 |             0.030 |                47.459 |                  71.130 |                  1.160 |
| duplicates       |           0.034 |             0.018 |                19.618 |                  10.330 |                  1.973 |
| early-hit        |           0.005 |          0.000555 |                 3.965 |                   2.138 |                  0.694 |
| late-hit         |           0.005 |          0.000551 |                 2.726 |                   2.138 |                  0.395 |
| large-dictionary |          11.421 |             7.817 |             16221.947 |                9437.641 |                 78.530 |

Upstream is still faster on several printable-ASCII cases, especially full search. Native `indexOf` is attractive for a very small literal dictionary; its per-pattern rescans become expensive in the 10,000-pattern corpus. Modern counting avoids output enumeration, but does not win every ASCII corpus. Unicode semantics and output contracts matter when choosing an implementation. These measurements do not establish industry-wide performance leadership.

### Acceptance review

The full run flagged the following >5% changes for targeted reproduction:

- `unicode-start` / `match`: +5.30%.
- `long-text` / `match`: +37.53%.

The [independent nine-round recheck](./benchmarks-ascii-recheck.json) used the identical built SHA and timed presence alone. Neither flagged slowdown reproduced. The original full-run flags above remain visible; short native early-exit queries show substantial allocator/timing variability. No Unicode early-exit speedup is claimed.

| Presence scenario | Recheck before µs | Recheck now µs | Recheck current / before | Combined 14-round ratio |
| ----------------- | ----------------: | -------------: | -----------------------: | ----------------------: |
| unicode-start     |             4.576 |          4.290 |                    0.938 |                   1.002 |
| long-text         |            32.821 |         29.371 |                    0.895 |                   0.996 |
| ascii-combining   |             5.070 |          4.802 |                    0.947 |                   0.954 |
| unicode           |             3.806 |          3.858 |                    1.014 |                   1.023 |

The combined column is a supplementary median over all 14 process medians per variant, including the initial full run. The full suite and isolated recheck have different warmup histories; this column does not replace either raw dataset. No reproducible >5% slowdown remains in these measurements. The full-run ASCII targets pass: ordinary count is 3.55× faster and sparse absent-keyword presence is 3.26× faster. The 10,000-pattern build is 1.76× faster, while retained dictionary memory remains about 15.8 MiB. The additional cursor code and mixed-prefix startup probe are the primary implementation costs.

All reference result hashes, full iterator results, count totals and replacement strings agree. Correctness checks passed: 123 unit tests (including 766 Unicode 17.0 conformance lines, 1,024 ASCII/Unicode joins and seeded differential cases), 23 browser E2E tests across Chromium/Firefox/WebKit, declaration tests and packed ESM/CommonJS consumers. Performance was measured only on this Node/macOS host; browser checks establish correctness, not cross-engine speed claims.

## Review sequence

1. Correctness and measurement: official Unicode fixtures, independent oracle, historical/current/external benchmark runners and the pinned development-only comparison package.
2. ASCII implementation: private cursor, conservative fallback, construction/count/presence integration, laziness/overflow checks and the package change intent.
3. Browser and delivery evidence: three-engine contracts, packed-consumer assertions, bilingual documentation, roadmap and the raw performance reports.
