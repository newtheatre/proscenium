<script setup lang="ts">
import { CalendarDate } from '@internationalized/date'
import { isMonthDay } from '#shared/utils/london'
import { saysMonth, saysMonthDay } from '#shared/utils/when'

// A yearly boundary has no year, so the calendar draws a common one and never names it: 29
// February is not offered because it is not in every year (J-104 criterion 3, audit TR-7).
const COMMON_YEAR = 2001

const model = defineModel<string>({ default: '' })
const props = defineProps<{ name: string, label: string }>()

const open = ref(false)
const first = new CalendarDate(COMMON_YEAR, 1, 1)
const last = new CalendarDate(COMMON_YEAR, 12, 31)
const pad = (part: number): string => String(part).padStart(2, '0')

// The value back is from Reka's own copy of the date library, so its parts are read (0039).
const value = computed({
  get(): CalendarDate | undefined {
    if (!isMonthDay(model.value)) return undefined
    const [month, day] = model.value.split('-').map(Number)
    return new CalendarDate(COMMON_YEAR, month!, day!)
  },
  set(next: unknown) {
    const date = next as { month?: unknown, day?: unknown } | null | undefined
    if (typeof date?.month !== 'number' || typeof date.day !== 'number') return
    model.value = `${pad(date.month)}-${pad(date.day)}`
    open.value = false
  },
})
</script>

<template>
  <UPopover v-model:open="open">
    <UButton
      color="neutral"
      variant="outline"
      icon="i-lucide-calendar"
      :aria-label="props.label"
      :data-test="`input-${props.name}`"
      class="min-w-40"
    >
      {{ isMonthDay(model) ? saysMonthDay(model) : 'Choose a day' }}
    </UButton>

    <template #content>
      <UCalendar
        v-model="value"
        :min-value="first"
        :max-value="last"
        :year-controls="false"
        :view-control="false"
        :ui="{ gridWeekDaysRow: 'hidden' }"
        :data-test="`calendar-${props.name}`"
        class="p-2"
      >
        <template #heading="{ date }">
          {{ saysMonth(date.month) }}
        </template>
      </UCalendar>
    </template>
  </UPopover>
</template>
