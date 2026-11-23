<!-- The editor for finance.year.starts: the day the financial year begins, as a month and a day.
     The setting keeps it as "08-01". A year cannot start on the 29th to 31st, so every year has it. -->
<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
const model = defineModel<string>({ default: '08-01' })
const { t } = useT()
const { monthName } = useDates()

const month = computed(() => Number(model.value.slice(0, 2)) || 1)
const day = computed(() => Number(model.value.slice(3, 5)) || 1)
const months = computed(() => Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: monthName(i + 1) })))
const pad = (n: number) => String(n).padStart(2, '0')
const set = (m: number, d: number) => { model.value = `${pad(m)}-${pad(Math.min(28, Math.max(1, d)))}` }
</script>

<template>
  <UFieldGroup>
    <FieldNumber
      :model-value="day"
      :min="1"
      :max="28"
      :disabled="disabled"
      :aria-label="t('finance.screens.year-start.day')"
      class="w-28"
      @update:model-value="set(month, $event ?? 1)"
    />
    <USelect
      :model-value="month"
      :items="months"
      :disabled="disabled"
      :aria-label="t('finance.screens.year-start.month')"
      class="w-40"
      @update:model-value="set($event as number, day)"
    />
  </UFieldGroup>
</template>
