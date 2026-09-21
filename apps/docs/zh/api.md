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

非重叠策略会跳过与已选匹配重叠的候选，相邻匹配可同时保留。这两种策略先收集并排序所有候选，因此内存占用与全部命中数量相关。

```ts
ac.search(text, { strategy: 'leftmost-longest' })
```

## match(text)

返回布尔值，首次命中即停止。只需判断是否命中时使用。

## iterate(text)

惰性输出全部匹配，顺序与默认 `search()` 相同。接受完整字符串，不支持分块输入。无需保存整个结果数组，但仍持有原文和词典。

```ts
for (const hit of ac.iterate(text)) {
  console.log(hit.pattern, text.slice(hit.start, hit.end))
}
```

## replace(text, replacement, options?)

在原文范围上执行一次非重叠替换。默认 `leftmost-longest`，也接受 `leftmost-first`，不接受 `all`。回调收到 `(match, originalSubstring)`，必须返回字符串。字符串替换按字面值处理，`$&` 没有特殊含义，不重新扫描替换内容。

```ts
new AhoCorasick(['cat']).replace('cat cat', '$&') // '$& $&'
```

## 私有状态

goto 表、failure 链接、output 链接与构建方法属于实现细节。v3 没有公开的 `gotoFn`、`failure`、`output` 或 `trace()`。可视化通过仓库内部集成工作，不构成消费者 API。
