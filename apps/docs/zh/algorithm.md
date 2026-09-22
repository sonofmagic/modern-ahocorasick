---
title: "算法原理"
description: "Aho–Corasick 将多个关键词编译成 Trie，并借助 failure 链接扫描文本。此实现将每个**字素簇**作为一条边的标签。"
---

# 算法原理

Aho–Corasick 将多个关键词编译成 Trie，并借助 failure 链接扫描文本。此实现将每个**字素簇**作为一条边的标签。

## 三种状态信息

1. **Goto 转移边**消耗匹配的字素，进入子状态。
2. **Failure 链接**指向同时也是 Trie 前缀的最长真后缀。回退不消耗当前字素，因此一个字素可能触发多次回退。
3. **Output 链接**连接终态后缀。每个节点只保存自身的终态关键词下标，避免复制继承结果数组。

根节点没有匹配边时，消耗并跳过当前字素。可视化将其画为标记 ∅ 的根自循环。

## 逐步扫描 ushers

关键词为 `he,she,his,hers`。开头的 `u` 停留在根；`s → h → e` 到达 `she`，输出 `she` 以及后缀 `he`。遇到 `r` 时，先回退到 `he` 对应状态，再消耗 `r`。最后的 `s` 输出 `hers`。

教学分组结果为 `[[3, ['she', 'he']], [5, ['hers']]]`。这些数值是从零开始的**字素结束索引**，不是 v3 的切片坐标。

## 阅读工作台

[查看操作、轨迹解读与输入限制 →](/zh/workbench/guide)

## 开销与适用范围

默认后端保存已驻留符号和稀疏数字数组。扫描在根节点直接查找，其他转移使用二分查找。对 g 个文本字素、z 次命中及最大转移分支数 d，不计分段时枚举成本为 O(g log(d + 1) + z)。两种 leftmost 策略使用 O(L) 候选窗口；全局 `longest-first` 收集并排序候选。输出数组与字符串另占存储。

参见 [计数开销](/zh/api/count)；另见 [后端实测取舍](/zh/extensions/performance)。

参考：Aho 与 Corasick，_Efficient string matching: an aid to bibliographic search_（1975）。本库源自 [BrunoRB/ahocorasick](https://github.com/BrunoRB/ahocorasick).
