import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { digest } from './benchmark-versions-utils.mjs'

const full = JSON.parse(readFileSync(process.argv[2] ?? new URL('../docs/benchmarks-versions.json', import.meta.url), 'utf8'))
const recheck = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : undefined
assert.equal(full.schemaVersion, 1)
if (recheck) {
  assert.equal(recheck.recheckOf.reportSha256, digest(full), 'Recheck does not belong to this full run')
  assert.deepEqual(recheck.versions, full.versions)
  assert.equal(recheck.corpusSha256, full.corpusSha256)
  assert.equal(recheck.runnerSha256, full.runnerSha256)
}
const variants = ['v1', 'v2', 'current']
const label = variant => `${variant === 'current' ? 'v3' : variant} (${full.versions[variant].version})`
const row = (scenario, variant) => full.results.find(item => item.scenario === scenario && item.variant === variant)
const ratio = value => value === null || value === undefined ? '—' : `${value < 0.01 ? value.toPrecision(2) : value.toFixed(2)}×`
const ms = value => value === null || value === undefined ? '—' : value < 0.01 ? value.toFixed(6) : value.toFixed(3)
const kib = value => (value / 1024).toFixed(2)
function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(cells => `| ${cells.join(' | ')} |`),
  ].join('\n')
}
const flags = full.comparisons.filter(item => item.recheck)
const followup = item => recheck?.comparisons.find(other => other.scenario === item.scenario && other.baseline === item.baseline && other.operation === item.operation)
const repeated = flags.filter(item => followup(item)?.recheck)
const comparableRows = full.results.filter(item => item.variant === 'current')

for (const zh of [false, true]) {
  const t = (en, cn) => zh ? cn : en
  const sections = []
  const add = value => sections.push(value)
  add(t('# v1 / v2 / v3 benchmark report', '# v1／v2／v3 性能对比使用指南'))
  add(t('[中文版](./benchmarks-versions.zh-CN.md)', '[English](./benchmarks-versions.md)'))
  add(t(
    `Measured ${full.startedAt} on ${full.environment.cpu}, ${full.environment.platform}/${full.environment.arch}, Node ${full.environment.node}, ICU ${full.environment.icu}, Unicode ${full.environment.unicode}. Compare published ${label('v1')} and ${label('v2')} with the local default ${label('current')} build.`,
    `测量时间：${full.startedAt}。环境：${full.environment.cpu}、${full.environment.platform}/${full.environment.arch}、Node ${full.environment.node}、ICU ${full.environment.icu}、Unicode ${full.environment.unicode}。比较已发布的 ${label('v1')}、${label('v2')} 与本地默认入口 ${label('current')} 构建。`,
  ))
  add(t('## 1. Findings', '## 1. 结果解读'))
  const summaryRows = ['v1', 'v2'].map((variant) => {
    const pairs = full.comparisons.filter(item => item.baseline === variant && item.comparable)
    return [label(variant), ...full.operations.map((operation) => {
      const values = pairs.filter(item => item.operation === operation)
      return `${values.filter(item => item.currentOverBaseline !== null && item.currentOverBaseline < 1).length}/${values.filter(item => item.currentOverBaseline !== null).length}`
    })]
  })
  add(t('Current has a lower initial median in the following comparable scenarios (count / total). These counts summarize this corpus, not a universal speedup or a significance test.', '下表是当前版本初测中位数更低的场景数量（较快场景数／可比场景总数）。它只描述本次语料，不代表普遍提速，也不是显著性检验。'))
  add(table([t('Baseline', '基线'), ...full.operations], summaryRows))
  const dense = variants.map(variant => row('dense-suffix', variant))
  if (dense.every(Boolean)) {
    add(t(
      `Dense suffixes produce ${dense[2].checks.expectedCount.toLocaleString('en-US')} occurrences: historical search retains grouped results backed by dictionary-owned keyword arrays, while v3 allocates independent range objects. Native result heaps are ${dense.map(item => `${label(item.variant)} ${kib(item.memory.nativeResults.heapBytes)} KiB`).join('; ')}. Use the normalizedSearch table when your application needs independent UTF-16 ranges.`,
      `密集后缀场景产生 ${dense[2].checks.expectedCount.toLocaleString('en-US')} 次匹配：旧版返回分组结果并复用词典中的词条数组，v3 分配独立范围对象。原生结果保留堆分别为 ${dense.map(item => `${label(item.variant)} ${kib(item.memory.nativeResults.heapBytes)} KiB`).join('；')}。应用需要独立 UTF-16 范围时，应参考 normalizedSearch 表。`,
    ))
  }
  add(t(
    `v1 fails the emoji, ZWJ, combining-mark and CRLF cases. Their raw measurements remain visible with †, but no ratios are calculated. Initial flags above 5%: ${flags.length}; ${recheck ? `${repeated.length} remain above 5% in the ${recheck.rounds}-round targeted recheck` : 'a targeted recheck has not been supplied'}. See the recheck table before interpreting a small difference.`,
    `v1 在 emoji、ZWJ、组合字符和 CRLF 场景中结果不正确。原始测量保留并标记 †，不计算速度比。初测有 ${flags.length} 项耗时增加超过 5%；${recheck ? `${recheck.rounds} 轮定向复测中有 ${repeated.length} 项仍超过 5%` : '尚未提供定向复测结果'}。解读小幅差异前请查看复测表。`,
  ))
  add(t('## 2. Reproduction and methodology', '## 2. 复现与测量方法'))
  add('```sh\npnpm install --frozen-lockfile\npnpm test:benchmark:versions\npnpm benchmark:versions > docs/benchmarks-versions.json\n# Recheck only flagged scenario/operation combinations, with 7 rounds by default.\nnode --expose-gc scripts/benchmark-versions.mjs --recheck docs/benchmarks-versions.json > docs/benchmarks-versions-recheck.json\nnode scripts/report-benchmark-versions.mjs docs/benchmarks-versions.json docs/benchmarks-versions-recheck.json\npnpm exec eslint docs/benchmarks-versions*.md --fix\n```')
  add(t(
    'Use pnpm 12.5.1 and a supported Node version. Run sequentially without builds, tests or other benchmarks competing for CPU. Recheck is needed only if the full JSON contains recheck flags; omit its argument when generating a report without flags. JSON is stdout; build/progress logs go to stderr. Existing benchmark commands keep their previous meaning.',
    '使用 pnpm 12.5.1 和受支持的 Node 版本。串行运行，测量期间不要并行执行构建、测试或其他 benchmark。完整 JSON 中存在 recheck 标记时才需要复测；没有标记时，生成报告可省略复测文件参数。stdout 只输出 JSON，构建和进度日志写入 stderr。原有 benchmark 命令含义保持不变。',
  ))
  add('```sh\nBENCH_ROUNDS=1 BENCH_SCENARIOS=ordinary,emoji BENCH_OPERATIONS=search,match pnpm benchmark:versions > /tmp/versions-smoke.json\n```')
  add(t(
    `${full.rounds} independent process rounds per scenario/version, ${full.samples} batched timing samples per operation after warmup, with GC outside timed regions. Version order rotates and reverses across rounds. Tables show medians of process medians; JSON includes all samples, within-round MAD and between-round MAD. Rechecks rerun all three versions for flagged scenario/operation combinations, without repeating memory measurements. No automatic timing gate is applied.`,
    `每个场景／版本使用 ${full.rounds} 轮独立进程；预热后，每项操作采集 ${full.samples} 份批量计时样本，GC 在计时之外执行。轮次间轮换并反转版本顺序。表格展示各进程中位数的中位数；JSON 保留所有样本、轮内 MAD 和轮间 MAD。复测只针对被标记的场景／操作组合重跑三个版本，不重复测量内存。不设置自动耗时门禁。`,
  ))
  add(t(
    '`build` measures only the native constructor. `search` measures native eager output; `iterate` drains the lazy iterator with `Array.from` and is unsupported by v1/v2, which is shown as — rather than compared. Each child also exposes `diagnostics.directSearch` and `diagnostics.lazyIterate` aliases in JSON. `match` measures native early-exit presence and has no throughput metric. `normalizedSearch` includes search plus historical conversion to `{pattern, patternIndex, start, end, data}`. v1 ends are UTF-16 indices; v2 ends are grapheme indices, so conversion segments each input inside the timed operation. Dictionary-to-index maps are prepared once outside timing. v3 already returns the target format. Canonical sorting is used only for validation, outside timing; normalization is a transparent consumer adapter, not a claim of optimal conversion.',
    '`build` 只测原生构造器，`search` 测原生 eager 输出；`iterate` 用 `Array.from` 消耗 lazy iterator，v1/v2 不支持该 API，因此显示为 — 而不进行比较。每个子进程也会在 JSON 中提供 `diagnostics.directSearch` 和 `diagnostics.lazyIterate` 别名。`match` 测原生早停判断，不报告吞吐率。`normalizedSearch` 包含搜索和旧版结果到 `{pattern, patternIndex, start, end, data}` 的转换。v1 结束位置是 UTF-16 索引，v2 是字素索引，因此 v2 转换会在计时内对每次输入分段。词条到索引的映射在计时外预建一次。v3 已返回目标格式。排序只用于计时外校验；适配器用于展示调用方转换成本，不宣称此转换实现最优。',
  ))
  add(t(
    'The independent oracle searches substrings at original grapheme boundaries and preserves duplicate pattern indices. Validation compares canonical ranges and boolean presence, not just counts. Historical missing results are never synthesized. ASCII mismatches or unexpected v2/v3 Unicode mismatches abort the run. Known v1 errors are asserted explicitly.',
    '独立参考实现搜索原文字素边界上的子串，并保留重复词条索引。校验比较完整范围和存在性判断，不只比较数量。适配时不补齐旧版漏匹配。ASCII 不一致或 v2／v3 意外的 Unicode 不一致会中止测量；v1 已知差异也有明确断言。',
  ))
  add(table([t('Scenario', '场景'), t('Patterns', '词条数'), t('UTF-16 units', 'UTF-16 单元数'), t('Expected occurrences', '预期匹配数')], comparableRows.map(item => [item.scenario, item.keywords, item.utf16Length, item.checks.expectedCount])))
  add(t('## 3. Timings', '## 3. 耗时'))
  add(t('All times are milliseconds. Ratios are **current time / baseline time**: below 1 is faster; above 1 is slower. † means incorrect results, and — suppresses the ratio. The two search measurements have different output contracts; early-hit match latency does not measure a full-input scan. Sub-microsecond presence ratios are especially sensitive to JIT and measurement overhead; inspect absolute times and MAD.', '所有耗时单位为毫秒。比值为 **当前版耗时／基线耗时**：小于 1 更快，大于 1 更慢。† 表示结果错误，— 表示不计算比值。两种搜索测量的输出契约不同；首次命中的 match 延迟不代表完整扫描输入的耗时。亚微秒存在性判断尤其受 JIT 和测量开销影响，应结合绝对耗时与 MAD 解读。'))
  for (const operation of full.operations) {
    add(`### ${operation}`)
    add(table([t('Scenario', '场景'), label('v1'), label('v2'), label('current'), 'v3 / v1', 'v3 / v2'], full.scenarios.map((scenario) => {
      const values = variants.map(variant => row(scenario, variant))
      return [scenario, ...values.map(item => `${ms(item.metrics[operation]?.ms)}${item.checks.correct ? '' : ' †'}`), ...['v1', 'v2'].map(baseline => ratio(full.comparisons.find(item => item.scenario === scenario && item.baseline === baseline && item.operation === operation)?.currentOverBaseline))]
    })))
  }
  add(t('## 4. Retained memory and Unicode correctness', '## 4. 保留内存与 Unicode 正确性'))
  add(t(
    'KiB, medians of independent memory processes per round. Dictionary deltas average ten retained native matchers; results retain one native or normalized search output after GC. Historical native results share arrays already retained by the dictionary. Normalizer lookup maps are excluded. ArrayBuffer storage is reported separately from JS heap; native ICU memory and peak RSS are not measured. Signed deltas preserve GC noise rather than clamping it to zero. Tiny or negative values are not stable memory savings. Incorrect v1 Unicode rows cannot support memory-efficiency claims.',
    '单位为 KiB，取每轮独立内存进程结果的中位数。词典增量平均自十个保留的原生实例；结果增量来自 GC 后保留的一份原生或统一格式搜索输出。旧版原生结果共享词典已有数组。适配器索引映射不计入词典内存。ArrayBuffer 与 JS 堆分开报告，不测原生 ICU 内存及峰值 RSS。保留带符号增量，不将 GC 噪声截断为零；很小或负的值不代表稳定的内存节省。v1 的错误 Unicode 结果不能用于论证内存效率。',
  ))
  add(table([t('Scenario', '场景'), t('Version', '版本'), t('Dictionary heap', '词典堆'), t('Dictionary buffers', '词典缓冲'), t('Native result heap', '原生结果堆'), t('Range result heap', '范围结果堆')], full.results.map(item => [item.scenario, `${label(item.variant)}${item.checks.correct ? '' : ' †'}`, kib(item.memory.dictionary.heapBytes), kib(item.memory.dictionary.arrayBufferBytes), kib(item.memory.nativeResults.heapBytes), kib(item.memory.normalizedResults.heapBytes)])))
  add(t('Result ArrayBuffer deltas are also retained in JSON. The following Unicode rows show actual / expected occurrence counts; boolean columns show actual / expected presence.', '结果的 ArrayBuffer 增量也保存在 JSON 中。以下 Unicode 行展示实际／预期匹配数，以及实际／预期存在性判断。'))
  add(table([t('Scenario', '场景'), t('Version', '版本'), t('Occurrences', '匹配数'), 'match()', t('Correct', '正确')], full.results.filter(item => item.unicode).map(item => [item.scenario, label(item.variant), `${item.checks.actualCount} / ${item.checks.expectedCount}`, `${item.checks.presence} / ${item.checks.expectedPresence}`, item.checks.correct ? t('yes', '是') : t('no', '否')])))
  add(t('v1 builds its trie by code point but scans UTF-16 code units, so emoji and ZWJ words are missed. It also accepts partial combining sequences and individual CR/LF inside one grapheme. v2/v3 enforce grapheme boundaries in these fixtures. JSON contains missing/extra examples and correctness digests.', 'v1 构建词典时按码点遍历，却按 UTF-16 单元扫描，因此漏掉 emoji 和 ZWJ 词条；它也会匹配组合序列的一部分，以及同一字素内部的 CR／LF。v2／v3 在这些语料上遵守字素边界。JSON 中保留漏匹配、多匹配示例及结果摘要。'))
  add(t('## 5. Targeted rechecks and source data', '## 5. 定向复测与原始数据'))
  add(table([t('Scenario', '场景'), t('Operation', '操作'), t('Baseline', '基线'), t('Initial v3 / baseline', '初测 v3／基线'), t('Recheck v3 / baseline', '复测 v3／基线'), t('Still >5% slower', '仍慢于 5%')], flags.map((item) => {
    const next = followup(item)
    return [item.scenario, item.operation, item.baseline, ratio(item.currentOverBaseline), ratio(next?.currentOverBaseline), next ? (next.recheck ? t('yes', '是') : t('no', '否')) : '—']
  })))
  add(t('A repeated ratio above 1.05 documents a cost in this corpus, including differences in output allocation and Unicode guarantees. A single noisy flag is not proof of regression; even a repeated small difference is not a statistical confidence interval. The benchmark changes no matcher implementation.', '复测仍超过 1.05 的比值表明本语料下存在成本，其中包括结果分配和 Unicode 保证的差别。单次噪声标记不能证明回退；重复出现的小幅差异也不等于统计置信区间。本次 benchmark 不修改匹配器实现。'))
  add(t(`[Full run](./benchmarks-versions.json) · [Targeted recheck](./benchmarks-versions-recheck.json). Full timing processes: ${full.rawRuns.length}; memory processes: ${full.memoryRuns.length}; recheck timing processes: ${recheck?.rawRuns.length ?? 0}.`, `[完整测量](./benchmarks-versions.json) · [定向复测](./benchmarks-versions-recheck.json)。完整计时进程：${full.rawRuns.length}；内存进程：${full.memoryRuns.length}；复测计时进程：${recheck?.rawRuns.length ?? 0}。`))
  add(`${t('Source revision', '源码提交')}: \`${full.revision}\`; ${t('working tree contained benchmark changes', '测量时工作区包含 benchmark 改动')}: ${full.workingTreeDirty}.`)
  add(table([t('Artifact', '产物'), 'SHA-256'], [...variants.map(variant => [label(variant), full.versions[variant].implementationSha256]), [t('Corpus', '语料'), full.corpusSha256], [t('Runner', '测量脚本'), full.runnerSha256], ['pnpm-lock.yaml', full.lockfileSha256]]))
  add(t('Implementation fingerprints hash sorted ESM relative paths and file bytes. Corpus, runner, lockfile and report fingerprints hash JSON-serialized content; they are not standalone file checksums.', '实现指纹由排序后的 ESM 相对路径与文件内容计算；语料、脚本、lockfile 和报告指纹由 JSON 序列化内容计算，不是单个文件的直接校验和。'))
  add(t('Related reports: [historical v2/v3](./benchmarks.md), [ASCII optimizations](./benchmarks-ascii.md), [extension benchmarks](./benchmarks-extensions.md). These used other runtime versions and baselines; do not combine their timings with this run.', '相关报告：[历史 v2／v3](./benchmarks.md)、[ASCII 优化](./benchmarks-ascii.md)、[扩展能力](./benchmarks-extensions.md)。这些报告使用其他运行时或基线，不应与本次耗时混合计算。'))
  writeFileSync(new URL(`../docs/benchmarks-versions${zh ? '.zh-CN' : ''}.md`, import.meta.url), `${sections.join('\n\n')}\n`)
}
