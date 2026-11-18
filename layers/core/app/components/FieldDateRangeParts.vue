<!-- The typed part of the kit's date range field (FieldDateRange): Nuxt UI's date range input, drawn
     from the same Reka parts and theme, with the one difference FieldDateParts makes for a single
     date. Nuxt UI names each part only "day", "month" or "year", twice over; here each part is also
     named by its form field's label and by which end of the range it is, so a screen reader says
     "Run start day" and "Run end day" rather than "day" and "day". Each part points at the field's
     label and at a hidden name of its own (aria-labelledby). Everything else is passed to Reka as
     Nuxt UI does: the value, limits, and the form field's id, name and events. -->
<script setup lang="ts">
import { DateRangeFieldInput, DateRangeFieldRoot } from 'reka-ui'
import type { DateValue } from '@internationalized/date'
import theme from '#build/ui/input-date'
import { tv } from '@nuxt/ui/utils/tv'
import { useFormField } from '@nuxt/ui/composables/useFormField'
import { useLocale } from '@nuxt/ui/composables/useLocale'

export interface DateRangeParts { start: DateValue | undefined, end: DateValue | undefined }

defineOptions({ inheritAttrs: false })
const props = defineProps<{
  modelValue?: DateRangeParts | null
  minValue?: DateValue
  maxValue?: DateValue
  isDateUnavailable?: (date: DateValue) => boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: DateRangeParts | null | undefined): void }>()
defineSlots<{ trailing?: () => unknown }>()

const { t: ui$t } = useLocale()
const { t } = useT()
const appConfig = useAppConfig() as { ui?: { icons?: { minus?: string }, inputDate?: Record<string, unknown> } }
const { id, name, labelId, ariaAttrs, color, size, highlight, disabled: fieldDisabled, emitFormBlur, emitFormFocus, emitFormChange, emitFormInput } = useFormField<Record<string, unknown>>(props)
const off = computed(() => fieldDisabled.value ?? props.disabled)
const slots = useSlots()
const ui = computed(() => tv({ extend: theme, ...(appConfig.ui?.inputDate ?? {}) })({
  color: color.value as 'primary' | undefined,
  size: size.value as 'md' | undefined,
  highlight: highlight.value,
  trailing: !!slots.trailing,
}))

// Each part's own name for each end, hidden, for the part to be labelled by along with the field's label.
const partId = useId()
const SIDES = ['start', 'end'] as const
type Side = typeof SIDES[number]
const PARTS = ['year', 'month', 'day', 'era'] as const
const partName = (side: Side, part: string) => t(`core.dates.part-${side}`, { part: ui$t(`inputDate.${part}`) })
const labelledBy = (side: Side, part: string) => labelId.value ? `${labelId.value} ${partId}-${side}-${part}` : undefined

function update(value: DateRangeParts | null | undefined) {
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
  <DateRangeFieldRoot
    :id="id"
    v-slot="{ segments }"
    data-slot="base"
    v-bind="{ ...$attrs, ...ariaAttrs }"
    :model-value="(modelValue ?? undefined) as any"
    :name="name"
    :min-value="minValue"
    :max-value="maxValue"
    :is-date-unavailable="isDateUnavailable"
    :disabled="off"
    :class="ui.base()"
    @update:model-value="update($event as DateRangeParts | null | undefined)"
    @focusout="focusOut"
    @focusin="focusIn"
  >
    <template
      v-for="side in SIDES"
      :key="side"
    >
      <UIcon
        v-if="side === 'end'"
        :name="appConfig.ui?.icons?.minus ?? 'i-lucide-minus'"
        data-slot="separatorIcon"
        :class="ui.separatorIcon()"
      />
      <DateRangeFieldInput
        v-for="(segment, index) in segments[side]"
        :key="`${side}-${segment.part}-${index}`"
        :type="side"
        :part="segment.part"
        data-slot="segment"
        :class="ui.segment()"
        :data-segment="segment.part"
        :aria-label="segment.part === 'literal' ? undefined : partName(side, segment.part)"
        :aria-labelledby="segment.part === 'literal' ? undefined : labelledBy(side, segment.part)"
      >
        {{ segment.value.trim() }}
      </DateRangeFieldInput>
    </template>
    <template
      v-for="side in SIDES"
      :key="`names-${side}`"
    >
      <span
        v-for="part in PARTS"
        :id="`${partId}-${side}-${part}`"
        :key="part"
        hidden
      >{{ partName(side, part) }}</span>
    </template>
    <span
      v-if="slots.trailing"
      data-slot="trailing"
      :class="ui.trailing()"
    >
      <slot name="trailing" />
    </span>
  </DateRangeFieldRoot>
</template>
