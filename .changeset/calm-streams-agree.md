---
"modern-ahocorasick": patch
---

Fix transformed token and replacement streams losing early matches or selecting overlaps. Share incremental stream processing, enforce original-text buffer limits, release obsolete mapping and lifecycle state, and preserve original Unicode boundaries, word context and protected text before selection.
