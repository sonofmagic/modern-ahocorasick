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
收集并排序有效候选。createStream() 对分块输入执行相同的逐字素转换，并把匹配映射回原文
UTF-16 范围；createTokenStream() 与 createReplaceStream() 提供对应的分块接口。分词流会
保留尚未结束的原文，直到 end() 才生成完整 token。serialize() 与
TextMatcher.deserialize() 会保存转换配置、原始关键词和转换后的编译词典。
可选转换需要额外内存和扫描开销，不执行模糊匹配、音译或语言排序比较。

参见 [支持流式处理的折叠](/zh/unicode/case-folding)。
