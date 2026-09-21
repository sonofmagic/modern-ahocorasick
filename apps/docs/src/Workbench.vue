<script setup lang="ts">
import type { Match, MatchStrategy } from 'modern-ahocorasick'
import type { ExperimentInputs, ExperimentResult } from './experiment'
import type { GraphNode } from './graph'
import type { Language } from './i18n'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { Computation } from './computation'
import {
  deserialize,
  experimentDefaults,
  fromHash,
  hitCount,
  limits,
  serialize,
  shareHash,
  snippet,
  validateInputs,
} from './experiment'
import { messages } from './i18n'
import MatchLab from './MatchLab.vue'
import { Player } from './player'
import StateGraph from './StateGraph.vue'
import { defaults, persist, restore } from './storage'
import { explain, groupedMatches } from './trace'

const props = defineProps<{ language: Language }>()
const t = computed(() => messages[props.language])
const keywords = ref(defaults.keywords)
const text = ref(defaults.text)
const speed = ref(defaults.speed)
const strategy = ref<MatchStrategy>('all')
const replacement = ref(experimentDefaults.replacement)
const showFailure = ref(false)
const cursor = ref(0)
const running = ref(false)
const busy = ref(false)
const error = ref<'limit' | 'error' | undefined>()
const result = shallowRef<ExperimentResult>()
const graphNodes = shallowRef<GraphNode[]>()
let graphKeywords: string | undefined
const model = computed(() => result.value?.model)
const inspection = ref<number>()
const selectedHit = shallowRef<Match>()
const tablePage = ref(0)
const resultPage = ref(0)
const tapePage = ref(0)
const notice = ref('')
const fallbackCopy = ref('')
const fileInput = ref<HTMLInputElement>()
const tape = ref<HTMLElement>()
const elapsed = ref(0)
let started = 0
let mounted = false
let importGeneration = 0
const input = computed<ExperimentInputs>(() => ({
  keywords: keywords.value,
  text: text.value,
  speed: speed.value,
  strategy: strategy.value,
  replacement: replacement.value,
  showFailure: showFailure.value,
}))
const code = computed(() => snippet(input.value))
const examples = {
  classic: { keywords: 'he,she,his,hers', text: 'ushers' },
  overlap: { keywords: 'a,aa,aaa,a', text: 'aaaa' },
  chinese: { keywords: '中国,中国人,人,你好', text: '你好，中国人！' },
  combining: { keywords: 'é,é,e', text: 'é et é' },
  emoji: { keywords: '👨‍👩‍👧‍👦,😀,😀😀', text: 'Hi 👨‍👩‍👧‍👦! 😀😀' },
}
const example = ref<keyof typeof examples>('classic')
const steps = computed(() => model.value?.steps ?? [])
const hits = computed(() => model.value?.hits ?? [])
const current = computed(() => steps.value[cursor.value - 1])
const completed = computed(
  () => cursor.value > 0 && cursor.value === steps.value.length,
)
const count = computed(() => hitCount(hits.value, cursor.value))
const previousHit = computed(
  () => hits.value[hitCount(hits.value, cursor.value - 1) - 1]?.cursor,
)
const nextHit = computed(() => hits.value[count.value]?.cursor)
const matches = computed(() =>
  hits.value
    .slice(
      resultPage.value * limits.page,
      Math.min(count.value, (resultPage.value + 1) * limits.page),
    )
    .map(hit => hit.match),
)
const groups = computed(() =>
  JSON.stringify(
    groupedMatches(
      hits.value
        .slice(
          resultPage.value * limits.page,
          Math.min(count.value, (resultPage.value + 1) * limits.page),
        )
        .map(hit => steps.value[hit.cursor - 1]),
    ),
  ),
)
const tapeSegments = computed(
  () =>
    model.value?.segments.slice(
      tapePage.value * limits.page,
      (tapePage.value + 1) * limits.page,
    ) ?? [],
)
const tableNodes = computed(
  () =>
    model.value?.nodes.slice(
      tablePage.value * limits.page,
      (tablePage.value + 1) * limits.page,
    ) ?? [],
)
const inspected = computed(
  () => model.value?.nodes[inspection.value ?? current.value?.to ?? 0],
)
const inherited = computed(() => {
  const nodes = model.value?.nodes
  if (!nodes || !inspected.value) {
    return []
  }
  const sources = []
  for (let id = inspected.value.failure; id !== 0; id = nodes[id].failure) {
    for (const index of nodes[id].ownPatternIndices) {
      sources.push({ id, index, pattern: model.value!.patterns[index] })
    }
  }
  return sources
})
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
const computation = new Computation(
  () =>
    new Worker(new URL('./experiment.worker.ts', import.meta.url), {
      type: 'module',
    }),
  (response) => {
    busy.value = false
    elapsed.value = Math.round(performance.now() - started)
    if ('error' in response) {
      result.value = undefined
      graphNodes.value = undefined
      error.value = response.error
    }
    else {
      if (graphKeywords !== keywords.value || !graphNodes.value) {
        graphNodes.value = response.result.model.nodes
        graphKeywords = keywords.value
      }
      response.result.model.nodes = graphNodes.value
      result.value = response.result
      error.value = undefined
    }
  },
)
function reset(): void {
  player.pause()
  cursor.value = 0
  inspection.value = undefined
  selectedHit.value = undefined
  resultPage.value = 0
  tablePage.value = 0
  tapePage.value = 0
}
function seek(position: number): void {
  player.pause()
  cursor.value = Math.max(
    0,
    Math.min(steps.value.length, Math.trunc(position)),
  )
  inspection.value = undefined
  selectedHit.value = current.value?.match
  resultPage.value = Math.max(0, Math.ceil(count.value / limits.page) - 1)
}
function selectHit(hit: Match): void {
  const target = hits.value.find(
    value =>
      value.match.patternIndex === hit.patternIndex
      && value.match.start === hit.start
      && value.match.end === hit.end,
  )
  if (target) {
    seek(target.cursor)
  }
  selectedHit.value = hit
}
function inspect(id: number): void {
  inspection.value = id
  tablePage.value = Math.floor(id / limits.page)
}
function rebuild(): void {
  if (!mounted) {
    return
  }
  reset()
  result.value = undefined
  error.value = undefined
  busy.value = true
  started = performance.now()
  try {
    validateInputs(input.value)
    computation.schedule({ ...input.value })
  }
  catch {
    computation.cancel()
    busy.value = false
    error.value = 'limit'
  }
}
function save(): void {
  if (!mounted) {
    return
  }
  try {
    persist(window.sessionStorage, input.value)
  }
  catch {
    /* Storage access itself may be blocked. */
  }
}
function play(): void {
  if (!steps.value.length || busy.value) {
    return
  }
  if (completed.value) {
    reset()
  }
  player.play()
}
function apply(value: ExperimentInputs): void {
  keywords.value = value.keywords
  text.value = value.text
  speed.value = value.speed
  strategy.value = value.strategy
  replacement.value = value.replacement
  showFailure.value = value.showFailure
}
function selectExample(): void {
  keywords.value = examples[example.value].keywords
  text.value = examples[example.value].text
}
async function copy(value: string): Promise<void> {
  fallbackCopy.value = ''
  try {
    await navigator.clipboard.writeText(value)
    notice.value = t.value.copied
  }
  catch {
    fallbackCopy.value = value
    notice.value = t.value.copyFallback
  }
}
function share(): void {
  try {
    const url = new URL(window.location.href)
    url.hash = shareHash(input.value)
    void copy(url.href)
  }
  catch {
    notice.value = t.value.invalidImport
  }
}
function download(): void {
  let url: string | undefined
  try {
    url = URL.createObjectURL(
      new Blob([serialize(input.value, result.value)], {
        type: 'application/json',
      }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'modern-ahocorasick-example.json'
    link.click()
  }
  catch {
    notice.value = t.value.downloadError
  }
  finally {
    if (url) {
      URL.revokeObjectURL(url)
    }
  }
}
async function importFile(event: Event): Promise<void> {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]
  element.value = ''
  if (!file) {
    return
  }
  const generation = ++importGeneration
  try {
    if (file.size > limits.exportBytes) {
      throw new RangeError('file limit')
    }
    const value = deserialize(await file.text())
    if (!mounted || generation !== importGeneration) {
      return
    }
    apply(value)
    notice.value = t.value.shared
  }
  catch {
    if (mounted && generation === importGeneration) {
      notice.value = t.value.invalidImport
    }
  }
}
function loadHash(): void {
  try {
    const value = fromHash(window.location.hash)
    if (value) {
      apply(value)
      notice.value = t.value.shared
    }
  }
  catch {
    notice.value = t.value.invalidImport
  }
}
// Cancel playback immediately; batch compilation so multi-field edits build only once.
watch(
  [keywords, text, strategy, replacement],
  () => {
    player.pause()
    computation.cancel()
    busy.value = true
    importGeneration++
  },
  { flush: 'sync' },
)
watch(
  keywords,
  () => {
    graphNodes.value = undefined
  },
  { flush: 'sync' },
)
watch([keywords, text, strategy, replacement], rebuild)
watch(input, save)
watch(speed, () => player.setDelay(1000 / speed.value), { flush: 'sync' })
watch(current, async (value) => {
  if (!value) {
    return
  }
  tablePage.value = Math.floor(value.to / limits.page)
  tapePage.value = Math.floor(value.grapheme / limits.page)
  if (value.match) {
    selectedHit.value = value.match
  }
  await nextTick()
  const cell = tape.value?.querySelector<HTMLElement>('.selected')
  if (cell && tape.value) {
    tape.value.scrollLeft
      = cell.offsetLeft - tape.value.offsetLeft - tape.value.clientWidth / 2
  }
})
onMounted(() => {
  try {
    const value = restore(window.sessionStorage)
    apply(validateInputs({ ...experimentDefaults, ...value }))
  }
  catch {
    /* Use defaults for unavailable or incompatible storage. */
  }
  loadHash()
  mounted = true
  player.setDelay(1000 / speed.value)
  rebuild()
  window.addEventListener('hashchange', loadHash)
})
onBeforeUnmount(() => {
  mounted = false
  importGeneration++
  player.dispose()
  computation.dispose()
  window.removeEventListener('hashchange', loadHash)
})
</script>

<template>
  <section class="workbench" :aria-label="t.graph" :aria-busy="busy">
    <div class="tape-section">
      <div class="section-heading">
        <h2>{{ t.tape }}</h2>
        <span class="mono" data-testid="progress">{{ cursor }} / {{ steps.length }}</span>
      </div>
      <p class="hint">
        {{ t.coordinates }}
      </p>
      <div ref="tape" class="tape" :aria-label="t.tape">
        <span
          v-for="(part, offset) in tapeSegments"
          :key="part.index"
          class="tape-cell"
          :class="{
            selected: current?.grapheme === tapePage * limits.page + offset,
            matched:
              selectedHit
              && part.index >= selectedHit.start
              && part.index < selectedHit.end,
            processed:
              current && tapePage * limits.page + offset < current.grapheme,
          }"
        >
          <small>G{{ tapePage * limits.page + offset }}</small><span>{{
            part.segment === " "
              ? "␠"
              : part.segment === "\n"
                ? "↵"
                : part.segment
          }}</span><small>[{{ part.index }}, {{ part.index + part.segment.length }})</small>
        </span>
        <span v-if="!model?.segments.length" class="hint">∅</span>
      </div>
      <div v-if="(model?.segments.length ?? 0) > limits.page" class="controls">
        <button :disabled="tapePage === 0" @click="tapePage--">
          {{ t.previousPage }}
        </button><span>{{ t.page }} {{ tapePage + 1 }}</span><button
          :disabled="
            (tapePage + 1) * limits.page >= (model?.segments.length ?? 0)
          "
          @click="tapePage++"
        >
          {{ t.nextPage }}
        </button>
      </div>
      <div class="status-line" aria-live="polite" aria-atomic="true">
        <strong class="state-badge">{{ t.current }}
          <span data-testid="current-state">{{
            current?.to ?? 0
          }}</span></strong>
        <p data-testid="explanation">
          {{
            busy
              ? t.calculating
              : current
                ? explain(current, language)
                : text
                  ? t.ready
                  : t.emptyText
          }}
          <span v-if="completed">{{ t.done }}</span>
        </p>
      </div>
      <label for="timeline">{{ t.timeline }}</label>
      <input
        id="timeline"
        type="range"
        min="0"
        :max="steps.length"
        :value="cursor"
        :disabled="!steps.length || busy"
        @input="seek(Number(($event.target as HTMLInputElement).value))"
      >
      <div class="controls">
        <button :disabled="!cursor || busy" @click="seek(cursor - 1)">
          {{ t.back }}
        </button>
        <button
          :disabled="previousHit === undefined || busy"
          @click="seek(previousHit!)"
        >
          {{ t.previousHit }}
        </button>
        <button
          :disabled="nextHit === undefined || busy"
          @click="seek(nextHit!)"
        >
          {{ t.nextHit }}
        </button>
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
        <label for="keywords">{{ t.keywords }}</label><input
          id="keywords"
          v-model="keywords"
          spellcheck="false"
          aria-describedby="keyword-hint"
        >
        <p id="keyword-hint" class="hint">
          {{ t.hint }}
        </p>
        <label for="search-text">{{ t.text }}</label><textarea
          id="search-text"
          v-model="text"
          rows="4"
          spellcheck="false"
        />
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
            :disabled="!model?.patterns.length || !steps.length || busy"
            @click="play"
          >
            {{ completed ? t.replay : cursor ? t.resume : t.play }}
          </button>
          <button
            type="button"
            :disabled="
              !model?.patterns.length || completed || !steps.length || busy
            "
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
          {{ t[error] }}
        </p>
        <p
          v-else-if="!busy && !model?.patterns.length"
          role="status"
          class="hint"
        >
          {{ t.empty }}
        </p>
        <p v-if="result" class="hint">
          {{ t.timing }}: {{ elapsed }} ms
        </p>
      </div>
      <div class="graph-inspector">
        <StateGraph
          v-if="graphNodes && graphNodes.length <= limits.graph"
          :nodes="graphNodes"
          :current="current?.to ?? 0"
          :active="current"
          :show-failure="showFailure"
          :language="language"
          :inspected="inspection"
          @inspect="inspect"
        />
        <p v-else-if="graphNodes" class="hint graph-limit">
          {{ t.graphLimit }}
        </p>
        <section v-if="inspected" class="inspector" data-testid="inspector">
          <h2>{{ t.inspector }} · {{ inspected.id }}</h2>
          <p class="hint">
            {{ t.inspectHint }}
          </p>
          <dl>
            <dt>{{ t.prefix }}</dt>
            <dd>{{ JSON.stringify(inspected.prefix) }}</dd>
            <dt>{{ t.suffix }}</dt>
            <dd>
              <button @click="inspect(inspected.failure)">
                {{ inspected.failure }}
              </button>
              {{ JSON.stringify(model?.nodes[inspected.failure].prefix) }}
            </dd>
            <dt>{{ t.own }}</dt>
            <dd>
              {{
                JSON.stringify(
                  inspected.ownPatternIndices.map((index) => ({
                    patternIndex: index,
                    pattern: model?.patterns[index],
                  })),
                )
              }}
            </dd>
            <dt>{{ t.inherited }}</dt>
            <dd>
              <span v-if="!inherited.length">∅</span>
              <div v-for="source in inherited" :key="source.index">
                <button @click="inspect(source.id)">
                  {{ source.id }}
                </button>
                #{{ source.index }} {{ JSON.stringify(source.pattern) }}
              </div>
            </dd>
          </dl>
        </section>
      </div>
    </div>
    <MatchLab
      :language="language"
      :input="input"
      :result="result"
      :busy="busy"
      :selected="selectedHit"
      @strategy="strategy = $event"
      @replacement="replacement = $event"
      @select="selectHit"
    />
    <div class="work-bottom">
      <section class="tables">
        <h2>{{ t.tables }}</h2>
        <div v-if="(model?.nodes.length ?? 0) > limits.page" class="controls">
          <button :disabled="!tablePage" @click="tablePage--">
            {{ t.previousPage }}
          </button><span>{{ t.page }} {{ tablePage + 1 }}</span><button
            :disabled="
              (tablePage + 1) * limits.page >= (model?.nodes.length ?? 0)
            "
            @click="tablePage++"
          >
            {{ t.nextPage }}
          </button>
        </div>
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
                  v-for="node in tableNodes"
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
                  <td>
                    <button @click="inspect(node.id)">
                      {{ node.id }}
                    </button>
                  </td>
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
                  v-for="node in tableNodes.filter(
                    (node) => node.output.length,
                  )"
                  :key="node.id"
                  :class="{ selected: node.id === current?.to }"
                >
                  <td>
                    <button @click="inspect(node.id)">
                      {{ node.id }}
                    </button>
                  </td>
                  <td>{{ JSON.stringify(node.output) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section class="results">
        <h2>
          {{ t.results }} <span class="hit-count">{{ count }}</span>
        </h2>
        <p class="hint">
          {{ t.note }}
        </p>
        <div v-if="count > limits.page" class="controls">
          <button :disabled="!resultPage" @click="resultPage--">
            {{ t.previousPage }}
          </button><span>{{ t.page }} {{ resultPage + 1 }} /
            {{ Math.ceil(count / limits.page) }}</span><button
            :disabled="(resultPage + 1) * limits.page >= count"
            @click="resultPage++"
          >
            {{ t.nextPage }}
          </button>
        </div>
        <h3>{{ t.grouped }}</h3>
        <pre data-testid="grouped-results">{{ groups }}</pre>
        <h3>{{ t.structured }}</h3>
        <pre data-testid="structured-results">{{
          JSON.stringify(matches, null, 2)
        }}</pre>
      </section>
    </div>
    <section class="sharing inputs">
      <div class="controls">
        <button @click="copy(code)">
          {{ t.copyCode }}
        </button><button @click="share">
          {{ t.share }}
        </button><button :disabled="!result || busy" @click="download">
          {{ t.exportData }}
        </button><button @click="fileInput?.click()">
          {{ t.importData }}
        </button>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept=".json,application/json"
        hidden
        @change="importFile"
      >
      <p class="hint">
        {{ t.shareNote }}
      </p>
      <p v-if="notice" aria-live="polite" data-testid="share-notice">
        {{ notice }}
      </p>
      <textarea
        v-if="fallbackCopy"
        :value="fallbackCopy"
        readonly
        :aria-label="t.copyFallback"
        rows="4"
      />
      <pre data-testid="code-example">{{ code }}</pre>
    </section>
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

#timeline {
  width: 100%;
  margin: 10px 0;
  accent-color: var(--vp-c-brand-1);
}

.tape {
  position: relative;
}

.tape-cell.matched {
  box-shadow: inset 0 -4px var(--work-hit);
}

.graph-inspector {
  min-width: 0;
}

.inspector {
  padding: 20px;
  border-top: 1px solid var(--vp-c-divider);
}

.inspector dt {
  margin-top: 10px;
  font-size: 12px;
  color: var(--vp-c-text-2);
}

.inspector dd {
  margin: 4px 0;
  font: 13px/1.6 var(--vp-font-family-mono);
  overflow-wrap: anywhere;
}

.graph-limit {
  padding: 24px;
}

.sharing {
  border-top: 1px solid var(--vp-c-divider);
  border-right: 0;
}

.sharing pre {
  max-height: 260px;
  overflow: auto;
  font: 12px/1.7 var(--vp-font-family-mono);
}

.workbench :focus-visible {
  outline: 3px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}
</style>
