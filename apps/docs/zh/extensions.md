# 可选文本处理扩展

这些新增能力基于已发布的 v3.1，本次扩展尚未发布。默认导出仍是不可变的精确字素匹配器，结果使用原文
UTF-16 坐标。所有可选入口均支持 ESM 和 CommonJS；构造器入口通过 `require()`
直接返回构造器。运行时没有第三方依赖。`queue-microtask` 与匹配无关，不在覆盖范围内。

## 能力与入口

| 入口                          | 导出                                                                     | 用途                                   |
| ----------------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| `modern-ahocorasick`          | 默认构造器、命名类型                                                     | 精确匹配、边界、四种选择策略、分词输出 |
| `/text`                       | 默认 `TextMatcher`                                                       | 现有整段正规化与大小写折叠             |
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

## 边界与选择策略

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['cat'], { boundary: 'ascii' })
matcher.replace('cat category', 'DOG') // 'DOG category'
```

构造器的可选 `boundary` 默认是 `none`，在重叠选择之前应用于所有操作：

| 规则         | 对相邻原文字素的要求                                         |
| ------------ | ------------------------------------------------------------ |
| `none`       | 不限制                                                       |
| `ascii`      | 两侧都不以 ASCII A–Z、a–z、0–9 开头                          |
| `ascii-edge` | 仅当词条相应边缘以 ASCII 单词字符开头时，检查该侧 ASCII 边界 |
| `unicode`    | 两侧都不包含 Unicode 字母、数字、标记或下划线                |
| `whitespace` | 两侧为空白或输入边界                                         |
| 函数         | `(context: BoundaryContext) => boolean`                      |

回调收到 `left`、`right`、`first`、`last`、`pattern`、`patternIndex`；输入边界外的
`left`/`right` 为 `undefined`，字符上下文均为原文字素。回调必须返回布尔值，建议为纯函数，
异常直接传播。这些是字符边界规则，不是语言词法分词；Unicode 属性和字素行为跟随运行时版本。

新增离线策略 `longest-first`：候选按原文匹配字素长度降序，再按起点、输入索引升序排列；
依次保留不与已选结果重叠的候选，最后按原文顺序返回。词典 `['ab', 'bcdef', 'f']`
匹配 `abcdef` 时，`leftmost-longest` 选择 `ab, f`，`longest-first` 选择 `bcdef`。
整段搜索、迭代、替换和分词均支持新策略。它缓存候选与原文字素坐标，不是有限前瞻迭代器，
所有流式接口都会拒绝此策略。

`tokenize(text, options?)` 默认使用 `leftmost-longest`，拒绝 `all`。返回 `Token<T>[]`：
普通文本为 `{ type: 'text', text, start, end }`，匹配文本为
`{ type: 'match', text, start, end, match }`。不生成空文本 token；拼接所有 `token.text`
可还原输入。库不会生成 HTML。

## 完整 Unicode 折叠

```ts
import UnicodeAhoCorasick from 'modern-ahocorasick/unicode'

const matcher = new UnicodeAhoCorasick(['STRASSE', 'ss', 's'])
matcher.replace('😀Straße', 'X') // '😀X'
matcher.search('ß').map(match => match.pattern) // ['ss']
```

使用 Unicode 17.0 `CaseFolding.txt` 的 common/full 映射，随包附带 Unicode License v3。
不做正规化或土耳其语定制，因此 `é` 与 `e\u0301` 仍不同；`Σ`、`σ`、`ς` 折叠后相同，
`İ` 折叠为 `i\u0307`。匹配必须覆盖完整原文字素：`ss` 可以匹配 `ß`，`s` 不能只匹配
展开后的半个字符。词条和元数据保持原样，范围及替换回调文本来自未修改的输入。
折叠数据版本固定，字素分割仍跟随宿主 ICU。

## 动态词典与替换工具

```ts
import DynamicDictionary from 'modern-ahocorasick/dynamic'

const dictionary = new DynamicDictionary(['cat'])
const old = dictionary.compile()
const dogID = dictionary.add('dog')
const current = dictionary.compile()
old.matcher.match('dog') // false
current.matcher.match('dog') // true
dictionary.delete(dogID)
```

`add` 返回稳定的非负 ID，重复字符串具有不同 ID；`delete(id)` 返回是否删除了条目。
`clear()` 不复用 ID。有效编辑发生前，`compile()` 复用同一个 `{ matcher, ids }` 快照。
冻结的 `ids` 数组将快照内连续的 `patternIndex` 映射回稳定 ID。元数据引用仍由调用方持有。
已有迭代器和流继续使用旧快照。

第三个构造参数可传入 `(patterns, options) => new UnicodeAhoCorasick(patterns, options)`
选择其他内置匹配器。编译是显式同步操作，不承诺在线索引更新为常数时间。

`/replace` 提供 `keep()`、`remove()`、`mask(character = '*')`、`fromMap(mapOrRecord)` 和
`once(replacement)`。掩码按原文字素重复；映射表在创建时快照，以原始词条为键，未映射的匹配
保留原文。`once()` 的状态按每次库替换操作隔离，同一个工具可用于多个并发会话。
替换字符串仍按字面处理。

## 增量会话与迭代

```ts
import AhoCorasick from 'modern-ahocorasick'
import { createTokenStream, replaceChunks, replaceChunksAsync } from 'modern-ahocorasick/stream'

const matcher = new AhoCorasick(['cat'])
const replaced = [...replaceChunks(matcher, ['a ca', 't!'], 'DOG')].join('') // 'a DOG!'

const session = createTokenStream(matcher)
const first = session.write('a ca')
const preview = session.preview() // 暂定尾部，不是已确认替换输出
const rest = [...session.write('t!'), ...session.end()]
const original = [...first, ...rest].map(token => token.text).join('')

for await (const part of replaceChunksAsync(matcher, ['a ca', 't!'], async () => 'DOG')) {
  console.log(part)
}
```

- 会话：`createMatchStream(matcher, options?)`、`createTokenStream(matcher, options?)`、
  `createReplaceStream(matcher, replacement, options?)`，均有 `write(string)`、`end()`、
  `destroy()`。调用返回数组，单个输入块的输出仍可能很大。
- 迭代：`iterateChunks`、`tokenizeChunks`、`replaceChunks`；对应 `Async` 版本接受
  `Iterable<string>` 或 `AsyncIterable<string>`。参数顺序为 `(matcher, source, options?)`，
  替换接口为 `(matcher, source, replacement, options?)`。
- 匹配流默认 `all`；分词与替换流默认 `leftmost-longest`，也接受 `leftmost-first`。
  所有坐标都是完整输入的 UTF-16 偏移。
- 不同分块可能产生不同的相邻普通文本 token 或输出字符串切片；拼接结果与最终匹配
  与整段操作一致。
- 重复 `end()` 返回空数组；结束后写入或使用已销毁会话会抛错。处理或替换失败会销毁会话。

`maxBufferLength` 默认限制 **1,048,576 个尚未确认的原文 UTF-16 单元**。
可设为正安全整数，或显式使用 `Infinity`。超限抛出 `RangeError`，不截断文本或匹配。
这不是总内存上限：词典、调用方输入块、结果数组和替换输出另有开销。扫描器保留选择前瞻窗口
及最多三个尾部字素；任意长字素或未确认的行内代码都可能触及上限。

异步选项还包括 `signal: AbortSignal` 和 `yieldEvery`（正安全整数，默认 4096 个 UTF-16
单元）。扫描通过任务队列让出执行权，异步回调按顺序等待。取消传播 `signal.reason`，
关闭源迭代器并释放扫描状态；任意生产者或回调内的外部工作仍需自行配合取消。
拉取式适配器在当前输出消费前不会请求下一输入块，但单个字素产生的匹配组仍可能很大。

`preview()` 返回整个未确认后缀的 `{ start, text, tokens }`。每次整体替换旧预览，
已确认 token 永不撤销。预览独立解释这个后缀，可能随边界、过滤规则或更长匹配的到达而改变。
预览不调用替换回调，只有确认后的输出才执行回调。

## 受保护语法与平台流

`urls()` 从 HTTP/HTTPS 协议头（忽略大小写）保护到空白或 EOF。
`markdown({ heading?, code? })` 两项默认均启用：识别行首 1–6 个井号的 ATX 标题、
起止反引号数量相同的行内代码，以及行首至少三个反引号或波浪线的围栏代码。
关闭围栏必须使用相同字符、长度不少于开始围栏，并仅允许尾随空格或制表符。
缩进围栏、转义、链接及其他 CommonMark 规则不在该语法子集内。
未闭合行内代码在 EOF 恢复普通文本，未闭合围栏继续保护到 EOF。
`protectedText({ urls: true, markdown: true })` 可组合两种规则。
受保护文本原样输出，匹配不能跨越；语法边缘若落在字素内部，则保护整个字素。

```ts
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import AhoCorasick from 'modern-ahocorasick'
import { createReplaceTransform } from 'modern-ahocorasick/stream/node'

await pipeline(
  createReadStream('input.txt'),
  createReplaceTransform(new AhoCorasick(['secret']), '[redacted]'),
  createWriteStream('output.txt'),
)
```

Node 适配器返回 `Duplex`，通过异步生成器按消费需求处理，并增量解码 UTF-8 字节。
建议输入统一使用字节或字符串；从字节切换至字符串时，会先结算解码器里未完成的序列。
Web 适配器返回可供 `pipeThrough()` 使用的 `ReadableWritablePair`，不是
`TransformStream` 实例；字节输入先通过 `TextDecoderStream`。
两种平台均支持异步替换回调、取消和背压。

## 性能与对照

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

### 与 v3.1 的兼容性

现有 `matcher.createStream({ maxBufferedUnits, wholeWord, locale })` 保留 `write/finish/cancel` 生命周期，重复 `finish()` 仍抛错。新增 `/stream` 接口使用 `write/end/destroy` 和 `maxBufferLength`，也接受 `wholeWord`、`locale`；整词流保留最后一个未确认行以维持 ICU 上下文，受缓冲上限约束。构造器字符边界与查询整词边界取交集。

`/text` 保留正规化与 Turkic 折叠，是整段文本适配器；默认完整折叠的流式场景使用 `/unicode`。精确匹配器和 `/fast` 保留 `serialize()`，后者输出兼容的紧凑格式。带构造器字符边界或折叠配置的实例不支持序列化，调用会抛错，不会静默丢失配置。`countByPattern()`、现有持久化接口和所有已有默认行为保持兼容。

命令式异步版本 `createMatchStreamAsync`、`createTokenStreamAsync`、`createReplaceStreamAsync` 的 `write/end` 返回 Promise，`destroy()` 同步取消。必须等待当前操作完成；并发写入或结束会被拒绝，不使用无上限队列。异步替换和取消遵循迭代接口的契约。

### 从参考包迁移

| 参考能力                           | 本包公开 API                                          | 需要确认的契约                              |
| ---------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| Monyone 检测、匹配、替换           | `match`、`search`、`replace`                          | 原文 UTF-16 范围，字面替换                  |
| Monyone 动态编辑与分块处理         | `/dynamic`、`/stream`、平台适配器                     | 显式编译修改，旧快照继续有效                |
| Monyone 分词、跳过规则与预览       | `tokenize`、`/stream/filters`、token 会话 `preview()` | 受限语法和整体可替换的暂定后缀              |
| Monyone 快速后端                   | `/fast`                                               | 显式启用，按实际词典测量                    |
| Tanishiking `caseInsensitive`      | `/unicode`                                            | 完整 Unicode 折叠，包括扩展映射             |
| Tanishiking `onlyWholeWords`       | 构造器 `boundary: 'ascii'`                            | 字符边界规则；`wholeWord` 使用 ICU 单词分段 |
| Tanishiking `allowOverlaps: false` | `strategy: 'longest-first'`                           | 原文字素长度优先，同长按起点和索引决胜      |

例如，将忽略大小写且不允许重叠的词典迁移为：

```ts
import UnicodeAhoCorasick from 'modern-ahocorasick/unicode'

const matcher = new UnicodeAhoCorasick(['STRASSE', 'ss'], { boundary: 'ascii' })
const matches = matcher.search('Straße ss', { strategy: 'longest-first' })
// [{ pattern: 'STRASSE', start: 0, end: 6, patternIndex: 0, data: undefined },
//  { pattern: 'ss', start: 7, end: 9, patternIndex: 1, data: undefined }]
```

可直接使用 `text.slice(match.start, match.end)`：Tanishiking 的 `end` 包含结束位置，
本包的 `end` 不包含结束位置。结果用 `pattern` 代替 `keyword`；重复输入词条保留独立的
`patternIndex` 与元数据。这里迁移的是功能意图，不提供第三方 API 兼容层。

## 范围、锚定与编译统计

所有整段查询支持 `start`、`end`、`anchored`，默认分别为 `0`、`text.length`、`false`。范围是原文 UTF-16 半开区间，坐标必须是输入范围内有序的安全整数，并落在原文字素边界，否则抛出 `RangeError`。非布尔 `anchored` 抛出 `TypeError`。空范围没有命中；锚定只接受恰好从 `start` 开始的命中。

```ts
import AhoCorasick from 'modern-ahocorasick'

const matcher = new AhoCorasick(['abc', 'bc'])
matcher.search('!abc!', { start: 2, end: 4, anchored: true })
// [{ pattern: 'bc', patternIndex: 1, start: 2, end: 4, data: undefined }]
matcher.replace('!abc!', 'X', { start: 2, end: 4 }) // '!aX!'
matcher.getStats() // 冻结、缓存的标量统计
```

`search`、`iterate`、`match`、`count`、`countByPattern`、`replace`、`tokenize` 共用此契约，包括 `/unicode`、`/fast`、`/unicode-fast` 和 `/text`。范围先过滤再选择，整词及构造器边界仍读取完整原文。替换和分词保留范围外文本；折叠、正规化不改变坐标系统。当前是语义范围过滤，不承诺耗时只与选定区间长度成正比。流式拒绝这些离线选项，包括 `anchored: false`。

默认及派生编译构造器的 `getStats()` 返回 `backend`（`compact`/`double-array`）、`patternCount`（含重复词条）、`stateCount`（含根，不含 DAT 空槽）、`transitionCount`（Trie 边）、`alphabetSize`、`maxPatternUnits`、`unit`（`grapheme`/`folded-codepoint`）和 `typedArrayBytes`。折叠单元是 Unicode 折叠后的码点，所以 `ß` 变为两个单元。字节统计含保留的扫描/辅助 TypedArray 及已分配空槽，不含字符串、Map、JS 对象、构建临时分配和原生 ICU，**不是总堆内存**。统计在编译时生成，读取不遍历自动机。紧凑后端反序列化统计一致；`/fast` 沿用可移植紧凑持久化格式，恢复后的后端及字节数因此描述紧凑布局。`/text` 属于映射适配器，不是编译构造器子类，不提供 `getStats()`。

跨语言源码评估及实测放在仓库 `docs/research/`。本批吸收范围、诊断和连续输出布局的设计，默认仍使用紧凑后端，未新增原生运行时依赖。
