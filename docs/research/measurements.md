# Range/statistics and cross-language measurements

Baseline: `d50fcbfad26cc2a9b74c7d9f4379404a02b9df72`. [中文](measurements.zh.md). No runtime prefilter was adopted.

## Reproduce

```sh
pnpm build
BENCH_BASELINE_REF=d50fcbfad26cc2a9b74c7d9f4379404a02b9df72 BENCH_ROUNDS=3 BENCH_OPERATIONS=build,search,match,count,countByPattern,iterate:leftmost-longest pnpm benchmark
node --expose-gc scripts/research/experiments.mjs
python3 scripts/research/cross-language.py /tmp/ac-survey --prepare
python3 scripts/research/cross-language.py /tmp/ac-survey --run
```

Run measurements serially on an idle machine. The Python preparation downloads the four pinned source revisions from `sources.json`, uses memchr 2.8.3 with Rust, compiles Go/Java/Rust, and installs pyahocorasick 2.3.1 into an isolated temporary venv. It adds no project/runtime dependencies. Script options `EXPERIMENT_SCENARIOS`, `EXPERIMENT_VARIANTS`, `EXPERIMENT_ROUNDS` support targeted retests. All scripts and raw data are retained here/in `scripts/research/`.

## Cross-language execution (not a global ranking)

Three counterbalanced independent processes per implementation/scenario. ASCII, 200 unique patterns, exact all-overlap occurrence enumeration: every run checks its count and sum of original start/end/pattern ID against independent naive substring enumeration. Rust iterators, Python iterators, Go/Java callbacks and JS iterators consume hits without retaining a full result array. Byte, codepoint, UTF-16 and grapheme positions coincide **only in these corpora**. The JS scanner still pays grapheme segmentation cost; these numbers do not compare equivalent Unicode services.

Build is the first constructor call, excluding process/import startup but including lazy runtime initialization. Query and first-result paths are warmed separately (20 scans, Java 100). First-result measurements near timer resolution are diagnostic, not evidence of sub-microsecond precision. Peak RSS is whole-process high-water, including runtime/JIT/ICU/input. Retained JS heap, Go heap delta, JS array buffers and library-reported automaton bytes are separate raw fields. Unavailable fields are null, never inferred as zero or equated to one another. Native OS/JIT allocation is not JS heap.

| Scenario | Implementation       | Build ms | Enumerate ms | First ms | Process peak MiB |
| -------- | -------------------- | -------: | -----------: | -------: | ---------------: |
| ordinary | rust                 |   0.1059 |       0.0656 | 0.000042 |             1.91 |
| ordinary | daachorse            |   0.0495 |       0.0252 | 0.000208 |             1.92 |
| ordinary | go-bobusumisu        |   0.5088 |       0.0696 | 0.000042 |             5.95 |
| ordinary | java-robert-bor      |   5.1945 |       0.2577 | 0.001916 |            62.89 |
| ordinary | python-pyahocorasick |   0.0360 |       0.4251 | 0.006958 |            15.28 |
| ordinary | modern               |   7.9428 |       1.9888 | 0.005667 |            62.72 |
| sparse   | rust                 |   0.1003 |       0.0145 | 0.014500 |             1.92 |
| sparse   | daachorse            |   0.0498 |       0.0288 | 0.028708 |             1.94 |
| sparse   | go-bobusumisu        |   0.4824 |       0.0971 | 0.097250 |             5.70 |
| sparse   | java-robert-bor      |   5.0670 |       0.1329 | 0.131667 |            47.66 |
| sparse   | python-pyahocorasick |   0.0366 |       0.0868 | 0.085625 |            15.52 |
| sparse   | modern               |   7.6602 |       2.7528 | 2.855542 |            66.12 |
| late     | rust                 |   0.1068 |       0.0008 | 0.000666 |             1.94 |
| late     | daachorse            |   0.0488 |       0.0351 | 0.035208 |             1.95 |
| late     | go-bobusumisu        |   0.5397 |       0.0461 | 0.045666 |             5.88 |
| late     | java-robert-bor      |   5.9294 |       0.1381 | 0.123542 |            48.03 |
| late     | python-pyahocorasick |   0.0359 |       0.1057 | 0.101958 |            15.66 |
| late     | modern               |   7.5330 |       3.5913 | 3.575291 |            68.67 |

[Raw cross-language results](cross-language-results.json) contain toolchain versions, platform, pins, input/implementation hashes, memory fields and every round. [Initial results](cross-language-initial.json) preserve the diagnostic run where the first-result API was not warmed independently; Java firstMatch therefore included cold code-path costs. The corrected run above warms both paths. Unexecuted surveyed implementations remain source reviews. Cloudflare Go's unique-ID API is excluded from this all-occurrence table rather than silently changing result semantics.

## Prefilter experiment and decision

[Raw experiment](layout-prefilter-results.json), [gate calculation](prefilter-decision.json). Two conservative exact-matcher prototypes scan for dictionary prefix code units with a precompiled regex: first-unit and up-to-two-unit alternatives. If no prefix exists, return empty; otherwise run the unchanged full public matcher. A returned regex location is never a match. This is a limited whole-input rejection experiment inspired by Rust's necessary-candidate contract and daachorse's 2-grams; it is **not** a port of SIMD/Shift-Or SOG or an incremental skip scanner. Filter build cost is measured separately.

The pair filter cuts the candidate-free sparse search from about 4.59 ms to 0.0156 ms, but tiny presence checks regress in every round (4.33–4.47×). The first-unit prototype has no ≥10% gain repeated in every round and repeatedly regresses sparse presence (1.06–1.40×). Dense presence also regresses. Both fail the agreed gate, so neither enters runtime. This does not rule out later adaptive/incremental prefilters; those need their own proof, workloads and gate.

## Implementation and validation

Original UTF-16 range/anchor filters run before selection and retain full-text boundary context. They are semantic filters, not a guarantee of scanning only the span. Statistics are cached frozen scalars; typed-array bytes are not total heap. The exact default path caches immutable dispatch and avoids option work for absent options. Validated predicates are reused internally by counting and selection, avoiding repeat whole-word segmentation. DAT terminals are contiguous offsets and IDs; temporary placement storage is isolated from scanner closures.

Independent naive-reference tests cover ranges, anchoring, duplicates, all selections, folded expansions, normalization, original offsets, replacement and token reconstruction. Invalid boundaries include surrogate pairs, marks, ZWJ families, flags and CRLF; streams reject offline keys, including platform adapters. Existing lifecycle/snapshot/cancellation tests remain. Doctor, full checks, tsd, packed ESM/CJS/browser and Node declarations, and 26 docs/browser E2E tests pass; no version or publication operation was performed.

## Final layout measurements

10,000 ASCII patterns, three independent counterbalanced rounds, matching multi-entry builds:

| Backend        | Build ms | Search ms | First ms | Retained JS heap MiB | Array buffers MiB | Batch-process peak MiB |
| -------------- | -------: | --------: | -------: | -------------------: | ----------------: | ---------------------: |
| before-compact |   14.351 |     1.993 | 0.006245 |                0.474 |             1.603 |                  996.1 |
| compact        |   14.092 |     2.000 | 0.006853 |                0.474 |             1.603 |                  936.7 |
| before-fast    |   29.528 |     4.358 | 0.007203 |                3.520 |             1.183 |                 1336.1 |
| fast           |   31.888 |     3.778 | 0.007203 |                0.477 |             1.412 |                 1301.5 |

[Final layout raw data](layout-final-results.json). DAT search improves about 13%, while build becomes about 8% slower. Retained JS heap drops about 86% (3.52→0.48 MiB), with TypedArray backing storage increasing (1.18→1.41 MiB). Flattening terminals removes per-slot arrays; separating compilation from scanner closure scope also releases temporary base/check placement arrays. Default retained heap grows by about 186 bytes/dictionary in this large sample, with identical backing storage. Tiny heap deltas may be negative from GC noise in raw samples; do not interpret them as negative memory usage.

First-result latency is measured separately from full search; it does not improve uniformly. Peak here is an **independent batch process** containing warmup, repeated construction/scanning and ten retained dictionaries, not the footprint of one compiled matcher. Default compact remains faster than DAT on this corpus, so `/fast` remains opt-in. Earlier [layout/filter experiments](layout-prefilter-results.json) used the single-entry historical baseline and preceded build-scope separation; use the final table for backend comparisons, and the within-current-build comparisons for the prefilter gate.

## Corrected default-backend comparison

Positive values mean slower; three-round medians versus the pushed baseline, identical public multi-entry topology:

| Scenario            | Build | Search | Presence |  Count | Per-pattern count | Leftmost-longest iteration |
| ------------------- | ----: | -----: | -------: | -----: | ----------------: | -------------------------: |
| ascii-tiny          | +2.4% |  -1.4% |    +1.6% |  -7.3% |            +81.7% |                      -0.4% |
| crlf                | +3.2% |  -1.4% |   -20.1% |  -2.3% |             +0.5% |                      -0.3% |
| ascii-combining     | +1.9% |  -1.3% |   -12.3% |  +0.2% |             +1.6% |                      -0.3% |
| unicode-start       | +1.3% |  +1.2% |    +9.2% |  +1.5% |             +0.0% |                      +0.4% |
| ascii-prefix        | +0.7% |  +1.0% |    -1.8% |  -2.2% |             -1.0% |                      -5.1% |
| ascii-early-unicode | +5.6% |  +2.2% |    -5.4% |  +1.7% |             +1.7% |                      +2.5% |
| ordinary            | -1.7% |  -1.3% |    +7.1% |  +3.5% |             -0.2% |                      +2.6% |
| sparse              | -1.5% |  +3.4% |    +0.9% |  +0.6% |             +1.4% |                      +4.1% |
| unicode             | -0.8% |  +1.9% |   -13.4% |  +0.0% |             +1.0% |                      +1.0% |
| shared-prefix       | +0.1% |  +1.7% |   +21.1% |  +1.5% |             +6.2% |                      -0.2% |
| dense-suffix        | -5.1% |  +0.5% |   -14.3% | -13.9% |             -7.7% |                      -0.1% |
| duplicates          | +1.7% |  +0.1% |   -11.3% | -10.6% |             -9.3% |                      -1.9% |
| early-hit           | +0.5% |  -2.6% |   -12.9% | -21.5% |            -11.4% |                      -1.6% |
| late-hit            | +0.3% |  -0.8% |   -14.7% | -14.1% |            -12.0% |                      -0.7% |
| large-dictionary    | +2.3% |  +0.3% |  +105.9% |  -2.0% |             +1.6% |                      -5.6% |
| long-text           | -3.1% |  -1.1% |    +7.6% |  -2.1% |             -0.1% |                      +0.3% |

[Final full run](range-benchmark-multi-entry.json), [all 96 process records with seven batched samples per operation](range-raw-runs.json), [targeted reproduction](module-topology-retest.json). All 16 full-search scenarios stay within 5% of baseline in this final run. Some tiny paths still regress: per-pattern counting on two characters is roughly 0.4→0.7 microseconds, and large-dictionary early presence roughly 0.2→0.5 microseconds. Shared-prefix per-pattern counting is about 6% slower. These are measured costs, not a claim of uniform improvement.

Investigation found that the existing benchmark rebuilt historical code as one module while the current package used shared chunks. Comparing unlike module topology changed V8 behavior. `gitBaseline()` now reproduces the multi-entry graph, preserving module identities; async stdin consumption fixes macOS nonblocking-pipe EAGAIN for the larger graph, and `BENCH_RAW_FILE` optionally checkpoints individual process/sample data. Historical graphs travel through data URLs, so loader storage still differs and process peaks must not be interpreted as matcher-only memory.

[Initial run](range-benchmark.json) and [first retest](range-benchmark-final.json) are retained **only as single-entry-baseline diagnostics**, not final regression evidence. In particular, their apparent large late-hit counting regression does not reproduce in the corrected comparison. Source behavior digests agree throughout. The final run includes 18 separate cold-process memory runs: three operations at dense-suffix scales 1×, 10× and 100×. Each memory row is one process, not a timing-round median.

| Dense-suffix ×100 operation | Baseline peak MiB | Current peak MiB |
| --------------------------- | ----------------: | ---------------: |
| count                       |             72.16 |            66.91 |
| iterate:leftmost-longest    |             76.16 |            71.22 |
| replace:leftmost-longest    |             76.03 |            71.45 |

These peaks include startup, code loading, input, automaton, ICU and results. Keep retained heap, ArrayBuffer bytes and peak RSS separate. Runtime/default entry dependencies, release configuration and version numbers remain unchanged.
