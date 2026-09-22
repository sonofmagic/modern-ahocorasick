---
title: "后端选择与性能"
description: "根据实际词典、输入和输出规模的测量结果选择后端。"
---

# 后端选择与性能

根据实际词典、输入和输出规模的测量结果选择后端。

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
当前通用游标的开销也可能主导扫描。在 Node 24.18.0 / Apple M4 Max 的一万词条 ASCII
对照中，`/fast` 构建和搜索耗时分别为 28.23 ms、4.34 ms，默认后端为 13.61 ms、2.00 ms。
保留堆分别为 3.52 MiB、0.47 MiB，数组缓冲分别为 1.18 MiB、1.60 MiB。这些是三轮中位数，
不代表其他词典的结果。边界和折叠使用通用游标，所以带过滤的
`count()` 会枚举通过过滤的结果。默认精确计数和检测仍使用低分配路径。

能力对照固定为 `@monyone/aho-corasick@1.5.10`、`@tanishiking/aho-corasick@0.0.1`。
它们的坐标、重复词条和 Unicode 契约不同；本库保持自身语义，不复刻缺陷或方法别名。
运行 `pnpm benchmark:external` 查看可打印 ASCII 对照，分别报告统一后的独立范围、
原生结果、构建成本及内存。

## 复现与解读

```sh
pnpm benchmark
pnpm benchmark:external
pnpm benchmark:docs
```

在仓库中运行这些命令。分别比较构建与扫描时间、保留堆和缓冲区；`getStats().typedArrayBytes` 不是总堆内存。过滤、折叠、结果数组及 `longest-first` 还有默认精确扫描之外的开销。工作台时间包含防抖、Worker 和传输，不是库性能基准。

测量来源：[Extension benchmarks](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks-extensions.md) · [v2/v3 benchmarks](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks.md) · [ASCII benchmarks](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks-ascii.md) · [Workbench measurements](https://github.com/icelib/modern-ahocorasick/blob/main/docs/workbench-performance.md)
