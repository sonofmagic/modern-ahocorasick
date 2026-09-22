---
title: "Replacement and tokenization"
description: "Replace selected ranges or split text into literal and matched tokens."
---

# Replacement and tokenization

Replace selected ranges or split text into literal and matched tokens.

## replace(text, replacement, options?)

Replaces non-overlapping original ranges once. Default strategy is `leftmost-longest`; `leftmost-first` and `longest-first` are also accepted, `all` is rejected. A callback receives `(match, originalSubstring)` and must return a string. String replacements are literal: `$&` has no special meaning. Inserted text is not searched again. Selected matches are consumed incrementally, although output text and intermediate string pieces still require memory.

```ts
import AhoCorasick from 'modern-ahocorasick'

new AhoCorasick(['cat']).replace('cat cat', '$&') // '$& $&'
```

## tokenize(text, options?)

`tokenize(text, options?)` defaults to `leftmost-longest` and rejects `all`. It returns
`Token<T>[]`: either `{ type: 'text', text, start, end }` or
`{ type: 'match', text, start, end, match }`. No empty text tokens are generated.
Concatenating `token.text` reconstructs the original input. The library emits no HTML.

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['cat'])
const tokens = matcher.tokenize('a cat!')
tokens.map(token => [token.type, token.text])
// [['text', 'a '], ['match', 'cat'], ['text', '!']]
tokens.map(token => token.text).join('') // 'a cat!'
```

## Selection and output

Both methods accept the three non-overlapping strategies. `longest-first` buffers candidates; the leftmost strategies settle candidates with bounded lookahead. Output strings and token arrays still consume memory. Query ranges filter matches while preserving text outside the range.

See [Safe highlighting](/examples/highlighting); see [Replacement helpers](/extensions/replacement-helpers).
