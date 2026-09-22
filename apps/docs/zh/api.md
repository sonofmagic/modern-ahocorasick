---
title: "API 概览"
description: "v3.2 API 返回原文 UTF-16 范围。按任务选择所需的结果形式。"
---

# API 概览

v3.2 API 返回原文 UTF-16 范围。按任务选择所需的结果形式。

| 需求                       | 方法                                            |
| -------------------------- | ----------------------------------------------- |
| 全部匹配或惰性结果         | [search / iterate](/zh/api/search)              |
| 是否命中、总数、各词条次数 | [match / count / countByPattern](/zh/api/count) |
| 替换或分词                 | [replace / tokenize](/zh/api/replace)           |
| 选择、过滤、限制范围       | [SearchOptions / QueryOptions](/zh/api/options) |
| 保存编译词典               | [serialize / deserialize](/zh/api/persistence)  |
| 检查编译存储               | [getStats](/zh/api/stats)                       |

## 构造函数

[查看专题说明 →](/zh/api/constructor)

## search(text, options?)

[查看专题说明 →](/zh/api/search)

## match(text, options?)

[查看专题说明 →](/zh/api/count)

## count(text, options?)

[查看专题说明 →](/zh/api/count)

## countByPattern(text, options?)

[查看专题说明 →](/zh/api/count)

## iterate(text, options?)

[查看专题说明 →](/zh/api/search)

## replace(text, replacement, options?)

[查看专题说明 →](/zh/api/replace)

## 私有状态

[查看专题说明 →](/zh/api/constructor)

## 完整词匹配

[查看专题说明 →](/zh/api/options)

## 保存与加载编译词库

[查看专题说明 →](/zh/api/persistence)

## createStream(options?)

[查看专题说明 →](/zh/stream/core)

## 可选归一化与大小写折叠

[查看专题说明 →](/zh/unicode/normalization)
