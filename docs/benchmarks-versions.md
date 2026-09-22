# v1 / v2 / v3 benchmark report

[中文版](./benchmarks-versions.zh-CN.md)

Measured 2026-09-22T13:34:37.548Z on Apple M4 Pro, darwin/arm64, Node v26.5.0, ICU 78.3, Unicode 17.0. Compare published v1 (1.1.0) and v2 (2.0.4) with the local default v3 (3.2.0) build.

## 1. Findings

Current has a lower initial median in the following comparable scenarios (count / total). These counts summarize this corpus, not a universal speedup or a significance test.

| Baseline   | build | search | match | normalizedSearch |
| ---------- | ----- | ------ | ----- | ---------------- |
| v1 (1.1.0) | 1/10  | 0/10   | 1/10  | 0/10             |
| v2 (2.0.4) | 12/14 | 3/14   | 14/14 | 13/14            |

Dense suffixes produce 91,440 occurrences: historical search retains grouped results backed by dictionary-owned keyword arrays, while v3 allocates independent range objects. Native result heaps are v1 (1.1.0) 75.59 KiB; v2 (2.0.4) 73.80 KiB; v3 (3.2.0) 6640.87 KiB. Use the normalizedSearch table when your application needs independent UTF-16 ranges.

v1 fails the emoji, ZWJ, combining-mark and CRLF cases. Their raw measurements remain visible with †, but no ratios are calculated. Initial flags above 5%: 46; 44 remain above 5% in the 7-round targeted recheck. See the recheck table before interpreting a small difference.

## 2. Reproduction and methodology

```sh
pnpm install --frozen-lockfile
pnpm test:benchmark:versions
pnpm benchmark:versions > docs/benchmarks-versions.json
# Recheck only flagged scenario/operation combinations, with 7 rounds by default.
node --expose-gc scripts/benchmark-versions.mjs --recheck docs/benchmarks-versions.json > docs/benchmarks-versions-recheck.json
node scripts/report-benchmark-versions.mjs docs/benchmarks-versions.json docs/benchmarks-versions-recheck.json
pnpm exec eslint docs/benchmarks-versions*.md --fix
```

Use pnpm 12.5.1 and a supported Node version. Run sequentially without builds, tests or other benchmarks competing for CPU. Recheck is needed only if the full JSON contains recheck flags; omit its argument when generating a report without flags. JSON is stdout; build/progress logs go to stderr. Existing benchmark commands keep their previous meaning.

```sh
BENCH_ROUNDS=1 BENCH_SCENARIOS=ordinary,emoji BENCH_OPERATIONS=search,match pnpm benchmark:versions > /tmp/versions-smoke.json
```

5 independent process rounds per scenario/version, 7 batched timing samples per operation after warmup, with GC outside timed regions. Version order rotates and reverses across rounds. Tables show medians of process medians; JSON includes all samples, within-round MAD and between-round MAD. Rechecks rerun all three versions for flagged scenario/operation combinations, without repeating memory measurements. No automatic timing gate is applied.

`build` measures only the native constructor. `search` measures native output; `match` measures native early-exit presence and has no throughput metric. `normalizedSearch` includes search plus historical conversion to `{pattern, patternIndex, start, end, data}`. v1 ends are UTF-16 indices; v2 ends are grapheme indices, so conversion segments each input inside the timed operation. Dictionary-to-index maps are prepared once outside timing. v3 already returns the target format. Canonical sorting is used only for validation, outside timing; normalization is a transparent consumer adapter, not a claim of optimal conversion.

The independent oracle searches substrings at original grapheme boundaries and preserves duplicate pattern indices. Validation compares canonical ranges and boolean presence, not just counts. Historical missing results are never synthesized. ASCII mismatches or unexpected v2/v3 Unicode mismatches abort the run. Known v1 errors are asserted explicitly.

| Scenario         | Patterns | UTF-16 units | Expected occurrences |
| ---------------- | -------- | ------------ | -------------------- |
| ordinary         | 200      | 32899        | 4900                 |
| sparse           | 500      | 46800        | 0                    |
| shared-prefix    | 1000     | 24889        | 1000                 |
| dense-suffix     | 96       | 1000         | 91440                |
| duplicates       | 200      | 18000        | 60000                |
| early-hit        | 1        | 140006       | 1                    |
| late-hit         | 1        | 140006       | 1                    |
| large-dictionary | 10000    | 33681        | 2000                 |
| long-text        | 4        | 560000       | 80000                |
| chinese          | 4        | 36000        | 15000                |
| emoji            | 2        | 18000        | 6000                 |
| zwj              | 3        | 24000        | 2000                 |
| combining        | 4        | 20000        | 8000                 |
| crlf             | 5        | 20000        | 12000                |

## 3. Timings

All times are milliseconds. Ratios are **current time / baseline time**: below 1 is faster; above 1 is slower. † means incorrect results, and — suppresses the ratio. The two search measurements have different output contracts; early-hit match latency does not measure a full-input scan. Sub-microsecond presence ratios are especially sensitive to JIT and measurement overhead; inspect absolute times and MAD.

### build

| Scenario         | v1 (1.1.0) | v2 (2.0.4) | v3 (3.2.0) | v3 / v1 | v3 / v2 |
| ---------------- | ---------- | ---------- | ---------- | ------- | ------- |
| ordinary         | 0.070      | 1.148      | 0.071      | 1.02×   | 0.06×   |
| sparse           | 0.168      | 2.910      | 0.189      | 1.13×   | 0.06×   |
| shared-prefix    | 0.921      | 6.828      | 1.177      | 1.28×   | 0.17×   |
| dense-suffix     | 0.033      | 0.665      | 0.074      | 2.24×   | 0.11×   |
| duplicates       | 0.039      | 1.059      | 0.035      | 0.89×   | 0.03×   |
| early-hit        | 0.000467   | 0.005673   | 0.005875   | 12.58×  | 1.04×   |
| late-hit         | 0.000462   | 0.005663   | 0.005926   | 12.82×  | 1.05×   |
| large-dictionary | 6.524      | 66.101     | 14.994     | 2.30×   | 0.23×   |
| long-text        | 0.002270   | 0.024      | 0.007264   | 3.20×   | 0.31×   |
| chinese          | 0.000741   | 0.021      | 0.011      | 14.66×  | 0.52×   |
| emoji            | 0.000314 † | 0.011      | 0.008381   | —       | 0.80×   |
| zwj              | 0.001048 † | 0.016      | 0.009397   | —       | 0.61×   |
| combining        | 0.000439 † | 0.020      | 0.009924   | —       | 0.49×   |
| crlf             | 0.000581 † | 0.026      | 0.007223   | —       | 0.28×   |

### search

| Scenario         | v1 (1.1.0) | v2 (2.0.4) | v3 (3.2.0) | v3 / v1 | v3 / v2 |
| ---------------- | ---------- | ---------- | ---------- | ------- | ------- |
| ordinary         | 0.490      | 1.626      | 1.757      | 3.58×   | 1.08×   |
| sparse           | 0.438      | 1.988      | 2.270      | 5.19×   | 1.14×   |
| shared-prefix    | 0.442      | 1.252      | 1.288      | 2.91×   | 1.03×   |
| dense-suffix     | 0.007412   | 0.049      | 2.544      | 343.25× | 51.56×  |
| duplicates       | 0.341      | 0.913      | 2.335      | 6.86×   | 2.56×   |
| early-hit        | 1.631      | 6.101      | 5.993      | 3.68×   | 0.98×   |
| late-hit         | 1.633      | 6.100      | 6.046      | 3.70×   | 0.99×   |
| large-dictionary | 0.666      | 1.813      | 1.803      | 2.71×   | 0.99×   |
| long-text        | 9.011      | 27.740     | 28.402     | 3.15×   | 1.02×   |
| chinese          | 1.985      | 2.239      | 2.446      | 1.23×   | 1.09×   |
| emoji            | 0.756 †    | 1.007      | 1.076      | —       | 1.07×   |
| zwj              | 1.389 †    | 0.361      | 0.383      | —       | 1.06×   |
| combining        | 0.586 †    | 1.029      | 1.201      | —       | 1.17×   |
| crlf             | 0.400 †    | 1.081      | 1.276      | —       | 1.18×   |

### match

| Scenario         | v1 (1.1.0) | v2 (2.0.4) | v3 (3.2.0) | v3 / v1 | v3 / v2 |
| ---------------- | ---------- | ---------- | ---------- | ------- | ------- |
| ordinary         | 0.000146   | 0.011      | 0.000406   | 2.78×   | 0.04×   |
| sparse           | 0.439      | 1.985      | 0.522      | 1.19×   | 0.26×   |
| shared-prefix    | 0.000351   | 0.010      | 0.000558   | 1.59×   | 0.06×   |
| dense-suffix     | 0.000013   | 0.005238   | 0.000047   | 3.64×   | 0.0089× |
| duplicates       | 0.000091   | 0.007560   | 0.000285   | 3.15×   | 0.04×   |
| early-hit        | 0.000102   | 0.025      | 0.000304   | 2.97×   | 0.01×   |
| late-hit         | 1.618      | 6.033      | 1.353      | 0.84×   | 0.22×   |
| large-dictionary | 0.000214   | 0.011      | 0.000457   | 2.14×   | 0.04×   |
| long-text        | 0.000053   | 0.086      | 0.000231   | 4.36×   | 0.0027× |
| chinese          | 0.000032   | 0.007726   | 0.004072   | 127.81× | 0.53×   |
| emoji            | 0.760 †    | 0.006496   | 0.002096   | —       | 0.32×   |
| zwj              | 1.387 †    | 0.006670   | 0.002516   | —       | 0.38×   |
| combining        | 0.000013 † | 0.006586   | 0.002315   | —       | 0.35×   |
| crlf             | 0.000013 † | 0.007708   | 0.000179   | —       | 0.02×   |

### normalizedSearch

| Scenario         | v1 (1.1.0) | v2 (2.0.4) | v3 (3.2.0) | v3 / v1 | v3 / v2 |
| ---------------- | ---------- | ---------- | ---------- | ------- | ------- |
| ordinary         | 0.658      | 3.236      | 1.752      | 2.66×   | 0.54×   |
| sparse           | 0.440      | 3.996      | 2.298      | 5.22×   | 0.57×   |
| shared-prefix    | 0.482      | 2.325      | 1.280      | 2.65×   | 0.55×   |
| dense-suffix     | 2.479      | 2.475      | 2.742      | 1.11×   | 1.11×   |
| duplicates       | 1.458      | 2.806      | 2.449      | 1.68×   | 0.87×   |
| early-hit        | 1.649      | 11.803     | 5.995      | 3.64×   | 0.51×   |
| late-hit         | 1.633      | 11.918     | 6.030      | 3.69×   | 0.51×   |
| large-dictionary | 0.825      | 3.616      | 1.826      | 2.21×   | 0.50×   |
| long-text        | 11.051     | 53.919     | 28.326     | 2.56×   | 0.53×   |
| chinese          | 2.356      | 4.615      | 2.413      | 1.02×   | 0.52×   |
| emoji            | 0.756 †    | 1.781      | 1.060      | —       | 0.60×   |
| zwj              | 1.377 †    | 0.669      | 0.377      | —       | 0.56×   |
| combining        | 0.999 †    | 2.029      | 1.168      | —       | 0.58×   |
| crlf             | 0.998 †    | 2.250      | 1.269      | —       | 0.56×   |

## 4. Retained memory and Unicode correctness

KiB, medians of independent memory processes per round. Dictionary deltas average ten retained native matchers; results retain one native or normalized search output after GC. Historical native results share arrays already retained by the dictionary. Normalizer lookup maps are excluded. ArrayBuffer storage is reported separately from JS heap; native ICU memory and peak RSS are not measured. Signed deltas preserve GC noise rather than clamping it to zero. Tiny or negative values are not stable memory savings. Incorrect v1 Unicode rows cannot support memory-efficiency claims.

| Scenario         | Version      | Dictionary heap | Dictionary buffers | Native result heap | Range result heap |
| ---------------- | ------------ | --------------- | ------------------ | ------------------ | ----------------- |
| ordinary         | v1 (1.1.0)   | 56.02           | 0.00               | 366.79             | 367.28            |
| ordinary         | v2 (2.0.4)   | 56.14           | 0.00               | 352.29             | 359.60            |
| ordinary         | v3 (3.2.0)   | 19.98           | 7.96               | 321.09             | 358.41            |
| sparse           | v1 (1.1.0)   | 139.08          | 0.00               | 0.98               | 1.01              |
| sparse           | v2 (2.0.4)   | 139.17          | 0.00               | 1.41               | 0.96              |
| sparse           | v3 (3.2.0)   | 31.61           | 19.88              | 23.22              | 0.96              |
| shared-prefix    | v1 (1.1.0)   | 1079.47         | 0.00               | 81.02              | 80.95             |
| shared-prefix    | v2 (2.0.4)   | 1078.94         | 0.00               | 66.27              | 74.44             |
| shared-prefix    | v3 (3.2.0)   | 60.72           | 258.37             | 68.27              | 78.23             |
| dense-suffix     | v1 (1.1.0)   | 64.19           | 0.00               | 75.59              | 6618.58           |
| dense-suffix     | v2 (2.0.4)   | 66.41           | 0.00               | 73.80              | 6619.31           |
| dense-suffix     | v3 (3.2.0)   | 10.65           | 3.78               | 6640.87            | 6610.25           |
| duplicates       | v1 (1.1.0)   | 5.65            | 0.00               | 223.20             | 4347.41           |
| duplicates       | v2 (2.0.4)   | 5.88            | 0.00               | 223.36             | 4355.85           |
| duplicates       | v3 (3.2.0)   | 16.13           | 1.56               | 4320.98            | 4346.03           |
| early-hit        | v1 (1.1.0)   | 2.00            | 0.00               | -5.44              | 1.72              |
| early-hit        | v2 (2.0.4)   | 2.80            | 0.00               | 1.58               | 1.72              |
| early-hit        | v3 (3.2.0)   | 7.57            | 0.00               | 7.14               | -0.05             |
| late-hit         | v1 (1.1.0)   | 2.03            | 0.00               | 1.30               | 1.72              |
| late-hit         | v2 (2.0.4)   | 2.78            | 0.00               | 1.50               | 10.63             |
| late-hit         | v3 (3.2.0)   | 7.50            | 0.00               | 5.92               | 17.42             |
| large-dictionary | v1 (1.1.0)   | 7194.07         | 0.00               | 149.07             | 156.58            |
| large-dictionary | v2 (2.0.4)   | 7194.06         | 0.00               | 149.23             | 149.27            |
| large-dictionary | v3 (3.2.0)   | 488.74          | 1640.98            | 142.37             | 148.98            |
| long-text        | v1 (1.1.0)   | 2.47            | 0.00               | 4347.16            | 5895.26           |
| long-text        | v2 (2.0.4)   | 2.32            | 0.00               | 4347.88            | 5896.48           |
| long-text        | v3 (3.2.0)   | 7.12            | 0.00               | 5898.20            | 5895.25           |
| chinese          | v1 (1.1.0)   | 2.54            | 0.00               | 868.60             | 1056.31           |
| chinese          | v2 (2.0.4)   | 3.30            | 0.00               | 868.80             | 1056.53           |
| chinese          | v3 (3.2.0)   | 6.77            | 0.00               | 1056.34            | 1056.48           |
| emoji            | v1 (1.1.0) † | 1.79            | 0.00               | 0.98               | 1.01              |
| emoji            | v2 (2.0.4)   | 2.56            | 0.00               | 428.48             | 437.64            |
| emoji            | v3 (3.2.0)   | 21.38           | 0.00               | 430.27             | 432.86            |
| zwj              | v1 (1.1.0) † | 1.75            | 0.00               | 0.98               | 1.01              |
| zwj              | v2 (2.0.4)   | 2.80            | 0.00               | 149.23             | 150.23            |
| zwj              | v3 (3.2.0)   | 18.91           | 0.00               | 151.23             | 152.16            |
| combining        | v1 (1.1.0) † | 2.33            | 0.00               | 868.67             | 1184.19           |
| combining        | v2 (2.0.4)   | 3.04            | 0.00               | 579.66             | 588.82            |
| combining        | v3 (3.2.0)   | 8.20            | 0.00               | 581.58             | 584.04            |
| crlf             | v1 (1.1.0) † | 2.42            | 0.00               | 1185.09            | 1433.84           |
| crlf             | v2 (2.0.4)   | 3.58            | 0.00               | 868.88             | 872.14            |
| crlf             | v3 (3.2.0)   | 9.24            | 0.00               | 870.96             | 868.51            |

Result ArrayBuffer deltas are also retained in JSON. The following Unicode rows show actual / expected occurrence counts; boolean columns show actual / expected presence.

| Scenario  | Version    | Occurrences   | match()      | Correct |
| --------- | ---------- | ------------- | ------------ | ------- |
| chinese   | v1 (1.1.0) | 15000 / 15000 | true / true  | yes     |
| chinese   | v2 (2.0.4) | 15000 / 15000 | true / true  | yes     |
| chinese   | v3 (3.2.0) | 15000 / 15000 | true / true  | yes     |
| emoji     | v1 (1.1.0) | 0 / 6000      | false / true | no      |
| emoji     | v2 (2.0.4) | 6000 / 6000   | true / true  | yes     |
| emoji     | v3 (3.2.0) | 6000 / 6000   | true / true  | yes     |
| zwj       | v1 (1.1.0) | 0 / 2000      | false / true | no      |
| zwj       | v2 (2.0.4) | 2000 / 2000   | true / true  | yes     |
| zwj       | v3 (3.2.0) | 2000 / 2000   | true / true  | yes     |
| combining | v1 (1.1.0) | 16000 / 8000  | true / true  | no      |
| combining | v2 (2.0.4) | 8000 / 8000   | true / true  | yes     |
| combining | v3 (3.2.0) | 8000 / 8000   | true / true  | yes     |
| crlf      | v1 (1.1.0) | 20000 / 12000 | true / true  | no      |
| crlf      | v2 (2.0.4) | 12000 / 12000 | true / true  | yes     |
| crlf      | v3 (3.2.0) | 12000 / 12000 | true / true  | yes     |

v1 builds its trie by code point but scans UTF-16 code units, so emoji and ZWJ words are missed. It also accepts partial combining sequences and individual CR/LF inside one grapheme. v2/v3 enforce grapheme boundaries in these fixtures. JSON contains missing/extra examples and correctness digests.

## 5. Targeted rechecks and source data

| Scenario         | Operation        | Baseline | Initial v3 / baseline | Recheck v3 / baseline | Still >5% slower |
| ---------------- | ---------------- | -------- | --------------------- | --------------------- | ---------------- |
| ordinary         | search           | v1       | 3.58×                 | 3.60×                 | yes              |
| ordinary         | match            | v1       | 2.78×                 | 1.13×                 | yes              |
| ordinary         | normalizedSearch | v1       | 2.66×                 | 2.62×                 | yes              |
| ordinary         | search           | v2       | 1.08×                 | 1.09×                 | yes              |
| sparse           | build            | v1       | 1.13×                 | 1.16×                 | yes              |
| sparse           | search           | v1       | 5.19×                 | 5.22×                 | yes              |
| sparse           | match            | v1       | 1.19×                 | 1.25×                 | yes              |
| sparse           | normalizedSearch | v1       | 5.22×                 | 5.15×                 | yes              |
| sparse           | search           | v2       | 1.14×                 | 1.13×                 | yes              |
| shared-prefix    | build            | v1       | 1.28×                 | 1.45×                 | yes              |
| shared-prefix    | search           | v1       | 2.91×                 | 2.84×                 | yes              |
| shared-prefix    | match            | v1       | 1.59×                 | 1.54×                 | yes              |
| shared-prefix    | normalizedSearch | v1       | 2.65×                 | 2.58×                 | yes              |
| dense-suffix     | build            | v1       | 2.24×                 | 2.23×                 | yes              |
| dense-suffix     | search           | v1       | 343.25×               | 339.85×               | yes              |
| dense-suffix     | match            | v1       | 3.64×                 | 3.84×                 | yes              |
| dense-suffix     | normalizedSearch | v1       | 1.11×                 | 1.12×                 | yes              |
| dense-suffix     | search           | v2       | 51.56×                | 51.64×                | yes              |
| dense-suffix     | normalizedSearch | v2       | 1.11×                 | 1.01×                 | no               |
| duplicates       | search           | v1       | 6.86×                 | 7.11×                 | yes              |
| duplicates       | match            | v1       | 3.15×                 | 1.13×                 | yes              |
| duplicates       | normalizedSearch | v1       | 1.68×                 | 1.66×                 | yes              |
| duplicates       | search           | v2       | 2.56×                 | 2.59×                 | yes              |
| early-hit        | build            | v1       | 12.58×                | 12.65×                | yes              |
| early-hit        | search           | v1       | 3.68×                 | 3.73×                 | yes              |
| early-hit        | match            | v1       | 2.97×                 | 1.06×                 | yes              |
| early-hit        | normalizedSearch | v1       | 3.64×                 | 3.66×                 | yes              |
| late-hit         | build            | v1       | 12.82×                | 12.82×                | yes              |
| late-hit         | search           | v1       | 3.70×                 | 3.81×                 | yes              |
| late-hit         | normalizedSearch | v1       | 3.69×                 | 3.85×                 | yes              |
| large-dictionary | build            | v1       | 2.30×                 | 2.35×                 | yes              |
| large-dictionary | search           | v1       | 2.71×                 | 2.72×                 | yes              |
| large-dictionary | match            | v1       | 2.14×                 | 2.15×                 | yes              |
| large-dictionary | normalizedSearch | v1       | 2.21×                 | 2.18×                 | yes              |
| long-text        | build            | v1       | 3.20×                 | 3.22×                 | yes              |
| long-text        | search           | v1       | 3.15×                 | 3.19×                 | yes              |
| long-text        | match            | v1       | 4.36×                 | 4.33×                 | yes              |
| long-text        | normalizedSearch | v1       | 2.56×                 | 2.55×                 | yes              |
| chinese          | build            | v1       | 14.66×                | 14.87×                | yes              |
| chinese          | search           | v1       | 1.23×                 | 1.24×                 | yes              |
| chinese          | match            | v1       | 127.81×               | 116.77×               | yes              |
| chinese          | search           | v2       | 1.09×                 | 1.09×                 | yes              |
| emoji            | search           | v2       | 1.07×                 | 1.09×                 | yes              |
| zwj              | search           | v2       | 1.06×                 | 1.03×                 | no               |
| combining        | search           | v2       | 1.17×                 | 1.24×                 | yes              |
| crlf             | search           | v2       | 1.18×                 | 1.19×                 | yes              |

A repeated ratio above 1.05 documents a cost in this corpus, including differences in output allocation and Unicode guarantees. A single noisy flag is not proof of regression; even a repeated small difference is not a statistical confidence interval. The benchmark changes no matcher implementation.

[Full run](./benchmarks-versions.json) · [Targeted recheck](./benchmarks-versions-recheck.json). Full timing processes: 210; memory processes: 210; recheck timing processes: 294.

Source revision: `1b5a27728c80bacce0edec1012dc50c3e99884e8`; working tree contained benchmark changes: true.

| Artifact       | SHA-256                                                          |
| -------------- | ---------------------------------------------------------------- |
| v1 (1.1.0)     | 92e364bded18733ea20c25d2ba2773677970600be6d65da05fa325267a19d2c1 |
| v2 (2.0.4)     | 8de77ed31903160adb53c77cf4aff80032144f685710c719c5490e592c9d7397 |
| v3 (3.2.0)     | 15d7f00f3a9163a12252998330e14e65ad1744f62f4b629b2417f08fbddcdd1e |
| Corpus         | 8dbac3966d9f23c4047c59576d55779948d57a39c7603acdf7b748506f701d4d |
| Runner         | 0a534897558f3433befa9c87f3a94577d08cedbbe0cefc84ef56056c7a2397d0 |
| pnpm-lock.yaml | 91a959d182dc0f27a8184f67350877f5d26e8ebea449a440282428948ee8086c |

Implementation fingerprints hash sorted ESM relative paths and file bytes. Corpus, runner, lockfile and report fingerprints hash JSON-serialized content; they are not standalone file checksums.

Related reports: [historical v2/v3](./benchmarks.md), [ASCII optimizations](./benchmarks-ascii.md), [extension benchmarks](./benchmarks-extensions.md). These used other runtime versions and baselines; do not combine their timings with this run.
