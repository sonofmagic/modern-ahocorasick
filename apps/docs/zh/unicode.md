# Unicode 与索引

## 匹配单位是字素簇

`Intl.Segmenter` 将文本分成用户感知的字素簇。家庭 emoji `👨‍👩‍👧‍👦` 是一个字素，但占 11 个 UTF-16 码元；`é`（e 加组合重音）是一个字素，占两个码元。JavaScript `slice()` 按 UTF-16 码元计数。

```ts
const text = '😀é👨‍👩‍👧‍👦'
const ac = new AhoCorasick(['é', '👨‍👩‍👧‍👦'])
ac.search(text)
// é: start 2, end 4; 家庭: start 4, end 15
```

工作台显示的字素结束索引分别为 `1` 与 `2`；库返回范围 `[2, 4)` 与 `[4, 15)`。它们描述相同命中，但只有后者可直接用于 `slice()`。

## 精确边界与字符形式

关键词必须匹配完整字素。`e` 不匹配 `é` 的内部；单个人物 emoji 不匹配 ZWJ 家庭内部。规范等价的形式不会自动视为相同：`é` 与 `é` 是不同输入。库不执行规范化或大小写折叠。

如果应用需要规范化，请一致处理关键词与文本。返回坐标将针对**变换后的文本**，不能在没有单独映射的情况下用于原文。

## 大小写处理

默认区分大小写。仅针对 ASCII 的简单忽略大小写示例：

```ts
const text = 'Hello WORLD'
const ac = new AhoCorasick(['hello', 'world'])
ac.search(text.toLowerCase())
```

Unicode 小写转换可能改变长度与分词（例如 `İ`），不可假设转换后的坐标仍适用于原文。库没有内置忽略大小写选项。

## 空输入

`new AhoCorasick([])` 合法，扫描无结果。`new AhoCorasick([''])` 抛出 `RangeError`，空关键词不是通配符。工作台按逗号拆分关键词、去除两端空白并忽略空项，但完整保留待搜索文本的空格与换行，重复关键词仍保留。
