<!-- How long a scheme lasts: fixed to a day of the year, rolling from the day it starts, or until
     somebody ends it. 29 February is never offered as an end date. -->
<script setup lang="ts">
const { t } = useT()
const { monthName } = useDates()
const rule = defineModel<'fixed' | 'rolling' | 'indefinite'>('rule', { required: true })
const month = defineModel<number>('month', { required: true })
const day = defineModel<number>('day', { required: true })

const DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const months = computed(() => DAYS_IN.map((_, i) => ({ value: i + 1, label: monthName(i + 1) })))
const days = computed(() => Array.from({ length: DAYS_IN[month.value - 1] ?? 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) })))
watch(month, (m) => {
  if (day.value > (DAYS_IN[m - 1] ?? 31)) day.value = DAYS_IN[m - 1] ?? 31
})
</script>

<template>
  <div class="space-y-4">
    <UFormField
      :label="t('membership.screens.scheme.length-rule')"
      required
    >
      <URadioGroup
        v-model="rule"
        :items="(['rolling', 'fixed', 'indefinite'] as const).map(v => ({ value: v, label: t(`membership.screens.length-rules.${v}`), description: t(`membership.screens.length-rules.${v}-help`) }))"
      />
    </UFormField>
    <UFormField
      v-if="rule === 'fixed'"
      :label="t('membership.screens.scheme.fixed-end')"
      :help="t('membership.screens.scheme.fixed-end-help')"
      required
    >
      <UFieldGroup>
        <USelect
          v-model="day"
          :items="days"
          :aria-label="t('membership.screens.scheme.fixed-end-day')"
        />
        <USelect
          v-model="month"
          :items="months"
          :aria-label="t('membership.screens.scheme.fixed-end-month')"
        />
      </UFieldGroup>
    </UFormField>
  </div>
</template>
