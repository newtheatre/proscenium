<!-- A length of time (settings build brief, Matt): a number and a unit side by side, second to year,
     each unit named for the number. Stored and given back as whole seconds. Only units that can hold
     a value between min and max are offered, and a stored value shows in the largest unit that
     divides it exactly, so 2555 days reads 7 years. A month counts as 30 days and a year as 365. -->
<script setup lang="ts">
import { durationParts, parseDuration, unitSeconds, unitsWithin, type DurationUnit } from '../../kit/duration'

const props = defineProps<{
  /** The least it may be: seconds, or written like 5m or 14d. */
  min?: number | string
  /** The most it may be: seconds, or written like 1h or 365d. */
  max?: number | string
  disabled?: boolean
  /** What the number is, for a screen reader, where no form field names it. */
  label?: string
}>()
const model = defineModel<number | null | undefined>()

const { t } = useT()
const seconds = (limit?: number | string) => limit === undefined ? undefined : parseDuration(limit)
const offered = computed(() => unitsWithin(seconds(props.min), seconds(props.max)))
const count = ref<number | undefined>()
const unit = ref<DurationUnit>(offered.value[0] ?? 'minute')

watch(model, (value) => {
  if (value === null || value === undefined) {
    count.value = undefined
    return
  }
  // A value this control just sent keeps the unit the person chose.
  if (count.value !== undefined && count.value * unitSeconds(unit.value) === value) return
  const parts = durationParts(value, offered.value)
  count.value = parts.count
  unit.value = parts.unit
}, { immediate: true })

const items = computed(() => offered.value.map(value => ({ value, label: t(`core.duration.${value}`, { count: count.value ?? 2 }) }))) // not-policy: the plural when empty
const longUnits = computed(() => offered.value.includes('month') || offered.value.includes('year'))

function setCount(value: number | null | undefined) {
  count.value = value ?? undefined
  model.value = value === null || value === undefined ? null : value * unitSeconds(unit.value)
}
function setUnit(value: DurationUnit) {
  unit.value = value
  if (count.value !== undefined) model.value = count.value * unitSeconds(value)
}
</script>

<template>
  <div class="space-y-1">
    <UFieldGroup>
      <UInputNumber
        :model-value="count"
        :min="0"
        :disabled="disabled"
        :aria-label="label"
        class="w-32"
        @update:model-value="setCount"
      />
      <USelect
        :model-value="unit"
        :items="items"
        value-key="value"
        :disabled="disabled"
        :aria-label="t('core.duration.control-unit')"
        class="w-32"
        @update:model-value="setUnit($event as DurationUnit)"
      />
    </UFieldGroup>
    <p
      v-if="longUnits"
      class="text-xs text-muted"
    >
      {{ t('core.duration.long-units') }}
    </p>
  </div>
</template>
