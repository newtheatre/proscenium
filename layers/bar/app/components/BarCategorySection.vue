<!-- One category on the Products screen: its colour, its actions and its products with their Standard
     prices, each marked when a size still needs a price. Products move up and down by button, except
     while the list is searched. -->
<script setup lang="ts">
interface VariantPrice { listId: string, amountMinor: number | null }
interface Variant { id: string, name: string, mixerMeasure: boolean, active: boolean, prices: VariantPrice[] }
interface Product { id: string, name: string, ageRestricted: boolean, active: boolean, variants: Variant[] }
interface Category { id: string, name: string, title: string, colour: string | null, active: boolean, products: Product[] }

// standardId: Standard's list. inSubCategories: how many products its sub-categories hold.
const props = defineProps<{ category: Category, standardId?: string, inSubCategories: number, searching: boolean }>()
const emit = defineEmits<{ add: [], edit: [], active: [on: boolean], move: [product: Product, direction: 'up' | 'down'] }>()

const { t } = useT()
const { money } = await useMoney()

const swatch = (c: string) => ({ backgroundColor: c === 'neutral' ? 'var(--ui-color-neutral-500)' : `var(--ui-${c})` })
const priceOf = (v: Variant) => v.prices.find(x => x.listId === props.standardId)?.amountMinor ?? null
// One line of a product: each size on sale with its Standard price. The mixer measure is never sold
// on its own, so it is left out.
function line(p: Product): string {
  const onSale = p.variants.filter(v => v.active && !v.mixerMeasure)
  const sizes = onSale.map((v) => {
    const price = priceOf(v)
    const shown = price === null ? t('bar.screens.products.no-price') : money(price)
    return onSale.length === 1 && v.name === 'Each' ? shown : `${v.name} ${shown}`
  })
  return [sizes.join(' · '), p.ageRestricted ? t('bar.screens.products.age-restricted') : null].filter(Boolean).join(' · ')
}
// A size on sale with no Standard price is not on the till yet. The mixer measure is priced by its group.
const needsPrice = (p: Product) => p.active && p.variants.some(v => v.active && !v.mixerMeasure && priceOf(v) === null)
</script>

<template>
  <PageSection
    :title="category.title"
    :description="category.active ? undefined : t('bar.screens.products.category-retired')"
  >
    <template #actions>
      <UBadge
        v-if="category.colour"
        color="neutral"
        variant="outline"
        :label="t(`bar.screens.colours.${category.colour}`)"
      >
        <template #leading>
          <span
            class="size-2 rounded-full"
            :style="swatch(category.colour)"
            aria-hidden="true"
          />
        </template>
      </UBadge>
      <UButton
        v-if="category.active"
        color="neutral"
        variant="outline"
        icon="i-lucide-plus"
        :label="t('bar.screens.products.add-here')"
        @click="emit('add')"
      />
      <RowActions
        :label="t('bar.screens.products.category-actions', { name: category.name })"
        :items="[
          { label: t('bar.screens.products.edit-category'), icon: 'i-lucide-pencil', onSelect: () => emit('edit') },
          category.active
            ? { label: t('bar.screens.products.retire-category'), icon: 'i-lucide-archive', onSelect: () => emit('active', false) }
            : { label: t('bar.screens.products.restore-category'), icon: 'i-lucide-archive-restore', onSelect: () => emit('active', true) },
        ]"
      />
    </template>
    <p
      v-if="!category.products.length"
      class="text-sm text-muted"
    >
      {{ inSubCategories ? t('bar.screens.products.in-sub-categories', { count: inSubCategories }) : t('bar.screens.products.no-products') }}
    </p>
    <RecordList
      v-else
      :label="category.name"
    >
      <RecordListItem
        v-for="(p, i) in category.products"
        :key="p.id"
        :description="line(p)"
        :muted="!p.active || !category.active"
      >
        <template #name>
          <ULink :to="`/admin/modules/bar/products/${p.id}`">
            {{ p.active ? p.name : t('bar.screens.products.retired-name', { name: p.name }) }}
          </ULink>
        </template>
        <StatusBadge
          v-if="needsPrice(p)"
          tone="warning"
          :label="t('bar.screens.products.needs-price')"
        />
        <div
          v-if="!searching"
          class="flex gap-1"
        >
          <IconButton
            icon="i-lucide-arrow-up"
            :label="t('bar.screens.products.move-up', { name: p.name })"
            :disabled="i === 0"
            @click="emit('move', p, 'up')"
          />
          <IconButton
            icon="i-lucide-arrow-down"
            :label="t('bar.screens.products.move-down', { name: p.name })"
            :disabled="i === category.products.length - 1"
            @click="emit('move', p, 'down')"
          />
        </div>
      </RecordListItem>
    </RecordList>
  </PageSection>
</template>
