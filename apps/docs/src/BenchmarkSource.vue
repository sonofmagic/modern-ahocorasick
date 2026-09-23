<script setup lang="ts">
import type { BenchmarkSource } from './performance-data'
import { computed } from 'vue'

const props = defineProps<{
  source: BenchmarkSource
  language: 'en' | 'zh'
}>()
const zh = computed(() => props.language === 'zh')
const fields = computed(() => ([
  [zh.value ? '测量时间' : 'Measured at', props.source.date],
  [zh.value ? '实现快照' : 'Source revision', props.source.revision],
  [zh.value ? '工作区存在变更' : 'Working tree changes', String(props.source.workingTreeDirty)],
  [zh.value ? '基线' : 'Baseline', props.source.baselineRef],
  ['Implementation SHA-256', props.source.implementationSha256],
  ['Baseline SHA-256', props.source.baselineSourceSha256],
  ['Runner SHA-256', props.source.runnerSha256],
  ['Corpus SHA-256', props.source.corpusSha256],
  ['Report SHA-256', props.source.reportSha256],
] satisfies [string, string | null][]).filter(([, value]) => value))
</script>

<template>
  <div class="benchmark-source">
    <p>
      <a :href="source.url">{{ source.file }}</a>
      <span> · {{ source.date.slice(0, 10) }} · {{ source.rounds }} {{ zh ? '轮独立进程' : 'independent rounds' }} · </span>
      <code>{{ source.revision.slice(0, 7) }}</code>
    </p>
    <details>
      <summary>{{ zh ? '测量环境与完整来源' : 'Environment and full provenance' }}</summary>
      <dl>
        <template v-for="(value, key) in source.environment" :key="key">
          <dt>{{ key }}</dt>
          <dd>{{ value }}</dd>
        </template>
        <template v-for="[label, value] in fields" :key="label">
          <dt>{{ label }}</dt>
          <dd>{{ value }}</dd>
        </template>
        <template v-for="(version, key) in source.versions" :key="key">
          <dt>{{ key }} · {{ version.version }}</dt>
          <dd>{{ version.implementationSha256 }}</dd>
        </template>
      </dl>
    </details>
  </div>
</template>

<style scoped>
.benchmark-source {
  margin: 14px 0 22px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
  overflow-wrap: anywhere;
}

p {
  margin: 0 0 4px;
}

summary {
  width: fit-content;
  cursor: pointer;
}

dl {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) minmax(0, 3fr);
  gap: 4px 14px;
  margin: 12px 0;
}

dt {
  font-weight: 600;
}

dd {
  margin: 0;
  font-family: var(--vp-font-family-mono);
}

@media (max-width: 480px) {
  dl {
    grid-template-columns: 1fr;
  }

  dd {
    margin-bottom: 8px;
  }
}
</style>
