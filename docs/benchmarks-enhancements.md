# Matcher enhancement measurements

Measured on 2026-09-22 using Node 24.11.1, ICU 77.1 / Unicode 16.0, Apple M4 Pro.
The optional case-folding adapter independently uses Unicode 17 data. Baseline:
`c15a10e8f7ed44143edc0e74202064cb9c7b81c7` (published v3 semantics).

The compact representation substantially reduces retained dictionary memory and
improves dense selected matching. It adds construction work and can slow smaller
or shared-prefix scans. These are workload-specific tradeoffs, not a blanket
speed claim. All original result digests and per-pattern frequencies agree.

## Dictionary scale

Each cell is baseline → current. Retained memory includes JS heap **and** numeric
ArrayBuffer storage, excluding pre-existing input strings. Build peak RSS includes
startup, input, the temporary Map builder and the compact result together. One
cold process per size/variant establishes feasibility; these build times are not
multi-round performance medians. Count time averages 100 warmed scans of a
1,000-hit corpus. The temporary builder remains a future memory optimization.

| Patterns  | Retained MiB   | Build ms        | Peak RSS MiB | Count ms      |
| --------- | -------------- | --------------- | ------------ | ------------- |
| 10,000    | 15.9 → 2.1     | 26.3 → 31.8     | 99 → 112     | 0.360 → 0.249 |
| 100,000   | 157.7 → 19.5   | 150.8 → 171.3   | 383 → 407    | 0.485 → 0.279 |
| 1,000,000 | 1583.2 → 194.4 | 1488.1 → 1764.1 | 2241 → 2306  | 0.593 → 0.308 |

At one million patterns, retained memory drops by about 88%, while build peak RSS
remains above 2 GiB. Do not size a worker's memory limit using retained memory alone.

## Query and loading latency

Medians of three independent, counterbalanced processes per variant. Each process
warms up and takes seven batched samples; raw data includes within- and between-round
MAD. The full report covers 16 scenarios and the whole-text query strategies.
Times below are milliseconds; negative changes are lower latency.

`countByPattern` compares state-visit aggregation against tallying the baseline
iterator. `load` compares validated restoration from an already serialized string
against constructing the baseline dictionary from patterns; saving/reading the
string is excluded. For the 10k dictionary, restoration is faster than either old
or new construction. For tiny dictionaries, validation and JSON parsing cost more
than rebuilding. Throughput fields are workload labels; use latency when comparing
loading or early-exit presence queries.

| Scenario         | Operation                  | Baseline ms | Current ms | Change |
| ---------------- | -------------------------- | ----------- | ---------- | ------ |
| dense-suffix     | `countByPattern`           | 3.644       | 0.017      | -99.5% |
| dense-suffix     | `iterate:leftmost-first`   | 1.087       | 0.088      | -91.9% |
| dense-suffix     | `iterate:leftmost-longest` | 1.139       | 0.060      | -94.7% |
| duplicates       | `countByPattern`           | 2.681       | 0.304      | -88.7% |
| duplicates       | `iterate:leftmost-longest` | 1.460       | 1.057      | -27.6% |
| ordinary         | `count`                    | 0.375       | 0.478      | +27.5% |
| shared-prefix    | `iterate:leftmost-longest` | 1.212       | 1.406      | +16.1% |
| large-dictionary | `count`                    | 0.664       | 0.490      | -26.2% |
| large-dictionary | `build`                    | 11.093      | 13.888     | +25.2% |
| large-dictionary | `load`                     | 11.169      | 7.008      | -37.3% |

The full survey showed a tiny two-character count rising from roughly 0.047 µs
to 0.172 µs, but the targeted run did **not** reproduce that regression (current
was 0.88× baseline). Do not treat that sub-microsecond result as a stable penalty.
The targeted run did reproduce ordinary-count slowdown (~24%), duplicate-count
slowdown (~16%), shared-prefix selected slowdown (~14%), and construction overhead.
The 10k count improvement remained ~26%. Compact lookups intern each grapheme and binary-search non-root transitions; this trades
Map lookup speed on small/shared-prefix dictionaries for smaller retained tables.
Packing adds a construction pass, and validation makes small dictionary loading
more expensive. Dense selection gains come from avoiding duplicate terminals,
pruning outputs covered by the earliest candidate and settling an unbeatable first
pattern early. Per-pattern aggregation avoids enumerating the 91,440 dense hits.

The raw survey lists every >5% regression, including construction and loading;
these are not hidden by the selected table. A separate targeted recheck covers
tiny, ordinary, sparse, shared-prefix, duplicate and 10k dictionary workloads.

## Reproduction and artifacts

Run these sequentially without tests or other benchmarks competing for the machine:

```sh
BENCH_BASELINE_REF=c15a10e8f7ed44143edc0e74202064cb9c7b81c7 BENCH_ROUNDS=3 BENCH_MEMORY=0 pnpm benchmark
node --expose-gc scripts/benchmark-scale.mjs
BENCH_BASELINE_REF=c15a10e8f7ed44143edc0e74202064cb9c7b81c7 BENCH_ROUNDS=3 BENCH_MEMORY=0 BENCH_SCENARIOS=ascii-tiny,ordinary,sparse,shared-prefix,duplicates,large-dictionary BENCH_OPERATIONS=build,count,search,iterate:leftmost-first,iterate:leftmost-longest pnpm benchmark
```

- [Full query survey](./benchmarks-enhancements.json)
- [10k/100k/1m scale observations](./benchmarks-enhancements-scale.json)
- [Targeted regression recheck](./benchmarks-enhancements-recheck.json)

The scripts preserve runtime, baseline, corpus and implementation fingerprints.
These measurements concern the exact core paths; opt-in word segmentation and
mapped text conversions have additional documented costs. The core ESM bundle is
about 29.5 kB (7.4 kB gzip); the independently bundled optional text adapter is
about 52.6 kB (16.5 kB gzip), including its own core code and folding table. The
folding table is absent from the default entry, verified in the packed test.
