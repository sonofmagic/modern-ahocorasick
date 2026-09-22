---
layout: page
sidebar: false
title: 使用文档
description: 学习 modern-ahocorasick v3.2.0 的精确多模式匹配、Unicode 处理和流式 API。
---

<div class="hero">
<p class="hero-kicker">Aho–Corasick / exact text matching</p>
<h1 class="hero-title">一个词典。<br>一次扫描。<br>每一处命中。</h1>
<p class="hero-copy">用原文字素匹配多个关键词，以可直接切片的范围处理命中。观察每次转移、回退，以及后缀如何成为结果。</p>
<div class="hero-links"><a href="/zh/visualization">打开算法工作台 →</a><a href="/zh/getting-started">快速开始</a></div>
<div class="hero-demo"><div>he · she · his · hers<br>u<mark>she</mark>rs → she, he<br>us<mark>hers</mark> → hers</div><div>search('ushers')<br>{ pattern: 'she', start: 1, end: 4 }<br>text.slice(1, 4) === 'she'</div></div>
<nav class="hero-reading" aria-label="文档阅读路径"><a href="/zh/guide/choosing">选择能力</a><a href="/zh/api">API 参考</a><a href="/zh/extensions">扩展能力</a><a href="/zh/stream/sessions">流式处理</a></nav>
<p class="hero-small">本站介绍已在 npm 发布的 v3.2.0。 MIT · SonOfMagic · <a href="https://github.com/BrunoRB/ahocorasick">BrunoRB/ahocorasick</a></p>
</div>
