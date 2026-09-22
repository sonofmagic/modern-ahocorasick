---
title: "Choose an API and entry"
description: "Start with the default matcher, then opt into the capabilities your task needs."
---

# Choose an API and entry

Start with the default matcher, then opt into the capabilities your task needs.

## Choose by task

| Task                         | Start here                                   |
| ---------------------------- | -------------------------------------------- |
| Find every range             | [search / iterate](/api/search)              |
| Check presence or count      | [match / count / countByPattern](/api/count) |
| Replace or highlight         | [replace / tokenize](/api/replace)           |
| Normalize complete strings   | [/text](/unicode/normalization)              |
| Fold case, including streams | [/unicode](/unicode/case-folding)            |
| Edit dictionaries            | [/dynamic](/extensions/dynamic)              |
| Process chunks               | [/stream](/stream/sessions)                  |

## Pick an entry

| Entry                         | Exports                                                                  | Purpose                                                             |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `modern-ahocorasick`          | default constructor; named types                                         | Exact matching, boundaries, four selection strategies, tokenization |
| `/text`                       | default `TextMatcher`                                                    | Existing whole-text normalization and case folding                  |
| `/unicode`                    | default constructor                                                      | Unicode 17.0 full case folding                                      |
| `/fast`                       | default constructor                                                      | Optional double-array trie                                          |
| `/unicode-fast`               | default constructor                                                      | Full folding with the double-array trie                             |
| `/dynamic`                    | default `DynamicDictionary`; snapshot/compiler types                     | Batched edits and immutable compiled snapshots                      |
| `/replace`                    | `keep`, `remove`, `mask`, `fromMap`, `once`                              | Literal replacement callbacks                                       |
| `/stream`                     | match/token/replace sessions and iterable adapters                       | Incremental Unicode processing                                      |
| `/stream/filters`             | `urls`, `markdown`, `protectedText`                                      | Protect supported syntax from matching                              |
| `/stream/node`, `/stream/web` | `createMatchTransform`, `createTokenTransform`, `createReplaceTransform` | Platform stream adapters                                            |

Paths in this table are package subpaths, not additional packages. Internal tables and
shared implementation chunks are not public entry points. Importing the default
entry does not load the folding table, double-array compiler or Node stream modules.

## Version and environment

This site documents published v3.2.0. Core flat ranges arrived in v3.0; whole-word queries, persistence, `countByPattern`, core streams and `/text` in v3.1; character boundaries, `longest-first`, tokenization, range queries, statistics and the other optional entries in v3.2. All entries support ESM and CommonJS with no runtime dependencies. Class entries return the constructor directly from `require()`.

See [Installation and runtime requirements](/getting-started).
