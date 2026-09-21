# modern-ahocorasick

用 Aho–Corasick 在 Unicode 文本中匹配多个关键词。字典只需编译一次，即可重复查找、计数或替换；返回的匹配范围可直接用于 JavaScript 的 `slice()`。

[![npm](https://img.shields.io/npm/v/modern-ahocorasick)](https://www.npmjs.com/package/modern-ahocorasick)
[![CI](https://github.com/icelib/modern-ahocorasick/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/icelib/modern-ahocorasick/actions/workflows/test.yml)
[![MIT license](https://img.shields.io/npm/l/modern-ahocorasick)](https://github.com/icelib/modern-ahocorasick/blob/main/LICENSE)

[English](https://github.com/icelib/modern-ahocorasick/blob/main/README.md) · **简体中文**

[使用文档](https://aho.icebreaker.top/zh/) · [交互工作台](https://aho.icebreaker.top/zh/visualization) · [API 参考](https://aho.icebreaker.top/zh/api)

## 安装并查找匹配

```sh
npm install modern-ahocorasick
# 或者：pnpm add modern-ahocorasick
```

```js
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['cat', '猫'])
const text = '😀cat和猫'

const matches = matcher.search(text)
// [
//   { pattern: 'cat', patternIndex: 0, start: 2, end: 5, data: undefined },
//   { pattern: '猫', patternIndex: 1, start: 6, end: 7, data: undefined },
// ]

matches.map(({ start, end }) => text.slice(start, end))
// ['cat', '猫']
```

匹配以完整的 Unicode 字素簇为单位，包括 emoji 和组合字符。结果使用原文的 **UTF-16 偏移量**：包含 `start`，不包含 `end`。同一个匹配器可以处理多段文本；需要修改字典时，请创建新实例。

## 选择合适的方法

| 需求               | 方法                                        | 返回结果                               |
| ------------------ | ------------------------------------------- | -------------------------------------- |
| 判断是否存在关键词 | `match(text)`                               | 布尔值；首次命中后停止                 |
| 统计所有出现次数   | `count(text)`                               | 数值；包含重叠匹配和重复字典项         |
| 分别统计每个词条   | `countByPattern(text)`                      | 按输入顺序返回次数，保留零次及重复词条 |
| 匹配分块输入       | `createStream(options?)`                    | 连续写入、结束刷新和取消               |
| 保存或加载词库     | `serialize()` / `AhoCorasick.deserialize()` | 带版本和校验的编译数据                 |
| 收集匹配范围       | `search(text, options?)`                    | 独立匹配对象组成的数组                 |
| 按需读取匹配       | `iterate(text, options?)`                   | 惰性匹配迭代器                         |
| 替换不重叠的匹配   | `replace(text, replacement, options?)`      | 新字符串                               |

`count()` 不创建匹配对象。`iterate()` 不收集结果数组，停止迭代后也会停止扫描。它接收完整字符串；分块输入使用 `createStream()`。迭代器会持有原文和字典。

```js
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['he', 'she', 'hers'])

matcher.match('ushers') // true
matcher.count('ushers') // 3：'she'、'he' 和 'hers' 存在重叠
matcher.countByPattern('ushers') // [1, 1, 1]

for (const hit of matcher.iterate('ushers')) {
  console.log(hit.pattern) // 'she'
  if (hit.pattern === 'she') {
    break
  }
}
```

完整签名和参数校验规则见 [API 参考](https://aho.icebreaker.top/zh/api)。

## 更多匹配工具

`countByPattern()`、完整词选项、流式扫描、编译词库保存及可选文本适配器需要
v3.1.0 或更高版本。

```ts
matcher.countByPattern('ushers') // [1, 1, 1]
new AhoCorasick(['cat']).match('concatenate', { wholeWord: true, locale: 'en' }) // false
const restored = AhoCorasick.deserialize(matcher.serialize())
const stream = restored.createStream()
const hits = [...stream.write('ush'), ...stream.write('ers'), ...stream.finish()]
```

需要归一化或完整 Unicode 大小写折叠时，从 `modern-ahocorasick/text` 导入独立的
`TextMatcher` 构造器。它会把结果映射回原文 UTF-16 范围，包括 `ß` → `ss` 这类展开。
默认入口保持精确匹配，不加载折叠表。

词边界规则、元数据编解码、流式缓冲和取消、转换开销详见
[API 指南](https://aho.icebreaker.top/zh/api#完整词匹配)。流的待定尾部有明确上限，
不会静默截断。

## 选择重叠处理策略

`search()` 和 `iterate()` 默认使用 `all`。需要互不重叠的范围时，例如文本高亮，可选择以最左起点优先的策略。

| 策略               | 选择规则                                       | 返回顺序                                   |
| ------------------ | ---------------------------------------------- | ------------------------------------------ |
| `all`              | 返回所有出现位置，包含重叠匹配和重复字典项     | 终点升序，其次按模式长度降序，再按输入顺序 |
| `leftmost-first`   | 起点最左优先；同起点按字典输入顺序选择         | 起点升序，互不重叠                         |
| `leftmost-longest` | 起点最左优先；同起点选择最长模式，再按输入顺序 | 起点升序，互不重叠                         |

```js
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['a', 'ab', 'bc'])

matcher.search('abc', { strategy: 'leftmost-first' }).map(hit => hit.pattern)
// ['a', 'bc']
matcher.search('abc', { strategy: 'leftmost-longest' }).map(hit => hit.pattern)
// ['ab']
```

“最长”只用于同起点的候选，不是在全文中选择最长匹配。相邻匹配会保留。使用 `all` 时，首个结果是结束位置最早的匹配，不一定是起点最左的匹配。不重叠迭代可能向前读取最多相当于最长关键词字素长度的内容。

## 附加元数据并替换文本

字典项可以是字符串，也可以是 `{ pattern, data }` 对象。每个输入项保留自己的 `patternIndex`，因此相同关键词也能区分。元数据由调用者管理，按引用保留，不做深拷贝。修改输入记录或返回的匹配对象不会重新配置匹配器。

```js
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick([
  { pattern: 'cat', data: { replacement: '猫' } },
  { pattern: 'dog', data: { replacement: '狗' } },
])

matcher.replace('cat and dog', hit => hit.data.replacement)
// '猫 and 狗'
matcher.replace('cat', '$&') // '$&'：字符串替换值按字面量处理
```

`replace()` 默认使用 `leftmost-longest`，也接受 `leftmost-first`，但不接受 `all`。回调接收 `(match, originalSubstring)`，必须返回字符串。替换仅对原文范围执行一次，不会再次扫描插入的文本。库返回字符串和范围，不生成 HTML；高亮时请按渲染框架的规则转义文本。

## Unicode 与兼容性

匹配区分大小写，不做 Unicode 归一化。`é` 和 `e\u0301` 是不同的模式，`e` 不会命中 `e\u0301` 内部。字素边界由运行环境的 ICU/Unicode 版本决定。示例和坐标约定见 [Unicode 与索引](https://aho.icebreaker.top/zh/unicode)。

| 环境                | 要求                                             |
| ------------------- | ------------------------------------------------ |
| JavaScript 运行环境 | 支持 ES2022 和 `Intl.Segmenter`；不内置 polyfill |
| 模块格式            | ESM 默认导入，或 CommonJS 直接 `require()`       |
| TypeScript          | 使用内置类型声明需要 5.3+                        |

```js
const AhoCorasick = require('modern-ahocorasick')

const matcher = new AhoCorasick(['cat'])
matcher.match('cat') // true
```

```ts
import type { Match, PatternInput } from 'modern-ahocorasick'
import AhoCorasick from 'modern-ahocorasick'

const patterns: PatternInput<{ id: string }>[] = [
  { pattern: 'cat', data: { id: 'animal-cat' } },
]
const matcher = new AhoCorasick(patterns)
const matches: Match<{ id: string }>[] = matcher.search('cat')
```

允许空字典。空关键词抛出 `RangeError`，无效的运行时参数抛出 `TypeError`。计数超过 `Number.MAX_SAFE_INTEGER` 时抛出 `RangeError`。仓库开发所需的 Node.js 版本不等同于使用此包的运行环境要求。

## 从 v2 升级

v3 已在 npm 发布。`search()` 现在返回带 UTF-16 范围的独立匹配对象，代替按终点分组的元组。默认构造函数导出、CommonJS 直接 `require()` 和 `match(text): boolean` 均保留支持。

升级请阅读 [v2 → v3 迁移指南](https://github.com/icelib/modern-ahocorasick/blob/main/packages/modern-ahocorasick/MIGRATION.md)，版本变更见 [changelog](https://github.com/icelib/modern-ahocorasick/blob/main/packages/modern-ahocorasick/CHANGELOG.md)。

## 性能

Aho–Corasick 会编译可复用的字典。设输入有 `g` 个字素、产生 `z` 次匹配，设最大转移分支数为 d，不计运行环境的分段成本，全匹配搜索耗时为 O(g log(d + 1) + z)。`count()` 使用聚合计数，扫描耗时为 O(g log(d + 1))；`match()` 可以提前结束。搜索会保留结果数组，不重叠选择使用由最长关键词长度限制的候选窗口。替换仍需分配输出文本。

性能取决于字典、输入、结果密度和运行环境。[可复现的基准报告](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks-ascii.md)包含具体工作负载的结果、内存测量和比较限制。

## 参与开发

本地开发、验证、发布与文档部署流程见[贡献指南](https://github.com/icelib/modern-ahocorasick/blob/main/CONTRIBUTING.md)。[报告问题](https://github.com/icelib/modern-ahocorasick/issues)时，请附上最小复现和运行环境版本。

## 许可证与致谢

采用 [MIT 许可证](https://github.com/icelib/modern-ahocorasick/blob/main/LICENSE)。最初 fork 自 [BrunoRB/ahocorasick](https://github.com/BrunoRB/ahocorasick)，基于 Aho 与 Corasick 的论文 “Efficient string matching: an aid to bibliographic search”。现代版本由 [SonOfMagic](https://github.com/sonofmagic) 维护。

可选文本适配器包含 Unicode 17 大小写折叠数据，采用
[Unicode License V3](https://github.com/icelib/modern-ahocorasick/blob/main/packages/modern-ahocorasick/UNICODE-LICENSE.txt)。
