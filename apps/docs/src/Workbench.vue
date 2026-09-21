<script setup lang="ts">
import type { Language } from './i18n'
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { messages } from './i18n'
import { prepare } from './integration'
import { Player } from './player'
import StateGraph from './StateGraph.vue'
import { defaults, persist, restore } from './storage'
import { explain, groupedMatches } from './trace'

const props = defineProps<{ language: Language }>()
const t = computed(() => messages[props.language])
const keywords = ref(defaults.keywords)
const text = ref(defaults.text)
const speed = ref(defaults.speed)
const showFailure = ref(false)
const cursor = ref(0)
const running = ref(false)
const error = ref(false)
const model = shallowRef<ReturnType<typeof prepare>>()
const examples = {
  classic: { keywords: 'he,she,his,hers', text: 'ushers' },
  overlap: { keywords: 'a,aa,aaa,a', text: 'aaaa' },
  chinese: { keywords: '中国,中国人,人,你好', text: '你好，中国人！' },
  combining: { keywords: 'é,é,e', text: 'é et é' },
  emoji: { keywords: '👨‍👩‍👧‍👦,😀,😀😀', text: 'Hi 👨‍👩‍👧‍👦! 😀😀' },
}
const example = ref<keyof typeof examples>('classic')
const steps = computed(() => model.value?.steps ?? [])
const current = computed(() => steps.value[cursor.value - 1])
const completed = computed(
  () => cursor.value > 0 && cursor.value === steps.value.length,
)
const visibleSteps = computed(() => steps.value.slice(0, cursor.value))
const matches = computed(() =>
  visibleSteps.value.flatMap(step => (step.match ? [step.match] : [])),
)
const groups = computed(() =>
  JSON.stringify(groupedMatches(visibleSteps.value)),
)
const player = new Player(
  () => {
    if (cursor.value < steps.value.length) {
      cursor.value++
    }
    return cursor.value < steps.value.length
  },
  (value) => {
    running.value = value
  },
)
function reset(): void {
  player.pause()
  cursor.value = 0
}
function rebuild(): void {
  reset()
  error.value = false
  try {
    model.value = prepare(keywords.value, text.value)
  }
  catch {
    model.value = undefined
    error.value = true
  }
}
function save(): void {
  try {
    persist(window.sessionStorage, {
      keywords: keywords.value,
      text: text.value,
      speed: speed.value,
    })
  }
  catch {
    /* Access to sessionStorage itself can be denied. */
  }
}
function play(): void {
  if (completed.value) {
    reset()
  }
  player.play()
}
function selectExample(): void {
  reset()
  keywords.value = examples[example.value].keywords
  text.value = examples[example.value].text
}
watch(
  [keywords, text],
  () => {
    rebuild()
    save()
  },
  { flush: 'sync' },
)
watch(
  speed,
  () => {
    player.setDelay(1000 / speed.value)
    save()
  },
  { flush: 'sync' },
)
onMounted(() => {
  try {
    const input = restore(window.sessionStorage)
    keywords.value = input.keywords
    text.value = input.text
    speed.value = input.speed
  }
  catch {
    /* Use defaults if storage access is blocked. */
  }
  player.setDelay(1000 / speed.value)
  rebuild()
})
onBeforeUnmount(() => player.dispose())
</script>

<template>
  <section class="workbench" :aria-label="t.graph">
    <div class="tape-section">
      <div class="section-heading">
        <h2>{{ t.tape }}</h2>
        <span class="mono" data-testid="progress">{{ cursor }} / {{ steps.length }}</span>
      </div>
      <div class="tape" :aria-label="t.tape">
        <span
          v-for="(part, index) in model?.segments"
          :key="index"
          class="tape-cell"
          :class="{
            selected: current?.grapheme === index,
            processed: current && index < current.grapheme,
          }"
        ><small>{{ index }}</small><span>{{
          part.segment === " "
            ? "␠"
            : part.segment === "\n"
              ? "↵"
              : part.segment
        }}</span></span>
        <span v-if="!model?.segments.length" class="hint">∅</span>
      </div>
      <div class="status-line" aria-live="polite" aria-atomic="true">
        <strong class="state-badge">{{ t.current }}
          <span data-testid="current-state">{{
            current?.to ?? 0
          }}</span></strong>
        <p data-testid="explanation">
          {{ current ? explain(current, language) : t.ready }}
          <span v-if="completed">{{ t.done }}</span>
        </p>
      </div>
    </div>
    <div class="work-top">
      <div class="inputs">
        <label for="example">{{ t.example }}</label>
        <select id="example" v-model="example" @change="selectExample">
          <option v-for="(_, name) in examples" :key="name" :value="name">
            {{ t[name] }}
          </option>
        </select>
        <label for="keywords">{{ t.keywords }}</label>
        <input
          id="keywords"
          v-model="keywords"
          spellcheck="false"
          aria-describedby="keyword-hint"
        >
        <p id="keyword-hint" class="hint">
          {{ t.hint }}
        </p>
        <label for="search-text">{{ t.text }}</label>
        <textarea id="search-text" v-model="text" rows="4" spellcheck="false" />
        <label for="speed">{{ t.speed }} <span class="mono">{{ speed }}×</span></label>
        <input
          id="speed"
          v-model.number="speed"
          type="range"
          min="0.5"
          max="10"
          step="0.5"
        >
        <div class="controls">
          <button
            v-if="running"
            class="primary"
            type="button"
            @click="player.pause()"
          >
            {{ t.pause }}
          </button>
          <button
            v-else
            class="primary"
            type="button"
            :disabled="!model?.patterns.length || !steps.length"
            @click="play"
          >
            {{ completed ? t.replay : cursor ? t.resume : t.play }}
          </button>
          <button
            type="button"
            :disabled="!model?.patterns.length || completed || !steps.length"
            @click="player.step()"
          >
            {{ t.step }}
          </button>
          <button type="button" @click="reset">
            {{ t.reset }}
          </button>
        </div>
        <label class="check"><input v-model="showFailure" type="checkbox">
          {{ t.failure }}</label>
        <p v-if="error" role="alert" class="hint">
          {{ t.error }}
        </p>
        <p v-else-if="!model?.patterns.length" role="status" class="hint">
          {{ t.empty }}
        </p>
      </div>
      <StateGraph
        v-if="model"
        :nodes="model.nodes"
        :current="current?.to ?? 0"
        :active="current"
        :show-failure="showFailure"
        :language="language"
      />
    </div>
    <div class="work-bottom">
      <section class="tables">
        <h2>{{ t.tables }}</h2>
        <div class="table-pair">
          <div class="table-scroll">
            <table>
              <caption>
                failure
              </caption>
              <thead>
                <tr>
                  <th>{{ t.state }}</th>
                  <th>→</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="node in model?.nodes"
                  :key="node.id"
                  :class="{
                    selected: node.id === (current?.to ?? 0),
                    fallback:
                      current?.kind === 'fallback' && node.id === current.from,
                  }"
                  :aria-current="
                    node.id === (current?.to ?? 0) ? 'step' : undefined
                  "
                >
                  <td>{{ node.id }}</td>
                  <td>{{ node.failure }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="table-scroll">
            <table>
              <caption>
                output
              </caption>
              <thead>
                <tr>
                  <th>{{ t.state }}</th>
                  <th>{{ t.output }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="node in model?.nodes.filter(
                    (node) => node.output.length,
                  )"
                  :key="node.id"
                  :class="{ selected: node.id === current?.to }"
                >
                  <td>{{ node.id }}</td>
                  <td>{{ JSON.stringify(node.output) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section class="results">
        <h2>
          {{ t.results }} <span class="hit-count">{{ matches.length }}</span>
        </h2>
        <p class="hint">
          {{ t.note }}
        </p>
        <h3>{{ t.grouped }}</h3>
        <pre data-testid="grouped-results">{{ groups }}</pre>
        <h3>{{ t.structured }}</h3>
        <pre data-testid="structured-results">{{
          JSON.stringify(matches, null, 2)
        }}</pre>
      </section>
    </div>
  </section>
</template>

<style>
.workbench {
  margin-bottom: 28px;
  overflow: hidden;
  background: var(--work-panel);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
}

.workbench h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.workbench h3 {
  margin: 18px 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.workbench button {
  padding: 7px 11px;
  font-size: 13px;
  cursor: pointer;
  background: var(--work-panel);
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
}

.workbench button:hover {
  border-color: var(--vp-c-brand-1);
}

.workbench button:disabled {
  cursor: default;
  opacity: 0.45;
}

.workbench button.primary {
  color: var(--vp-c-bg);
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.work-top {
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
}

.inputs {
  padding: 24px;
  background: var(--vp-c-bg);
  border-right: 1px solid var(--vp-c-divider);
}

.inputs label:not(.check) {
  display: flex;
  justify-content: space-between;
  margin-bottom: 7px;
  font-size: 13px;
  font-weight: 600;
}

.inputs input:not([type]),
.inputs textarea,
.inputs select {
  width: 100%;
  padding: 9px 10px;
  font-size: 14px;
  background: var(--work-panel);
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
}

.inputs textarea {
  font-family: var(--vp-font-family-mono);
  resize: vertical;
}

.inputs select {
  margin-bottom: 18px;
}

.inputs input[type='range'] {
  width: 100%;
  margin: 4px 0 16px;
  accent-color: var(--vp-c-brand-1);
}

.inputs label[for='speed'] {
  margin-top: 18px;
}

.hint {
  margin: 8px 0 18px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.check {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 20px;
  font-size: 12px;
}

.check input {
  accent-color: var(--work-failure);
}

.mono {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
}

.tape-section {
  padding: 20px 24px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tape {
  display: flex;
  gap: 4px;
  padding: 16px 3px;
  overflow: auto;
}

.tape-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 42px;
  padding: 3px 8px 8px;
  font: 20px var(--vp-font-family-mono);
  white-space: pre;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
}

.tape-cell small {
  margin: 3px 0 9px;
  font-size: 10px;
  color: var(--vp-c-text-2);
}

.tape-cell.selected {
  padding: 2px 7px 7px;
  background: var(--vp-c-bg-soft);
  border: 2px solid var(--vp-c-brand-1);
}

.tape-cell.processed {
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg);
}

.status-line {
  display: flex;
  gap: 18px;
  align-items: baseline;
  min-height: 50px;
  font-size: 13px;
}

.status-line p {
  margin: 0;
  line-height: 1.7;
}

.state-badge {
  flex-shrink: 0;
  font-size: 12px;
}

.state-badge span {
  margin-left: 5px;
  font: 18px var(--vp-font-family-mono);
  color: var(--vp-c-brand-1);
}

.work-bottom {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.tables,
.results {
  min-width: 0;
  padding: 24px;
}

.tables {
  border-right: 1px solid var(--vp-c-divider);
}

.table-pair {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  gap: 24px;
  margin-top: 16px;
}

.table-scroll {
  max-height: 400px;
  overflow: auto;
}

.workbench table {
  width: 100%;
  font: 12px/1.7 var(--vp-font-family-mono);
  border-collapse: collapse;
}

.workbench caption {
  padding-bottom: 6px;
  color: var(--vp-c-text-2);
  text-align: left;
}

.workbench th,
.workbench td {
  padding: 6px 8px;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid var(--vp-c-divider);
}

.workbench tr.selected {
  background: var(--vp-c-bg-soft);
  box-shadow: inset 3px 0 var(--vp-c-brand-1);
}

.workbench tr.fallback {
  box-shadow: inset 3px 0 var(--work-failure);
}

.results pre {
  max-height: 290px;
  padding: 14px;
  overflow: auto;
  font: 12px/1.7 var(--vp-font-family-mono);
  background: var(--vp-c-bg);
  border-radius: 5px;
}

.hit-count {
  margin-left: 10px;
  font-family: var(--vp-font-family-mono);
  color: var(--work-hit);
}

@media (max-width: 850px) {
  .work-top {
    grid-template-columns: 250px minmax(0, 1fr);
  }

  .work-bottom {
    grid-template-columns: 1fr;
  }

  .tables {
    border-right: 0;
    border-bottom: 1px solid var(--vp-c-divider);
  }
}

@media (max-width: 640px) {
  .work-top {
    grid-template-columns: 1fr;
  }

  .inputs {
    padding: 18px;
    border-right: 0;
    border-bottom: 1px solid var(--vp-c-divider);
  }

  .tape-section,
  .tables,
  .results {
    padding: 18px;
  }

  .status-line {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
