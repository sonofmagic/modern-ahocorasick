# v2 / v3 benchmark snapshot

Measured on Apple M4 Max, darwin/arm64, Node v24.18.0. Five timed samples after warmup; medians in milliseconds. Each scenario/version runs in a separate process.

Run `pnpm benchmark` from a full source checkout. The script reads v2 from Git commit `a4181b054b2d2c85e83fe4201b1417c879db2f30` and compares it with the current v3 build. It verifies that both versions find the same total number of occurrences.

## Timings

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

## Retained JavaScript heap

Dictionary heap is a post-GC delta averaged across ten retained dictionaries. Result heap is a post-GC delta with one search result retained. These estimates are noisy and exclude native ICU memory; they are not peak memory or process RSS.

| Scenario      | Occurrences | v2 dictionary KiB | v3 dictionary KiB | v2 results KiB | v3 results KiB |
| ------------- | ----------: | ----------------: | ----------------: | -------------: | -------------: |
| ordinary      |        4900 |              56.1 |             105.4 |          359.9 |          344.9 |
| sparse        |           0 |             141.2 |             255.1 |            0.0 |            0.0 |
| unicode       |        2000 |              39.5 |              84.2 |          148.3 |          142.0 |
| shared-prefix |        1000 |            1078.0 |            2440.4 |           72.9 |           91.5 |
| dense-suffix  |       91440 |              64.3 |              46.5 |           73.0 |         6712.4 |

## Interpretation

- Construction was faster in these five samples. Reused full searches were generally slower; Map transitions, generator traversal and independent match objects have costs.
- The dense-suffix case has 96 nested patterns and 91,440 occurrences in 1,000 characters. v2 returns only 1,000 groups and references precomputed keyword arrays. v3 materializes all 91,440 independent range objects. Its search time and result memory therefore measure substantially more output work.
- Output links reduce retained dictionary memory in the dense-suffix case. Maps and richer nodes consume more dictionary memory in the other scenarios; this is not a blanket memory optimization.
- Iteration lets callers process results without retaining the entire result array. It still emits each occurrence and keeps the input and dictionary alive. It does not make high-output scans free.
- Boolean matching stops early when a hit exists. Tiny timings are sensitive to timer resolution and should not be interpreted as stable speedup ratios.
- Non-overlapping selection and replacement collect and sort all candidates. They are not low-memory streaming operations.
- This is one machine and a deterministic synthetic corpus, not a universal performance claim or a CI timing threshold.
