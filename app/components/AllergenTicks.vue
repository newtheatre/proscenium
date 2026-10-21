<script setup lang="ts">
import { ALLERGENS, saysAllergen } from '#shared/utils/bar'
import type { Allergen } from '#shared/utils/bar'

// The fourteen allergens UK law names, ticked rather than typed (0142). Every form that records
// an allergen answer draws this, so the list and its wording are the same wherever it is asked.
const ticked = defineModel<Allergen[]>({ default: () => [] })

const props = defineProps<{ testPrefix?: string }>()
const prefix = computed(() => props.testPrefix ?? 'allergen')

const items = computed(() => ALLERGENS.map(allergen => ({
  'value': allergen,
  'label': saysAllergen(allergen),
  'data-test': `${prefix.value}-tick-${allergen}`,
})))

const chosen = computed({
  get: () => ticked.value,
  set: (list: string[]) => {
    ticked.value = ALLERGENS.filter(allergen => list.includes(allergen))
  },
})
</script>

<template>
  <UCheckboxGroup
    v-model="chosen"
    :items="items"
    legend="The allergens it contains"
    variant="card"
    size="sm"
    :data-test="`${prefix}-ticks`"
    :ui="{ legend: 'sr-only', fieldset: 'grid grid-cols-1 gap-2 sm:grid-cols-2' }"
  />
</template>
