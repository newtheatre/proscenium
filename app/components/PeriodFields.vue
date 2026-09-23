<script setup lang="ts">
import type { PeriodForm } from '~/composables/usePeriodForm'

// The controls for a `usePeriodForm`, in an AdminToolbar's actions slot. The refs are the form's
// own, so the screen reads the chosen period from the form it passed in.
const props = defineProps<{ form: PeriodForm }>()

const { customRange, kindItems, termItems, seasonItems, kind, termId, seasonId, day, fromDay, toDay, month, monthYear, year, months, calendarYears, years } = props.form
</script>

<template>
  <USelect
    v-model="kind"
    aria-label="Period kind"
    data-test="period-kind"
    :items="kindItems"
    value-key="value"
  />
  <USelect
    v-if="kind === 'TERM' && !customRange"
    v-model="termId"
    aria-label="Term"
    data-test="period-term"
    :items="termItems"
    value-key="value"
  />
  <template v-if="kind === 'TERM' && customRange">
    <DateField
      v-model="fromDay"
      data-test="period-from"
    />
    <DateField
      v-model="toDay"
      data-test="period-to"
    />
  </template>
  <USelect
    v-if="kind === 'SEASON'"
    v-model="seasonId"
    aria-label="Season"
    data-test="period-season"
    :items="seasonItems"
    value-key="value"
  />
  <DateField
    v-if="kind === 'DAY' || kind === 'WEEK'"
    v-model="day"
    data-test="period-day"
  />
  <USelect
    v-if="kind === 'MONTH'"
    v-model="month"
    aria-label="Month"
    data-test="period-month"
    :items="months"
    value-key="value"
  />
  <USelect
    v-if="kind === 'MONTH'"
    v-model="monthYear"
    aria-label="Calendar year"
    data-test="period-calendar-year"
    :items="calendarYears"
    value-key="value"
  />
  <USelect
    v-if="kind === 'YEAR'"
    v-model="year"
    aria-label="Year"
    data-test="period-year"
    :items="years"
    value-key="value"
  />
</template>
