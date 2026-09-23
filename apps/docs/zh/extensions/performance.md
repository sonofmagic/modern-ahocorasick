---
title: "后端选择与性能"
description: "根据实际词典、输入和输出规模的测量结果选择后端。"
---

<script setup>
import PerformanceCharts from "../../src/PerformanceCharts.vue"
import { data } from "../../src/performance.data"
</script>

# 后端选择与性能

根据实际词典、输入和输出规模的测量结果选择后端。

## 性能图表

<PerformanceCharts :data="data" language="zh" />

## 后端选择

优先使用默认紧凑后端。`/fast` 显式选择双数组存储；`/unicode-fast` 将该后端与完整折叠结合。默认入口不会加载可选编译器或折叠数据。

```ts
import FastAhoCorasick from 'modern-ahocorasick/fast'

const matcher = new FastAhoCorasick(['cat'])
matcher.search('cat')[0]?.start // 0
matcher.getStats().backend // 'double-array'
```

## 实测取舍

`/fast` 是显式选择的双数组后端，不保证普遍更快。它可能减少 ArrayBuffer 存储，却增加 JavaScript 堆占用；
通用游标的开销也可能主导扫描。以下数据来自流式处理、扫描器与构建器优化之前的快照。
在 Node 24.18.0 / Apple M4 Max 的一万词条 ASCII
对照中，`/fast` 构建和搜索耗时分别为 28.23 ms、4.34 ms，默认后端为 13.61 ms、2.00 ms。
保留堆分别为 3.52 MiB、0.47 MiB，数组缓冲分别为 1.18 MiB、1.60 MiB。这些是三轮中位数，
不代表优化后的构建或其他词典的结果。边界和折叠使用通用游标，所以带过滤的
`count()` 会枚举通过过滤的结果。默认精确计数和检测仍使用低分配路径。

能力对照固定为 `@monyone/aho-corasick@1.5.10`、`@tanishiking/aho-corasick@0.0.1`。
它们的坐标、重复词条和 Unicode 契约不同；本库保持自身语义，不复刻缺陷或方法别名。
运行 `pnpm benchmark:external` 查看可打印 ASCII 对照，分别报告统一后的独立范围、
原生结果、构建成本及内存。

三代版本对比使用 `pnpm benchmark:versions`：固定 npm v1.1.0、v2.0.4，与当前本地默认入口比较构建、原生搜索、独立范围转换和保留内存。Unicode 结果不正确的旧版场景不计算速度比。[优化后版本对照](https://github.com/icelib/modern-ahocorasick/blob/main/docs/optimization-report.zh-CN.md) 包含本轮测量；[较早的 v1／v2／v3 报告](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks-versions.zh-CN.md) 保留为历史快照。

优化构建的五轮对照中，独立范围输出在全部 14 份语料中均快于 v2；七轮复测确认 v1 扫描部分 ASCII 输入仍更快，历史原生分组输出的分配成本也不同。一万词条的词典保留堆加缓冲约为 2.08 MiB，两个旧版均约 7.03 MiB。选择版本应结合输出契约和负载，不能据此作普遍速度排名。

[流式处理、扫描与构建优化报告](https://github.com/icelib/modern-ahocorasick/blob/main/docs/optimization-report.zh-CN.md) 记录后续改动相对 `b01c9f2` 的测量：转换流的增量保留内存、18 场景扫描器对照、词典保留内存，以及一万至百万词条冷构建。报告区分预热重复构建、保留堆、ArrayBuffer 存储与构建峰值 RSS，并提供各进程原始数据、实现摘要和专项复测。

对于单个状态可能产生大量匹配的词典，完整枚举使用原生字素分段，以避免密集输出时的额外开销。这些词典在输入只有少量命中或没有命中时，也使用相同路径。因此 ASCII 加速取决于词典和文本，应同时测量具有代表性的无命中输入。计数和选中匹配扫描保持各自路径。

## 复现与解读

```sh
pnpm benchmark
pnpm benchmark:external
pnpm benchmark:versions
pnpm benchmark:scale
pnpm benchmark:stream
pnpm benchmark:docs
```

在仓库中运行这些命令。分别比较构建与扫描时间、保留堆和缓冲区；`getStats().typedArrayBytes` 不是总堆内存。过滤、折叠、结果数组及 `longest-first` 还有默认精确扫描之外的开销。工作台时间包含防抖、Worker 和传输，不是库性能基准。

测量来源：[Extension benchmarks](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks-extensions.md) · [v2/v3 benchmarks](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks.md) · [ASCII benchmarks](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks-ascii.md) · [Workbench measurements](https://github.com/icelib/modern-ahocorasick/blob/main/docs/workbench-performance.md)
