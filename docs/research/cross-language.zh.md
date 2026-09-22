# Aho–Corasick 跨语言源码评估

基线：`d50fcbfad26cc2a9b74c7d9f4379404a02b9df72`；检索日期：2026-09-22。[完整固定版本矩阵与源码链接](cross-language.md#pinned-implementation-matrix)，[机器可读记录](sources.json)。

## 检索范围和缺口

本次固定 27 个仓库提交，额外检查 3 份 npm 发布包。GitHub 两组名称/描述查询各取前 50 项，Ruby 10 项、Swift 4 项只做发现；npm 40 项、crates.io 25 项、Maven 7 项，并核查 PyPI、NuGet 和 Go proxy。搜索排序、别名和未索引项目都会造成遗漏，因此不宣称穷尽全网。Ruby/Swift 未深入源码；.NET/PHP/Haskell/Lua 本轮没有运行实测。提交日期只反映活动时间，不代表质量保证，归档状态单独记录。

发布仓库观察版本：Rust aho-corasick 1.1.5、daachorse 5.0.0；Python pyahocorasick 2.3.1、ahocorapy 1.8.0、ahocorasick-rs 1.0.3；Java org.ahocorasick 0.6.3；NuGet AhoCorasick 2.0.279。源码 HEAD 与发布版本分别记录，不混为同一产物。DAT 论文摘要结论笔记及书目信息保存在 [dat-paper.json](dat-paper.json)；论文中布局优劣依赖数据集的结论，也是本轮坚持实测、不自动切换后端的原因。原 npm 对照仍固定 @monyone/aho-corasick 1.5.10、@tanishiking/aho-corasick 0.0.1。

## 实现家族和源码结论

ahocorasick_rs 包装 BurntSushi；BlackGlory npm 原生扩展包装 daachorse，python-daachorse 同样属于包装；Vectorscan 是 Hyperscan fork。Wikimedia GitHub 是 Gerrit 镜像。Lua 包含 C++ 构建器和压缩扫描器。移植和受启发的独立实现不等于新的算法家族。完整矩阵逐项提供固定提交、许可证、结构、能力、决策与源码锚点；测试位置记录在 JSON 中，不将仅列出的测试误称为已经执行。

Rust 的 Input、预过滤器和内存诊断，pyahocorasick 的 Automaton/迭代器/统计/持久化，Java 的 DAT 与 PayloadTrie/区间去重，Go 的扫描器及池化结果，是本次重点。PHP 检查构建、失败转移与结果输出；Haskell 检查 UTF-8 Text 和替换优先级；Mensa 检查符号分类器、原始/有效输入映射；C 检查交错表及二进制布局。

额外 npm：`@blackglory/aho-corasick@0.1.27` 是 MIT 的 Neon/daachorse 包装，不计独立 JS 后端；`lazy-aho-corasick@1.2.2` 提供 startOnly、重复项及结果选择，但发布代码和源代码的字符串遍历方式不同，last 会反转内部词典，不吸收这些行为；`aho-corasick2@2.0.1` 属于 ws-trie 家族，MIT 归属 Thomas Booth/Dejian Xu；检查发布的 `dist/index.esm.mjs` 后确认其使用可变对象 Trie、递归后缀探测构建、UTF-16 charAt 扫描，提供按词计数/坐标/数据及 DOT 导出。这些查询与可视化需求已覆盖，不吸收回调暴露活 Trie 节点的契约；本轮未运行实测。

## 能力吸收矩阵

| 结论       | 能力                                                                                                     | 理由                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 已覆盖     | 重叠、两种左侧策略、全局最长、元数据/重复项、分词/替换、边界、折叠、动态快照、流式取消/预览、DAT、持久化 | 保留本库原文坐标与不可变契约                                      |
| 首批吸收   | 合法字素边界的范围/锚定；冻结且缓存的编译统计                                                            | 支持局部查询和编译成本诊断                                        |
| 首批吸收   | DAT 终止列表平铺；缓存不可变扫描路径判定                                                                 | 减少 JS 分配和重复分派                                            |
| 先实验     | 首字符、二元组候选预过滤                                                                                 | 重复测量目标收益 ≥10%，其他主场景不得可复现退化 >5%；仍需完整验证 |
| 后续候选   | 构建预算、浅层稠密状态/DFA、语料优化布局、可移植二进制格式、显式替换优先级                               | 需要独立预算、格式及 API 设计                                     |
| 不适用本轮 | 原生 SIMD、WASM、结果对象池、任意符号流、语言排序/容错审核、正则数据库、queue-microtask                  | 超出纯 JS/TS 精确字素语义范围                                     |

## 复杂度与可比性

经典稀疏 AC 在常数边查询假设下扫描 O(n + z)，n 为输入单元、z 为输出数；输出链接避免每状态复制全部后缀列表。排序紧凑转移有查边成本，DAT 索引查询快但布局构建和空洞依赖词典。DFA/后缀展开用构建与内存换扫描分支。全局最长还需排序和区间选择，不能承诺有界流式。这是结构分析，不是所有实现的统一实测结论。

字节、码点、UTF-16 单元都不等同于字素。Python 字典和 Java Map 可能合并重复字符串；Cloudflare Go 输出唯一词条 ID；lower()/文化比较不等同于扩展折叠和原文映射。公共性能场景限定 ASCII、唯一词条、全部重叠结果，其他语义单列。未运行的实现明确标为源码评估。

范围先过滤再选择，边界判定仍读取完整原文。锚定指范围起点。ß→ss 不允许只匹配半个展开。统计区分字素/折叠码点，TypedArray 字节不是总堆。流式拒绝离线范围配置。

## 论文、许可与后续验证

参考 [Aho/Corasick 1975](https://doi.org/10.1145/360825.360855)、[Kanda 等 2023 DAT 工程](https://doi.org/10.1002/spe.3190)、[作者预印本](https://arxiv.org/abs/2207.13870)，以及 Rust Input、pyahocorasick 官方 API 文档。Rust 的每状态 12 字节不能作为 JS 总堆估算。

许可以文件、头部或 POM 核对：Rust 两库均有双许可；hankcs POM 声明 Apache-2.0；cjgdev/pdonald 头部为 MIT；mischasan 头部为 LGPL-3.0-only，仅借鉴概念。未复制第三方实现代码，不将下载源码打入 npm。后续实现提交另附运行结果、原始数据与复测记录。
