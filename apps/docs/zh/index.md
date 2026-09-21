---
layout: page
sidebar: false
---

<div class="hero">
<p class="hero-kicker">Aho–Corasick / exact text matching</p>
<h1 class="hero-title">一个词典。<br>一次扫描。<br>每一处命中。</h1>
<p class="hero-copy">用原文字素匹配多个关键词，以可直接切片的范围处理命中。观察每次转移、回退，以及后缀如何成为结果。</p>
<div class="hero-links"><a href="/zh/visualization">打开算法工作台 →</a><a href="/zh/getting-started">快速开始</a></div>
<div class="hero-demo"><div>he · she · his · hers<br>u<mark>she</mark>rs → she, he<br>us<mark>hers</mark> → hers</div><div>search('ushers')<br>{ pattern: 'she', start: 1, end: 4 }<br>text.slice(1, 4) === 'she'</div></div>
<p class="hero-small">此站点对应尚未发布的 v3 工作区代码。 MIT · SonOfMagic · <a href="https://github.com/BrunoRB/ahocorasick">BrunoRB/ahocorasick</a></p>
</div>
