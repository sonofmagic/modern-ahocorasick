# API

## 构造函数

```text
new AhoCorasick<T>(patterns: readonly (string | { pattern: string, data?: T })[])
```

字符串与元数据对象可以混用。`patternIndex` 对应输入数组下标，因此可区分重复关键词。构造时保存关键词内容，元数据保留引用。修改输入或返回的匹配对象，不会改变自动机的匹配状态。

空列表 `[]` 合法且不会命中。空关键词 `''` 抛出含输入下标的 `RangeError`。非法运行时参数抛出 `TypeError`。

## search(text, options?)

返回独立的扁平匹配对象：

```ts
interface Match<T> {
  pattern: string
  patternIndex: number
  start: number
  end: number
  data: T | undefined
}
```

`start`、`end` 是原文的 UTF-16 偏移，采用左闭右开区间。`text.slice(start, end)` 即命中文本。

| 策略               | 规则                                                   |
| ------------------ | ------------------------------------------------------ |
| `all`（默认）      | 保留重叠结果。结束位置升序、关键词长度降序、输入顺序。 |
| `leftmost-first`   | 优先最左起点，同起点按关键词输入顺序。                 |
| `leftmost-longest` | 优先最左起点，同起点选择最长匹配，再按输入顺序。       |

非重叠策略会跳过与已选匹配重叠的候选，相邻匹配可同时保留。这两种策略在以最长关键词字素数为界的窗口中，每个起点只保留最佳候选，无需收集并排序全部命中。搜索仍会保存选中结果的数组。

```ts
ac.search(text, { strategy: 'leftmost-longest' })
```

## match(text, options?)

返回布尔值，首次命中即停止，不创建匹配对象。只需判断是否命中时使用。

## count(text, options?)

返回全部出现次数，包含重叠与重复词条，等于 `search(text).length`。直接累加状态的命中总数，不创建匹配对象，也不遍历 output 链。空文本或空词典返回 `0`。非法文本抛出 `TypeError`；计数超过 `Number.MAX_SAFE_INTEGER` 时抛出 `RangeError`。不接受策略选项。

```ts
new AhoCorasick(['a', 'aa', 'a']).count('aaa') // 8
```

## countByPattern(text, options?)

返回新的 `number[]`，顺序与输入词条一致。次数包含重叠匹配，未命中的词条为零，
重复词条各自保留一个位置。例如
`new AhoCorasick(['a', 'aa', 'a', 'b']).countByPattern('aaa')`
返回 `[3, 2, 3, 0]`。空字典返回 `[]`，非法文本抛出 `TypeError`。

扫描器通过 failure 链汇总状态访问次数，不枚举每次命中。不计分段成本，时间为
O(g log(d + 1) + s + p)，临时空间为 O(s + p)，其中 g 为文本字素数、s 为状态数、p 为词条数、d 为最大转移分支数。
只需要总数时使用 `count()`，可以避免分配与状态数成正比的临时数组。

## iterate(text, options?)

惰性输出匹配，顺序与 `search(text, options)` 相同，支持相同的三种策略，默认 `all`。调用时立即校验文本和选项并保存策略。接受完整字符串，不支持分块输入。无需保存整个结果数组，但仍持有原文和词典。非重叠策略使用 O(L) 候选窗口，为确定结果，最多需要前瞻最长关键词的 L 个字素。每个迭代器的状态独立。

```ts
for (const hit of ac.iterate(text, { strategy: 'leftmost-longest' })) {
  console.log(hit.pattern, text.slice(hit.start, hit.end))
}
```

## replace(text, replacement, options?)

在原文范围上执行一次非重叠替换。默认 `leftmost-longest`，也接受 `leftmost-first`，不接受 `all`。回调收到 `(match, originalSubstring)`，必须返回字符串。字符串替换按字面值处理，`$&` 没有特殊含义，不重新扫描替换内容。选中匹配逐步消费，但输出文本和中间字符串片段仍占用内存。

```ts
new AhoCorasick(['cat']).replace('cat cat', '$&') // '$& $&'
```

## 私有状态

goto 表、failure 链接、output 链接与构建方法属于实现细节。v3 没有公开的 `gotoFn`、`failure`、`output` 或 `trace()`。可视化通过仓库内部集成工作，不构成消费者 API。

## 完整词匹配

本节新增选项与方法需要 v3.1.0 或更高版本。

所有查询均接受 `{ wholeWord: true, locale: 'en' }`。`locale` 为 BCP 47 语言标记，
省略时使用运行时默认语言。匹配必须起于一个 `isWordLike` 词段的开头，止于另一个
`isWordLike` 词段的结尾；词段由 `Intl.Segmenter` 的 `word` 模式确定。短语可以跨词、
跨标点，纯标点模式不会命中。下划线通常属于单词；中文遵循运行时的语言分词规则。
指定语言可以明确意图，但不同 ICU 版本仍可能有差异。

```ts
const words = new AhoCorasick(['cat', 'cat_dog'])
words.countByPattern('concatenate cat cat_dog', { wholeWord: true, locale: 'en' })
// [1, 1]
```

边界过滤发生在不重叠选择之前。完整词模式会先对原文分词并保存边界集合；其
`count()`、`countByPattern()` 和 `match()` 会过滤逐次命中，因此不具备默认精确扫描
避免创建匹配对象或汇总状态的性能特性。非法选项对象、非布尔 `wholeWord` 或非字符串
`locale` 抛出 `TypeError`；格式错误的语言标记抛出 `RangeError`。
`count()`、`countByPattern()` 和 `match()` 始终考虑全部匹配，不接受策略参数。

## 保存与加载编译词库

`serialize(options?)` 返回带版本的字符串，使用
`AhoCorasick.deserialize(serialized, options?)` 加载。可以通过平台 API 把字符串保存到
文件、数据库，或传入 Worker。加载会校验并复制数字扫描表，不重新构建 trie；检查内容
包括状态树、failure/output 链接、词条索引，以及每个关键词在当前运行时的字素分段。
分段不兼容、数据损坏或格式版本不支持时抛出 `TypeError`。这种检查确认词库分段一致，
不保证不同 ICU 对任意后续文本的规则完全相同。

```ts
const saved = new AhoCorasick([{ pattern: 'cat', data: { id: 7 } }]).serialize()
const loaded = AhoCorasick.deserialize(saved)
loaded.count('cat cat') // 2
```

元数据仅接受 JSON 兼容值：有限数值、字符串、布尔值、null、数组和普通对象。未设置的
元数据仍保持缺省；嵌套 undefined、函数、symbol、bigint、循环引用、Date 和 Map
会报错，避免被静默丢弃。特殊类型可以显式编解码：

```ts
const dates = new AhoCorasick([{ pattern: 'today', data: new Date('2026-09-22') }])
const saved = dates.serialize({ encodeData: date => date.toISOString() })
const loaded = AhoCorasick.deserialize(saved, {
  decodeData: value => new Date(String(value)),
})
```

没有解码器时，加载后的元数据类型为 `unknown`；应在解码器中校验外部数据，再视作业务
类型。编解码器只处理已定义的元数据，回调错误直接传出。目前支持格式版本 1，但内部字段
不属于公开扫描表 API，请将字符串作为整体保存。加载仍需遍历和校验词库，耗时与词库
大小相关；实际启动收益应通过自己的词库测量。

## createStream(options?)

创建独立的 `MatchStream<T>`，提供 `write(chunk): Match<T>[]`、
`finish(): Match<T>[]` 和 `cancel(): void`。选项包括三种匹配策略、`wholeWord`、
`locale`，以及默认值为 1,048,576 的 `maxBufferedUnits`。依次拼接每次返回的数组，
结果和顺序与搜索拼接后的完整输入一致。位置为原文的绝对 UTF-16 偏移。输入必须是
已解码字符串；字节流的解码由调用方负责。

```ts
const stream = new AhoCorasick(['hello', '👩‍😀']).createStream()
const matches = [
  ...stream.write('hel'),
  ...stream.write('lo 👩‍'),
  ...stream.write('😀!'),
  ...stream.finish(),
]
```

尾部字素或不重叠候选尚未确定时，写入可能返回空数组。代理对、CRLF、组合字符、旗帜和
ZWJ emoji 均可跨块。不重叠策略还会保留由最长关键词限制的候选窗口。完整词模式在完整
行结束处（LF、CR、U+2028、U+2029）确定词边界，并暂存未完成的一行，保证 ICU 得到完整
分词上下文；关键词仍然可以跨行匹配。输入结束时必须调用 `finish()` 输出剩余结果。

每次写入都会重新处理待定尾部；块很小、未完成字素或行很长时，需要更多处理时间。
单个字素或一行可能任意长。未确定尾部超过指定的正安全整数 UTF-16 缓冲上限时，会取消
流并抛出 `RangeError`，不会静默截断。限制针对待定尾部，不限制单块大小、结果数组或
词库大小。允许空字符串写入；非法块抛出 `TypeError`，且不消费输入。`cancel()` 可重复
调用；完成或取消后再写入或完成会抛出 `Error`。总位置超过安全整数也会取消并抛出
`RangeError`。完成或取消后的流不可复用。

## 可选归一化与大小写折叠

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

关键词和文本均按原始字素依次执行归一化、折叠，再执行一次所选归一化。结果保留输入时
的 `pattern`、`patternIndex` 和元数据；范围与替换回调中的文本指向原文。只接受覆盖
完整原始字素的匹配：折叠后 `ss` 可以匹配 `ß`，但 `s` 不会命中其一半；NFKC 下 `fi`
可以匹配 `ﬁ`，而 `f` 不行。完整词边界在原文上检查，先过滤再选择。`all` 按结束位置、
更早的开始位置、输入顺序排列；不重叠策略使用原文范围及既有优先规则。

适配器提供 `search`、`iterate`、`match`、`count`、`countByPattern` 和 `replace`，
接受相同的查询选项与参数校验规则。它先处理完整字符串并创建偏移映射；不重叠迭代还会
收集并排序有效候选。它不提供编译词库保存或流式接口；这两项能力使用核心匹配器。
可选转换需要额外内存和扫描开销，不执行模糊匹配、音译或语言排序比较。
