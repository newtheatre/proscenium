<script setup lang="ts">
import { says } from '#shared/utils/bar'
import type { SaleProduct } from '#shared/utils/sale'

// Opening the note never leaves the sale: a modal over the basket, never a navigation, so what
// was tapped in is still there on return (F-107 criterion 2).

defineProps<{
  allergenOpen: { name: string, state: SaleProduct['allergenState'], note: string | null } | null
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
