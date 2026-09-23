# Streaming, scanning and construction optimization report

[中文版](./optimization-report.zh-CN.md)

Measured on 2026-09-23 against `b01c9f22b2566b3a6058b41b05564b214899c8d7`, using Node 24.18.0, Apple M4 Max, darwin/arm64, ICU 78.3 and Unicode 17.0. These measurements cover the default compact backend. Stage snapshots identify which changes each comparison includes; they are not measurements of interchangeable implementations.

| Performance criterion                                          | Measured result                                                             | Assessment                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------- |
| Target ASCII full/selected scans: at least 20% faster          | About 65%–71% lower median time in ordinary, no-hit and long-ASCII fixtures | Met for the target fixtures |
| Large-dictionary construction peak RSS: at least 40% lower     | 100,000 patterns: −65.5%; 1,000,000: −71.3%                                 | Met                         |
| Cold construction: at most 10% slower                          | 10,000 / 100,000 / 1,000,000 patterns: 35.1% / 50.6% / 59.0% faster         | Met                         |
| Retained dictionary storage: no reproducible increase above 5% | 18-scenario heap comparison: −0.71% to +0.82%; ArrayBuffer bytes unchanged  | Met in the measured corpus  |
| Scanning: no reproducible slowdown above 5%                    | Full-scan/count matrix and targeted presence rechecks show no stable flag   | Met in the measured corpus  |

The final construction and presence rechecks use source commit `dd97451`. Earlier stage snapshots remain below as supporting evidence. Full enumeration with a high-output dictionary deliberately retains native segmentation, including on no-hit inputs; the ASCII improvement is not universal.

## Published v1/v2 and the optimized local build

The [five-round version comparison](./benchmarks-versions-optimization.json) measures pinned npm v1.1.0, v2.0.4 and the local `dd97451` build. The current build and v2 return correct results in all 14 fixtures. v1's emoji, ZWJ, combining-mark and CRLF defects are recorded and excluded from speed ratios. Correctness uses independent original-grapheme-boundary searches, including duplicate multiplicity.

When all versions return independent UTF-16 ranges, the current build has a lower median than v2 in all 14 fixtures, and than v1 in 6 of its 10 valid fixtures. v1 remains faster in no-hit and early-/late-hit ASCII scans; Chinese range output is approximately equal. This does not support a claim that the current version is faster in every workload.

The following representative table uses `normalizedSearch`, in milliseconds. For v1/v2, timing includes converting their grouped output to independent range objects; v2 also requires per-query grapheme-to-UTF-16 conversion. Dictionary index lookup maps are prepared outside timing. Current already returns that format. `—` excludes incorrect v1 output.

| Scenario                  | v1.1.0 | v2.0.4 | Current | Current / v1 | Current / v2 |
| ------------------------- | -----: | -----: | ------: | -----------: | -----------: |
| Ordinary                  |  0.672 |  3.496 |   0.599 |       0.891× |       0.171× |
| No matches                |  0.421 |  4.370 |   0.584 |       1.387× |       0.134× |
| Dense suffixes            |  3.114 |  3.260 |   2.306 |       0.740× |       0.707× |
| Long ASCII, early hit     |  1.547 | 12.897 |   2.204 |       1.425× |       0.171× |
| Long ASCII, late hit      |  1.562 | 13.219 |   2.118 |       1.356× |       0.160× |
| 10,000-pattern dictionary |  0.820 |  3.840 |   0.598 |       0.730× |       0.156× |
| Chinese                   |  2.337 |  4.957 |   2.350 |       1.005× |       0.474× |
| ZWJ sequences             |      — |  0.701 |   0.332 |            — |       0.474× |

Native `search` performs different output work. For 91,440 dense-suffix matches, v1/v2 return grouped arrays that share dictionary-owned keyword arrays; their native medians are 0.007/0.051 ms, versus 2.297 ms for current's independent ranges. Native result heaps are about 47/82 KiB versus 6.46 MiB. Once all outputs use independent ranges, result heaps are about 6.46 MiB for all three. The artifact preserves both native and normalized measurements rather than treating those contracts as equal-cost operations.

For 10,000 patterns, current retains about 2.08 MiB of JS heap plus ArrayBuffer storage, versus 7.03 MiB for either historical version, a reduction of about 70%. Repeated warm construction is also faster in this fixture:

| Version | Repeated warm build ms | Retained JS heap MiB | Retained ArrayBuffer MiB | Combined MiB |
| ------- | ---------------------: | -------------------: | -----------------------: | -----------: |
| v1.1.0  |                  8.173 |                7.025 |                    0.000 |        7.025 |
| v2.0.4  |                 69.027 |                7.025 |                    0.000 |        7.025 |
| Current |                  6.188 |                0.474 |                    1.603 |        2.076 |

These version-build timings are warmed repeated operations, not the cold-process construction measurements below. Memory is measured in separate processes with 10–1,000 retained dictionaries, and excludes native ICU storage and peak RSS.

The [seven-round version recheck](./benchmarks-versions-optimization-recheck.json), using the same runner, implementation and environment, reproduced all 26 initial flags above 5%. These concern comparisons with older versions, not regressions against `b01c9f2`. The representative independent-range gaps versus v1 are stable:

| Scenario              | Five-round current / v1 | Seven-round current / v1 |
| --------------------- | ----------------------: | -----------------------: |
| No matches            |                 1.3865× |                  1.4197× |
| Long ASCII, early hit |                 1.4251× |                  1.3477× |
| Long ASCII, late hit  |                 1.3560× |                  1.3828× |

The historical native grouped-output advantage also reproduces: current/v2 native search is 44.91× for dense suffixes and 1.72× for duplicates. These native-output ratios retain the allocation-contract difference explained above; the independent-range comparison remains the relevant measure when callers need independent ranges. The full JSON includes all 26 flags, absolute timings and dispersion, including small-dictionary construction and presence queries where v1 remains faster.

## Contracts and acceptance criteria

The changes preserve the public API, exact original-grapheme boundaries, UTF-16 half-open ranges, duplicate pattern order, independent match objects, ESM/CommonJS entrypoints and existing persistence schema. The compact backend remains the default.

The agreed performance thresholds are at least 20% lower median time for ordinary, no-hit and long-ASCII full/selected scans; at least 40% lower large-dictionary construction peak RSS; no more than 10% slower cold construction; and no reproducible scan or retained-memory regression above 5%. Ratios below are **new time / baseline time**, so lower is faster. An observed ratio is evidence for this corpus and environment, not a universal guarantee.

## Stage 1: correct incremental transformed streams

`/text` now uses the shared streaming core for matching, tokenization and replacement. Stable matches are available from `write()` before EOF, and default tokens do not overlap. Transformed text is resegmented incrementally after concatenation, preserving the existing whole-input behavior when normalization joins transformed pieces, including compatibility Hangul. Partial original-grapheme ranges, original-text word boundaries and protected regions are checked before overlap selection.

The stream discards committed original text, transformed tails, offset mappings and obsolete candidates. Completion, cancellation, overflow and callback errors release its retained state. The buffer limit follows `maxBufferLength ?? maxBufferedUnits ?? 1_048_576`, applies to uncommitted original text held by the transformation layer, and accepts an explicit `Infinity`. Filters see original text; preview uses independent scanning state.

Callers must consume the outputs from both `write()` and the ending method. Existing entrypoints retain their termination contracts. Regression coverage includes lost early replacements, overlapping default tokens, buffer-limit bypasses, all UTF-16 split positions, folding expansions, ligatures, Hangul, combining marks, ZWJ sequences, surrogate splits, original word boundaries, protected syntax and preview state.

### Retained memory while results are consumed

Three independent processes per version/strategy repeatedly feed the same 80-unit chunk, consume every emitted result immediately, and measure post-GC heap growth. The dictionary and input chunk exist before the memory baseline. The table reports medians in KiB; ArrayBuffer deltas were zero throughout this experiment.

| Strategy           | Implementation | 40,000 UTF-16 units | 120,000 units | 400,000 units | After finish and cancel, handle retained |
| ------------------ | -------------- | ------------------: | ------------: | ------------: | ---------------------------------------: |
| `all`              | Baseline       |             2,031.0 |       3,848.7 |      14,707.8 |                                 14,666.8 |
| `all`              | Stage 1        |               263.7 |         268.1 |         264.0 |                                    158.5 |
| `leftmost-longest` | Baseline       |             2,899.6 |       6,388.9 |      23,208.3 |                                 23,179.2 |
| `leftmost-longest` | Stage 1        |               271.1 |         275.7 |         271.1 |                                    158.4 |

The new measurements stay approximately flat as cumulative input grows tenfold. Before EOF at 400,000 units, the new `leftmost-longest` stream had already emitted 79,997 of its final 80,000 matches; the baseline had emitted none. Final counts and full pattern-index/range digests agree. The `all` streams both emit incrementally, but the baseline retains obsolete mappings.

These deltas include runtime/JIT noise and do not represent the exact size of live stream state. They exclude caller-retained results, transient output arrays, native ICU storage and peak RSS. The deterministic lifecycle tests separately verify bounded offset mappings and their release. Retaining all results in application code still consumes memory proportional to output size.

The stage-1 default-scanner sanity comparison also ran five independent process rounds across ordinary, Unicode and dense-suffix inputs, measuring `search`, `count`, `match`, leftmost-longest iteration and replacement. None of its 15 comparisons exceeded the 5% regression threshold. This check concerns the default scanner, not transformed-stream throughput.

Sources: [stream retention measurements](./benchmarks-stream-optimization.json), [default-scanner sanity comparison](./benchmarks-stream-core.json). Both use stage-1 commit `b6ebdce`; implementation digest: `593af04bb53db03a3dd84c0be75c30ec04dc51cbd6e863af74db75d6a0e1fb7a`.

## Stage 2: ASCII full-output and selected scans

Stage 2 added the existing safe ASCII prefix scanner to complete output and both leftmost strategies. ASCII and native grapheme segmentation have separate read positions while preserving automaton state, selection candidates and absolute offsets at the handoff. CRLF, combining characters and Unicode retain the native fallback. There is no whole-input preflight or additional per-grapheme wrapper object. Match results remain independent.

Five independent process rounds, seven batched samples after warmup per process, compare stage 2 with the original baseline. Each table cell shows baseline → stage-2 milliseconds, followed by the time ratio.

| Scenario                   |               `search` |          `iterate:all` | `iterate:leftmost-first` | `iterate:leftmost-longest` |
| -------------------------- | ---------------------: | ---------------------: | -----------------------: | -------------------------: |
| Ordinary                   | 1.998 → 0.628 (0.314×) | 1.965 → 0.619 (0.315×) |   2.036 → 0.747 (0.367×) |     2.063 → 0.750 (0.364×) |
| No matches                 | 2.525 → 0.701 (0.278×) | 2.503 → 0.714 (0.285×) |   2.513 → 0.718 (0.286×) |     2.500 → 0.725 (0.290×) |
| Long ASCII, early hit      | 7.543 → 2.399 (0.318×) | 7.593 → 2.280 (0.300×) |   7.824 → 2.770 (0.354×) |     7.687 → 2.732 (0.355×) |
| Long ASCII, late hit       | 7.384 → 2.350 (0.318×) | 7.345 → 2.336 (0.318×) |   7.669 → 2.673 (0.349×) |     7.548 → 2.637 (0.349×) |
| Unicode                    | 0.860 → 0.855 (0.993×) | 0.837 → 0.836 (0.998×) |   0.910 → 0.892 (0.980×) |     0.922 → 0.898 (0.974×) |
| ASCII with combining marks | 2.739 → 2.647 (0.967×) | 2.562 → 2.473 (0.965×) |   2.885 → 2.786 (0.966×) |     2.991 → 2.853 (0.954×) |

The target ASCII workloads improved by 63%–72%, exceeding the 20% requirement. Long-input rows consume the complete iterator; an early hit does not imply early exit in these operations. Leftmost-longest replacement on ordinary input improved from 2.149 ms to 0.806 ms (0.375×). Its ratios across the four target ASCII workloads were 0.292×–0.375×.

The measured Unicode/fallback ratios across all five operations were 0.954×–0.998×. None of the 30 stage-2 timing comparisons exceeded the 5% regression threshold. Output digests agree with the baseline, and targeted tests cover ASCII/Unicode handoffs and lazy early exit. The timing experiment does not establish a retained-memory improvement.

Source: [ASCII result-scan measurements](./benchmarks-ascii-result-optimization.json), stage-2 commit `afe63a5`; implementation digest: `2f6fd74037020a282ebe8d5b1109008e4be765da71b7b396a7248762782c200a`.

### Adaptive enumeration dispatch

The implementation keeps the one-way ASCII/native scanner, with a dictionary-level choice for full enumeration. If any compiled state has at least 32 aggregate outputs, `search()` and all-match iteration use the smaller native-segmentation generator. Construction and deserialization each calculate this private flag once with an indexed pass; neither the public API nor serialized format changes. Counting and selected-match scans do not use this fallback.

This choice limits generator overhead when many outputs can be emitted per state. It also has a concrete cost: a dictionary that qualifies for the fallback uses native segmentation even when a particular input produces no matches or very few. The 20% ASCII improvement target therefore applies to the ordinary/no-hit/long-input fixtures above, not to every dictionary with a no-hit input. The [seven-round focused enumeration comparison](./benchmarks-dense-dispatch.json) covers dense suffixes, duplicates, ordinary text, Unicode and an ASCII prefix; full-suite interpretation also needs the `output-heavy-miss` and `output-heavy-sparse` cases.

## Stage 3: construct compact tables directly

The single internal builder interns graphemes as numeric symbols and stores leaf/single-edge states in numeric blocks, allocating Maps only for branching states. It records one terminal state per input pattern, fills terminal ranges in input order, and directly creates the compact transition arrays. Failure links, output links and aggregate counts use the final typed-array queue. Temporary construction blocks are released as their data enters the final tables. Small dictionaries begin with a small first block. A bounded memo of 256 exact pattern strings reuses already-computed terminal states and lengths during construction, preserving every duplicate entry and its input order. The memo is not retained by the matcher.

Both the double-array compiler and the documentation graph consume this same compact build result. They do not rebuild the former per-node object graph. Existing serialized dictionaries remain readable; internal numbering need not produce byte-identical new serialization.

The short transition loops for construction and scanning are deliberately separate. Keeping construction's root-heavy calls out of the scanner's JIT feedback is a design safeguard; it is not a proven explanation for the earlier timing flags. The paired-seed diagnostic below identified randomized string-hash layout as a measurement confounder.

Seven independent cold processes per size/version, using paired hash seeds, measured the following medians for the final source at `dd97451`, including the bounded pattern memo. Construction time excludes input generation and module loading. Peak RSS includes the process runtime, input, native allocations, temporary construction data and final tables. Retained heap excludes preexisting pattern strings; ArrayBuffer backing stores are reported separately.

|  Patterns | Cold build, baseline → new | Build reduction | Peak RSS MiB, baseline → new | Peak reduction | Retained heap MiB, baseline → new | Retained ArrayBuffer MiB, both |
| --------: | -------------------------: | --------------: | ---------------------------: | -------------: | --------------------------------: | -----------------------------: |
|    10,000 |           31.94 → 20.74 ms |           35.1% |               106.30 → 71.63 |          32.6% |                       0.55 → 0.54 |                           1.60 |
|   100,000 |          186.38 → 92.05 ms |           50.6% |              407.11 → 140.38 |          65.5% |                       3.50 → 3.49 |                          16.02 |
| 1,000,000 |       1,945.30 → 797.32 ms |           59.0% |            2,300.22 → 660.16 |          71.3% |                     34.22 → 34.21 |                         160.22 |

The 100,000- and 1,000,000-pattern dictionaries exceed the 40% peak-reduction target, and construction is faster at all three sizes. ArrayBuffer bytes are exactly unchanged at each size, while retained JS heap is slightly lower. For 10,000 patterns the whole-process RSS reduction is 32.6%; fixed runtime costs are a larger fraction of that smaller process. Historical modules are loaded through data URLs, so their loader storage differs; the raw data includes pre-construction RSS to make this visible.

The `count()` probes use seven calibrated batches after warmup. Their final time ratios are 0.9861×, 0.9958× and 0.8958× for 10,000, 100,000 and 1,000,000 patterns respectively; none exceeds the 5% regression threshold. These scale probes complement the broader scanner comparisons.

The [initial three-round results](./benchmarks-builder-initial.json), [earlier seven-round snapshot](./benchmarks-builder-before-scan-isolation.json) and [snapshot before pattern memoization](./benchmarks-builder-optimization.json) remain available for audit. The final method waits for three GC/task turns before measuring retained memory so delayed backing-store disposal is not attributed to the dictionary. Build peak RSS is captured before these collections. The [initial full scanner comparison](./benchmarks-optimization-initial.json) and [seven-round recheck](./benchmarks-optimization-initial-recheck.json) retain earlier flags; they predate the final implementation and paired-seed method.

Source: [final seven-round construction measurements](./benchmarks-builder-final.json), commit `dd97451`; implementation digest: `c7af20de2e8a6a0064b3755ef656d653b0e6d469429ac614a7f0c03d5bc32a6c`.

### Repeated small-dictionary construction

Repeated warm construction measures a different workload from the one-constructor cold-process scale experiment. The seven-round [builder recheck](./benchmarks-final-builder-recheck.json) at `dd97451` includes the bounded memo and indexed output-density pass. Duplicate-heavy construction is 0.4808× the baseline (35.664 → 17.147 µs), shared-prefix construction is 0.6629× (1.269 → 0.841 ms), and Unicode construction is 0.9505×. Ordinary repeated construction is 1.0725× (75.951 → 81.460 µs), a measured 7.3% cost. This small warm-build result must not be substituted for the cold-build acceptance measurement. The implementation digest is `c7af20de2e8a6a0064b3755ef656d653b0e6d469429ac614a7f0c03d5bc32a6c`.

## Combined scanning evidence

The [five-round full comparison](./benchmarks-optimization.json) covers 18 scenarios and 13 operations at snapshot `0d10f03`. All complete-output, selected-output, replacement and counting comparisons are below the 5% regression threshold. Four flags concern presence, loading or repeated construction; those require the separate rechecks below. This full matrix predates the indexed density pass, bounded pattern memo and revised warmup method.

| Scenario                               | `search`, baseline → snapshot ms | `search` ratio | `iterate:all` ratio | Leftmost-first / longest iteration ratios |
| -------------------------------------- | -------------------------------: | -------------: | ------------------: | ----------------------------------------: |
| Ordinary                               |                    2.021 → 0.609 |         0.302× |              0.306× |                           0.352× / 0.352× |
| No matches                             |                    2.473 → 0.719 |         0.291× |              0.290× |                           0.286× / 0.290× |
| Long ASCII, early hit                  |                    7.381 → 2.254 |         0.305× |              0.291× |                           0.350× / 0.348× |
| Long ASCII, late hit                   |                    7.437 → 2.260 |         0.304× |              0.303× |                           0.349× / 0.343× |
| Dense suffixes                         |                    2.355 → 2.358 |         1.001× |              1.010× |                           0.540× / 0.479× |
| High-output dictionary, no matches     |                    4.637 → 4.656 |         1.004× |              1.003× |                           0.307× / 0.304× |
| High-output dictionary, sparse matches |                    4.783 → 4.760 |         0.995× |              1.004× |                           0.334× / 0.340× |
| Unicode                                |                    0.866 → 0.863 |         0.996× |              0.981× |                           0.952× / 0.966× |

Ordinary/no-hit/long-ASCII full and selected scans in this matrix reduce median time by about 65%–71%. The dense-dictionary no-hit/sparse rows expose the fallback cost: complete enumeration remains near the baseline while selected scans still improve. The raw artifact retains every operation, all process samples, correctness digests and separate peak/retained-result observations.

### Presence and restoration rechecks

The first [seven-round recheck](./benchmarks-optimization-recheck.json) retained Unicode presence and shared-prefix loading flags. A separate [native-module presence diagnostic](./benchmarks-native-presence-warmed-diagnostic.json) loaded the historical module graph from real files and ran 65,536 additional warmup calls before each process measurement. Unicode presence measured 3.619 → 3.592 µs (0.9925×), with all seven paired ratios below 1.05×. This identified insufficient warmup in the original timing helper: a slow cold/JIT batch could reach the 25 ms calibration target before the code settled. It does not demonstrate a library-logic slowdown.

With at least 250 ms of accumulated warmup and the indexed density pass, the [seven-round warmed recheck](./benchmarks-final-warmed-recheck.json) measured Unicode presence at 0.9066× and shared-prefix restoration at 0.9889×. The later `dd97451` builder recheck measured the same operations at 0.9082× and 1.0208×. Its shared-prefix presence result initially flagged 1.1324× by independent medians, with a paired-ratio median of about 1.0213× and one large outlier. A [separate seven-round presence-only recheck](./benchmarks-presence-final-recheck.json) on the same implementation measured 0.2951 → 0.3041 µs (1.0304×), with no flag; between-process MAD was 0.0132 → 0.0049 µs. The 13% difference did not reproduce independently. These tiny timings retain their absolute values and both datasets for review.

### Retained dictionary memory

The [seven-round retained-memory comparison](./benchmarks-retained-optimization.json) covers all 18 scenarios without timing operations. It retains `max(10, min(1000, floor(100000 / patternCount)))` matchers and reports the actual copy count, then divides the post-GC delta by that count. Small dictionaries therefore use up to 1,000 copies, reducing the influence of one-off runtime/JIT allocations. Three GC/task turns precede the snapshot.

Across these scenarios, retained JS-heap ratios are 0.99292×–1.00823×, or −0.71% to +0.82%; ArrayBuffer bytes match exactly in every scenario. The measured build has digest `6716d18808b34e066dc30eaaaa8b90d773adc567feda47150f18e51b0283296c`, with the indexed density pass and before pattern memoization. The construction-only memo is outside retained matcher state; the final scale experiment above separately measures its cold peak and confirms unchanged buffers with slightly lower heap. Dictionary retention, transient build peak and caller-retained results remain distinct quantities.

## Measurement and reproduction

Use pnpm 12.5.1 and the same Node/ICU environment for direct comparisons. Run benchmarks sequentially, without competing builds or test suites. Timings are medians of independent process medians; JSON retains samples and within-/between-process median absolute deviation. A suspected slowdown above 5% needs seven independent process rounds and investigation of absolute time and noise. Sub-microsecond early-exit ratios are particularly sensitive to runtime overhead.

Scanner, scale and version comparisons use predetermined V8 hash seeds, `104729 + roundIndex * 7919`. Every version in one round receives the same seed; the seed changes across rounds and is not selected after seeing results. This controls a source of noise in repeated misses against a small string alphabet while still sampling multiple hash layouts. Timing now requires at least 250 ms of accumulated warmup and a final batch of at least 25 ms, or the batch limit of 1,048,576 iterations. The earlier limit was 4,096. Artifacts record `warmupMs` and `warmupIterations`; a slow first batch alone can no longer end calibration.

The [seven-seed count diagnostic](./benchmarks-paired-count-diagnostic.json) tested `ascii-early-unicode` with paired baseline/current seeds and alternating process order. Ratios of the process medians were 0.99754× for `count` and 0.99222× for `countByPattern`; every paired `count` ratio lay between 0.98034× and 1.02080×. The earlier roughly 9% count difference did not persist under this control, which does not support attributing it to a stable scanner-code regression. This diagnostic concerns those operations and that fixture, not final acceptance of the whole suite.

The shared retained-memory measurement helper also uses three GC/task turns, allowing temporary backing-store disposal to settle before taking the retained snapshot. Earlier artifacts retain their original methodology and are not relabeled as measurements from the revised helper.

The runner builds historical source as a multi-entry module graph matching the current package topology, fingerprints every generated ESM module, and records environment/commit metadata before measurements. Recent artifacts also record `runnerSha256` and explicit timing/memory methods; version rechecks require the same runner, implementation and environment. Each completed child is appended to a JSONL journal, so a later failure does not discard earlier data. `BENCH_RECORD_FILE` chooses its path; the default temporary path is printed to stderr. Artifacts also report whether the worktree was dirty; implementation fingerprints identify the measured build.

```sh
# Run against the original baseline using the currently built source.
BENCH_BASELINE_REF=b01c9f2 BENCH_ROUNDS=3 pnpm --silent benchmark:stream > stream.json

# Stage-1 scanner coverage.
BENCH_BASELINE_REF=b01c9f2 BENCH_ROUNDS=5 BENCH_MEMORY=0 \
  BENCH_SCENARIOS=ordinary,unicode,dense-suffix \
  BENCH_OPERATIONS=search,count,match,iterate:leftmost-longest,replace:leftmost-longest \
  pnpm --silent benchmark > stream-core.json

# Stage-2 result-scan coverage.
BENCH_BASELINE_REF=b01c9f2 BENCH_ROUNDS=5 BENCH_MEMORY=0 \
  BENCH_SCENARIOS=ordinary,sparse,early-hit,late-hit,unicode,ascii-combining \
  BENCH_OPERATIONS=search,iterate:all,iterate:leftmost-first,iterate:leftmost-longest,replace:leftmost-longest \
  pnpm --silent benchmark > ascii-results.json

# Cold construction, retained storage and whole-process peak RSS.
BENCH_BASELINE_REF=b01c9f2 BENCH_ROUNDS=7 pnpm --silent benchmark:scale > builder.json

# Published v1/v2, with an independent-range comparison as well as native output.
BENCH_ROUNDS=5 pnpm --silent benchmark:versions > versions.json
node --expose-gc scripts/benchmark-versions.mjs --recheck versions.json > versions-recheck.json
```

These commands rebuild the current worktree. To reproduce a stage snapshot exactly, use that stage's source with the benchmark tooling from this report and verify the artifact's implementation digest. Different runtimes or source revisions require a new comparison, not merged timing samples.

## Final validation and delivery

Final validation passed: `pnpm exec repo doctor --strict` (13 passes, no warnings or failures), `pnpm exec repo check --full` (lint, type checking, 269 tests across 26 files, and builds), `pnpm tsd`, and `pnpm test:package` after building. The packed consumer verified ESM, direct CommonJS construction, named type imports, declarations and package contents. `pnpm test:docs:e2e` passed all 44 browser tests, including the workbench and Unicode contracts across browser engines.

The implementation is organized into three commits: `b6ebdce` for transformed streaming, `afe63a5` for ASCII result scanning, and `dd97451` for compact construction and its performance safeguards. Each stage has a pnpm change intent. Benchmark tooling, raw measurements and bilingual reports are delivered separately. This work does not publish to npm or deploy the documentation site.
