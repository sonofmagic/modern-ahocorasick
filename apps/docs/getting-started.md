# Getting started

These pages describe **v3**, available on npm. Upgrading from v2 changes the result format; see the [migration guide](https://github.com/icelib/modern-ahocorasick/blob/main/packages/modern-ahocorasick/MIGRATION.md).

## Install

```sh
pnpm add modern-ahocorasick
```

The examples below work with the published v3 package.

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

CommonJS returns the constructor directly. TypeScript declarations require TypeScript 5.3 or newer. The runtime requires `Intl.Segmenter`; development tooling requires Node 22.22.1+, 24.11+, or 26+, with pnpm 12.5.1.

## Develop this site

```sh
pnpm install --frozen-lockfile
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

The development command builds the workspace library first. Preview serves the static output after a build. No backend, account, or deployment configuration is needed.

Continue with [the API](./api) or [open the visualizer](./visualization).
