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
  /** Names the two controls for a screen reader when the field's label does not, as "Hold for". */
  label?: string
  /** What an empty field stands for, in seconds: shown greyed in the number box, in its own unit. */
  placeholder?: number | null
  /** Only these units, such as hours and minutes for a running time. */
  units?: DurationUnit[]
  /** Fill the field's width, as in a grid of fields, instead of the usual fixed width. */
  block?: boolean
  /** The number box's id, when the field's own id belongs to another control beside this one. */
  id?: string
}>()
const model = defineModel<number | null | undefined>()

const { t } = useT()
const seconds = (limit?: number | string) => limit === undefined ? undefined : parseDuration(limit)
const offered = computed(() => unitsWithin(seconds(props.min), seconds(props.max)).filter(u => !props.units || props.units.includes(u)))
const count = ref<number | undefined>()
const unit = ref<DurationUnit>(offered.value[0] ?? 'minute')

watch([model, () => props.placeholder], ([value]) => {
  if (value === null || value === undefined) {
    count.value = undefined
    // Empty, the unit is the one the greyed value reads best in.
    if (props.placeholder) unit.value = durationParts(props.placeholder, offered.value).unit
    return
  }
  // A value this control just sent keeps the unit the person chose.
  if (count.value !== undefined && count.value * unitSeconds(unit.value) === value) return
  const parts = durationParts(value, offered.value)
  count.value = parts.count
  unit.value = parts.unit
}, { immediate: true })

const items = computed(() => offered.value.map(value => ({ value, label: t(`core.duration.${value}`, { count: count.value ?? 2 }) }))) // not-policy: the plural when empty
const ghost = computed(() => {
  if (props.placeholder === null || props.placeholder === undefined) return undefined
  const n = props.placeholder / unitSeconds(unit.value)
  return Number.isInteger(n) ? String(n) : undefined
})
// The unit has an id of its own: the field's id belongs to the number box, which its label names.
const unitId = useId()
const named = (part: string) => props.label ? `${props.label}: ${part}` : part

// The count each unit allows inside the limits: from 60 to 86,400 seconds is 1 to 1,440 minutes.
const countMin = computed(() => {
  const least = seconds(props.min)
  return least === undefined ? 0 : Math.ceil(least / unitSeconds(unit.value))
})
const countMax = computed(() => {
  const most = seconds(props.max)
  return most === undefined ? undefined : Math.floor(most / unitSeconds(unit.value))
})

function setCount(value: number | null | undefined) {
  count.value = value ?? undefined
  model.value = value === null || value === undefined ? null : value * unitSeconds(unit.value)
}
function setUnit(value: DurationUnit) {
  unit.value = value
  if (count.value === undefined) return
  // Changing the unit keeps the count inside what the new unit allows.
  count.value = Math.min(Math.max(count.value, countMin.value), countMax.value ?? Number.POSITIVE_INFINITY)
  model.value = count.value * unitSeconds(value)
}
</script>

<template>
  <UFieldGroup :class="block ? 'flex w-full' : undefined">
    <UInputNumber
      :id="id"
      :model-value="count"
      :min="countMin"
      :max="countMax"
      :disabled="disabled"
      :aria-label="named(t('core.duration.amount'))"
      :placeholder="ghost"
      :class="block ? 'min-w-0 flex-1' : 'w-32'"
      @update:model-value="setCount"
    />
    <USelect
      :id="unitId"
      :model-value="unit"
      :items="items"
      value-key="value"
      :disabled="disabled"
      :aria-label="named(t('core.duration.unit'))"
      :class="block ? 'w-28 shrink-0' : 'w-32'"
      @update:model-value="setUnit($event as DurationUnit)"
    />
  </UFieldGroup>
</template>
