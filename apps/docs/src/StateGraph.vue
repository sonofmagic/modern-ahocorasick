<script setup lang="ts">
import type { ZoomBehavior } from 'd3-zoom'
import type { GraphNode } from './graph'
import type { Language } from './i18n'
import dagre from '@dagrejs/dagre'
import { select } from 'd3-selection'
import { zoom, zoomIdentity } from 'd3-zoom'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { messages } from './i18n'

const props = defineProps<{
  nodes: GraphNode[]
  current: number
  active: { from: number, to: number, kind: string } | undefined
  showFailure: boolean
  language: Language
}>()
const t = computed(() => messages[props.language])
const svg = ref<SVGSVGElement>()
const transform = ref('')
let behavior: ZoomBehavior<SVGSVGElement, unknown> | undefined
let observer: ResizeObserver | undefined
const layout = computed(() => {
  const graph = new dagre.graphlib.Graph()
    .setGraph({
      rankdir: 'LR',
      nodesep: 38,
      ranksep: 72,
      marginx: 50,
      marginy: 55,
    })
    .setDefaultEdgeLabel(() => ({}))
  for (const node of props.nodes) {
    graph.setNode(String(node.id), { width: 42, height: 42 })
  }
  for (const node of props.nodes) {
    for (const edge of node.edges) {
      graph.setEdge(String(node.id), String(edge.target))
    }
  }
  dagre.layout(graph)
  const nodes = props.nodes.map(node => ({
    ...node,
    ...graph.node(String(node.id)),
  }))
  const edges = props.nodes.flatMap(node =>
    node.edges.map((edge) => {
      const points = graph.edge(String(node.id), String(edge.target)).points
      const label = points[Math.floor(points.length / 2)]
      return {
        from: node.id,
        to: edge.target,
        label: edge.label,
        x: label.x,
        y: label.y - 10,
        path: points
          .map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`)
          .join(' '),
      }
    }),
  )
  const failures = nodes
    .filter(node => node.id !== 0)
    .map((node) => {
      const target = nodes[node.failure]
      const bend = Math.max(35, Math.abs(node.x - target.x) / 4)
      return {
        from: node.id,
        to: target.id,
        path: `M${node.x},${node.y + 22} C${node.x},${node.y + bend + 32} ${target.x},${target.y + bend + 32} ${target.x},${target.y + 24}`,
      }
    })
  return {
    nodes,
    edges,
    failures,
    width: graph.graph().width ?? 100,
    height: (graph.graph().height ?? 100) + 100,
  }
})
function active(from: number, to: number, kind: string): boolean {
  return (
    props.active?.from === from
    && props.active.to === to
    && props.active.kind === kind
  )
}
function fit(): void {
  if (!svg.value || !behavior) {
    return
  }
  const { width, height } = svg.value.getBoundingClientRect()
  const scale
    = Math.min(width / layout.value.width, height / layout.value.height, 1.4)
      * 0.9
  select(svg.value).call(
    behavior.transform,
    zoomIdentity
      .translate(
        (width - layout.value.width * scale) / 2,
        (height - layout.value.height * scale) / 2,
      )
      .scale(scale),
  )
}
function scaleBy(factor: number): void {
  if (svg.value && behavior) {
    select(svg.value).call(behavior.scaleBy, factor)
  }
}
function key(event: KeyboardEvent): void {
  if (['+', '=', '-', '0'].includes(event.key)) {
    event.preventDefault()
    if (event.key === '0') {
      fit()
    }
    else {
      scaleBy(event.key === '-' ? 0.8 : 1.25)
    }
  }
}
onMounted(() => {
  if (!svg.value) {
    return
  }
  behavior = zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 5])
    .on('zoom', (event) => {
      transform.value = event.transform.toString()
    })
  select(svg.value).call(behavior)
  observer = new ResizeObserver(fit)
  observer.observe(svg.value)
  fit()
})
watch(
  () => props.nodes,
  async () => {
    await nextTick()
    fit()
  },
)
onBeforeUnmount(() => {
  observer?.disconnect()
  if (svg.value) {
    select(svg.value).on('.zoom', null)
  }
})
</script>

<template>
  <div class="graph-wrap">
    <div class="graph-toolbar">
      <span>{{ t.graph }}</span>
      <div>
        <button type="button" :aria-label="t.zoomOut" @click="scaleBy(0.8)">
          −
        </button>
        <button type="button" :aria-label="t.zoomIn" @click="scaleBy(1.25)">
          +
        </button>
        <button type="button" @click="fit">
          {{ t.fit }}
        </button>
      </div>
    </div>
    <svg
      ref="svg"
      class="state-graph"
      tabindex="0"
      role="img"
      :aria-label="`${t.graph}. ${t.graphHelp}`"
      @keydown="key"
    >
      <defs>
        <marker
          id="goto-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10z" fill="var(--vp-c-brand-1)" />
        </marker>
        <marker
          id="failure-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10z" fill="var(--work-failure)" />
        </marker>
      </defs>
      <g data-testid="graph-transform" :transform="transform">
        <g
          v-for="edge in layout.failures"
          v-show="showFailure || active(edge.from, edge.to, 'fallback')"
          :key="`f${edge.from}`"
          class="failure-edge"
          :class="{ active: active(edge.from, edge.to, 'fallback') }"
        >
          <path :d="edge.path" marker-end="url(#failure-arrow)" />
        </g>
        <g
          v-for="edge in layout.edges"
          :key="`${edge.from}-${edge.to}`"
          class="goto-edge"
          :class="{ active: active(edge.from, edge.to, 'transition') }"
        >
          <path :d="edge.path" marker-end="url(#goto-arrow)" />
          <text :x="edge.x" :y="edge.y" text-anchor="middle">
            {{ edge.label }}
          </text>
        </g>
        <g
          v-if="layout.nodes[0]"
          class="goto-edge root-loop"
          :class="{ active: active(0, 0, 'skip') }"
        >
          <path
            :d="`M${layout.nodes[0].x - 15},${layout.nodes[0].y - 16} C${layout.nodes[0].x - 55},${layout.nodes[0].y - 65} ${layout.nodes[0].x + 55},${layout.nodes[0].y - 65} ${layout.nodes[0].x + 16},${layout.nodes[0].y - 18}`"
            marker-end="url(#goto-arrow)"
          />
          <text
            :x="layout.nodes[0].x"
            :y="layout.nodes[0].y - 47"
            text-anchor="middle"
          >
            ∅
          </text>
        </g>
        <g
          v-for="node in layout.nodes"
          :key="node.id"
          class="graph-node"
          :class="{ current: current === node.id, terminal: node.terminal }"
          :transform="`translate(${node.x},${node.y})`"
        >
          <circle r="21" />
          <circle v-if="node.terminal" class="terminal-ring" r="16" />
          <text text-anchor="middle" dominant-baseline="central">
            {{ node.id }}
          </text>
        </g>
      </g>
    </svg>
    <p class="graph-legend">
      {{ t.legend }}
    </p>
    <p class="graph-help">
      {{ t.graphHelp }}
    </p>
  </div>
</template>

<style scoped>
.graph-wrap {
  min-width: 0;
}

.graph-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  font-weight: 600;
  border-bottom: 1px solid var(--vp-c-divider);
}

.graph-toolbar div {
  display: flex;
  gap: 6px;
}

.state-graph {
  display: block;
  width: 100%;
  height: 380px;
  touch-action: none;
  cursor: grab;
}

.state-graph:active {
  cursor: grabbing;
}

.goto-edge path,
.failure-edge path {
  fill: none;
  stroke: var(--vp-c-brand-1);
  stroke-width: 1.7;
}

.failure-edge path {
  opacity: 0.5;
  stroke: var(--work-failure);
  stroke-dasharray: 5 5;
}

.active path {
  opacity: 1;
  stroke-width: 4;
}

text {
  font: 13px var(--vp-font-family-mono);
  fill: var(--vp-c-text-1);
}

.goto-edge text {
  stroke: var(--work-panel);
  stroke-width: 5;
  paint-order: stroke;
}

.graph-node circle {
  fill: var(--work-panel);
  stroke: var(--vp-c-text-2);
  stroke-width: 1.5;
}

.graph-node.terminal circle {
  stroke: var(--work-hit);
}

.graph-node.current > circle:first-child {
  fill: var(--vp-c-bg-soft);
  stroke: var(--vp-c-brand-1);
  stroke-width: 4;
}

.graph-node .terminal-ring {
  fill: none;
}

.graph-legend,
.graph-help {
  padding: 0 20px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.graph-help {
  margin-bottom: 14px;
}

@media (max-width: 640px) {
  .state-graph {
    height: 300px;
  }

  .graph-toolbar {
    padding: 12px;
  }
}
</style>
