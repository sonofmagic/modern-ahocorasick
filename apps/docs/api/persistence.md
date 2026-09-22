---
title: "Compiled dictionaries"
description: "Save an opaque compiled dictionary and validate it when loading, instead of rebuilding its trie."
---

# Compiled dictionaries

Save an opaque compiled dictionary and validate it when loading, instead of rebuilding its trie.

## Save and load

`serialize(options?)` returns an opaque versioned string; use
`AhoCorasick.deserialize(serialized, options?)` to load it. Store the string in a
file, database or Worker message using your platform's APIs. Loading validates
and copies numeric scan tables without rebuilding the trie. It checks trie
structure, failure/output links, terminal identities and each dictionary pattern's
grapheme segmentation against the current runtime. A segmentation mismatch or
invalid/unsupported payload throws `TypeError`. This validates dictionary
compatibility, not equality of every ICU rule for arbitrary future input.

```ts
import AhoCorasick from 'modern-ahocorasick'

const saved = new AhoCorasick([{ pattern: 'cat', data: { id: 7 } }]).serialize()
const loaded = AhoCorasick.deserialize(saved)
loaded.count('cat cat') // 2
```

## Metadata codecs

Metadata must contain only JSON-compatible values: finite numbers, strings,
booleans, null, arrays and plain objects. Undefined metadata is preserved as
absent; undefined nested values, functions, symbols, bigint, cycles, Date and Map
are rejected instead of silently discarded. Metadata can use explicit codecs:

```ts
import AhoCorasick from 'modern-ahocorasick'

const dates = new AhoCorasick([{ pattern: 'today', data: new Date('2026-09-22') }])
const saved = dates.serialize({ encodeData: date => date.toISOString() })
const loaded = AhoCorasick.deserialize(saved, {
  decodeData: value => new Date(String(value)),
})
```

Without a decoder, loaded metadata has type `unknown`; validate it in your decoder
before treating persisted external data as an application type. Codecs run only
for defined metadata and their errors propagate. Treat the payload as opaque:
version 1 is supported, but its internal keys are not a public table API. Loading
still validates every pattern and costs time proportional to dictionary size;
benchmark it for your dictionary rather than assuming constant-time startup.

## Supported profiles and cost

Persistence supports the default exact matcher and /fast, which saves the portable compact format. serializeArtifact() wraps the same payload with validated segmentation, backend, unit, dictionary summary, compilation statistics and a payload checksum; load it with AhoCorasick.deserializeArtifact() when distributing a prebuilt dictionary to a Worker or Serverless process. Constructor character boundaries and folding profiles cannot be serialized: saving them throws rather than silently dropping options. The /text entry has its own transformation-aware serialize() and deserialize() methods. Loading still costs time proportional to dictionary size.
