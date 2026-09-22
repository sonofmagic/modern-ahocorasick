---
title: "安全高亮"
description: "将命中和未命中的片段渲染为文本节点，包括看起来像 HTML 的输入。"
---

# 安全高亮

将命中和未命中的片段渲染为文本节点，包括看起来像 HTML 的输入。

## 浏览器示例

在文档 body 已存在的浏览器模块中运行。示例高亮 `cat`，并按字面显示 `<img>`。

```ts
import AhoCorasick from 'modern-ahocorasick'

const text = '<img> a cat!'
const matcher = new AhoCorasick(['cat'])
const tokens = matcher.tokenize(text)
const container = document.createElement('p')
for (const token of tokens) {
  if (token.type === 'match') {
    const mark = document.createElement('mark')
    mark.textContent = token.text
    container.append(mark)
  }
  else {
    container.append(document.createTextNode(token.text))
  }
}
document.body.append(container)
```

## 重叠与坐标

`tokenize()` 默认使用 `leftmost-longest`，拒绝 `all`。拼接 token 文本可以还原原文。若改用 `search()`，先选择非重叠策略，再按 UTF-16 范围切片；重叠命中无法直接划分字符串。

## 框架渲染

使用框架会转义的文本绑定渲染 `token.text`。不要将用户输入传给 `innerHTML` 或 HTML 渲染指令。替换工具返回字符串，并非安全 HTML。

参见 [分词与替换契约](/zh/api/replace)。
