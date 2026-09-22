---
layout: page
sidebar: false
title: Documentation
description: Learn exact multi-pattern matching, Unicode processing and streaming with modern-ahocorasick v3.2.0.
---

<div class="hero">
<p class="hero-kicker">Aho–Corasick / exact text matching</p>
<h1 class="hero-title">One dictionary.<br>One scan.<br>Every match.</h1>
<p class="hero-copy">Match a dictionary against text with grapheme precision and slice-ready ranges. Follow every transition, fallback, and suffix match.</p>
<div class="hero-links"><a href="/visualization">Open the workbench →</a><a href="/getting-started">Get started</a></div>
<div class="hero-demo"><div>he · she · his · hers<br>u<mark>she</mark>rs → she, he<br>us<mark>hers</mark> → hers</div><div>search('ushers')<br>{ pattern: 'she', start: 1, end: 4 }<br>text.slice(1, 4) === 'she'</div></div>
<nav class="hero-reading" aria-label="Documentation paths"><a href="/guide/choosing">Choose an API</a><a href="/api">API reference</a><a href="/extensions">Extensions</a><a href="/stream/sessions">Streams</a></nav>
<p class="hero-small">Documentation for v3.2.0, available on npm. MIT · SonOfMagic · <a href="https://github.com/BrunoRB/ahocorasick">BrunoRB/ahocorasick</a></p>

<section class="home-proof" aria-label="Library highlights">
<div><strong>3.2.0</strong><span>current release</span></div>
<div><strong>grapheme-first</strong><span>matching unit</span></div>
<div><strong>UTF-16</strong><span>slice-ready ranges</span></div>
<div><strong>0</strong><span>runtime dependencies</span></div>
</section>

<section class="home-section" aria-labelledby="home-tasks">
<div class="home-section-heading"><p class="hero-kicker">Start with a task</p><h2 id="home-tasks">A focused API for each kind of text work.</h2><p>Pick the result you need, then keep the same matcher as your application grows.</p></div>
<div class="home-cards">
<a class="home-card" href="/api/search"><span class="home-card-label">Find</span><h3>Search every occurrence</h3><p>Get independent matches with original text ranges, duplicate pattern indexes, and overlap control.</p><code>matcher.search(text)</code></a>
<a class="home-card" href="/api/count"><span class="home-card-label">Measure</span><h3>Check, count, aggregate</h3><p>Stop on the first hit, count all occurrences, or count each dictionary entry without creating match objects.</p><code>matcher.countByPattern(text)</code></a>
<a class="home-card" href="/examples/highlighting"><span class="home-card-label">Render</span><h3>Highlight safely</h3><p>Tokenize non-overlapping matches and render user input as text nodes, including strings that look like HTML.</p><code>matcher.tokenize(text)</code></a>
<a class="home-card" href="/stream/sessions"><span class="home-card-label">Stream</span><h3>Process chunks</h3><p>Carry graphemes across chunk boundaries with sessions, async iterables, previews, and backpressure.</p><code>createTokenStream(matcher)</code></a>
</div>
</section>

<section class="home-callout" aria-labelledby="home-contract">
<div><p class="hero-kicker">The contract to remember</p><h2 id="home-contract">Match the original text. Keep the original coordinates.</h2><p>Every result uses a half-open UTF-16 range, so the matched text is always <code>text.slice(start, end)</code>. Emoji, combining marks, and CRLF stay together as graphemes.</p><a class="home-inline-link" href="/unicode">Read the Unicode and index guide →</a></div>
<pre><code>const text = '😀 café'
const hit = new AhoCorasick(['café']).search(text)[0]
text.slice(hit.start, hit.end)
// 'café'</code></pre>
</section>

<section class="home-section home-paths" aria-labelledby="home-paths">
<div class="home-section-heading"><p class="hero-kicker">Keep exploring</p><h2 id="home-paths">From the first match to a production pipeline.</h2></div>
<div class="home-path-list"><a href="/guide/choosing"><strong>Choose an entry</strong><span>Find the smallest API that fits.</span><b>→</b></a><a href="/extensions"><strong>Add capabilities</strong><span>Folding, dynamic dictionaries, filters, and fast backends.</span><b>→</b></a><a href="/visualization"><strong>See the automaton</strong><span>Step through transitions, fallbacks, and suffix outputs.</span><b>→</b></a></div>
</section>
</div>
