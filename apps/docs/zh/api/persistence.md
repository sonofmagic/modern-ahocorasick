---
title: "保存与加载编译词库"
description: "保存编译词库，并在加载时校验，无需重新构建 Trie。"
---

# 保存与加载编译词库

保存编译词库，并在加载时校验，无需重新构建 Trie。

## 保存与加载

`serialize(options?)` 返回带版本的字符串，使用
`AhoCorasick.deserialize(serialized, options?)` 加载。可以通过平台 API 把字符串保存到
文件、数据库，或传入 Worker。加载会校验并复制数字扫描表，不重新构建 trie；检查内容
包括状态树、failure/output 链接、词条索引，以及每个关键词在当前运行时的字素分段。
分段不兼容、数据损坏或格式版本不支持时抛出 `TypeError`。这种检查确认词库分段一致，
不保证不同 ICU 对任意后续文本的规则完全相同。

```ts
import AhoCorasick from 'modern-ahocorasick'

const saved = new AhoCorasick([{ pattern: 'cat', data: { id: 7 } }]).serialize()
const loaded = AhoCorasick.deserialize(saved)
loaded.count('cat cat') // 2
```

## 元数据编解码

元数据仅接受 JSON 兼容值：有限数值、字符串、布尔值、null、数组和普通对象。未设置的
元数据仍保持缺省；嵌套 undefined、函数、symbol、bigint、循环引用、Date 和 Map
会报错，避免被静默丢弃。特殊类型可以显式编解码：

```ts
import AhoCorasick from 'modern-ahocorasick'

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

## 支持的配置与开销

默认精确匹配器与 `/fast` 支持持久化，后者保存为可移植的紧凑格式。带构造器字符边界或折叠配置的实例无法序列化，会抛错而不是丢弃选项。`/text` 不提供持久化接口。加载耗时仍与词库大小相关。
