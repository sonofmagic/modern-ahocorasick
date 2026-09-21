<script setup lang="ts">
import type { Match, MatchStrategy } from 'modern-ahocorasick'
import type { ExperimentInputs, ExperimentResult } from './experiment'
import type { Language } from './i18n'
import { computed, ref, watch } from 'vue'
import { highlights, limits } from './experiment'
import { messages } from './i18n'

const props = defineProps<{
  language: Language
  input: ExperimentInputs
  result: ExperimentResult | undefined
  busy: boolean
  selected: Match | undefined
}>()
const emit = defineEmits<{
  strategy: [value: MatchStrategy]
  replacement: [value: string]
  select: [value: Match]
}>()
const t = computed(() => messages[props.language])
const page = ref(0)
const matches = computed(() => props.result?.selected ?? [])
const visible = computed(() =>
  matches.value.slice(page.value * limits.page, (page.value + 1) * limits.page),
)
const parts = computed(() =>
  highlights(props.input.text, matches.value, props.selected),
)
watch(matches, () => {
  page.value = 0
})
function selectPart(start: number, end: number): void {
  const match = matches.value.find(
    match => match.start < end && match.end > start,
  )
  if (match) {
    emit('select', match)
  }
}
</script>

<template>
  <section class="match-lab">
    <div class="section-heading">
      <h2>{{ t.lab }}</h2>
      <span class="hit-count" data-testid="lab-count">{{
        matches.length
      }}</span>
    </div>
    <p class="hint">
      {{ t.labNote }}
    </p>
    <div class="lab-options">
      <label>{{ t.strategy
      }}<select
        id="strategy"
        :value="input.strategy"
        @change="
          emit(
            'strategy',
            ($event.target as HTMLSelectElement).value as MatchStrategy,
          )
        "
      >
        <option value="all">all</option>
        <option value="leftmost-first">leftmost-first</option>
        <option value="leftmost-longest">leftmost-longest</option>
      </select></label>
      <label>{{ t.replacement
      }}<input
        id="replacement"
        :value="input.replacement"
        @input="
          emit('replacement', ($event.target as HTMLInputElement).value)
        "
      ></label>
    </div>
    <p class="hint">
      {{ t.replacementNote }}
    </p>
    <div v-if="result && !busy" class="lab-columns">
      <div>
        <h3>{{ t.original }}</h3>
        <div class="highlighted-text" data-testid="highlighted-text">
          <template v-for="part in parts" :key="part.start">
            <button
              v-if="part.hit"
              class="text-hit"
              :class="{ chosen: part.selected }"
              :aria-label="`${t.hit}: [${part.start}, ${part.end})`"
              @click="selectPart(part.start, part.end)"
            >
              {{ part.text }}
            </button><span v-else :class="{ chosen: part.selected }">{{
              part.text
            }}</span>
          </template>
        </div>
        <h3>{{ t.replaced }} · {{ result.replacementStrategy }}</h3>
        <pre data-testid="replacement-preview">{{ result.replaced }}</pre>
        <div v-if="selected" class="slice-detail">
          <h3>{{ t.slice }}</h3>
          <code>text.slice({{ selected.start }}, {{ selected.end }})</code>
          <pre data-testid="selected-slice">{{
            JSON.stringify(input.text.slice(selected.start, selected.end))
          }}</pre>
        </div>
      </div>
      <div>
        <h3>{{ t.structured }}</h3>
        <p v-if="!matches.length">
          {{ t.noHits }}
        </p>
        <ol class="match-list" :start="page * limits.page + 1">
          <li
            v-for="hit in visible"
            :key="`${hit.start}:${hit.end}:${hit.patternIndex}`"
          >
            <button
              class="match-result"
              :aria-pressed="
                selected?.start === hit.start
                  && selected?.end === hit.end
                  && selected?.patternIndex === hit.patternIndex
              "
              @click="emit('select', hit)"
            >
              <span>#{{ hit.patternIndex }} {{ JSON.stringify(hit.pattern) }}</span><code>[{{ hit.start }}, {{ hit.end }})</code>
            </button>
          </li>
        </ol>
        <div v-if="matches.length > limits.page" class="controls">
          <button :disabled="page === 0" @click="page--">
            {{ t.previousPage }}
          </button><span>{{ t.page }} {{ page + 1 }} /
            {{ Math.ceil(matches.length / limits.page) }}</span><button
            :disabled="(page + 1) * limits.page >= matches.length"
            @click="page++"
          >
            {{ t.nextPage }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.match-lab {
  padding: 24px;
  border-block: 1px solid var(--vp-c-divider);
}

.lab-options,
.lab-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
}

.lab-options label {
  display: grid;
  gap: 8px;
  font-size: 13px;
}

.lab-options input,
.lab-options select {
  width: 100%;
  padding: 9px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
}

.lab-columns > div {
  min-width: 0;
}

.highlighted-text,
pre {
  max-height: 300px;
  padding: 14px;
  overflow: auto;
  font: 14px/2 var(--vp-font-family-mono);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: var(--vp-c-bg);
  border-radius: 5px;
}

.highlighted-text .text-hit {
  display: inline;
  padding: 0;
  font: inherit;
  color: var(--vp-c-text-1);
  white-space: pre-wrap;
  background: var(--vp-c-bg-soft);
  border: 0;
  border-bottom: 3px solid var(--work-hit);
  border-radius: 0;
}

.chosen {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 1px;
}

.match-list {
  max-height: 390px;
  padding-left: 26px;
  margin: 0;
  overflow: auto;
}

.match-list li {
  margin: 5px 0;
}

.match-result {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  width: 100%;
  text-align: left;
  overflow-wrap: anywhere;
}

.match-result code {
  flex-shrink: 0;
}

.match-result[aria-pressed='true'] {
  border-color: var(--vp-c-brand-1);
  box-shadow: inset 3px 0 var(--vp-c-brand-1);
}

@media (max-width: 640px) {
  .match-lab {
    padding: 18px;
  }

  .lab-options,
  .lab-columns {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }
}
</style>
