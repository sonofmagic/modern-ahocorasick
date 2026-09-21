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

字素带高亮当前考虑的字素。蓝色实线表示 goto，橙色虚线表示 failure。即使隐藏 failure 连线，正在发生的回退也会显示。双圈节点代表终态。状态表按数值排序，展示继承输出，但不修改自动机。

每次命中事件只增加一条结构化结果。重置取消播放并清空结果，继续从下一个事件开始。修改输入会重建轨迹并取消旧计时器。

## 开销与适用范围

构建使用节点数组、Map 转移边以及带队列游标的广度优先 failure 构建。扫描沿 failure 与 output 链接前进；大量命中的输出必然消耗相应时间。工作台会保存完整轨迹并布局整个词典，适合小规模教学示例，不用于大型语料性能测试。

参阅[实测 v2/v3 性能取舍](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks.md)，不承诺全面加速。

参考文献：Aho 与 Corasick，_Efficient string matching: an aid to bibliographic search_（1975）。本库源自 [BrunoRB/ahocorasick](https://github.com/BrunoRB/ahocorasick)，工作台重写了[原可视化页面](https://brunorb.github.io/ahocorasick/visualization.html)的能力。
