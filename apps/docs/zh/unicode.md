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

关键词必须匹配完整字素。`e` 不匹配 `é` 的内部；单个人物 emoji 不匹配 ZWJ 家庭内部。规范等价的形式不会自动视为相同：`é` 与 `é` 是不同输入。核心构造器不执行归一化或大小写折叠。

需要归一化或完整 Unicode 大小写折叠，并保留原文位置时，可使用 v3.1.0+ 的
`modern-ahocorasick/text` 入口：

```ts
import TextMatcher from 'modern-ahocorasick/text'

const matcher = new TextMatcher(['STRASSE', 'é'], { normalization: 'NFC', caseFold: true })
const text = 'Straße e\u0301'
matcher.search(text).map(hit => text.slice(hit.start, hit.end))
// ['Straße', 'e\u0301']
```

适配器保留原始字素边界，不需要调用方自行处理大小写转换后的偏移。展开后只覆盖部分
字素的命中会被过滤，例如 `s` 不会匹配 `ß` 的一半。详见
[转换语义与成本](./api#可选归一化与大小写折叠)。核心构造器仍区分大小写，且不做归一化。

## 空输入

`new AhoCorasick([])` 合法，扫描无结果。`new AhoCorasick([''])` 抛出 `RangeError`，空关键词不是通配符。工作台按逗号拆分关键词、去除两端空白并忽略空项，但完整保留待搜索文本的空格与换行，重复关键词仍保留。

## ASCII 加速与运行时版本

词典构建、`count()` 和 `match()` 惰性处理开头的 ASCII 文本，不为每个字符创建原生分段对象；CRLF 仍是一个字素簇。
如果后续非 ASCII 字符可能延长当前字素簇，尚未确定的字素簇及剩余文本会交给
`Intl.Segmenter`，且本次扫描不再切回 ASCII 路径。例如，即使词典只有 ASCII，
`e` 也不会匹配 `abc e\u0301` 内的部分字素簇。扫描器不会先检查整篇文本是否都是
ASCII。启动时最多检查八个 UTF-16 单元，遇到短混合前缀则直接使用原生分段，
避免为紧邻的 Unicode 匹配付出游标初始化成本。

`search()`、`iterate()` 和 `replace()` 保留原生分段：实验中的游标结果生成路径
超出了性能回退预算，因此未启用。这只是内部优化，不是新的匹配模式。精确匹配、区分大小写、不做规范化和原文 UTF-16
范围均保持不变。Unicode 规则由宿主运行时提供，不同 ICU/Unicode 版本可能对新增字符
产生不同分段。Node 测试采用对应版本的 Unicode GraphemeBreakTest 数据；Chromium、
Firefox 和 WebKit 执行相同的库契约与差分测试，并使用各自的原生分词器作为参考。
