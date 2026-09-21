---
layout: page
sidebar: false
---

<div class="hero">
<p class="hero-kicker">Aho–Corasick / exact text matching</p>
<h1 class="hero-title">One dictionary.<br>One scan.<br>Every match.</h1>
<p class="hero-copy">Match a dictionary against text with grapheme precision and slice-ready ranges. Follow every transition, fallback, and suffix match.</p>
<div class="hero-links"><a href="/visualization">Open the workbench →</a><a href="/getting-started">Get started</a></div>
<div class="hero-demo"><div>he · she · his · hers<br>u<mark>she</mark>rs → she, he<br>us<mark>hers</mark> → hers</div><div>search('ushers')<br>{ pattern: 'she', start: 1, end: 4 }<br>text.slice(1, 4) === 'she'</div></div>
<p class="hero-small">Documentation for v3, available on npm. MIT · SonOfMagic · <a href="https://github.com/BrunoRB/ahocorasick">BrunoRB/ahocorasick</a></p>
</div>
