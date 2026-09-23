<script setup lang="ts">
import { computed } from 'vue'
import HeroLogo from './HeroLogo.vue'

const props = defineProps<{ language: 'en' | 'zh' }>()
const content = {
  en: {
    lines: ['One dictionary.', 'One scan.', 'Every match.'],
    description: 'Match a dictionary against text with grapheme precision and slice-ready ranges. Follow every transition, fallback, and suffix match.',
    workbench: 'Open the workbench →',
    start: 'Get started',
    prefix: '',
  },
  zh: {
    lines: ['一个词典。', '一次扫描。', '每一处命中。'],
    description: '用原文字素匹配多个关键词，以可直接切片的范围处理命中。观察每次转移、回退，以及后缀如何成为结果。',
    workbench: '打开算法工作台 →',
    start: '快速开始',
    prefix: '/zh',
  },
}
const copy = computed(() => content[props.language])
</script>

<template>
  <div class="hero-intro">
    <div class="hero-intro-copy">
      <p class="hero-kicker">
        Aho–Corasick / exact text matching
      </p>
      <h1 class="hero-title">
        <template v-for="(line, index) in copy.lines" :key="line">
          {{ line }}<br v-if="index < copy.lines.length - 1">
        </template>
      </h1>
      <p class="hero-copy">
        {{ copy.description }}
      </p>
      <div class="hero-links">
        <a :href="`${copy.prefix}/visualization`">{{ copy.workbench }}</a>
        <a :href="`${copy.prefix}/getting-started`">{{ copy.start }}</a>
      </div>
    </div>
    <HeroLogo :language="language" />
  </div>
</template>
