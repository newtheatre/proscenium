<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import type { SaleCategory, SaleChoice, SaleProduct, SaleVariant } from '#shared/utils/sale'

// The drinks grid (F-103 criterion 2): a size prompts for its choice before the line lands, so
// the basket never holds an unresolved mixer waiting to be asked about later.

defineProps<{
  categories: SaleCategory[]
  productsIn: (categoryId: string) => SaleProduct[]
  choosing: { productName: string, variant: SaleVariant, choice: SaleChoice } | null
  tapVariant: (productName: string, variant: SaleVariant) => void
  chooseOption: (optionId: string, optionName: string) => void
}>()

const emit = defineEmits<{
  openAllergens: [{ name: string, state: SaleProduct['allergenState'], note: string | null }]
  closeChoosing: []
}>()
</script>

<template>
  <div>
    <div
      v-for="category in categories"
      :key="category.id"
    >
      <template v-if="productsIn(category.id).length">
        <h2 class="mb-2 text-sm font-semibold text-muted">
          {{ category.name }}
        </h2>
        <div class="mb-4 space-y-2">
          <div
            v-for="product in productsIn(category.id)"
            :key="product.id"
            class="rounded-lg border border-default p-2"
            :data-test="`product-${product.id}`"
          >
            <div class="flex items-start justify-between gap-1">
              <span class="text-sm font-medium">{{ product.name }}</span>
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-info"
                class="min-h-12 min-w-12"
                :aria-label="`Allergens for ${product.name}`"
                :data-test="`allergen-${product.id}`"
                @click="emit('openAllergens', { name: product.name, state: product.allergenState, note: product.allergenNote })"
              />
            </div>
            <div class="mt-2 flex flex-wrap gap-2">
              <UButton
                v-for="variant in product.variants"
                :key="variant.id"
                color="neutral"
                variant="subtle"
                class="min-h-12 min-w-12"
                :data-test="`variant-${variant.id}`"
                @click="tapVariant(product.name, variant)"
              >
                {{ variant.label }} · {{ saysMoney(variant.pricePence) }}
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </div>

    <UModal
      :open="choosing !== null"
      :title="choosing ? choosing.choice.name : ''"
      description="Pick one; it depletes at no extra charge."
      @update:open="emit('closeChoosing')"
    >
      <template #body>
        <div class="grid grid-cols-2 gap-2">
          <UButton
            v-for="option in choosing?.choice.options ?? []"
            :key="option.id"
            color="neutral"
            variant="subtle"
            class="min-h-12"
            :data-test="`choice-option-${option.id}`"
            @click="chooseOption(option.id, option.itemName)"
          >
            {{ option.itemName }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
