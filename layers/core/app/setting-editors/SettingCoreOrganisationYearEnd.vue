<!-- The editor for core.organisation.year-end: the day the theatre's own year ends, as a day and a
     month. The setting keeps it as "07-31". Choosing a month first takes its last day, the usual year
     end; 29 February is not offered, since not every year has it. -->
<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
const model = defineModel<string>({ default: '' })
const { t } = useT()
const { monthName } = useDates()

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] // not-policy: the calendar
const parsed = computed(() => {
  const match = /^(\d{2})-(\d{2})$/.exec(model.value ?? '')
  return match ? { month: Number(match[1]), day: Number(match[2]) } : null
})
// A day typed before a month is chosen waits here until there is a month to go with it.
const pendingDay = ref<number | null>(null)
const month = computed(() => parsed.value?.month)
const day = computed(() => parsed.value?.day ?? pendingDay.value ?? undefined)
const months = computed(() => Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: monthName(i + 1) })))
const pad = (n: number) => String(n).padStart(2, '0')
const lastDay = (m: number) => MONTH_DAYS[m - 1] ?? 31

function set(m: number | undefined, d: number | null | undefined) {
  if (!m) {
    pendingDay.value = d ?? null
    return
  }
  const chosen = Math.min(lastDay(m), Math.max(1, d ?? lastDay(m)))
  pendingDay.value = null
  model.value = `${pad(m)}-${pad(chosen)}`
}
</script>

<template>
  <UFieldGroup>
    <UInputNumber
      :model-value="day"
      :min="1"
      :max="month ? lastDay(month) : 31"
      :disabled="disabled"
      :placeholder="t('core.day-of-year.day')"
      :aria-label="t('core.day-of-year.day')"
      class="w-32"
      @update:model-value="set(month, $event)"
    />
    <USelect
      :model-value="month"
      :items="months"
      :disabled="disabled"
      :placeholder="t('core.day-of-year.month')"
      :aria-label="t('core.day-of-year.month')"
      class="w-40"
      @update:model-value="set($event as number, day)"
    />
  </UFieldGroup>
</template>
