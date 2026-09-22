---
title: "版本与第三方迁移"
description: "迁移已有代码时，重点检查结果坐标、选择语义和流式生命周期。"
---

# 版本与第三方迁移

迁移已有代码时，重点检查结果坐标、选择语义和流式生命周期。

## 从 v2 升级至 v3

v2 返回 `[endingGraphemeIndex, keywords[]][]` 分组结果。v3 返回独立的 `Match` 对象，使用原文 UTF-16 `start` 和不包含结束位置的 `end`。升级时修改元组解构，直接使用 `text.slice(hit.start, hit.end)`。重复词条通过 `patternIndex` 保持独立。

```ts
import AhoCorasick from 'modern-ahocorasick'

const text = '😀cat'
const hit = new AhoCorasick(['cat']).search(text)[0]!
console.log([hit.start, hit.end]) // [2, 5]
text.slice(hit.start, hit.end) // 'cat'
```

空词条现在抛出 `RangeError`，非法运行时参数抛出 `TypeError`。自动机表和构建器属于私有实现。ESM 默认导入、CommonJS 直接构造器和命名类型导入继续受支持。

完整的 [v2 → v3 migration guide](https://github.com/icelib/modern-ahocorasick/blob/main/packages/modern-ahocorasick/MIGRATION.md) 记录了当时的不兼容变更。

## 从 v3.1 升级至 v3.2

现有 `matcher.createStream({ maxBufferedUnits, wholeWord, locale })` 保留 `write/finish/cancel` 生命周期，重复 `finish()` 仍抛错。新增 `/stream` 接口使用 `write/end/destroy` 和 `maxBufferLength`，也接受 `wholeWord`、`locale`；整词流保留最后一个未确认行以维持 ICU 上下文，受缓冲上限约束。构造器字符边界与查询整词边界取交集。

`/text` 保留归一化与 Turkic 折叠，是整段文本适配器；默认完整折叠的流式场景使用 `/unicode`。精确匹配器和 `/fast` 保留 `serialize()`，后者输出兼容的紧凑格式。带构造器字符边界或折叠配置的实例不支持序列化，调用会抛错，不会静默丢失配置。`countByPattern()`、现有持久化接口和所有已有默认行为保持兼容。

参见 [核心流](/zh/stream/core)；另见 [新增会话](/zh/stream/sessions)。

## 从参考包迁移

| 参考能力                           | 本包公开 API                                          | 需要确认的契约                              |
| ---------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| Monyone 检测、匹配、替换           | `match`、`search`、`replace`                          | 原文 UTF-16 范围，字面替换                  |
| Monyone 动态编辑与分块处理         | `/dynamic`、`/stream`、平台适配器                     | 显式编译修改，旧快照继续有效                |
| Monyone 分词、跳过规则与预览       | `tokenize`、`/stream/filters`、token 会话 `preview()` | 受限语法和整体可替换的暂定后缀              |
| Monyone 快速后端                   | `/fast`                                               | 显式启用，按实际词典测量                    |
| Tanishiking `caseInsensitive`      | `/unicode`                                            | 完整 Unicode 折叠，包括扩展映射             |
| Tanishiking `onlyWholeWords`       | 构造器 `boundary: 'ascii'`                            | 字符边界规则；`wholeWord` 使用 ICU 单词分段 |
| Tanishiking `allowOverlaps: false` | `strategy: 'longest-first'`                           | 原文字素长度优先，同长按起点和索引决胜      |

例如，将忽略大小写且不允许重叠的词典迁移为：

```ts
import UnicodeAhoCorasick from 'modern-ahocorasick/unicode'

const matcher = new UnicodeAhoCorasick(['STRASSE', 'ss'], { boundary: 'ascii' })
const matches = matcher.search('Straße ss', { strategy: 'longest-first' })
// [{ pattern: 'STRASSE', start: 0, end: 6, patternIndex: 0, data: undefined },
//  { pattern: 'ss', start: 7, end: 9, patternIndex: 1, data: undefined }]
```

可直接使用 `text.slice(match.start, match.end)`：Tanishiking 的 `end` 包含结束位置，
本包的 `end` 不包含结束位置。结果用 `pattern` 代替 `keyword`；重复输入词条保留独立的
`patternIndex` 与元数据。这里迁移的是功能意图，不提供第三方 API 兼容层。
