# modern-ahocorasick

## 3.0.0

### Major Changes

- Return independent UTF-16 match ranges with metadata, add lazy iteration and non-overlapping replacement, and make automaton state private. Empty keywords now throw RangeError. TypeScript declarations require TypeScript 5.3 or newer.

### Minor Changes

- Add allocation-light occurrence counting and lazy non-overlapping iteration; use bounded candidate selection for search and replacement while preserving Unicode and module contracts.

### Patch Changes

- Update repository links for the move to the icelib GitHub organization and migrate the release workflow to npm trusted publishing. Package names and public APIs are unchanged.

- Accelerate dictionary construction, ASCII counting and presence queries while preserving exact Unicode fallback and original UTF-16 ranges

- Migrate repository tooling to repoctl while preserving ESM, CommonJS and TypeScript package entrypoints.
