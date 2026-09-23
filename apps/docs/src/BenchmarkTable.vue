<script setup lang="ts">
import type { BenchmarkTableRow } from './performance-presentation'

defineProps<{
  label: string
  headings: string[]
  rows: BenchmarkTableRow[]
}>()
</script>

<template>
  <details class="benchmark-table">
    <summary>{{ label }}</summary>
    <div class="table-scroll" tabindex="0" role="region" :aria-label="label">
      <table>
        <thead>
          <tr>
            <th v-for="heading in headings" :key="heading" scope="col">
              {{ heading }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key" :data-row-key="row.key">
            <template v-for="(cell, index) in row.cells" :key="index">
              <th v-if="index === 0" scope="row" :title="cell.title">
                {{ cell.text }}
              </th>
              <td v-else :data-value="cell.value" :title="cell.title">
                {{ cell.text }}
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </details>
</template>

<style scoped>
.benchmark-table {
  margin: 18px 0 24px;
  border-top: 1px solid var(--vp-c-divider);
  border-bottom: 1px solid var(--vp-c-divider);
}

summary {
  padding: 12px 2px;
  font-weight: 600;
  cursor: pointer;
}

.table-scroll {
  max-width: 100%;
  margin-bottom: 16px;
  overflow: auto;
  overscroll-behavior-x: contain;
}

table {
  display: table;
  width: 100%;
  margin: 0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.6;
}

th,
td {
  padding: 9px 12px;
  white-space: nowrap;
}

td {
  text-align: right;
}

th {
  text-align: left;
}
</style>
