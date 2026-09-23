---
title: "Backends and performance"
description: "Choose a backend using measurements of your dictionary, input and output volume."
---

# Backends and performance

Choose a backend using measurements of your dictionary, input and output volume.

## Backend choices

Start with the default compact backend. `/fast` opts into double-array storage; `/unicode-fast` combines that backend with full folding. The default import does not load the optional compiler or folding data.

```ts
import FastAhoCorasick from 'modern-ahocorasick/fast'

const matcher = new FastAhoCorasick(['cat'])
matcher.search('cat')[0]?.start // 0
matcher.getStats().backend // 'double-array'
```

## Measured tradeoffs

`/fast` is an explicit double-array backend, not a universal speed guarantee. It can
reduce ArrayBuffer storage while increasing JavaScript heap usage; cursor
overhead may dominate scans. In the snapshot before the streaming, scanner and builder
optimizations, on Node 24.18.0 / Apple M4 Max, the 10,000-pattern ASCII
comparison measured 28.23 ms construction and 4.34 ms search for `/fast`, versus
13.61 ms and 2.00 ms for the default backend. Retained heap was 3.52 MiB versus
0.47 MiB; buffers were 1.18 MiB versus 1.60 MiB. These are three-round medians,
not measurements of the optimized build or a prediction for other dictionaries. Boundaries and folding use the
general cursor, so filtered `count()` does enumerate accepted outputs. The default
exact counting and presence paths retain their allocation-light implementation.

The feature comparison targets `@monyone/aho-corasick@1.5.10` and
`@tanishiking/aho-corasick@0.0.1`. Their index, duplicate and Unicode contracts differ;
this package preserves its own ranges and semantics rather than copying defects or
method aliases. Run `pnpm benchmark:external` for the printable-ASCII comparison,
including normalized independent ranges, native results, build costs and memory.

Run `pnpm benchmark:versions` to compare pinned npm v1.1.0 and v2.0.4 against the current local default entry: construction, native search, conversion to independent ranges and retained memory. Historical Unicode cases with incorrect results receive no speed ratios. The [optimized-build version comparison](https://github.com/icelib/modern-ahocorasick/blob/main/docs/optimization-report.md) includes the current measurements; the [earlier v1/v2/v3 report](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks-versions.md) remains a historical snapshot.

In the optimized build's five-round comparison, independent range output was faster than v2 in all 14 fixtures. Seven-round rechecks confirmed v1 still scanned some ASCII inputs faster, and historical native grouped output has different allocation costs. The 10,000-pattern dictionary retained about 2.08 MiB of heap plus buffers, versus 7.03 MiB for either older version. These results support choosing by the output contract and workload, rather than a universal version ranking.

The [streaming, scanning and construction report](https://github.com/icelib/modern-ahocorasick/blob/main/docs/optimization-report.md) records the subsequent changes against `b01c9f2`: incremental transformed-stream retention, an 18-scenario scanner comparison, retained-dictionary measurements, and cold construction at 10,000–1,000,000 patterns. It distinguishes repeated warm construction, retained heap, ArrayBuffer storage and construction peak RSS, with raw process results, implementation fingerprints and targeted rechecks.

Full enumeration uses native grapheme segmentation for dictionaries that can emit many matches at one state. This avoids extra overhead in dense output, but those dictionaries also use that path when an input has few or no matches. ASCII acceleration therefore depends on the dictionary as well as the text; measure representative no-hit inputs too. Counting and selected-match scans keep their own paths.

## Reproduce and interpret

```sh
pnpm benchmark
pnpm benchmark:external
pnpm benchmark:versions
pnpm benchmark:scale
pnpm benchmark:stream
pnpm benchmark:docs
```

Run these commands from the repository. Compare build and scan time, retained heap and buffers separately; `getStats().typedArrayBytes` is not total heap. Filtering, folding, result arrays and `longest-first` have costs beyond the default exact scan. The workbench includes debounce, Worker and transfer time, so its display is not a library benchmark.

Sources: [Extension benchmarks](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks-extensions.md) · [v2/v3 benchmarks](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks.md) · [ASCII benchmarks](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks-ascii.md) · [Workbench measurements](https://github.com/icelib/modern-ahocorasick/blob/main/docs/workbench-performance.md)
