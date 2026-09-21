# 快速开始

本站对应工作区中**尚未发布的 v3**。npm 当前的 v2 使用不同的结果结构，请参阅 [v2 → v3 迁移说明](https://github.com/sonofmagic/modern-ahocorasick/blob/main/packages/modern-ahocorasick/MIGRATION.md)。

## 安装

```sh
pnpm add modern-ahocorasick
```

v3 发布前，请在此仓库构建工作区包后运行示例。发布 npm 与网站部署均需单独执行。

## ESM 与 CommonJS

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

CommonJS 直接返回构造函数。类型声明需要 TypeScript 5.3 或更新版本。运行环境需要 `Intl.Segmenter`；开发工具要求 Node ≥22.13。

## 本地开发文档站

```sh
pnpm install --frozen-lockfile
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

开发命令会先构建工作区库包，预览命令在构建后运行。无需后端、账号或部署配置。

继续阅读 [API](./api)，或打开[可视化工作台](./visualization)。
