# Matcher enhancements

Implement the complete enhancement set requested on 2026-09-22. Keep the default
constructor, direct CommonJS export, exact grapheme matching, duplicate identity,
and original UTF-16 ranges. Additive APIs need a minor change intent. Do not merge
the prepared version PR or publish npm as part of this work.

## Implementation sequence and acceptance

1. **Per-pattern counts:** `countByPattern(text): number[]`, indexed by input
   pattern index, including zeroes and duplicates. Scan state visits and propagate
   backwards through failure links, without enumerating occurrences. Check against
   an independent reference on Unicode, overlapping and duplicate dictionaries.
2. **Compact dictionaries:** retain numeric transition/terminal arrays rather than
   one Map and object per state. Preserve the repository-internal builder contract
   used by the docs. Measure construction, retained heap plus buffers, and scan
   speed, including 10k, 100k and 1m dictionaries; report tradeoffs.
3. **Selected matching:** avoid duplicate terminal enumeration and prune suffix
   outputs that cannot affect selection. Preserve lazy bounded lookahead, input
   order ties, and independent iterators. Compare against all-match sort/greedy
   references and measure dense suffix/duplicate scenarios.
4. **Word boundaries:** opt-in whole-word matching based on Intl word segmentation,
   with a documented locale. Apply boundary filtering before selection. Cover
   underscores, punctuation, Chinese and overlaps in every querying API.
5. **Compiled persistence:** versioned serialization and validated loading of the
   compiled representation. Copy imported arrays, validate structural invariants,
   and define metadata encoding and segmentation compatibility. Loading must not
   reconstruct the dictionary trie. Cover corruption and round-trip parity.
6. **Streaming:** incremental writes and explicit finish/cancel, retaining matching
   state and absolute offsets. Match whole-input results under arbitrary splits,
   including split surrogates, CRLF, combining sequences, regional indicators and
   ZWJ emoji. Document pending-tail limits and errors; never truncate silently.
7. **Text transformations:** opt-in normalization and Unicode case folding with
   original-range mapping. Exact matching remains the default. Specify transformed
   expansion boundaries and keep Unicode data out of the default core bundle.

The feature branch includes unit and declaration tests, English/Chinese
documentation and packed ESM/CommonJS consumer coverage. Finish with strict doctor,
full repository checks, declaration checks, package tests, docs E2E and benchmark
reports. Submit the completed feature branch for CI; keep release preparation
separate from publication.

## Local validation before PR

- All seven stages implemented. Strict doctor, full repository checks, 158 unit
  tests, declaration and packed-consumer checks, and 23 browser tests passed.
- The 16-scenario benchmark survey, targeted regression recheck, and 10k/100k/1m
  scale report use the same compiled implementation fingerprint.
- A minor change intent is included. Merge requires feature PR CI; the prepared
  version PR must remain open.
