<!-- A date field: typed part by part, or picked from a calendar. It takes and gives the date as the
     server keeps it ("2027-09-01", or '' for none), so no page converts one by hand. -->
<script setup lang="ts">
import { parseDate } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'

const props = defineProps<{
  /** The earliest and latest day allowed, as "2027-09-01". */
  min?: string
  max?: string
  /** Days that cannot be chosen, such as a closure: given the day as "2027-09-01". */
  unavailable?: (day: string) => boolean
  disabled?: boolean
}>()
const model = defineModel<string | null>({ default: '' })
const { t } = useT()
const labelledBy = useFieldLabel()

function parse(value: string | null | undefined) {
  try { return value ? parseDate(value) : undefined }
  catch { return undefined }
}
const value = computed({
  get: () => parse(model.value) ?? null,
  set: (v: DateValue | null | undefined) => { model.value = v ? v.toString().slice(0, 10) : '' }, // not-policy: the length of a date
})
const minValue = computed(() => parse(props.min))
const maxValue = computed(() => parse(props.max))
const isUnavailable = computed(() => props.unavailable ? (d: DateValue) => props.unavailable!(d.toString().slice(0, 10)) : undefined) // not-policy: the length of a date
const open = ref(false)
function pick(v: unknown) {
  value.value = v as DateValue | null
  open.value = false
}
</script>

<template>
  <FieldDateParts
    v-model="value"
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
            :model-value="value ?? undefined"
            :min-value="minValue"
            :max-value="maxValue"
            :is-date-unavailable="isUnavailable"
            class="p-2"
            @update:model-value="pick"
          />
        </template>
      </UPopover>
    </template>
  </FieldDateParts>
</template>
