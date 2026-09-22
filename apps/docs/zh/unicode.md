---
title: "字素与 UTF-16 索引"
description: "按完整字素匹配，使用 UTF-16 范围切片原始 JavaScript 字符串。"
---

# 字素与 UTF-16 索引

按完整字素匹配，使用 UTF-16 范围切片原始 JavaScript 字符串。

## 匹配单位是字素簇

`Intl.Segmenter` 将文本分成用户感知的字素簇。家庭 emoji `👨‍👩‍👧‍👦` 是一个字素，但占 11 个 UTF-16 码元；`é`（e 加组合重音）是一个字素，占两个码元。JavaScript `slice()` 按 UTF-16 码元计数。

```ts
import AhoCorasick from 'modern-ahocorasick'

const text = '😀é👨‍👩‍👧‍👦'
const ac = new AhoCorasick(['é', '👨‍👩‍👧‍👦'])
ac.search(text)
// é: start 2, end 4; 家庭: start 4, end 15
```

工作台显示的字素结束索引分别为 `1` 与 `2`；库返回范围 `[2, 4)` 与 `[4, 15)`。它们描述相同命中，但只有后者可直接用于 `slice()`。

## 精确边界与字符形式

关键词必须匹配完整字素。`e` 不匹配 `é` 的内部；单个人物 emoji 不匹配 ZWJ 家庭内部。规范等价的形式不会自动视为相同：`é` 与 `é` 是不同输入。核心构造器不执行归一化或大小写折叠。

参见 [可选归一化](/zh/unicode/normalization)；另见 [完整大小写折叠](/zh/unicode/case-folding)。

## 空输入

`new AhoCorasick([])` 合法，扫描无结果。`new AhoCorasick([''])` 抛出 `RangeError`，空关键词不是通配符。工作台按逗号拆分关键词、去除两端空白并忽略空项，但完整保留待搜索文本的空格与换行，重复关键词仍保留。

## ASCII 加速与运行时版本

Unicode 分段跟随宿主 ICU 版本，新字符在不同运行时中可能有差异。ASCII 优化保持相同的精确字素语义，包括 CRLF 与组合字符。库的一致性测试覆盖 Node，以及 Chromium、Firefox 和 WebKit 的原生分段器。

参见 [性能与运行时开销](/zh/extensions/performance)。
