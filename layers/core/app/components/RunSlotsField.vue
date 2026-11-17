<!-- The start times of a run or a run preset (run presets, Matt 2026-11-17): one line for each start
     time, with the days of the week it runs on, so a matinee can be on Saturdays only. -->
<script setup lang="ts">
import { parseTime } from '@internationalized/date'
import type { SlotRow } from '../utils/show-defaults'

const rows = defineModel<SlotRow[]>({ required: true })
const DAYS = [{ value: '1', label: 'Mon' }, { value: '2', label: 'Tue' }, { value: '3', label: 'Wed' }, { value: '4', label: 'Thu' }, { value: '5', label: 'Fri' }, { value: '6', label: 'Sat' }, { value: '7', label: 'Sun' }]

function timeOf(value: string) {
  try { return value ? parseTime(value) : undefined }
  catch { return undefined }
}
function setTime(row: SlotRow, value: unknown) {
  row.time = value ? String(value).slice(0, 5) : '' // not-policy: HH:mm
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="(r, i) in rows"
      :key="i"
      class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-default px-3 py-2"
    >
      <UInputTime
        :model-value="timeOf(r.time)"
        :hour-cycle="24"
        class="w-20"
        :aria-label="`Start time ${i + 1}`"
        @update:model-value="setTime(r, $event)"
      />
      <UCheckboxGroup
        v-model="r.days"
        :items="DAYS"
        orientation="horizontal"
        class="flex-1"
        :ui="{ fieldset: 'gap-x-3 flex-wrap' }"
        :aria-label="`Days for start time ${i + 1}`"
      />
      <IconButton
        icon="i-lucide-trash-2"
        size="sm"
        :label="`Remove start time ${i + 1}`"
        :disabled="rows.length === 1"
        @click="rows.splice(i, 1)"
      />
    </div>
    <UButton
      label="Add a start time"
      icon="i-lucide-plus"
      color="neutral"
      variant="outline"
      size="sm"
      @click="rows.push({ time: '14:30', days: [] })"
    />
  </div>
</template>
