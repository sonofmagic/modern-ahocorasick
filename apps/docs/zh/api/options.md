---
title: "策略、边界与范围"
description: "先检查原文范围和边界，再选择匹配。这些选项不会改变坐标系统。"
---

# 策略、边界与范围

先检查原文范围和边界，再选择匹配。这些选项不会改变坐标系统。

## 选择策略

| 策略               | 规则                                                   |
| ------------------ | ------------------------------------------------------ |
| `all`（默认）      | 保留重叠结果。结束位置升序、关键词长度降序、输入顺序。 |
| `leftmost-first`   | 优先最左起点，同起点按关键词输入顺序。                 |
| `leftmost-longest` | 优先最左起点，同起点选择最长匹配，再按输入顺序。       |
| `longest-first`    | 全局优先选择原文字素最长的匹配，规则见下文。           |

两种 leftmost 策略会跳过与已选匹配重叠的候选，相邻匹配可同时保留。这两种策略在以最长关键词字素数为界的窗口中，每个起点只保留最佳候选，无需收集并排序全部命中。搜索仍会保存选中结果的数组。

新增离线策略 `longest-first`：候选按原文匹配字素长度降序，再按起点、输入索引升序排列；
依次保留不与已选结果重叠的候选，最后按原文顺序返回。词典 `['ab', 'bcdef', 'f']`
匹配 `abcdef` 时，`leftmost-longest` 选择 `ab, f`，`longest-first` 选择 `bcdef`。
整段搜索、迭代、替换和分词均支持新策略。它缓存候选与原文字素坐标，不是有限前瞻迭代器，
所有流式接口都会拒绝此策略。

## 构造器字符边界

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['cat'], { boundary: 'ascii' })
matcher.replace('cat category', 'DOG') // 'DOG category'
```

构造器的可选 `boundary` 默认是 `none`，在重叠选择之前应用于所有操作：

| 规则         | 对相邻原文字素的要求                                         |
| ------------ | ------------------------------------------------------------ |
| `none`       | 不限制                                                       |
| `ascii`      | 两侧都不以 ASCII A–Z、a–z、0–9 开头                          |
| `ascii-edge` | 仅当词条相应边缘以 ASCII 单词字符开头时，检查该侧 ASCII 边界 |
| `unicode`    | 两侧都不包含 Unicode 字母、数字、标记或下划线                |
| `whitespace` | 两侧为空白或输入边界                                         |
| 函数         | `(context: BoundaryContext) => boolean`                      |

回调收到 `left`、`right`、`first`、`last`、`pattern`、`patternIndex`；输入边界外的
`left`/`right` 为 `undefined`，字符上下文均为原文字素。回调必须返回布尔值，建议为纯函数，
异常直接传播。这些是字符边界规则，不是语言词法分词；Unicode 属性和字素行为跟随运行时版本。

## 完整词匹配

完整词匹配从 v3.1.0 起可用。

所有查询均接受 `{ wholeWord: true, locale: 'en' }`。`locale` 为 BCP 47 语言标记，
省略时使用运行时默认语言。匹配必须起于一个 `isWordLike` 词段的开头，止于另一个
`isWordLike` 词段的结尾；词段由 `Intl.Segmenter` 的 `word` 模式确定。短语可以跨词、
跨标点，纯标点模式不会命中。下划线通常属于单词；中文遵循运行时的语言分词规则。
指定语言可以明确意图，但不同 ICU 版本仍可能有差异。

```ts
import AhoCorasick from 'modern-ahocorasick'

const words = new AhoCorasick(['cat', 'cat_dog'])
words.countByPattern('concatenate cat cat_dog', { wholeWord: true, locale: 'en' })
// [1, 1]
```

边界过滤发生在不重叠选择之前。完整词模式会先对原文分词并保存边界集合；其
`count()`、`countByPattern()` 和 `match()` 会过滤逐次命中，因此不具备默认精确扫描
避免创建匹配对象或汇总状态的性能特性。非法选项对象、非布尔 `wholeWord` 或非字符串
`locale` 抛出 `TypeError`；格式错误的语言标记抛出 `RangeError`。
`count()`、`countByPattern()` 和 `match()` 始终考虑全部匹配，不接受策略参数。

构造器字符边界与每次查询的完整词边界取交集。

## 范围与锚定

所有整段查询支持 `start`、`end`、`anchored`，默认分别为 `0`、`text.length`、`false`。范围是原文 UTF-16 半开区间，坐标必须是输入范围内有序的安全整数，并落在原文字素边界，否则抛出 `RangeError`。非布尔 `anchored` 抛出 `TypeError`。空范围没有命中；锚定只接受恰好从 `start` 开始的命中。

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['abc', 'bc'])
matcher.search('!abc!', { start: 2, end: 4, anchored: true })
// [{ pattern: 'bc', patternIndex: 1, start: 2, end: 4, data: undefined }]
matcher.replace('!abc!', 'X', { start: 2, end: 4 }) // '!aX!'
```

`search`、`iterate`、`match`、`count`、`countByPattern`、`replace`、`tokenize` 共用此契约，包括 `/unicode`、`/fast`、`/unicode-fast` 和 `/text`。范围先过滤再选择，整词及构造器边界仍读取完整原文。替换和分词保留范围外文本；折叠、归一化不改变坐标系统。当前是语义范围过滤，不承诺耗时只与选定区间长度成正比。流式拒绝这些离线选项，包括 `anchored: false`。
