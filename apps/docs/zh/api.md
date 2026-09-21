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

## match(text)

返回布尔值，首次命中即停止，不创建匹配对象。只需判断是否命中时使用。

## count(text)

返回全部出现次数，包含重叠与重复词条，等于 `search(text).length`。直接累加状态的命中总数，不创建匹配对象，也不遍历 output 链。空文本或空词典返回 `0`。非法文本抛出 `TypeError`；计数超过 `Number.MAX_SAFE_INTEGER` 时抛出 `RangeError`。不接受策略选项。

```ts
new AhoCorasick(['a', 'aa', 'a']).count('aaa') // 8
```

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
