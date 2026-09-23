<script lang="ts">
// All figures on a page share one lazy runtime import, including its failure.
</script>

<script setup lang="ts">
import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts'
import type { TooltipComponentOption } from 'echarts/components'
import type { EChartsCoreOption, EChartsType } from 'echarts/core'
import { useData } from 'vitepress'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  option: EChartsCoreOption
  label: string
  fallback: string
  height?: number
}>(), { height: 340 })

let runtimePromise: Promise<typeof import('./performance-echarts')> | undefined

const { isDark } = useData()
const element = ref<HTMLDivElement>()
const state = ref<'waiting' | 'ready' | 'failed'>('waiting')
let chart: EChartsType | undefined
let runtime: typeof import('./performance-echarts') | undefined
let intersection: IntersectionObserver | undefined
let resize: ResizeObserver | undefined
let frame: number | undefined
let mounted = false

function draw(): void {
  if (!mounted || !element.value || !runtime) {
    return
  }
  const styles = getComputedStyle(element.value)
  const css = (name: string) => styles.getPropertyValue(name).trim()
  const text = css('--vp-c-text-2')
  const divider = css('--vp-c-divider')
  const colors: Record<string, string> = {
    baseline: css('--vp-c-brand-1'),
    current: css('--work-hit'),
    v1: css('--vp-c-brand-1'),
    v2: css('--work-failure'),
    heap: css('--vp-c-brand-1'),
    buffer: css('--work-hit'),
  }
  const axis = {
    axisLine: { lineStyle: { color: divider } },
    axisLabel: { color: text },
    nameTextStyle: { color: text },
    splitLine: { lineStyle: { color: divider } },
  }
  chart?.dispose()
  chart = runtime.init(element.value, {
    color: [css('--vp-c-brand-1'), css('--work-hit'), css('--work-failure')],
    textStyle: { color: text, fontFamily: styles.fontFamily },
    categoryAxis: axis,
    valueAxis: axis,
    legend: { selectedMode: false, textStyle: { color: text } },
    markLine: { lineStyle: { color: text }, label: { color: text } },
    tooltip: {
      backgroundColor: css('--work-panel'),
      borderColor: divider,
      textStyle: { color: css('--vp-c-text-1') },
    },
  }, { renderer: 'svg' })
  const tooltip = props.option['tooltip'] as TooltipComponentOption | undefined
  const number = new Intl.NumberFormat(document.documentElement.lang || undefined, { maximumSignificantDigits: 6 })
  const format = (value: unknown) => typeof value === 'number' ? number.format(value) : String(value ?? '—')
  const series = props.option['series'] as (BarSeriesOption | LineSeriesOption)[]
  chart.setOption({
    ...props.option,
    series: series.map((item) => {
      const color = colors[String(item.id)]
      return color
        ? { ...item, itemStyle: { ...item.itemStyle, color }, ...(item.type === 'line' ? { lineStyle: { ...item.lineStyle, color } } : {}) }
        : item
    }),
    animation: false,
    // Rich-text tooltips stay inside the renderer and never interpret HTML.
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) => Array.isArray(value) ? value.map(format).join(' / ') : format(value),
      ...tooltip,
      renderMode: 'richText',
      confine: true,
    },
  })
  state.value = 'ready'
}

async function initialize(): Promise<void> {
  intersection?.disconnect()
  try {
    runtimePromise ??= import('./performance-echarts')
    runtime = await runtimePromise
    if (mounted) {
      draw()
    }
  }
  catch {
    if (mounted) {
      chart?.dispose()
      chart = undefined
      state.value = 'failed'
    }
  }
}

onMounted(() => {
  mounted = true
  if (!element.value) {
    return
  }
  resize = new ResizeObserver(() => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame)
    }
    frame = requestAnimationFrame(() => {
      frame = undefined
      chart?.resize()
    })
  })
  resize.observe(element.value)
  if (typeof IntersectionObserver === 'undefined') {
    void initialize()
    return
  }
  intersection = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) {
      void initialize()
    }
  }, { rootMargin: '200px' })
  intersection.observe(element.value)
})

watch([() => props.option, isDark], async () => {
  await nextTick()
  if (chart) {
    draw()
  }
})

onBeforeUnmount(() => {
  mounted = false
  intersection?.disconnect()
  resize?.disconnect()
  if (frame !== undefined) {
    cancelAnimationFrame(frame)
  }
  chart?.dispose()
  chart = undefined
})
</script>

<template>
  <div class="benchmark-figure">
    <div
      ref="element"
      data-testid="benchmark-chart"
      :data-state="state"
      role="img"
      :aria-label="label"
      :style="{ height: `${height}px` }"
      class="benchmark-chart"
    />
    <p v-if="state === 'failed'" role="status" data-testid="benchmark-chart-fallback">
      {{ fallback }}
    </p>
  </div>
</template>

<style scoped>
.benchmark-figure {
  min-width: 0;
  margin: 24px 0 16px;
}

.benchmark-chart {
  width: 100%;
  overflow: hidden;
}

.benchmark-figure p {
  color: var(--vp-c-text-2);
}
</style>
