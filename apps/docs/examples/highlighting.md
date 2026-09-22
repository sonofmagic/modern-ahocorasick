---
title: "Safe highlighting"
description: "Render matched and unmatched fragments as text nodes, including input that looks like HTML."
---

# Safe highlighting

Render matched and unmatched fragments as text nodes, including input that looks like HTML.

## Browser example

Run this example in a browser module after the document body exists. It marks `cat` and displays `<img>` literally.

```ts
import AhoCorasick from 'modern-ahocorasick'

const text = '<img> a cat!'
const matcher = new AhoCorasick(['cat'])
const tokens = matcher.tokenize(text)
const container = document.createElement('p')
for (const token of tokens) {
  if (token.type === 'match') {
    const mark = document.createElement('mark')
    mark.textContent = token.text
    container.append(mark)
  }
  else {
    container.append(document.createTextNode(token.text))
  }
}
document.body.append(container)
```

## Overlaps and offsets

`tokenize()` defaults to `leftmost-longest` and rejects `all`. Concatenating token text reconstructs the original input. If you use `search()` instead, choose a non-overlapping strategy before slicing UTF-16 ranges; overlapping hits cannot directly partition the string.

## Framework rendering

Render `token.text` with your framework’s escaped text binding. Do not put user input into `innerHTML` or an HTML-rendering directive. Replacement helpers return strings, not safe HTML.

See [Token and replacement contracts](/api/replace).
