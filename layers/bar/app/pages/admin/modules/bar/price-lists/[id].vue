<!-- A price list (S12): every size on sale with its price on this list beside Standard's, and where
     it follows Standard. A percentage list is read only and shows each worked price; prices on a list
     priced by hand are set from each product's page. -->
<script setup lang="ts">
interface VariantPrice { listId: string, amountMinor: number | null, from: 'list' | 'standard' | 'percent' | null }
interface Variant { id: string, name: string, active: boolean, prices: VariantPrice[] }
interface Product { id: string, name: string, active: boolean, variants: Variant[] }
interface Category { id: string, name: string, active: boolean, products: Product[] }
interface List { id: string, name: string, standard: boolean, restricted: boolean, fallsBack: boolean, percentOff: number | null, active: boolean }

const { t } = useT()
const route = useRoute()
const { money } = await useMoney()
const { data, status, error, refresh } = await useAPI<{ categories: Category[], lists: List[] }>('/api/bar/price-lists', { key: 'bar:price-lists' })
const list = computed(() => data.value?.lists.find(l => l.id === String(route.params.id)))
const standard = computed(() => data.value?.lists.find(l => l.standard))
const trail = computed(() => [{ label: t('bar.navigation.price-lists.label'), to: '/admin/modules/bar/price-lists' }])

const sizeName = (p: Product, v: Variant) => p.variants.length === 1 && v.name === 'Each' ? p.name : `${p.name}, ${v.name}`
function here(v: Variant): string {
  const p = v.prices.find(x => x.listId === list.value?.id)
  if (!p || p.amountMinor === null) return t('bar.screens.product.not-sold')
  if (p.from === 'standard') return t('bar.screens.lists.follows', { amount: money(p.amountMinor) })
  return money(p.amountMinor)
}
function onStandard(v: Variant): string {
  const p = v.prices.find(x => x.listId === standard.value?.id)
  return p?.amountMinor === null || p?.amountMinor === undefined ? t('bar.screens.product.not-sold') : money(p.amountMinor)
}
</script>

<template>
  <PageFrame
    :title="list?.name ?? t('bar.navigation.price-lists.label')"
    :trail="trail"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data && list"
        class="space-y-6"
      >
        <p class="text-sm text-muted">
          {{ list.standard ? t('bar.screens.lists.standard-help') : list.percentOff !== null ? t('bar.screens.lists.percent-help', { percent: list.percentOff }) : t('bar.screens.lists.hand-help') }}
        </p>
        <PageSection
          v-for="c in data.categories.filter(c => c.active)"
          :key="c.id"
          :title="c.name"
        >
          <RecordList :label="c.name">
            <template
              v-for="p in c.products.filter(p => p.active)"
              :key="p.id"
            >
              <RecordListItem
                v-for="v in p.variants.filter(v => v.active)"
                :key="v.id"
                :to="`/admin/modules/bar/products/${p.id}`"
                :name="sizeName(p, v)"
                :description="list.standard ? here(v) : t('bar.screens.lists.beside-standard', { here: here(v), standard: onStandard(v) })"
              />
            </template>
          </RecordList>
        </PageSection>
      </div>
      <EmptyState
        v-else-if="data"
        :title="t('bar.screens.lists.unknown')"
        icon="i-lucide-tags"
      />
    </DataBoundary>
  </PageFrame>
</template>
