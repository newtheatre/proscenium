<!-- A length of time: a number and a unit, so nobody has to learn that thirty minutes is typed "30m".
     It takes and gives the text the server keeps ("30m", "2h", "14d"; '' for none). -->
<script setup lang="ts">
const props = defineProps<{ disabled?: boolean, /** Names the two controls for a screen reader when the field's label does not, as "Hold for". */ label?: string }>()
const model = defineModel<string | null>({ default: '' })
const { t } = useT()

const UNITS = ['s', 'm', 'h', 'd', 'w'] as const
type Unit = typeof UNITS[number]
const parsed = computed(() => {
  const match = /^(\d+)([smhdw])$/.exec((model.value ?? '').trim())
  return match ? { amount: Number(match[1]), unit: match[2] as Unit } : null
})
// The unit is kept while the number is empty, so clearing the number does not reset it.
const unit = ref<Unit>(parsed.value?.unit ?? 'm')
watch(parsed, (now) => { if (now) unit.value = now.unit })
const items = computed(() => UNITS.map(u => ({ value: u, label: t(`core.duration.units.${u}`) })))

function set(amount: number | null | undefined, next: Unit = unit.value) {
  unit.value = next
  model.value = amount === null || amount === undefined || Number.isNaN(amount) ? '' : `${Math.max(0, Math.round(amount))}${next}`
}
const named = (part: string) => props.label ? `${props.label}: ${part}` : part
</script>

<template>
  <UFieldGroup>
    <UInputNumber
      :model-value="parsed?.amount ?? null"
      :min="0"
      :disabled="disabled"
      :aria-label="named(t('core.duration.amount'))"
      class="w-32"
      @update:model-value="set($event)"
    />
    <USelect
      :model-value="unit"
      :items="items"
      :disabled="disabled"
      :aria-label="named(t('core.duration.unit'))"
      class="w-32"
      @update:model-value="set(parsed?.amount, $event as Unit)"
    />
  </UFieldGroup>
</template>
