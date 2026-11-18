<!-- A date and time, entered in the theatre's time zone whatever the viewer's, on a 24-hour clock.
     It takes and gives an instant in milliseconds (null for none), so no page converts one by hand.
     When the viewer's own zone differs, the field says which zone it means. -->
<script setup lang="ts">
import { fromAbsolute, getLocalTimeZone, toCalendarDate, toCalendarDateTime, toZoned } from '@internationalized/date'
import type { CalendarDateTime, DateValue } from '@internationalized/date'

const props = defineProps<{
  /** The earliest and latest instant allowed, in milliseconds. */
  min?: number
  max?: number
  /** Days that cannot be chosen, such as a closure: given the day as "2027-09-01". */
  unavailable?: (day: string) => boolean
  disabled?: boolean
}>()
const model = defineModel<number | null>({ default: null })
const { t } = useT()
const labelledBy = useFieldLabel()
const { zone } = useDates()

const local = (ms: number | null | undefined) => ms === null || ms === undefined ? undefined : toCalendarDateTime(fromAbsolute(ms, zone.value))
const value = computed({
  get: () => local(model.value) ?? null,
  set: (v: DateValue | null | undefined) => { model.value = v ? toZoned(toCalendarDateTime(v), zone.value).toDate().getTime() : null },
})
const minValue = computed(() => local(props.min))
const maxValue = computed(() => local(props.max))
const isUnavailable = computed(() => props.unavailable ? (d: DateValue) => props.unavailable!(d.toString().slice(0, 10)) : undefined) // not-policy: the length of a date
const open = ref(false)
// The calendar chooses the day and leaves the time as it was typed.
function pick(v: unknown) {
  const day = v as DateValue | null
  if (day) {
    const now = value.value as CalendarDateTime | null
    value.value = now ? now.set({ year: day.year, month: day.month, day: day.day }) : toCalendarDateTime(day)
  }
  open.value = false
}
// Known only in the browser, so it is said after hydration.
const elsewhere = ref(false)
onMounted(() => { elsewhere.value = getLocalTimeZone() !== zone.value })
</script>

<template>
  <div>
    <FieldDateParts
      v-model="value"
      granularity="minute"
      :hour-cycle="24"
      :min-value="minValue"
      :max-value="maxValue"
      :is-date-unavailable="isUnavailable"
      :disabled="disabled"
      :aria-labelledby="labelledBy"
    >
      <template #trailing>
        <UPopover v-model:open="open">
          <IconButton
            color="neutral"
            variant="link"
            size="sm"
            icon="i-lucide-calendar"
            :label="t('core.dates.pick')"
            :disabled="disabled"
            class="px-0"
          />
          <template #content>
            <UCalendar
              :model-value="value ? toCalendarDate(value) : undefined"
              :min-value="minValue ? toCalendarDate(minValue) : undefined"
              :max-value="maxValue ? toCalendarDate(maxValue) : undefined"
              :is-date-unavailable="isUnavailable"
              class="p-2"
              @update:model-value="pick"
            />
          </template>
        </UPopover>
      </template>
    </FieldDateParts>
    <p
      v-if="elsewhere"
      class="mt-1 text-xs text-muted"
    >
      {{ t('core.dates.zone', { zone }) }}
    </p>
  </div>
</template>
