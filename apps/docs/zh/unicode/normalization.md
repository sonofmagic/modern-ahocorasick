---
title: "归一化与 TextMatcher"
description: "通过 /text 入口为完整字符串启用归一化或土耳其语大小写折叠（v3.1.0+）。"
---

# 归一化与 TextMatcher

通过 /text 入口为完整字符串启用归一化或土耳其语大小写折叠（v3.1.0+）。

## 配置转换

从 `modern-ahocorasick/text` 导入 `TextMatcher`；默认入口不加载 Unicode 折叠表。
`TextMatcher<T>` 接受相同的关键词输入，以及
`{ normalization?: 'NFC' | 'NFD' | 'NFKC' | 'NFKD', caseFold?: boolean | 'turkic' }`。
两项转换默认关闭。`caseFold: true` 使用 Unicode 17 完整大小写折叠，不依赖语言；
`'turkic'` 使用 Unicode 对带点／不带点 I 的特殊映射。归一化使用运行时的 Unicode 实现。

```ts
import TextMatcher from 'modern-ahocorasick/text'

const matcher = new TextMatcher(['STRASSE', 'é'], {
  caseFold: true,
  normalization: 'NFC',
})
const text = 'Straße e\u0301'
matcher.search(text).map(hit => text.slice(hit.start, hit.end))
// ['Straße', 'e\u0301']
matcher.replace(text, 'X') // 'X X'
```

## 原文范围

关键词和文本均按原始字素依次执行归一化、折叠，再执行一次所选归一化。结果保留输入时
的 `pattern`、`patternIndex` 和元数据；范围与替换回调中的文本指向原文。只接受覆盖
完整原始字素的匹配：折叠后 `ss` 可以匹配 `ß`，但 `s` 不会命中其一半；NFKC 下 `fi`
可以匹配 `ﬁ`，而 `f` 不行。完整词边界在原文上检查，先过滤再选择。`all` 按结束位置、
更早的开始位置、输入顺序排列；不重叠策略使用原文范围及既有优先规则。

## 流式、持久化与开销

适配器提供 `search`、`iterate`、`match`、`count`、`countByPattern`、`replace` 和 `tokenize`，
接受相同的查询选项与参数校验规则。它先处理完整字符串并创建偏移映射；不重叠迭代还会
收集并排序有效候选。`createStream()` 对分块输入执行相同的逐字素转换，对拼接后的转换文本
重新分字素，再把匹配映射回原文 UTF-16 范围。转换扩展中的局部匹配会在不重叠选择之前被
排除。`createTokenStream()` 与 `createReplaceStream()` 复用同一增量流式核心，稳定结果会
在 EOF 前输出：必须消费每次 `write()` 的返回值，以及匹配流的 `finish()` 或分词／替换流的 `end()`。

```ts
const stream = matcher.createReplaceStream('X')
const output = [
  ...stream.write('Stra'),
  ...stream.write('ße!'),
  ...stream.end(),
].join('') // 'X!'
```

流会丢弃已提交原文及过期坐标映射。未决原文尾部的上限为
`maxBufferLength ?? maxBufferedUnits ?? 1_048_576` 个 UTF-16 单元；显式传入 `Infinity`
可关闭限制。该尾部包含未完成字素、转换尾、待选匹配、词边界上下文和受保护语法。
大输入块会分段处理，本身超过上限并不等于未决尾部溢出。这是尾部上限，不是进程总内存或
返回结果的上限。超过限制会抛出 `RangeError` 并关闭流。整词匹配可能需要等到换行或 EOF
才能确定原文词边界。

过滤器在转换前分类原文。分词流的 `preview()` 使用绝对原文坐标描述未决尾部，不推进实际
扫描器，其 token 仍是临时预览。取消、结束或失败都会释放保留的扫描状态；交错处理不同
输入时应分别创建流。

`serialize()` 与 `TextMatcher.deserialize()` 会保存转换配置、原始关键词和转换后的编译词典。
可选转换需要额外内存和扫描开销，不执行模糊匹配、音译或语言排序比较。

参见 [支持流式处理的折叠](/zh/unicode/case-folding)。
