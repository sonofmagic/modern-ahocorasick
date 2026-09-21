# Workbench computation measurements

Run `pnpm benchmark:docs` with the supported Node/pnpm versions. The command builds the actual docs engine into a temporary directory and cleans it afterward. Every scenario/variant runs in a fresh Node subprocess. Each timing is the median of seven samples after three warmups, with explicit GC outside the timed operation.

“Cold” recompiles the dictionary on every operation; “Reuse” keeps the compiled dictionary and changes the trailing text character to force a real rescan. Both run the same current trace, public search, and public replacement operations. This comparison isolates dictionary reuse; it is **not** a comparison with the older site or a browser frame-rate benchmark. Strategy-only edits additionally reuse the trace, as covered by unit tests.

Measured on 2026-09-21, Apple M4 Max, Node 24.18.0:

| Scenario                      |  Steps | Matches | Cold median ms | Reuse median ms | Retained worker model KiB | Additional cloned UI data KiB | Clone ms |
| ----------------------------- | -----: | ------: | -------------: | --------------: | ------------------------: | ----------------------------: | -------: |
| Classic repeated text         |  1,300 |     300 |          0.504 |           0.369 |                       205 |                           310 |     0.98 |
| Mixed Unicode                 |  2,100 |     600 |          0.779 |           0.560 |                       359 |                           570 |     1.92 |
| Dense overlaps and duplicates | 11,994 |   7,997 |          4.467 |           2.650 |                     2,603 |                         3,899 |    13.92 |
| 150-keyword dictionary        |  2,200 |     500 |          1.208 |           0.605 |                       498 |                           607 |     1.85 |

Heap and clone figures use one separate fresh engine/result plus a structured clone after the timed samples (the reuse subprocess is shown). Heap deltas are GC-sensitive estimates, not process RSS or peak memory. Clone time is a single sample, not a median. Actual Worker startup, browser segmentation, serialization, DOM rendering and 120 ms edit debounce are outside the Node timing. The UI's preparation timer includes debounce and Worker transfer but stops before Vue rendering.

The dense case demonstrates a real cost of offloading: the retained model is about 2.54 MiB and the cloned UI copy adds about 3.80 MiB; transfer can take longer than matching. The Worker is primarily an isolation/cancellation boundary, not a promise of faster end-to-end processing. Dictionary reuse helps these measured scenarios, but small dictionaries can be dominated by scanning and transfer.

Browser regression checks exercise a 20,000-unit text with 10,000 hits, seek to the final step, and verify that only 100 tape cells and 100 result rows render at once. They also exercise the explicit trace budget, large-dictionary graph fallback, pagination and recovery after rejected input. Graph layout is capped at 150 nodes and retained across text-only edits. No matches are silently truncated; exported JSON contains all selected results.
