# modern-ahocorasick

## 3.3.0

### Minor Changes

- Add transformed streaming, first-hit queries, portable artifacts, async dynamic compilation and snapshot persistence

### Patch Changes

- Fix transformed token and replacement streams losing early matches or selecting overlaps. Share incremental stream processing, enforce original-text buffer limits, release obsolete mapping and lifecycle state, and preserve original Unicode boundaries, word context and protected text before selection.

- Reduce dictionary construction memory with a numeric compact builder shared by all backends

- Accelerate result-producing ASCII scans while preserving grapheme boundaries, original ranges, and lazy non-overlapping selection.

## 3.2.0

### Minor Changes

- Add dynamic dictionary snapshots and incremental matching, tokenization and replacement with Unicode chunk parity, cancellation, buffer limits and Node/Web stream adapters.

- Add boundary-aware matching, global longest-first selection, original-range tokenization, optional Unicode 17.0 full case folding, and reusable per-operation replacement helpers.

- Add an optional double-array backend, protected Markdown/URL streaming filters, provisional token previews and development-only comparative benchmarks.

- Add original-grapheme-validated UTF-16 search ranges and anchoring across whole-text queries, cached immutable compilation statistics, and contiguous double-array terminal storage. Keep full-input boundary context and reject offline range options on streams.

## 3.1.0

### Minor Changes

- Add countByPattern() to count every input pattern without enumerating individual matches, preserving overlaps, duplicate entries and exact Unicode grapheme matching.

  Compact retained automaton storage and prune dominated selected matches. Add whole-word boundaries, validated compiled dictionary persistence with metadata codecs, and incremental Unicode streams with explicit EOF, cancellation and buffer limits.

  Add the optional modern-ahocorasick/text entry for normalization and full Unicode 17 case folding with original-text ranges and safe expansion boundaries.

### Patch Changes

- Refresh package metadata and English/Chinese READMEs for v3, include the Chinese README in npm packages, and correct published-version documentation.

## 3.0.0

### Major Changes

- Return independent UTF-16 match ranges with metadata, add lazy iteration and non-overlapping replacement, and make automaton state private. Empty keywords now throw RangeError. TypeScript declarations require TypeScript 5.3 or newer.

### Minor Changes

- Add allocation-light occurrence counting and lazy non-overlapping iteration; use bounded candidate selection for search and replacement while preserving Unicode and module contracts.

### Patch Changes

- Update repository links for the move to the icelib GitHub organization and migrate the release workflow to npm trusted publishing. Package names and public APIs are unchanged.

- Accelerate dictionary construction, ASCII counting and presence queries while preserving exact Unicode fallback and original UTF-16 ranges

- Migrate repository tooling to repoctl while preserving ESM, CommonJS and TypeScript package entrypoints.
