---
title: "能力与入口选择"
description: "从默认匹配器开始，按任务需要选择额外能力。"
---

# 能力与入口选择

从默认匹配器开始，按任务需要选择额外能力。

## 按任务选择

| 任务               | 从这里开始                                      |
| ------------------ | ----------------------------------------------- |
| 查找全部范围       | [search / iterate](/zh/api/search)              |
| 判断存在性或计数   | [match / count / countByPattern](/zh/api/count) |
| 替换或高亮         | [replace / tokenize](/zh/api/replace)           |
| 归一化完整字符串   | [/text](/zh/unicode/normalization)              |
| 大小写折叠，含流式 | [/unicode](/zh/unicode/case-folding)            |
| 编辑词典           | [/dynamic](/zh/extensions/dynamic)              |
| 处理分块           | [/stream](/zh/stream/sessions)                  |

## 选择入口

| 入口                          | 导出                                                                     | 用途                                   |
| ----------------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| `modern-ahocorasick`          | 默认构造器、命名类型                                                     | 精确匹配、边界、四种选择策略、分词输出 |
| `/text`                       | 默认 `TextMatcher`                                                       | 现有整段归一化与大小写折叠             |
| `/unicode`                    | 默认构造器                                                               | Unicode 17.0 完整大小写折叠            |
| `/fast`                       | 默认构造器                                                               | 可选双数组 Trie                        |
| `/unicode-fast`               | 默认构造器                                                               | 完整折叠与双数组 Trie                  |
| `/dynamic`                    | 默认 `DynamicDictionary`、快照与编译器类型                               | 批量编辑与不可变编译快照               |
| `/replace`                    | `keep`、`remove`、`mask`、`fromMap`、`once`                              | 字面替换工具                           |
| `/stream`                     | 匹配/分词/替换会话与迭代接口                                             | 增量 Unicode 处理                      |
| `/stream/filters`             | `urls`、`markdown`、`protectedText`                                      | 跳过受保护语法                         |
| `/stream/node`、`/stream/web` | `createMatchTransform`、`createTokenTransform`、`createReplaceTransform` | 平台流适配                             |

以上是同一个包的子路径，不需要安装额外包。自动机表和共享内部代码不是公开入口。
默认入口不会加载折叠数据、双数组编译器或 Node 流模块。

## 版本与环境

本站介绍已发布的 v3.2.0。v3.0 引入扁平范围结果；v3.1 引入完整词查询、持久化、`countByPattern`、核心流和 `/text`；v3.2 引入字符边界、`longest-first`、分词、范围查询、统计及其他可选入口。所有入口支持 ESM 和 CommonJS，没有运行时依赖；类入口的 `require()` 直接返回构造器。

参见 [安装与运行要求](/zh/getting-started)。
