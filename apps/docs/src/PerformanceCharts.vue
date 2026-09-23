<script setup lang="ts">
import type { EChartsCoreOption } from 'echarts/core'
import type { PerformanceData, Timing } from './performance-data'
import type { BenchmarkTableCell, BenchmarkTableRow } from './performance-presentation'
import { computed, ref } from 'vue'
import BenchmarkChart from './BenchmarkChart.vue'
import BenchmarkSource from './BenchmarkSource.vue'
import BenchmarkTable from './BenchmarkTable.vue'
import { scenarioLabels } from './performance-presentation'

const props = defineProps<{
  data: PerformanceData
  language: 'en' | 'zh'
}>()
const zh = computed(() => props.language === 'zh')
const scanOperation = ref('search')
const versions = ['v1', 'v2', 'current'] as const
const strategies = ['all', 'leftmost-longest'] as const
const text = (en: string, cn: string) => zh.value ? cn : en
const scenario = (key: string) => scenarioLabels[key]?.[zh.value ? 1 : 0] ?? key
const name = (version: string) => version === 'current' ? text('Optimized v3', '优化后 v3') : version
const before = computed(() => text('Before', '优化前'))
const after = computed(() => text('After', '优化后'))
const missing = computed(() => text('Not measured', '未测量'))
const invalid = computed(() => text('Not comparable', '不可比较'))
const fallback = computed(() => text('Chart unavailable. Read the data table below.', '图表暂不可用，请查看下方数据表。'))
const tableLabel = computed(() => text('Exact measurements and variation', '精确测量值与波动'))
const scenarioHeading = computed(() => text('Scenario', '场景'))
const number = (value: number | null, digits = 6) => value === null ? missing.value : new Intl.NumberFormat(zh.value ? 'zh-CN' : 'en-US', { maximumFractionDigits: digits }).format(value)
const stringCell = (value: string, title?: string): BenchmarkTableCell => ({ text: value, ...(title ? { title } : {}) })
function valueCell(value: number | null | undefined, digits = 6): BenchmarkTableCell {
  return value === null || value === undefined
    ? stringCell(missing.value)
    : { text: number(value, digits), value, title: String(value) }
}
function percentCell(value: number | null): BenchmarkTableCell {
  return value === null ? stringCell(missing.value) : { text: `${value > 0 ? '+' : ''}${number(value, 2)}%`, value, title: String(value) }
}
function timingCell(value: Timing | null, correct = true): BenchmarkTableCell {
  if (!correct) {
    return stringCell(invalid.value)
  }
  if (!value) {
    return stringCell(missing.value)
  }
  return {
    text: `${number(value.ms, 9)} (${value.madMs === null ? '—' : number(value.madMs, 9)}; ${value.betweenRoundsMadMs === null ? '—' : number(value.betweenRoundsMadMs, 9)})`,
    value: value.ms,
    title: String(value.ms),
  }
}
function horizontal(labels: string[], series: EChartsCoreOption['series'], ratio = false): EChartsCoreOption {
  return {
    tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
    legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11 } },
    grid: { left: 0, right: 18, top: 42, bottom: 12, containLabel: true },
    xAxis: {
      type: 'value',
      min: 0,
      axisLabel: { formatter: ratio ? '{value}×' : '{value}', fontSize: 11 },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: labels,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { interval: 0, fontSize: 11, width: 118, overflow: 'break' },
    },
    series,
  }
}
function reference() {
  return {
    silent: true,
    symbol: 'none',
    label: { show: false },
    lineStyle: { type: 'dashed' as const, width: 1.5 },
    data: [{ xAxis: 1 }],
  }
}
const scanRows = computed(() => props.data.scan.filter(row => row.operation === scanOperation.value))
const scanOptions = computed(() => horizontal(
  scanRows.value.map(row => scenario(row.scenario)),
  [{
    id: 'current',
    name: after.value,
    type: 'bar',
    barMaxWidth: 15,
    data: scanRows.value.map(row => row.ratio),
    markLine: reference(),
  }],
  true,
))
const scanTableRows = computed<BenchmarkTableRow[]>(() => scanRows.value.map(row => ({
  key: row.scenario,
  cells: [stringCell(scenario(row.scenario), row.scenario), timingCell(row.before), timingCell(row.after), valueCell(row.ratio), percentCell(row.changePercent)],
})))
const scanHeadings = computed(() => [scenarioHeading.value, `${before.value} · ms`, `${after.value} · ms`, text('After / before', '优化后 / 优化前'), text('Time change', '耗时变化')])
const operations = computed(() => [
  ['search', text('Full search', '完整搜索')],
  ['search:leftmost-first', 'leftmost-first'],
  ['search:leftmost-longest', 'leftmost-longest'],
  ['count', text('Count', '计数')],
])
const normalizedRows = computed(() => props.data.versions.filter(row => row.operation === 'normalizedSearch'))
const nativeRows = computed(() => props.data.versions.filter(row => row.operation === 'search'))
const versionOptions = computed(() => horizontal(
  normalizedRows.value.map(row => scenario(row.scenario)),
  versions.map((version, index) => ({
    id: version,
    name: name(version),
    type: 'bar' as const,
    barMaxWidth: 9,
    data: normalizedRows.value.map(row => row.values[version].ratioToV2),
    ...(index === 0 ? { markLine: reference() } : {}),
  })),
  true,
))
function versionTableRows(rows: typeof props.data.versions): BenchmarkTableRow[] {
  return rows.map(row => ({
    key: row.scenario,
    cells: [
      stringCell(scenario(row.scenario), row.scenario),
      ...versions.map(version => timingCell(row.values[version].timing, row.values[version].comparable)),
      stringCell(`${row.rounds} · ${row.source === 'versionRecheck' ? text('recheck', '复测') : text('original', '原始')}`),
    ],
  }))
}
const versionHeadings = computed(() => [scenarioHeading.value, 'v1 · ms', 'v2 · ms', `${name('current')} · ms`, text('Rounds / source', '轮数 / 来源')])
const versionWins = computed(() => normalizedRows.value.filter(row => (row.values.current.ratioToV2 ?? Infinity) < 1).length)
function builderOptions(metric: 'buildMs' | 'peakRssMiB'): EChartsCoreOption {
  return {
    tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
    legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8 },
    grid: { top: 52, right: 8, left: 0, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: props.data.builder.map(row => number(row.size)), axisTick: { show: false }, axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', min: 0, name: metric === 'buildMs' ? 'ms' : 'MiB', axisLabel: { fontSize: 11 } },
    series: (['before', 'after'] as const).map(variant => ({
      id: variant === 'before' ? 'baseline' : 'current',
      name: variant === 'before' ? before.value : after.value,
      type: 'bar',
      barMaxWidth: 42,
      data: props.data.builder.map(row => row[variant][metric]),
    })),
  }
}
const builderTimeOptions = computed(() => builderOptions('buildMs'))
const builderRssOptions = computed(() => builderOptions('peakRssMiB'))
const builderTableRows = computed<BenchmarkTableRow[]>(() => props.data.builder.map(row => ({
  key: String(row.size),
  cells: [
    stringCell(number(row.size)),
    valueCell(row.before.buildMs, 9),
    valueCell(row.after.buildMs, 9),
    percentCell(row.buildChangePercent),
    valueCell(row.before.buildMadMs, 9),
    valueCell(row.after.buildMadMs, 9),
    valueCell(row.before.peakRssMiB),
    valueCell(row.after.peakRssMiB),
    percentCell(row.peakRssChangePercent),
    valueCell(row.before.peakRssMadMiB),
    valueCell(row.after.peakRssMadMiB),
    valueCell(row.before.heapMiB),
    valueCell(row.after.heapMiB),
    valueCell(row.before.arrayBufferMiB),
    valueCell(row.after.arrayBufferMiB),
  ],
})))
const builderHeadings = computed(() => [
  text('Patterns', '词条数'),
  `${before.value} · ms`,
  `${after.value} · ms`,
  text('Time change', '耗时变化'),
  `${before.value} MAD · ms`,
  `${after.value} MAD · ms`,
  `${before.value} RSS · MiB`,
  `${after.value} RSS · MiB`,
  text('RSS change', 'RSS 变化'),
  `${before.value} RSS MAD · MiB`,
  `${after.value} RSS MAD · MiB`,
  `${before.value} heap · MiB`,
  `${after.value} heap · MiB`,
  `${before.value} buffers · MiB`,
  `${after.value} buffers · MiB`,
])
const largestBuild = computed(() => props.data.builder.at(-1))
const retainedOptions = computed(() => horizontal(
  props.data.retained.map(row => scenario(row.scenario)),
  [{
    id: 'current',
    name: text('Retained JS heap', '保留 JS 堆'),
    type: 'bar',
    barMaxWidth: 15,
    data: props.data.retained.map(row => row.before.heapBytes > 0 ? row.after.heapBytes / row.before.heapBytes : null),
    markLine: reference(),
  }],
  true,
))
const retainedTableRows = computed<BenchmarkTableRow[]>(() => props.data.retained.map(row => ({
  key: row.scenario,
  cells: [
    stringCell(scenario(row.scenario), row.scenario),
    valueCell(row.before.heapBytes),
    valueCell(row.after.heapBytes),
    percentCell(row.heapChangePercent),
    valueCell(row.before.arrayBufferBytes),
    valueCell(row.after.arrayBufferBytes),
  ],
})))
const dictionaryMemory = computed(() => normalizedRows.value.find(row => row.scenario === 'large-dictionary')?.memory)
const memoryOptions = computed<EChartsCoreOption>(() => ({
  tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
  legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8 },
  grid: { top: 52, right: 8, left: 0, bottom: 8, containLabel: true },
  xAxis: { type: 'category', data: versions.map(name), axisTick: { show: false } },
  yAxis: { type: 'value', min: 0, name: 'MiB' },
  series: (['heapBytes', 'arrayBufferBytes'] as const).map(metric => ({
    id: metric === 'heapBytes' ? 'heap' : 'buffer',
    name: metric === 'heapBytes' ? 'JS heap' : 'ArrayBuffer',
    type: 'bar',
    stack: 'dictionary',
    barMaxWidth: 56,
    data: versions.map((version) => {
      const memory = dictionaryMemory.value?.[version]?.dictionary
      return memory ? memory[metric] / 1_048_576 : null
    }),
  })),
}))
const memoryTableRows = computed<BenchmarkTableRow[]>(() => versions.map((version) => {
  const memory = dictionaryMemory.value?.[version]?.dictionary
  return {
    key: version,
    cells: [stringCell(name(version)), valueCell(memory?.heapBytes), valueCell(memory?.arrayBufferBytes), valueCell(memory ? (memory.heapBytes + memory.arrayBufferBytes) / 1_048_576 : null)],
  }
}))
function streamOptions(strategy: string): EChartsCoreOption {
  return {
    tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
    legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8 },
    grid: { top: 52, right: 16, left: 0, bottom: 32, containLabel: true },
    xAxis: {
      type: 'value',
      min: 0,
      name: text('Cumulative UTF-16 units', '累计 UTF-16 单元'),
      nameLocation: 'middle',
      nameGap: 32,
      axisLabel: { formatter: (value: number) => `${value / 1000}k`, fontSize: 11 },
    },
    yAxis: { type: 'value', min: 0, name: text('Heap growth · KiB', '堆增长 · KiB'), axisLabel: { fontSize: 11 } },
    series: props.data.stream.filter(row => row.strategy === strategy).map(row => ({
      id: row.variant,
      name: row.variant === 'baseline' ? before.value : after.value,
      type: 'line',
      smooth: false,
      symbolSize: 7,
      data: row.points.map(point => [point.utf16Units, point.heapKiB]),
    })),
  }
}
const streamChartOptions = computed(() => ({
  'all': streamOptions('all'),
  'leftmost-longest': streamOptions('leftmost-longest'),
}))
const streamTableRows = computed<BenchmarkTableRow[]>(() => props.data.stream.flatMap(row => row.points.map(point => ({
  key: `${row.strategy}-${row.variant}-${point.utf16Units}`,
  cells: [
    stringCell(`${row.strategy} · ${row.variant === 'baseline' ? before.value : after.value}`),
    valueCell(point.utf16Units),
    valueCell(point.heapKiB),
    valueCell(point.arrayBufferKiB),
    valueCell(point.emitted),
    valueCell(row.finalEmitted),
    valueCell(row.closedHeapKiB),
    valueCell(row.closedBufferKiB),
  ],
}))))
const longestStream = computed(() => props.data.stream.find(row => row.strategy === 'leftmost-longest' && row.variant === 'current'))
const recheckSources = computed(() => [...new Set(props.data.rechecks.map(row => row.source))])
const warmBuildChange = computed(() => props.data.rechecks.find(row => row.source === 'builderRecheck' && row.scenario === 'ordinary' && row.operation === 'build')?.changePercent ?? null)
const unchangedBuffers = computed(() => props.data.retained.filter(row => row.before.arrayBufferBytes === row.after.arrayBufferBytes).length)
const recheckTableRows = computed<BenchmarkTableRow[]>(() => props.data.rechecks.map(row => ({
  key: `${row.source}-${row.scenario}-${row.operation}`,
  cells: [
    stringCell(scenario(row.scenario), row.scenario),
    stringCell(row.operation),
    timingCell(row.before),
    timingCell(row.after),
    percentCell(row.changePercent),
    stringCell(`${props.data.sources[row.source].rounds} · ${row.source}`),
  ],
})))
</script>

<template>
  <div class="performance-charts" data-testid="performance-charts">
    <p class="reading-note">
      {{ text('Measured snapshots, not a live benchmark or a claim about the latest npm release. Lower time and memory are better. Expand the tables for values and variation.', '以下为已测量的实现快照，不是实时基准，也不代表最新 npm 发布版。耗时与内存越低越好；展开数据表可查看数值和波动。') }}
    </p>

    <section aria-labelledby="scan-performance-heading" data-testid="scan-performance">
      <h3 id="scan-performance-heading">
        {{ text('Scanning before and after optimization', '优化前后的扫描性能') }}
      </h3>
      <p>{{ text('All 18 scenarios share the same baseline. The dashed line is the original time (1×); a bar at 0.4× takes 40% of that time. Switch operations to see where the gains apply.', '18 个场景使用同一基线。虚线代表原耗时（1×）；0.4× 表示耗时为原来的 40%。切换操作可查看不同查询的收益。') }}</p>
      <div class="chart-control">
        <label for="scan-operation">{{ text('Operation', '查询操作') }}</label>
        <select id="scan-operation" v-model="scanOperation" data-testid="scan-operation">
          <option v-for="[value, label] in operations" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </div>
      <BenchmarkChart :option="scanOptions" :height="670" :label="text('Scan time relative to the baseline, across 18 scenarios', '18 个场景的扫描耗时与基线之比')" :fallback="fallback" />
      <p class="chart-caption">
        {{ text('After / before · lower is faster · baseline = 1×', '优化后 / 优化前 · 越低越快 · 基线 = 1×') }}
      </p>
      <BenchmarkTable data-testid="scan-table" :label="tableLabel" :headings="scanHeadings" :rows="scanTableRows" />
      <p class="chart-caption">
        {{ text('Timing cells show median ms (within-round MAD; between-round MAD). MAD measures variation, not a confidence interval. — means that statistic was not recorded.', '耗时单元格格式为中位数 ms（轮内 MAD；轮间 MAD）。MAD 表示波动，不是置信区间；— 表示未记录该统计量。') }}
      </p>
      <BenchmarkSource :source="data.sources.scan" :language="language" />
      <details class="followup-measurements">
        <summary>{{ text('Later targeted rechecks and remaining tradeoffs', '后续针对性复测与仍然存在的取舍') }}</summary>
        <p>{{ text(`The scan chart keeps its original five-round snapshot. Later measurements below use their own implementation fingerprints and are not spliced into it. Repeated warm construction of the ordinary small dictionary changed by ${number(warmBuildChange, 1)}% (positive means slower). High-output dictionaries use native full enumeration even on no-hit text, so ASCII gains are not universal.`, `上方扫描图保留原始五轮快照。下列后续测量保留各自的实现指纹，不混入该图。普通小词典的重复热构建耗时变化 ${number(warmBuildChange, 1)}%（正值表示变慢）。高输出词典即使在无命中文本上也使用原生完整枚举，因此 ASCII 加速并非适用于所有情况。`) }}</p>
        <BenchmarkTable data-testid="scan-recheck-table" :label="tableLabel" :headings="[scenarioHeading, text('Operation', '操作'), `${before} · ms`, `${after} · ms`, text('Time change', '耗时变化'), text('Rounds / source', '轮数 / 来源')]" :rows="recheckTableRows" />
        <BenchmarkSource v-for="source in recheckSources" :key="source" :source="data.sources[source]" :language="language" />
      </details>
    </section>

    <section aria-labelledby="version-performance-heading" data-testid="version-performance">
      <h3 id="version-performance-heading">
        {{ text('v1, v2 and optimized v3', 'v1、v2 与优化后 v3') }}
      </h3>
      <p>{{ text(`With independent UTF-16 ranges as the shared output, optimized v3 is faster than v2 in ${versionWins} of ${normalizedRows.length} scenarios. v1 still wins on some ASCII inputs. Results that fail the correctness check have no bars or speed ratios.`, `统一输出独立 UTF-16 范围后，优化后 v3 在 ${normalizedRows.length} 个场景中的 ${versionWins} 个快于 v2。v1 在部分 ASCII 输入上仍更快。正确性检查失败的结果不绘制柱形，也不计算速度比。`) }}</p>
      <BenchmarkChart :option="versionOptions" :height="740" :label="text('Normalized search time for v1, v2 and optimized v3, relative to v2', 'v1、v2 与优化后 v3 的独立范围搜索耗时，以 v2 为基线')" :fallback="fallback" />
      <p class="chart-caption">
        {{ text('Independent ranges · lower is faster · v2 = 1×. v1 is not comparable for emoji, ZWJ, combining marks and CRLF.', '独立范围结果 · 越低越快 · v2 = 1×。v1 在 emoji、ZWJ、组合字符和 CRLF 场景中不可比较。') }}
      </p>
      <BenchmarkTable data-testid="version-table" :label="text('Independent range timings · median ms (MAD; between-round MAD)', '独立范围耗时 · 中位数 ms（MAD；轮间 MAD）')" :headings="versionHeadings" :rows="versionTableRows(normalizedRows)" />
      <p>{{ text('Native v1/v2 search returns grouped output; v3 returns independent match objects. The native timings below measure different output work and should not be read as equivalent throughput.', 'v1/v2 原生搜索返回分组结果，v3 返回独立匹配对象。下方原生耗时执行的输出工作不同，不能据此直接比较等价吞吐量。') }}</p>
      <BenchmarkTable data-testid="native-version-table" :label="text('Native output timings · median ms (MAD; between-round MAD)', '原生输出耗时 · 中位数 ms（MAD；轮间 MAD）')" :headings="versionHeadings" :rows="versionTableRows(nativeRows)" />
      <p class="chart-caption">
        {{ text('A seven-round recheck replaces a complete scenario/operation group across all three versions only after source, environment, runner and corpus validation. Remaining groups keep five rounds. Memory measurements stay with the original report.', '七轮复测通过实现、环境、runner 与语料校验后，才按完整的“场景＋操作”覆盖三个版本的耗时；其余组保留五轮。内存测量仍取原始报告。') }}
      </p>
      <BenchmarkSource :source="data.sources.versions" :language="language" />
      <BenchmarkSource :source="data.sources.versionRecheck" :language="language" />
    </section>

    <section aria-labelledby="build-performance-heading" data-testid="build-performance">
      <h3 id="build-performance-heading">
        {{ text('Cold construction at scale', '大词典冷构建') }}
      </h3>
      <p v-if="largestBuild">
        {{ text(`At ${number(largestBuild.size)} patterns, cold construction time changed by ${number(largestBuild.buildChangePercent, 1)}% and peak RSS by ${number(largestBuild.peakRssChangePercent, 1)}%. These are seven-process medians; cold process construction is distinct from repeated warm construction.`, `${number(largestBuild.size)} 个词条下，冷构建耗时变化 ${number(largestBuild.buildChangePercent, 1)}%，峰值 RSS 变化 ${number(largestBuild.peakRssChangePercent, 1)}%。这里是七个独立进程的中位数；冷进程构建与重复热构建是不同指标。`) }}
      </p>
      <h4>{{ text('Construction time', '构建耗时') }}</h4>
      <BenchmarkChart :option="builderTimeOptions" :height="310" :label="text('Cold construction time in milliseconds, at 10k, 100k and one million patterns', '1 万、10 万、100 万词条的冷构建耗时，单位毫秒')" :fallback="fallback" />
      <h4>{{ text('Peak process RSS', '进程峰值 RSS') }}</h4>
      <BenchmarkChart :option="builderRssOptions" :height="310" :label="text('Peak process RSS in MiB at each dictionary size', '各词典规模的进程峰值 RSS，单位 MiB')" :fallback="fallback" />
      <p class="chart-caption">
        {{ text('Patterns on the horizontal axis. Peak RSS includes the process runtime and temporary construction state; it is not the retained dictionary size. The historical baseline loads modules through data URLs, so module-loader storage also differs within this whole-process measurement.', '横轴为词条数。峰值 RSS 包括进程运行时和构建临时状态，不等于词典常驻内存。历史基线通过 data URL 加载模块，因此这一整进程测量也包含模块加载器存储方式的差异。') }}
      </p>
      <BenchmarkTable data-testid="build-table" :label="tableLabel" :headings="builderHeadings" :rows="builderTableRows" />
      <BenchmarkSource :source="data.sources.builder" :language="language" />
    </section>

    <section aria-labelledby="retained-performance-heading" data-testid="retained-performance">
      <h3 id="retained-performance-heading">
        {{ text('Memory retained by the dictionary', '词典常驻内存') }}
      </h3>
      <p>{{ text(`The dedicated retention run disables timing and averages multiple live dictionary copies. The bars compare retained JS heap; ArrayBuffer storage is reported separately in bytes. Buffer measurements are unchanged in ${unchangedBuffers} of ${data.retained.length} scenarios.`, `独立内存实验禁用计时，并通过多份存活词典取平均。柱形比较保留的 JS 堆；ArrayBuffer 以字节单独列示。${data.retained.length} 个场景中有 ${unchangedBuffers} 个的 ArrayBuffer 测量值未变化。`) }}</p>
      <BenchmarkChart :option="retainedOptions" :height="670" :label="text('Retained dictionary heap after optimization relative to before, across 18 scenarios', '18 个场景优化后的词典保留堆与优化前之比')" :fallback="fallback" />
      <p class="chart-caption">
        {{ text('After / before · baseline = 1× · zero-based scale to avoid exaggerating small differences', '优化后 / 优化前 · 基线 = 1× · 从零开始，避免放大小幅差异') }}
      </p>
      <BenchmarkTable data-testid="retained-table" :label="tableLabel" :headings="[scenarioHeading, `${before} heap · B`, `${after} heap · B`, text('Heap change', '堆变化'), `${before} buffers · B`, `${after} buffers · B`]" :rows="retainedTableRows" />
      <BenchmarkSource :source="data.sources.retained" :language="language" />
      <h4>{{ text('10,000-pattern dictionary across versions', '三个版本的 1 万词词典') }}</h4>
      <BenchmarkChart :option="memoryOptions" :height="310" :label="text('Retained JS heap and ArrayBuffer memory by version, in MiB', '各版本保留的 JS 堆与 ArrayBuffer，单位 MiB')" :fallback="fallback" />
      <p class="chart-caption">
        {{ text('Stacked components share the same unit: 1 MiB = 1,048,576 bytes. This excludes returned result objects and process peak RSS.', '堆叠部分使用同一单位：1 MiB = 1,048,576 字节。不包含返回结果对象与进程峰值 RSS。') }}
      </p>
      <BenchmarkTable data-testid="version-memory-table" :label="text('Dictionary memory by version', '各版本词典内存明细')" :headings="[text('Version', '版本'), 'JS heap · B', 'ArrayBuffer · B', text('Combined · MiB', '合计 · MiB')]" :rows="memoryTableRows" />
      <BenchmarkSource :source="data.sources.versions" :language="language" />
    </section>

    <section aria-labelledby="stream-performance-heading" data-testid="stream-performance">
      <h3 id="stream-performance-heading">
        {{ text('Long streams with continuous consumption', '持续消费结果的长流') }}
      </h3>
      <p>{{ text('The caller consumes every output batch immediately. Points show post-GC heap growth relative to a baseline taken after creating the dictionary and input. This excludes their preexisting memory and caller-retained outputs, as well as native ICU allocations and peak RSS. Straight lines only connect measured input sizes; runtime and JIT noise remain included.', '调用方立即消费每批输出。各点表示 GC 后的堆增长，基线在创建词典与输入之后测量，因此不包含两者预先占用的内存、调用方保留的结果、原生 ICU 分配或峰值 RSS。直线仅连接已测量的输入规模；测量仍包含运行时与 JIT 噪声。') }}</p>
      <template v-for="strategy in strategies" :key="strategy">
        <h4>{{ strategy }}</h4>
        <BenchmarkChart :option="streamChartOptions[strategy]" :height="320" :label="text(`${strategy}: post-GC heap growth against cumulative UTF-16 input`, `${strategy}：GC 后堆增长随累计 UTF-16 输入量的变化`)" :fallback="fallback" />
      </template>
      <p v-if="longestStream">
        {{ text(`Before EOF, optimized leftmost-longest had already emitted ${number(longestStream.points.at(-1)?.emitted ?? 0)} of ${number(longestStream.finalEmitted)} matches. The table also shows retained memory with the handle still held after finish and cancel.`, `EOF 前，优化后的 leftmost-longest 已输出 ${number(longestStream.points.at(-1)?.emitted ?? 0)} / ${number(longestStream.finalEmitted)} 个匹配。表格还列出结束和取消后仍保留句柄时的内存。`) }}
      </p>
      <BenchmarkTable data-testid="stream-table" :label="tableLabel" :headings="[text('Strategy / snapshot', '策略 / 快照'), 'UTF-16', text('Heap growth · KiB', '堆增长 · KiB'), text('ArrayBuffer growth · KiB', 'ArrayBuffer 增长 · KiB'), text('Emitted before EOF', 'EOF 前已输出'), text('Final matches', '最终匹配数'), text('Closed heap growth · KiB', '结束后堆增长 · KiB'), text('Closed buffer growth · KiB', '结束后 buffer 增长 · KiB')]" :rows="streamTableRows" />
      <BenchmarkSource :source="data.sources.stream" :language="language" />
    </section>
  </div>
</template>

<style scoped>
.performance-charts {
  min-width: 0;
  margin: 32px 0;
}

.reading-note {
  padding-left: 16px;
  color: var(--vp-c-text-2);
  border-left: 3px solid var(--vp-c-brand-1);
}

section {
  min-width: 0;
  padding: 24px 0;
  border-top: 1px solid var(--vp-c-divider);
}

section h3 {
  margin-top: 0;
  font-size: 22px;
  letter-spacing: -0.025em;
}

h4 {
  margin: 28px 0 16px;
  font-size: 16px;
}

.chart-control {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
  margin: 24px 0 18px;
}

.chart-control label {
  font-size: 13px;
  font-weight: 600;
}

select {
  min-width: 190px;
  max-width: 100%;
  padding: 8px 36px 8px 12px;
  font: inherit;
  font-size: 13px;
  color: var(--vp-c-text-1);
  appearance: auto;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
}

.chart-caption {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
}

.followup-measurements > summary {
  font-weight: 600;
  cursor: pointer;
}

.followup-measurements > p {
  font-size: 14px;
}

@media (max-width: 480px) {
  section h3 {
    font-size: 20px;
  }
}
</style>
