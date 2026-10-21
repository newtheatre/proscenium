<script setup lang="ts">
import { says, saysAllergen } from '#shared/utils/bar'
import type { SaleProduct } from '#shared/utils/sale'

// Opening the note never leaves the sale: a modal over the basket, never a navigation, so what
// was tapped in is still there on return (F-107 criterion 2).

defineProps<{
  allergenOpen: { name: string, state: SaleProduct['allergenState'], note: string | null, allergens: SaleProduct['allergens'] } | null
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <UModal
    :open="allergenOpen !== null"
    :title="allergenOpen ? `Allergens: ${allergenOpen.name}` : ''"
    @update:open="emit('close')"
  >
    <template #body>
      <p
        data-test="allergen-state"
        class="font-medium"
      >
        {{ says(allergenOpen?.state ?? '') }}
      </p>
      <!-- The ticked fourteen first, one to a line, so the answer is read out the same every time. -->
      <ul
        v-if="allergenOpen?.allergens?.length"
        class="mt-3 space-y-1"
        data-test="allergen-list"
      >
        <li
          v-for="allergen in allergenOpen.allergens"
          :key="allergen"
          class="flex items-center gap-2 font-medium"
          :data-test="`allergen-listed-${allergen}`"
        >
          <UIcon
            name="i-lucide-triangle-alert"
            class="size-4 text-warning"
            aria-hidden="true"
          />
          {{ saysAllergen(allergen) }}
        </li>
      </ul>
      <p
        v-if="allergenOpen?.note"
        data-test="allergen-note"
        class="mt-2 text-sm"
      >
        {{ allergenOpen.note }}
      </p>
    </template>
  </UModal>
</template>
