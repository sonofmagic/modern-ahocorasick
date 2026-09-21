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

每次命中事件只展示一条新的结构化结果。重置清空播放进度，实验台仍展示完整搜索结果。前后定位读取同一份不可变轨迹，并暂停播放。点击状态可查看前缀、failure 后缀、自身终态和继承输出来源。修改词典或文本会取消播放与过时的计算。

## 开销与适用范围

构建使用节点数组、Map 转移边以及带队列游标的广度优先 failure 构建。扫描沿 failure 与 output 链接前进；大量命中的输出必然消耗相应时间。工作台在可取消的 Worker 中生成有规模限制的完整轨迹，修改文本时复用词典，仅对不超过 150 个状态的图进行布局；更大的词典使用分页状态表。参阅[工作台限制和操作说明](./visualization#输入规模与响应能力)以及[计算与传输实测](https://github.com/icelib/modern-ahocorasick/blob/main/docs/workbench-performance.md)。工作台用于教学，不用于大型语料性能测试。

设输入有 g 个字素、z 次命中，最长关键词有 L 个字素，枚举耗时为 O(g + z)。非重叠策略维护 O(L) 候选窗口，无需收集并排序 z 次命中；结果数组和替换字符串另需存储空间。只有确认后续更长关键词不会改变选择时，候选才会输出。预计算状态命中总数使 `count()` 的扫描耗时为 O(g)、额外扫描状态为 O(1)，也使 `match()` 无需创建结果即可停止。这些复杂度不包含运行时的 Unicode 分段成本。词条字素长度和命中总数增加词典存储，但不复制继承输出列表。

参阅[实测 v2/v3 性能取舍](https://github.com/icelib/modern-ahocorasick/blob/main/docs/benchmarks.md)，不承诺全面加速。

参考文献：Aho 与 Corasick，_Efficient string matching: an aid to bibliographic search_（1975）。本库源自 [BrunoRB/ahocorasick](https://github.com/BrunoRB/ahocorasick)，工作台重写了[原可视化页面](https://brunorb.github.io/ahocorasick/visualization.html)的能力。
