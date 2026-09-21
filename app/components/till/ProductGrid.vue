<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { plural } from '#shared/utils/text'
import type { SaleCategory, SaleChoice, SaleProduct, SaleVariant } from '#shared/utils/sale'

// The drinks grid (F-103 criterion 1, 0083): one tile per product, sizes in a sheet off the tile,
// and a size prompts for its choice before the line lands rather than after (criterion 2).

const props = defineProps<{
  categories: SaleCategory[]
  productsIn: (categoryId: string) => SaleProduct[]
  sizing: SaleProduct | null
  choosing: { productName: string, variant: SaleVariant, choice: SaleChoice } | null
  tapProduct: (product: SaleProduct) => void
  tapVariant: (productName: string, variant: SaleVariant) => void
  chooseOption: (optionId: string, optionName: string) => void
}>()

const emit = defineEmits<{
  openAllergens: [{ name: string, state: SaleProduct['allergenState'], note: string | null }]
  closeSizing: []
  closeChoosing: []
}>()

// A one-handed jump for a grid several screens tall (F-103 criterion 5, K-102 criterion 3).
const nonEmptyCategories = computed(() => props.categories.filter(category => props.productsIn(category.id).length))

function jumpTo(categoryId: string): void {
  document.getElementById(`till-category-${categoryId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// What the tile says under the name, so a tile costing a second tap says so before it is tapped.
function priceLine(product: SaleProduct): string {
  const prices = product.variants.map(variant => variant.pricePence)
  if (prices.length === 1) return saysMoney(prices[0]!)
  return `From ${saysMoney(Math.min(...prices))} · ${plural(prices.length, 'size')}`
}
</script>

<template>
  <div>
    <div
      v-if="nonEmptyCategories.length > 1"
      class="sticky top-0 z-10 -mx-4 mb-2 flex gap-2 overflow-x-auto bg-default px-4 py-2"
      data-test="category-chips"
    >
      <UButton
        v-for="category in nonEmptyCategories"
        :key="category.id"
        size="sm"
        color="neutral"
        variant="subtle"
        class="min-h-10 shrink-0"
        :data-test="`category-chip-${category.id}`"
        @click="jumpTo(category.id)"
      >
        {{ category.name }}
      </UButton>
    </div>

    <div
      v-for="category in nonEmptyCategories"
      :id="`till-category-${category.id}`"
      :key="category.id"
    >
      <h2 class="mb-2 text-sm font-semibold text-muted">
        {{ category.name }}
      </h2>
      <div class="mb-4 grid grid-cols-2 gap-2">
        <div
          v-for="product in productsIn(category.id)"
          :key="product.id"
          class="flex items-start justify-between gap-1 rounded-lg border border-default p-2"
        >
          <UButton
            color="neutral"
            variant="ghost"
            class="min-h-12 grow justify-start p-1 text-left"
            :data-test="`product-${product.id}`"
            @click="tapProduct(product)"
          >
            <span class="flex flex-col items-start gap-0.5">
              <span class="text-sm font-medium">{{ product.name }}</span>
              <span class="text-xs text-muted">{{ priceLine(product) }}</span>
              <!-- Carried by the word, never by the colour alone (K-101 criterion 3, F-106
                   criterion 6). -->
              <UBadge
                v-if="product.ageRestricted"
                color="warning"
                variant="subtle"
                size="sm"
                icon="i-lucide-id-card"
                label="Check ID"
                :data-test="`restricted-mark-${product.id}`"
              />
            </span>
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-info"
            class="min-h-12 min-w-12 shrink-0"
            :aria-label="`Allergens for ${product.name}`"
            :data-test="`allergen-${product.id}`"
            @click="emit('openAllergens', { name: product.name, state: product.allergenState, note: product.allergenNote })"
          />
        </div>
      </div>
    </div>

    <UModal
      :open="sizing !== null"
      :title="sizing ? sizing.name : ''"
      description="Pick a size."
      @update:open="emit('closeSizing')"
    >
      <template #body>
        <div
          class="grid grid-cols-2 gap-2"
          data-test="size-sheet"
        >
          <UButton
            v-for="variant in sizing?.variants ?? []"
            :key="variant.id"
            color="neutral"
            variant="subtle"
            class="min-h-12"
            :data-test="`variant-${variant.id}`"
            @click="tapVariant(sizing!.name, variant)"
          >
            {{ variant.label }} {{ saysMoney(variant.pricePence) }}
          </UButton>
        </div>
        <div class="mt-2 flex justify-end">
          <UButton
            color="neutral"
            variant="ghost"
            class="min-h-12"
            @click="emit('closeSizing')"
          >
            Back
          </UButton>
        </div>
      </template>
    </UModal>

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
