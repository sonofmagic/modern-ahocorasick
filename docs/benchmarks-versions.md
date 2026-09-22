# v1 / v2 / v3 benchmark report

[中文版](./benchmarks-versions.zh-CN.md)

Measured 2026-09-22T17:30:21.133Z on Apple M4 Pro, darwin/arm64, Node v26.5.0, ICU 78.3, Unicode 17.0. Compare published v1 (1.1.0) and v2 (2.0.4) with the local default v3 (3.2.0) build.

## 1. Findings

Current has a lower initial median in the following comparable scenarios (count / total). These counts summarize this corpus, not a universal speedup or a significance test.

| Baseline   | build | search | match | iterate | normalizedSearch |
| ---------- | ----- | ------ | ----- | ------- | ---------------- |
| v1 (1.1.0) | 1/16  | 11/16  | 11/16 | 0/0     | 16/16            |
| v2 (2.0.4) | 16/21 | 13/21  | 21/21 | 0/0     | 21/21            |

Dense suffixes produce 91,440 occurrences: historical search retains grouped results backed by dictionary-owned keyword arrays, while v3 allocates independent range objects. Native result heaps are v1 (1.1.0) 73.86 KiB; v2 (2.0.4) 74.06 KiB; v3 (3.2.0) 6635.20 KiB. Use the normalizedSearch table when your application needs independent UTF-16 ranges.

v1 fails the emoji, ZWJ, combining-mark and CRLF cases. Their raw measurements remain visible with †, but no ratios are calculated. Initial flags above 5%: 36; 30 remain above 5% in the 7-round targeted recheck. See the recheck table before interpreting a small difference.

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

`build` measures only the native constructor. `search` measures native eager output; `iterate` drains the lazy iterator with `Array.from` and is unsupported by v1/v2, which is shown as — rather than compared. Each child also exposes `diagnostics.directSearch` and `diagnostics.lazyIterate` aliases in JSON. `match` measures native early-exit presence and has no throughput metric. `normalizedSearch` includes search plus historical conversion to `{pattern, patternIndex, start, end, data}`. v1 ends are UTF-16 indices; v2 ends are grapheme indices, so conversion segments each input inside the timed operation. Dictionary-to-index maps are prepared once outside timing. v3 already returns the target format. Canonical sorting is used only for validation, outside timing; normalization is a transparent consumer adapter, not a claim of optimal conversion.

The independent oracle searches substrings at original grapheme boundaries and preserves duplicate pattern indices. Validation compares canonical ranges and boolean presence, not just counts. Historical missing results are never synthesized. ASCII mismatches or unexpected v2/v3 Unicode mismatches abort the run. Known v1 errors are asserted explicitly.

| Scenario            | Patterns | UTF-16 units | Expected occurrences |
| ------------------- | -------- | ------------ | -------------------- |
| empty-dictionary    | 0        | 20400        | 0                    |
| tiny-no-match       | 1        | 13           | 0                    |
| ascii-fast          | 7        | 53138        | 17143                |
| ordinary            | 200      | 32899        | 4900                 |
| sparse              | 500      | 46800        | 0                    |
| shared-prefix       | 1000     | 24889        | 1000                 |
| ascii-fanout        | 256      | 23999        | 6000                 |
| fail-chain          | 64       | 2401         | 74784                |
| dense-suffix        | 96       | 1000         | 91440                |
| duplicates          | 200      | 18000        | 60000                |
| early-hit           | 1        | 140006       | 1                    |
| late-hit            | 1        | 140006       | 1                    |
| large-dictionary    | 10000    | 33681        | 2000                 |
| long-text           | 4        | 560000       | 80000                |
| mixed-ascii-unicode | 7        | 80000        | 22500                |
| nested-duplicates   | 8        | 700          | 5588                 |
| chinese             | 4        | 36000        | 15000                |
| emoji               | 2        | 18000        | 6000                 |
| zwj                 | 3        | 24000        | 2000                 |
| combining           | 4        | 20000        | 8000                 |
| crlf                | 5        | 20000        | 12000                |

## 3. Timings

All times are milliseconds. Ratios are **current time / baseline time**: below 1 is faster; above 1 is slower. † means incorrect results, and — suppresses the ratio. The two search measurements have different output contracts; early-hit match latency does not measure a full-input scan. Sub-microsecond presence ratios are especially sensitive to JIT and measurement overhead; inspect absolute times and MAD.

### build

| Scenario            | v1 (1.1.0) | v2 (2.0.4) | v3 (3.2.0) | v3 / v1 | v3 / v2 |
| ------------------- | ---------- | ---------- | ---------- | ------- | ------- |
| empty-dictionary    | 0.000060   | 0.000060   | 0.007978   | 132.06× | 132.56× |
| tiny-no-match       | 0.000787   | 0.010      | 0.013      | 16.36×  | 1.24×   |
| ascii-fast          | 0.002752   | 0.081      | 0.025      | 9.13×   | 0.31×   |
| ordinary            | 0.175      | 2.397      | 0.202      | 1.15×   | 0.08×   |
| sparse              | 0.374      | 5.871      | 0.533      | 1.42×   | 0.09×   |
| shared-prefix       | 2.232      | 11.400     | 4.219      | 1.89×   | 0.37×   |
| ascii-fanout        | 0.079      | 2.401      | 0.222      | 2.81×   | 0.09×   |
| fail-chain          | 0.037      | 0.844      | 0.108      | 2.90×   | 0.13×   |
| dense-suffix        | 0.066      | 1.305      | 0.188      | 2.83×   | 0.14×   |
| duplicates          | 0.097      | 2.405      | 0.086      | 0.89×   | 0.04×   |
| early-hit           | 0.000734   | 0.012      | 0.013      | 17.58×  | 1.12×   |
| late-hit            | 0.000664   | 0.010      | 0.012      | 17.96×  | 1.19×   |
| large-dictionary    | 14.892     | 147.152    | 42.059     | 2.82×   | 0.29×   |
| long-text           | 0.004532   | 0.051      | 0.019      | 4.21×   | 0.37×   |
| mixed-ascii-unicode | 0.002903 † | 0.073      | 0.028      | —       | 0.38×   |
| nested-duplicates   | 0.000609   | 0.068      | 0.016      | 26.07×  | 0.23×   |
| chinese             | 0.000969   | 0.038      | 0.022      | 23.16×  | 0.60×   |
| emoji               | 0.000517 † | 0.017      | 0.019      | —       | 1.11×   |
| zwj                 | 0.001518 † | 0.027      | 0.018      | —       | 0.66×   |
| combining           | 0.000535 † | 0.034      | 0.023      | —       | 0.69×   |
| crlf                | 0.000766 † | 0.053      | 0.017      | —       | 0.33×   |

### search

| Scenario            | v1 (1.1.0) | v2 (2.0.4) | v3 (3.2.0) | v3 / v1 | v3 / v2 |
| ------------------- | ---------- | ---------- | ---------- | ------- | ------- |
| empty-dictionary    | 0.348      | 2.003      | 0.107      | 0.31×   | 0.05×   |
| tiny-no-match       | 0.000195   | 0.009276   | 0.000123   | 0.63×   | 0.01×   |
| ascii-fast          | 1.713      | 7.128      | 1.052      | 0.61×   | 0.15×   |
| ordinary            | 0.831      | 2.711      | 0.489      | 0.59×   | 0.18×   |
| sparse              | 0.891      | 3.959      | 0.351      | 0.39×   | 0.09×   |
| shared-prefix       | 0.971      | 3.443      | 0.288      | 0.30×   | 0.08×   |
| ascii-fanout        | 1.123      | 3.229      | 0.523      | 0.47×   | 0.16×   |
| fail-chain          | 0.092      | 0.290      | 2.701      | 29.26×  | 9.30×   |
| dense-suffix        | 0.022      | 0.133      | 3.369      | 154.23× | 25.41×  |
| duplicates          | 0.653      | 1.756      | 1.845      | 2.82×   | 1.05×   |
| early-hit           | 3.612      | 14.039     | 0.849      | 0.23×   | 0.06×   |
| late-hit            | 3.187      | 11.471     | 0.836      | 0.26×   | 0.07×   |
| large-dictionary    | 1.716      | 3.918      | 0.503      | 0.29×   | 0.13×   |
| long-text           | 19.328     | 60.073     | 6.152      | 0.32×   | 0.10×   |
| mixed-ascii-unicode | 6.108 †    | 8.646      | 6.715      | —       | 0.78×   |
| nested-duplicates   | 0.016      | 0.103      | 0.162      | 10.22×  | 1.58×   |
| chinese             | 3.930      | 3.979      | 4.048      | 1.03×   | 1.02×   |
| emoji               | 1.433 †    | 1.943      | 2.077      | —       | 1.07×   |
| zwj                 | 2.827 †    | 0.689      | 0.795      | —       | 1.15×   |
| combining           | 1.399 †    | 2.273      | 2.477      | —       | 1.09×   |
| crlf                | 0.987 †    | 2.512      | 0.736      | —       | 0.29×   |

### match

| Scenario            | v1 (1.1.0) | v2 (2.0.4) | v3 (3.2.0) | v3 / v1   | v3 / v2    |
| ------------------- | ---------- | ---------- | ---------- | --------- | ---------- |
| empty-dictionary    | 0.418      | 1.935      | 0.000014   | 0.000034× | 0.0000074× |
| tiny-no-match       | 0.000280   | 0.013      | 0.000100   | 0.36×     | 0.0077×    |
| ascii-fast          | 0.000019   | 0.031      | 0.000039   | 2.01×     | 0.0012×    |
| ordinary            | 0.000221   | 0.025      | 0.000114   | 0.51×     | 0.0046×    |
| sparse              | 1.030      | 3.950      | 0.392      | 0.38×     | 0.10×      |
| shared-prefix       | 0.000463   | 0.023      | 0.000225   | 0.49×     | 0.0097×    |
| ascii-fanout        | 0.000065   | 0.018      | 0.000053   | 0.81×     | 0.0030×    |
| fail-chain          | 0.000019   | 0.010      | 0.000028   | 1.47×     | 0.0027×    |
| dense-suffix        | 0.000019   | 0.011      | 0.000037   | 1.89×     | 0.0032×    |
| duplicates          | 0.000144   | 0.017      | 0.000103   | 0.71×     | 0.0060×    |
| early-hit           | 0.000134   | 0.049      | 0.000127   | 0.95×     | 0.0026×    |
| late-hit            | 3.911      | 12.481     | 0.865      | 0.22×     | 0.07×      |
| large-dictionary    | 0.000300   | 0.026      | 0.000153   | 0.51×     | 0.0058×    |
| long-text           | 0.000117   | 0.136      | 0.000051   | 0.43×     | 0.00037×   |
| mixed-ascii-unicode | 0.000071 † | 0.024      | 0.000052   | —         | 0.0022×    |
| nested-duplicates   | 0.000019   | 0.009432   | 0.000033   | 1.74×     | 0.0035×    |
| chinese             | 0.000056   | 0.017      | 0.005656   | 100.16×   | 0.34×      |
| emoji               | 1.545 †    | 0.014      | 0.006319   | —         | 0.44×      |
| zwj                 | 2.355 †    | 0.016      | 0.005300   | —         | 0.32×      |
| combining           | 0.000016 † | 0.014      | 0.003921   | —         | 0.29×      |
| crlf                | 0.000017 † | 0.017      | 0.000034   | —         | 0.0020×    |

### iterate

| Scenario            | v1 (1.1.0) | v2 (2.0.4) | v3 (3.2.0) | v3 / v1 | v3 / v2 |
| ------------------- | ---------- | ---------- | ---------- | ------- | ------- |
| empty-dictionary    | —          | —          | 0.000256   | —       | —       |
| tiny-no-match       | —          | —          | 0.003166   | —       | —       |
| ascii-fast          | —          | —          | 5.964      | —       | —       |
| ordinary            | —          | —          | 2.659      | —       | —       |
| sparse              | —          | —          | 3.911      | —       | —       |
| shared-prefix       | —          | —          | 1.908      | —       | —       |
| ascii-fanout        | —          | —          | 2.415      | —       | —       |
| fail-chain          | —          | —          | 6.211      | —       | —       |
| dense-suffix        | —          | —          | 6.969      | —       | —       |
| duplicates          | —          | —          | 5.241      | —       | —       |
| early-hit           | —          | —          | 11.692     | —       | —       |
| late-hit            | —          | —          | 8.307      | —       | —       |
| large-dictionary    | —          | —          | 3.300      | —       | —       |
| long-text           | —          | —          | 58.938     | —       | —       |
| mixed-ascii-unicode | — †        | —          | 7.728      | —       | —       |
| nested-duplicates   | —          | —          | 0.459      | —       | —       |
| chinese             | —          | —          | 6.084      | —       | —       |
| emoji               | — †        | —          | 2.149      | —       | —       |
| zwj                 | — †        | —          | 0.957      | —       | —       |
| combining           | — †        | —          | 2.420      | —       | —       |
| crlf                | — †        | —          | 3.138      | —       | —       |

### normalizedSearch

| Scenario            | v1 (1.1.0) | v2 (2.0.4) | v3 (3.2.0) | v3 / v1 | v3 / v2 |
| ------------------- | ---------- | ---------- | ---------- | ------- | ------- |
| empty-dictionary    | 0.395      | 3.826      | 0.112      | 0.28×   | 0.03×   |
| tiny-no-match       | 0.000246   | 0.017      | 0.000115   | 0.47×   | 0.0068× |
| ascii-fast          | 2.846      | 10.522     | 0.897      | 0.32×   | 0.09×   |
| ordinary            | 1.360      | 6.444      | 0.452      | 0.33×   | 0.07×   |
| sparse              | 0.969      | 8.919      | 0.341      | 0.35×   | 0.04×   |
| shared-prefix       | 1.049      | 5.958      | 0.319      | 0.30×   | 0.05×   |
| ascii-fanout        | 1.686      | 5.530      | 0.459      | 0.27×   | 0.08×   |
| fail-chain          | 3.173      | 3.845      | 2.434      | 0.77×   | 0.63×   |
| dense-suffix        | 5.334      | 4.982      | 2.875      | 0.54×   | 0.58×   |
| duplicates          | 2.724      | 7.435      | 1.924      | 0.71×   | 0.26×   |
| early-hit           | 2.768      | 23.444     | 0.778      | 0.28×   | 0.03×   |
| late-hit            | 3.114      | 27.217     | 0.708      | 0.23×   | 0.03×   |
| large-dictionary    | 2.379      | 7.509      | 0.451      | 0.19×   | 0.06×   |
| long-text           | 26.568     | 120.774    | 6.709      | 0.25×   | 0.06×   |
| mixed-ascii-unicode | 7.442 †    | 15.686     | 5.605      | —       | 0.36×   |
| nested-duplicates   | 0.249      | 0.496      | 0.156      | 0.62×   | 0.31×   |
| chinese             | 5.377      | 9.233      | 3.244      | 0.60×   | 0.35×   |
| emoji               | 1.484 †    | 4.581      | 1.939      | —       | 0.42×   |
| zwj                 | 2.420 †    | 1.358      | 0.797      | —       | 0.59×   |
| combining           | 2.597 †    | 3.570      | 2.165      | —       | 0.61×   |
| crlf                | 2.033 †    | 4.088      | 0.784      | —       | 0.19×   |

## 4. Retained memory and Unicode correctness

KiB, medians of independent memory processes per round. Dictionary deltas average ten retained native matchers; results retain one native or normalized search output after GC. Historical native results share arrays already retained by the dictionary. Normalizer lookup maps are excluded. ArrayBuffer storage is reported separately from JS heap; native ICU memory and peak RSS are not measured. Signed deltas preserve GC noise rather than clamping it to zero. Tiny or negative values are not stable memory savings. Incorrect v1 Unicode rows cannot support memory-efficiency claims.

| Scenario            | Version      | Dictionary heap | Dictionary buffers | Native result heap | Range result heap |
| ------------------- | ------------ | --------------- | ------------------ | ------------------ | ----------------- |
| empty-dictionary    | v1 (1.1.0)   | 1.70            | 0.00               | 0.98               | 1.01              |
| empty-dictionary    | v2 (2.0.4)   | 1.78            | 0.00               | 1.30               | -0.16             |
| empty-dictionary    | v3 (3.2.0)   | 24.22           | 0.00               | 0.96               | 1.01              |
| tiny-no-match       | v1 (1.1.0)   | 10.99           | 0.00               | 0.98               | 1.01              |
| tiny-no-match       | v2 (2.0.4)   | 2.90            | 0.00               | 1.20               | 1.01              |
| tiny-no-match       | v3 (3.2.0)   | 31.24           | 0.50               | 1.09               | 1.01              |
| ascii-fast          | v1 (1.1.0)   | 4.63            | 0.00               | 1248.94            | 1254.07           |
| ascii-fast          | v2 (2.0.4)   | 4.68            | 0.00               | 1249.26            | 1248.25           |
| ascii-fast          | v3 (3.2.0)   | 8.25            | 1.21               | 1249.79            | 1258.41           |
| ordinary            | v1 (1.1.0)   | 57.91           | 0.00               | 366.79             | 366.16            |
| ordinary            | v2 (2.0.4)   | 56.08           | 0.00               | 352.46             | 359.74            |
| ordinary            | v3 (3.2.0)   | 21.33           | 8.46               | 314.35             | 368.63            |
| sparse              | v1 (1.1.0)   | 139.02          | 0.00               | 18.01              | 0.96              |
| sparse              | v2 (2.0.4)   | 139.05          | 0.00               | 1.41               | 0.96              |
| sparse              | v3 (3.2.0)   | 31.80           | 20.38              | 0.96               | 3.76              |
| shared-prefix       | v1 (1.1.0)   | 1079.48         | 0.00               | 73.64              | 80.95             |
| shared-prefix       | v2 (2.0.4)   | 1078.93         | 0.00               | 73.80              | 74.47             |
| shared-prefix       | v3 (3.2.0)   | 61.07           | 258.87             | 68.27              | 70.38             |
| ascii-fanout        | v1 (1.1.0)   | 73.08           | 0.00               | 428.16             | 428.36            |
| ascii-fanout        | v2 (2.0.4)   | 75.24           | 0.00               | 428.36             | 437.04            |
| ascii-fanout        | v3 (3.2.0)   | 22.63           | 11.13              | 410.21             | 437.21            |
| fail-chain          | v1 (1.1.0)   | 38.91           | 0.00               | 86.36              | 5272.73           |
| fail-chain          | v2 (2.0.4)   | 36.38           | 0.00               | 86.56              | 5272.65           |
| fail-chain          | v3 (3.2.0)   | 13.28           | 3.03               | 5228.88            | 5281.95           |
| dense-suffix        | v1 (1.1.0)   | 64.13           | 0.00               | 73.86              | 6617.32           |
| dense-suffix        | v2 (2.0.4)   | 66.36           | 0.00               | 74.06              | 6620.25           |
| dense-suffix        | v3 (3.2.0)   | 11.06           | 4.28               | 6635.20            | 6600.29           |
| duplicates          | v1 (1.1.0)   | 5.52            | 0.00               | 223.25             | 4352.45           |
| duplicates          | v2 (2.0.4)   | 5.79            | 0.00               | 223.36             | 4355.74           |
| duplicates          | v3 (3.2.0)   | 20.09           | 2.06               | 4347.26            | 4358.02           |
| early-hit           | v1 (1.1.0)   | 2.87            | 0.00               | -5.46              | 1.72              |
| early-hit           | v2 (2.0.4)   | 2.84            | 0.00               | 1.58               | 1.72              |
| early-hit           | v3 (3.2.0)   | 27.82           | 0.50               | 2.88               | 5.45              |
| late-hit            | v1 (1.1.0)   | 2.77            | 0.00               | -5.87              | 1.69              |
| late-hit            | v2 (2.0.4)   | 2.96            | 0.00               | 1.50               | 10.63             |
| late-hit            | v3 (3.2.0)   | 9.47            | 0.50               | 2.27               | 1.39              |
| large-dictionary    | v1 (1.1.0)   | 7194.06         | 0.00               | 149.07             | 150.20            |
| large-dictionary    | v2 (2.0.4)   | 7194.06         | 0.00               | 141.86             | 149.30            |
| large-dictionary    | v3 (3.2.0)   | 489.22          | 1641.48            | 147.31             | 156.13            |
| long-text           | v1 (1.1.0)   | 2.49            | 0.00               | 4347.26            | 5894.91           |
| long-text           | v2 (2.0.4)   | 2.30            | 0.00               | 4348.00            | 5896.88           |
| long-text           | v3 (3.2.0)   | 7.67            | 0.50               | 5896.95            | 5905.49           |
| mixed-ascii-unicode | v1 (1.1.0) † | 4.33            | 0.00               | 1271.34            | 1271.73           |
| mixed-ascii-unicode | v2 (2.0.4)   | 2.98            | 0.00               | 1584.07            | 1592.95           |
| mixed-ascii-unicode | v3 (3.2.0)   | 8.07            | 0.50               | 1597.86            | 1595.04           |
| nested-duplicates   | v1 (1.1.0)   | 1.66            | 0.00               | 51.45              | 403.80            |
| nested-duplicates   | v2 (2.0.4)   | 1.64            | 0.00               | 51.60              | 412.59            |
| nested-duplicates   | v3 (3.2.0)   | 7.34            | 0.50               | 400.45             | 404.45            |
| chinese             | v1 (1.1.0)   | 3.20            | 0.00               | 868.60             | 1062.66           |
| chinese             | v2 (2.0.4)   | 3.39            | 0.00               | 868.92             | 1056.74           |
| chinese             | v3 (3.2.0)   | 7.13            | 0.00               | 1056.40            | 1067.21           |
| emoji               | v1 (1.1.0) † | 2.47            | 0.00               | 0.98               | 1.01              |
| emoji               | v2 (2.0.4)   | 2.66            | 0.00               | 428.37             | 437.62            |
| emoji               | v3 (3.2.0)   | 9.41            | 0.00               | 428.31             | 428.11            |
| zwj                 | v1 (1.1.0) † | 2.02            | 0.00               | 0.98               | 3.47              |
| zwj                 | v2 (2.0.4)   | 2.83            | 0.00               | 149.23             | 150.23            |
| zwj                 | v3 (3.2.0)   | 9.43            | 0.00               | 137.88             | 148.98            |
| combining           | v1 (1.1.0) † | 3.15            | 0.00               | 868.60             | 1178.66           |
| combining           | v2 (2.0.4)   | 3.08            | 0.00               | 579.59             | 588.80            |
| combining           | v3 (3.2.0)   | 8.80            | 0.50               | 582.62             | 589.91            |
| crlf                | v1 (1.1.0) † | 2.23            | 0.00               | 1177.50            | 1432.88           |
| crlf                | v2 (2.0.4)   | 3.73            | 0.00               | 868.80             | 878.06            |
| crlf                | v3 (3.2.0)   | 7.97            | 0.50               | 868.60             | 868.60            |

Result ArrayBuffer deltas are also retained in JSON. The following Unicode rows show actual / expected occurrence counts; boolean columns show actual / expected presence.

| Scenario            | Version    | Occurrences   | match()      | Correct |
| ------------------- | ---------- | ------------- | ------------ | ------- |
| mixed-ascii-unicode | v1 (1.1.0) | 17500 / 22500 | true / true  | no      |
| mixed-ascii-unicode | v2 (2.0.4) | 22500 / 22500 | true / true  | yes     |
| mixed-ascii-unicode | v3 (3.2.0) | 22500 / 22500 | true / true  | yes     |
| chinese             | v1 (1.1.0) | 15000 / 15000 | true / true  | yes     |
| chinese             | v2 (2.0.4) | 15000 / 15000 | true / true  | yes     |
| chinese             | v3 (3.2.0) | 15000 / 15000 | true / true  | yes     |
| emoji               | v1 (1.1.0) | 0 / 6000      | false / true | no      |
| emoji               | v2 (2.0.4) | 6000 / 6000   | true / true  | yes     |
| emoji               | v3 (3.2.0) | 6000 / 6000   | true / true  | yes     |
| zwj                 | v1 (1.1.0) | 0 / 2000      | false / true | no      |
| zwj                 | v2 (2.0.4) | 2000 / 2000   | true / true  | yes     |
| zwj                 | v3 (3.2.0) | 2000 / 2000   | true / true  | yes     |
| combining           | v1 (1.1.0) | 16000 / 8000  | true / true  | no      |
| combining           | v2 (2.0.4) | 8000 / 8000   | true / true  | yes     |
| combining           | v3 (3.2.0) | 8000 / 8000   | true / true  | yes     |
| crlf                | v1 (1.1.0) | 20000 / 12000 | true / true  | no      |
| crlf                | v2 (2.0.4) | 12000 / 12000 | true / true  | yes     |
| crlf                | v3 (3.2.0) | 12000 / 12000 | true / true  | yes     |

v1 builds its trie by code point but scans UTF-16 code units, so emoji and ZWJ words are missed. It also accepts partial combining sequences and individual CR/LF inside one grapheme. v2/v3 enforce grapheme boundaries in these fixtures. JSON contains missing/extra examples and correctness digests.

## 5. Targeted rechecks and source data

| Scenario          | Operation | Baseline | Initial v3 / baseline | Recheck v3 / baseline | Still >5% slower |
| ----------------- | --------- | -------- | --------------------- | --------------------- | ---------------- |
| empty-dictionary  | build     | v1       | 132.06×               | 136.97×               | yes              |
| empty-dictionary  | build     | v2       | 132.56×               | 140.74×               | yes              |
| tiny-no-match     | build     | v1       | 16.36×                | 14.71×                | yes              |
| tiny-no-match     | build     | v2       | 1.24×                 | 1.03×                 | no               |
| ascii-fast        | build     | v1       | 9.13×                 | 10.12×                | yes              |
| ascii-fast        | match     | v1       | 2.01×                 | 1.76×                 | yes              |
| ordinary          | build     | v1       | 1.15×                 | 1.09×                 | yes              |
| sparse            | build     | v1       | 1.42×                 | 1.26×                 | yes              |
| shared-prefix     | build     | v1       | 1.89×                 | 1.97×                 | yes              |
| ascii-fanout      | build     | v1       | 2.81×                 | 3.10×                 | yes              |
| fail-chain        | build     | v1       | 2.90×                 | 3.15×                 | yes              |
| fail-chain        | search    | v1       | 29.26×                | 22.57×                | yes              |
| fail-chain        | match     | v1       | 1.47×                 | 1.86×                 | yes              |
| fail-chain        | search    | v2       | 9.30×                 | 6.78×                 | yes              |
| dense-suffix      | build     | v1       | 2.83×                 | 3.09×                 | yes              |
| dense-suffix      | search    | v1       | 154.23×               | 128.08×               | yes              |
| dense-suffix      | match     | v1       | 1.89×                 | 1.68×                 | yes              |
| dense-suffix      | search    | v2       | 25.41×                | 27.28×                | yes              |
| duplicates        | search    | v1       | 2.82×                 | 2.51×                 | yes              |
| duplicates        | search    | v2       | 1.05×                 | 0.88×                 | no               |
| early-hit         | build     | v1       | 17.58×                | 20.96×                | yes              |
| early-hit         | build     | v2       | 1.12×                 | 1.13×                 | yes              |
| late-hit          | build     | v1       | 17.96×                | 20.08×                | yes              |
| late-hit          | build     | v2       | 1.19×                 | 1.19×                 | yes              |
| large-dictionary  | build     | v1       | 2.82×                 | 3.10×                 | yes              |
| long-text         | build     | v1       | 4.21×                 | 3.72×                 | yes              |
| nested-duplicates | build     | v1       | 26.07×                | 24.20×                | yes              |
| nested-duplicates | search    | v1       | 10.22×                | 10.84×                | yes              |
| nested-duplicates | match     | v1       | 1.74×                 | 1.93×                 | yes              |
| nested-duplicates | search    | v2       | 1.58×                 | 1.59×                 | yes              |
| chinese           | build     | v1       | 23.16×                | 20.78×                | yes              |
| chinese           | match     | v1       | 100.16×               | 81.23×                | yes              |
| emoji             | build     | v2       | 1.11×                 | 0.91×                 | no               |
| emoji             | search    | v2       | 1.07×                 | 0.83×                 | no               |
| zwj               | search    | v2       | 1.15×                 | 1.02×                 | no               |
| combining         | search    | v2       | 1.09×                 | 0.95×                 | no               |

A repeated ratio above 1.05 documents a cost in this corpus, including differences in output allocation and Unicode guarantees. A single noisy flag is not proof of regression; even a repeated small difference is not a statistical confidence interval. The benchmark changes no matcher implementation.

[Full run](./benchmarks-versions.json) · [Targeted recheck](./benchmarks-versions-recheck.json). Full timing processes: 315; memory processes: 315; recheck timing processes: 399.

Source revision: `b01c9f22b2566b3a6058b41b05564b214899c8d7`; working tree contained benchmark changes: true.

| Artifact       | SHA-256                                                          |
| -------------- | ---------------------------------------------------------------- |
| v1 (1.1.0)     | 92e364bded18733ea20c25d2ba2773677970600be6d65da05fa325267a19d2c1 |
| v2 (2.0.4)     | 8de77ed31903160adb53c77cf4aff80032144f685710c719c5490e592c9d7397 |
| v3 (3.2.0)     | d1cc53f5c24f1f416296e3f388e30068808c5d8e5bb31bcfbb9fe012d555925c |
| Corpus         | 1c5fd6de9a68148befac659fa292f0c1fa55bd0166d2b738a2427f15aa0efb8e |
| Runner         | 5768c3f571ecea550eca6f6df0fd9678f802ac4b8cf2e16e29aa315c475e2641 |
| pnpm-lock.yaml | 91a959d182dc0f27a8184f67350877f5d26e8ebea449a440282428948ee8086c |

Implementation fingerprints hash sorted ESM relative paths and file bytes. Corpus, runner, lockfile and report fingerprints hash JSON-serialized content; they are not standalone file checksums.

Related reports: [historical v2/v3](./benchmarks.md), [ASCII optimizations](./benchmarks-ascii.md), [extension benchmarks](./benchmarks-extensions.md). These used other runtime versions and baselines; do not combine their timings with this run.
