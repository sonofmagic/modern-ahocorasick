---
layout: page
sidebar: false
title: 使用文档
description: 学习 modern-ahocorasick v3.2.0 的精确多模式匹配、Unicode 处理和流式 API。
---

<script setup>
import HomeIntro from "../src/HomeIntro.vue"
</script>

<div class="hero">
<HomeIntro language="zh" />
<div class="hero-demo"><div>he · she · his · hers<br>u<mark>she</mark>rs → she, he<br>us<mark>hers</mark> → hers</div><div>search('ushers')<br>{ pattern: 'she', start: 1, end: 4 }<br>text.slice(1, 4) === 'she'</div></div>
<nav class="hero-reading" aria-label="文档阅读路径"><a href="/zh/guide/choosing">选择能力</a><a href="/zh/api">API 参考</a><a href="/zh/extensions">扩展能力</a><a href="/zh/stream/sessions">流式处理</a></nav>
<p class="hero-small">本站介绍已在 npm 发布的 v3.2.0。 MIT · SonOfMagic · <a href="https://github.com/BrunoRB/ahocorasick">BrunoRB/ahocorasick</a></p>

<section class="home-proof" aria-label="库能力速览">
<div><strong>3.2.0</strong><span>当前版本</span></div>
<div><strong>grapheme-first</strong><span>匹配单位</span></div>
<div><strong>UTF-16</strong><span>可直接切片的范围</span></div>
<div><strong>0</strong><span>运行时依赖</span></div>
</section>

<section class="home-section" aria-labelledby="home-tasks">
<div class="home-section-heading"><p class="hero-kicker">从任务开始</p><h2 id="home-tasks">每一种文本处理，都有对应的入口。</h2><p>先选需要的结果，再随着应用增长继续复用同一个匹配器。</p></div>
<div class="home-cards">
<a class="home-card" href="/zh/api/search"><span class="home-card-label">查找</span><h3>搜索每一处命中</h3><p>获取独立匹配、原文范围、重复词条索引，并控制重叠结果。</p><code>matcher.search(text)</code></a>
<a class="home-card" href="/zh/api/count"><span class="home-card-label">统计</span><h3>判断、计数、聚合</h3><p>首次命中即停，统计全部出现次数，或在不创建匹配对象时统计每个词条。</p><code>matcher.countByPattern(text)</code></a>
<a class="home-card" href="/zh/examples/highlighting"><span class="home-card-label">渲染</span><h3>安全地高亮文本</h3><p>将非重叠命中拆成 token，并把用户输入作为文本节点渲染，包括看起来像 HTML 的字符串。</p><code>matcher.tokenize(text)</code></a>
<a class="home-card" href="/zh/stream/sessions"><span class="home-card-label">流式</span><h3>处理连续分块</h3><p>跨块保留字素，使用会话、异步迭代、预览和背压处理增量文本。</p><code>createTokenStream(matcher)</code></a>
</div>
</section>

<section class="home-callout" aria-labelledby="home-contract">
<div><p class="hero-kicker">需要记住的契约</p><h2 id="home-contract">匹配原文，也保留原文坐标。</h2><p>每个结果都使用左闭右开的 UTF-16 范围，因此命中文本始终可以用 <code>text.slice(start, end)</code> 取得。Emoji、组合字符和 CRLF 都会作为完整字素处理。</p><a class="home-inline-link" href="/zh/unicode">阅读 Unicode 与索引指南 →</a></div>
<pre><code>const text = '😀 café'
const hit = new AhoCorasick(['café']).search(text)[0]
text.slice(hit.start, hit.end)
// 'café'</code></pre>
</section>

<section class="home-section home-paths" aria-labelledby="home-paths">
<div class="home-section-heading"><p class="hero-kicker">继续探索</p><h2 id="home-paths">从第一次匹配，到完整的生产流水线。</h2></div>
<div class="home-path-list"><a href="/zh/guide/choosing"><strong>选择入口</strong><span>找到最适合任务的最小 API。</span><b>→</b></a><a href="/zh/extensions"><strong>增加能力</strong><span>归一化、动态词典、过滤器和快速后端。</span><b>→</b></a><a href="/zh/visualization"><strong>查看自动机</strong><span>逐步观察转移、回退和后缀输出。</span><b>→</b></a></div>
</section>
</div>
