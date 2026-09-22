---
title: "Getting started"
description: "Install modern-ahocorasick v3.2.0 and find your first matches."
---

# Getting started

Install modern-ahocorasick v3.2.0 and find your first matches.

## Install

```sh
pnpm add modern-ahocorasick
```

The examples below work with published v3.2.0.

## ESM and CommonJS

```ts
import AhoCorasick from 'modern-ahocorasick'

const ac = new AhoCorasick(['he', 'she', 'his', 'hers'])
const matches = ac.search('ushers')
// [
//   { pattern: 'she', patternIndex: 1, start: 1, end: 4, data: undefined },
//   { pattern: 'he', patternIndex: 0, start: 2, end: 4, data: undefined },
//   { pattern: 'hers', patternIndex: 3, start: 2, end: 6, data: undefined },
// ]
```

```js
const AhoCorasick = require('modern-ahocorasick')

const ac = new AhoCorasick(['he'])
console.log(ac.match('ushers')) // true
```

## Runtime and types

CommonJS returns the constructor directly. TypeScript declarations require TypeScript 5.3 or newer. The runtime requires `Intl.Segmenter`; the runtime target is ES2022. Node.js development requirements are listed in the contributor guide.

## Develop this site

[Local documentation development →](/contributing)

See [Choose an API and entry](/guide/choosing).
