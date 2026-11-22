<!-- One category on the Products screen: its colour, its actions and its products with their Standard
     prices, each marked when a size still needs a price. Products are put in order by dragging their
     handle, its arrow keys or the row's menu, except while the list is searched. -->
<script setup lang="ts">
interface VariantPrice { listId: string, amountMinor: number | null }
interface Variant { id: string, name: string, mixerMeasure: boolean, active: boolean, prices: VariantPrice[] }
interface Product { id: string, name: string, ageRestricted: boolean, active: boolean, variants: Variant[] }
interface Category { id: string, name: string, title: string, colour: string | null, active: boolean, products: Product[] }

// standardId: Standard's list. inSubCategories: how many products its sub-categories hold.
const props = defineProps<{ category: Category, standardId?: string, inSubCategories: number, searching: boolean }>()
const emit = defineEmits<{ add: [], edit: [], active: [on: boolean], move: [product: Product, to: number] }>()

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
const nameOf = (p: Product) => p.active ? p.name : t('bar.screens.products.retired-name', { name: p.name })
function onReorder({ id, from, to }: { id: string, from: number, to: number }) {
  const p = props.category.products[from]
  if (p?.id === id) emit('move', p, to)
}
// The handle's arrow keys move the row a place, and keep the focus on it once the list has redrawn.
async function onHandleKey(event: KeyboardEvent, p: Product, at: number) {
  const to = at + (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0)
  if (to === at) return
  event.preventDefault()
  if (to < 0 || to >= props.category.products.length) return
  emit('move', p, to)
  await nextTick()
  document.querySelector<HTMLElement>(`[data-drag-handle="${p.id}"]`)?.focus()
}
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
      v-else-if="searching"
      :label="category.name"
    >
      <RecordListItem
        v-for="p in category.products"
        :key="p.id"
        :description="line(p)"
        :muted="!p.active || !category.active"
      >
        <template #name>
          <ULink :to="`/admin/modules/bar/products/${p.id}`">
            {{ nameOf(p) }}
          </ULink>
        </template>
        <StatusBadge
          v-if="needsPrice(p)"
          tone="warning"
          :label="t('bar.screens.products.needs-price')"
        />
      </RecordListItem>
    </RecordList>
    <template v-else>
      <SortableList
        :label="category.name"
        @reorder="onReorder"
      >
        <SortableRow
          v-for="(p, i) in category.products"
          :id="p.id"
          :key="p.id"
          :index="i"
          :description="line(p)"
          :muted="!p.active || !category.active"
        >
          <template #leading>
            <IconButton
              :data-drag-handle="p.id"
              icon="i-lucide-grip-vertical"
              size="sm"
              class="cursor-grab touch-none"
              :label="t('bar.screens.products.order-handle', { name: p.name })"
              :aria-describedby="`bar-products-order-help-${category.id}`"
              @keydown="onHandleKey($event, p, i)"
            />
          </template>
          <template #name>
            <ULink :to="`/admin/modules/bar/products/${p.id}`">
              {{ nameOf(p) }}
            </ULink>
          </template>
          <div class="flex shrink-0 items-center gap-2">
            <StatusBadge
              v-if="needsPrice(p)"
              tone="warning"
              :label="t('bar.screens.products.needs-price')"
            />
            <RowActions
              :label="t('bar.screens.products.product-actions', { name: p.name })"
              :items="[
                { label: t('bar.screens.products.open'), icon: 'i-lucide-arrow-right', to: `/admin/modules/bar/products/${p.id}` },
                { label: t('bar.screens.products.move-up'), icon: 'i-lucide-arrow-up', disabled: i === 0, onSelect: () => emit('move', p, i - 1) },
                { label: t('bar.screens.products.move-down'), icon: 'i-lucide-arrow-down', disabled: i === category.products.length - 1, onSelect: () => emit('move', p, i + 1) },
              ]"
            />
          </div>
        </SortableRow>
      </SortableList>
      <span
        :id="`bar-products-order-help-${category.id}`"
        class="sr-only"
      >{{ t('bar.screens.products.order-keys') }}</span>
    </template>
  </PageSection>
</template>
