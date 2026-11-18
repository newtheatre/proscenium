<!-- The typed part of the kit's date fields (FieldDate, FieldDateTime): Nuxt UI's date input, drawn
     from the same Reka parts and theme, with one difference. Nuxt UI names each part only "day",
     "month" or "year"; here each part is also named by its form field's label, so a screen reader
     says "On sale from day" rather than a bare "day". Each part points at the field's label and at
     a hidden name of its own (a hidden element can still name another) (aria-labelledby). Everything else is passed to Reka as Nuxt
     UI does: the value, limits, granularity and clock, and the form field's id, name and events. -->
<script setup lang="ts">
import { DateFieldInput, DateFieldRoot } from 'reka-ui'
import type { DateValue } from '@internationalized/date'
import theme from '#build/ui/input-date'
import { tv } from '@nuxt/ui/utils/tv'
import { useFormField } from '@nuxt/ui/composables/useFormField'
import { useLocale } from '@nuxt/ui/composables/useLocale'

defineOptions({ inheritAttrs: false })
const props = defineProps<{
  modelValue?: DateValue | null
  granularity?: 'day' | 'hour' | 'minute' | 'second'
  hourCycle?: 12 | 24
  minValue?: DateValue
  maxValue?: DateValue
  isDateUnavailable?: (date: DateValue) => boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: DateValue | null | undefined): void }>()
defineSlots<{ trailing?: () => unknown }>()

const { t } = useLocale()
const appConfig = useAppConfig() as { ui?: { inputDate?: Record<string, unknown> } }
const { id, name, labelId, ariaAttrs, color, size, highlight, disabled: fieldDisabled, emitFormBlur, emitFormFocus, emitFormChange, emitFormInput } = useFormField<Record<string, unknown>>(props)
const off = computed(() => fieldDisabled.value ?? props.disabled)
const slots = useSlots()
const ui = computed(() => tv({ extend: theme, ...(appConfig.ui?.inputDate ?? {}) })({
  color: color.value as 'primary' | undefined,
  size: size.value as 'md' | undefined,
  highlight: highlight.value,
  trailing: !!slots.trailing,
}))

// Each part's own name, hidden, for the part to be labelled by along with the field's label.
const partId = useId()
const partName = (part: string) => t(`inputDate.${part}`)
const labelledBy = (part: string) => labelId.value ? `${labelId.value} ${partId}-${part}` : undefined
const PARTS = ['year', 'month', 'day', 'hour', 'minute', 'second', 'dayPeriod', 'era', 'timeZoneName'] as const

function update(value: DateValue | null | undefined) {
  emit('update:modelValue', value)
  emitFormChange()
  emitFormInput()
}
function focusOut(event: FocusEvent) {
  if (event.relatedTarget && (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) return
  emitFormBlur()
}
function focusIn(event: FocusEvent) {
  if (event.relatedTarget && (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) return
  emitFormFocus()
}
</script>

<template>
  <DateFieldRoot
    :id="id"
    v-slot="{ segments }"
    data-slot="base"
    v-bind="{ ...$attrs, ...ariaAttrs }"
    :model-value="modelValue ?? undefined"
    :name="name"
    :granularity="granularity"
    :hour-cycle="hourCycle"
    :min-value="minValue"
    :max-value="maxValue"
    :is-date-unavailable="isDateUnavailable"
    :disabled="off"
    :class="ui.base()"
    @update:model-value="update"
    @focusout="focusOut"
    @focusin="focusIn"
  >
    <DateFieldInput
      v-for="(segment, index) in segments"
      :key="`${segment.part}-${index}`"
      :part="segment.part"
      data-slot="segment"
      :class="ui.segment()"
      :data-segment="segment.part"
      :aria-label="segment.part === 'literal' ? undefined : partName(segment.part)"
      :aria-labelledby="segment.part === 'literal' ? undefined : labelledBy(segment.part)"
    >
      {{ segment.value.trim() }}
    </DateFieldInput>
    <span
      v-for="part in PARTS"
      :id="`${partId}-${part}`"
      :key="part"
      hidden
    >{{ partName(part) }}</span>
    <span
      v-if="slots.trailing"
      data-slot="trailing"
      :class="ui.trailing()"
    >
      <slot name="trailing" />
    </span>
  </DateFieldRoot>
</template>
