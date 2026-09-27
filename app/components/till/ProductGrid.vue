<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { categoriesShown, productBlocked, productOutOfStock, saysNoChoice, sizeBlocked, sizeOutOfStock } from '#shared/utils/sale'
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
  chooseOption: (optionId: string | null, optionName: string | null) => void
}>()

const emit = defineEmits<{
  openAllergens: [{ name: string, state: SaleProduct['allergenState'], note: string | null }]
  closeSizing: []
  closeChoosing: []
}>()

// The category row filters a grid several screens tall (F-103 criterion 6, K-102 criterion 3).
// The choice outlives a sale: the next customer usually wants the same shelf.
const nonEmptyCategories = computed(() => props.categories.filter(category => props.productsIn(category.id).length))
const chosenCategoryId = ref<string | null>(null)
const shownCategories = computed(() => categoriesShown(nonEmptyCategories.value, chosenCategoryId.value))

// Stock is read with the catalogue and can trail the shelf; the charge is what checks it for real.
const STOCK_AS_LOADED = 'Stock as the till last read it; every charge checks it again.'

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
        size="sm"
        color="neutral"
        :variant="chosenCategoryId === null ? 'solid' : 'subtle'"
        class="min-h-12 shrink-0"
        :aria-pressed="chosenCategoryId === null"
        data-test="category-chip-all"
        @click="chosenCategoryId = null"
      >
        All
      </UButton>
      <UButton
        v-for="category in nonEmptyCategories"
        :key="category.id"
        size="sm"
        color="neutral"
        :variant="chosenCategoryId === category.id ? 'solid' : 'subtle'"
        class="min-h-12 shrink-0"
        :aria-pressed="chosenCategoryId === category.id"
        :data-test="`category-chip-${category.id}`"
        @click="chosenCategoryId = category.id"
      >
        {{ category.name }}
      </UButton>
    </div>

    <div
      v-for="category in shownCategories"
      :id="`till-category-${category.id}`"
      :key="category.id"
    >
      <h2 class="mb-2 text-sm font-semibold text-muted">
        {{ category.name }}
      </h2>
      <div class="mb-4 grid grid-cols-2 gap-2">
        <!-- One row of controls: the allergen button sits in the tile's corner beside the product,
             not under it, so a tile is no taller than its name and price (F-107.1, issue 1311). -->
        <div
          v-for="product in productsIn(category.id)"
          :key="product.id"
          class="relative rounded-lg border border-default"
          :data-test="`tile-${product.id}`"
        >
          <UButton
            color="neutral"
            variant="ghost"
            class="min-h-12 w-full justify-start py-1.5 ps-2 pe-12 text-left"
            :disabled="productBlocked(product)"
            :data-test="`product-${product.id}`"
            @click="tapProduct(product)"
          >
            <span class="flex flex-col items-start gap-0.5">
              <span class="text-sm font-medium">{{ product.name }}</span>
              <span class="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span>{{ priceLine(product) }}</span>
                <!-- Carried by the word, never by the colour alone (K-101 criterion 3, F-106
                     criterion 6). -->
                <span
                  v-if="product.ageRestricted"
                  class="inline-flex items-center gap-0.5 font-medium text-warning"
                  :data-test="`restricted-mark-${product.id}`"
                ><UIcon
                  name="i-lucide-id-card"
                  class="size-3.5"
                />ID</span>
                <!-- Advice read when the catalogue loaded, not a live count (F-128 criterion 8). -->
                <span
                  v-if="productOutOfStock(product)"
                  class="inline-flex items-center gap-0.5"
                  :data-test="`out-of-stock-${product.id}`"
                ><UIcon
                  name="i-lucide-package-x"
                  class="size-3.5"
                />Out of stock</span>
              </span>
            </span>
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-info"
            class="absolute end-0 top-0 size-12 justify-center"
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
      description="Pick a size"
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
            :disabled="sizeBlocked(variant)"
            :data-test="`variant-${variant.id}`"
            @click="tapVariant(sizing!.name, variant)"
          >
            <span class="flex flex-col items-start">
              <span>{{ variant.label }} {{ saysMoney(variant.pricePence) }}</span>
              <span
                v-if="sizeOutOfStock(variant)"
                class="text-xs text-muted"
                :data-test="`variant-out-of-stock-${variant.id}`"
              >Out of stock</span>
            </span>
          </UButton>
        </div>
        <p
          v-if="sizing?.variants.some(sizeOutOfStock)"
          class="mt-2 text-xs text-muted"
        >
          {{ STOCK_AS_LOADED }}
        </p>
        <div class="mt-2 flex justify-end">
          <UButton
            color="neutral"
            variant="ghost"
            class="min-h-12"
            @click="emit('closeSizing')"
          >
            {{ CONFIRM_BACK_LABEL }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="choosing !== null"
      :title="choosing ? choosing.choice.name : ''"
      :description="choosing?.choice.optional ? 'Pick one, or none, at no extra charge' : 'Pick one, at no extra charge'"
      @update:open="emit('closeChoosing')"
    >
      <template #body>
        <div class="grid grid-cols-2 gap-2">
          <!-- An option reads its own stock as a size does (F-128 criterion 9). -->
          <UButton
            v-for="option in choosing?.choice.options ?? []"
            :key="option.id"
            color="neutral"
            variant="subtle"
            class="min-h-12"
            :disabled="sizeBlocked(option)"
            :data-test="`choice-option-${option.id}`"
            @click="chooseOption(option.id, option.itemName)"
          >
            <span class="flex flex-col items-start">
              <span>{{ option.itemName }}</span>
              <span
                v-if="sizeOutOfStock(option)"
                class="text-xs text-muted"
                :data-test="`choice-option-out-of-stock-${option.id}`"
              >Out of stock</span>
            </span>
          </UButton>
          <!-- A spirit served neat pours no mixer, so it is rung up with none (issue 1314). -->
          <UButton
            v-if="choosing?.choice.optional"
            color="neutral"
            variant="outline"
            class="min-h-12"
            data-test="choice-none"
            @click="chooseOption(null, null)"
          >
            {{ saysNoChoice(choosing.choice) }}
          </UButton>
        </div>
        <p
          v-if="choosing?.choice.options.some(sizeOutOfStock)"
          class="mt-2 text-xs text-muted"
        >
          {{ STOCK_AS_LOADED }}
        </p>
        <div class="mt-2 flex justify-end">
          <UButton
            color="neutral"
            variant="ghost"
            class="min-h-12"
            data-test="choice-back"
            @click="emit('closeChoosing')"
          >
            {{ CONFIRM_BACK_LABEL }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
