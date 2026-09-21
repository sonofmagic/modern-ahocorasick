---
"modern-ahocorasick": minor
---

Add countByPattern() to count every input pattern without enumerating individual matches, preserving overlaps, duplicate entries and exact Unicode grapheme matching.

Compact retained automaton storage and prune dominated selected matches. Add whole-word boundaries, validated compiled dictionary persistence with metadata codecs, and incremental Unicode streams with explicit EOF, cancellation and buffer limits.

Add the optional modern-ahocorasick/text entry for normalization and full Unicode 17 case folding with original-text ranges and safe expansion boundaries.
