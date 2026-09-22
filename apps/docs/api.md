---
title: "API overview"
description: "The v3.2 API returns original-text UTF-16 ranges. Choose the smallest result shape your task needs."
---

# API overview

The v3.2 API returns original-text UTF-16 ranges. Choose the smallest result shape your task needs.

| Need                               | Method                                       |
| ---------------------------------- | -------------------------------------------- |
| Every match or lazy results        | [search / iterate](/api/search)              |
| Presence, totals, per-entry counts | [match / count / countByPattern](/api/count) |
| Replace or split text              | [replace / tokenize](/api/replace)           |
| Select, filter, restrict a range   | [SearchOptions / QueryOptions](/api/options) |
| Persist a compiled dictionary      | [serialize / deserialize](/api/persistence)  |
| Inspect compiled storage           | [getStats](/api/stats)                       |

## Constructor

[Read the focused reference →](/api/constructor)

## search(text, options?)

[Read the focused reference →](/api/search)

## match(text, options?)

[Read the focused reference →](/api/count)

## count(text, options?)

[Read the focused reference →](/api/count)

## countByPattern(text, options?)

[Read the focused reference →](/api/count)

## iterate(text, options?)

[Read the focused reference →](/api/search)

## replace(text, replacement, options?)

[Read the focused reference →](/api/replace)

## Private state

[Read the focused reference →](/api/constructor)

## Whole-word matching

[Read the focused reference →](/api/options)

## Compiled dictionaries

[Read the focused reference →](/api/persistence)

## createStream(options?)

[Read the focused reference →](/stream/core)

## Optional normalization and case folding

[Read the focused reference →](/unicode/normalization)
