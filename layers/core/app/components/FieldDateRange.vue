<!-- A first and last day as one field, so the last can never come before the first. It takes and
     gives { start, end } as the server keeps dates ("2027-09-01"); either is '' until chosen. -->
<script setup lang="ts">
import { parseDate } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'

export interface DateRangeValue { start: string, end: string }
interface Picked { start: DateValue | undefined, end: DateValue | undefined }

const props = defineProps<{
  min?: string
  max?: string
  /** Days that cannot be chosen: given the day as "2027-09-01". */
  unavailable?: (day: string) => boolean
  disabled?: boolean
}>()
const model = defineModel<DateRangeValue>({ default: () => ({ start: '', end: '' }) })
const { t } = useT()
const labelledBy = useFieldLabel()

function parse(value: string | null | undefined) {
  try { return value ? parseDate(value) : undefined }
  catch { return undefined }
}
const text = (d: DateValue | undefined) => d ? d.toString().slice(0, 10) : '' // not-policy: the length of a date
const value = computed({
  get: (): Picked => ({ start: parse(model.value?.start), end: parse(model.value?.end) }),
  set: (v: Picked | null | undefined) => { model.value = { start: text(v?.start), end: text(v?.end) } },
})
const minValue = computed(() => parse(props.min))
const maxValue = computed(() => parse(props.max))
const isUnavailable = computed(() => props.unavailable ? (d: DateValue) => props.unavailable!(text(d)) : undefined)
const open = ref(false)
function pick(v: unknown) {
  const picked = v as Picked | null
  value.value = picked
  if (picked?.start && picked.end) open.value = false
}
</script>

<template>
  <UInputDate
    :model-value="(value as any)"
    range
    :min-value="minValue"
    :max-value="maxValue"
    :is-date-unavailable="isUnavailable"
    :disabled="disabled"
    :aria-labelledby="labelledBy"
    @update:model-value="value = ($event as Picked | null)"
  >
    <template #trailing>
      <UPopover v-model:open="open">
        <IconButton
          color="neutral"
          variant="link"
          size="sm"
          icon="i-lucide-calendar"
          :label="t('core.dates.pick-range')"
          :disabled="disabled"
          class="px-0"
        />
        <template #content>
          <UCalendar
            :model-value="(value as any)"
            range
            :number-of-months="2"
            :min-value="minValue"
            :max-value="maxValue"
            :is-date-unavailable="isUnavailable"
            class="p-2"
            @update:model-value="pick"
          />
        </template>
      </UPopover>
    </template>
  </UInputDate>
</template>
