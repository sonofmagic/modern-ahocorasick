---
title: "快速开始"
description: "安装 modern-ahocorasick v3.2.0，完成第一次匹配。"
---

# 快速开始

安装 modern-ahocorasick v3.2.0，完成第一次匹配。

## 安装

```sh
pnpm add modern-ahocorasick
```

以下示例可直接使用已发布的 v3.2.0 包运行。

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

## 运行时与类型

CommonJS 直接返回构造函数。类型声明需要 TypeScript 5.3 或更新版本。运行环境需要 `Intl.Segmenter`；运行时目标为 ES2022。仓库开发环境要求见本地开发指南。

## 本地开发文档站

[本地开发文档站 →](/zh/contributing)

参见 [能力与入口选择](/zh/guide/choosing)。
