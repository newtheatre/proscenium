<!-- Stock's three jobs as tabs of one screen: what there is, what came in, what was counted. A tab
     shows only for someone who may open it, and with one tab there is no bar. -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
const { data } = await useAPI<{ stock: { levels: boolean, deliveries: boolean, counts: boolean } }>('/api/bar/may', { key: 'bar:may' })

const LEVELS = '/console/bar/stock'
const DELIVERIES = '/console/bar/stock/deliveries'
const COUNTS = '/console/bar/stock/stocktakes'
const items = computed(() => [
  ...(data.value?.stock.levels ? [{ value: LEVELS, label: t('bar.screens.stock-tabs.levels'), icon: 'i-lucide-package' }] : []),
  ...(data.value?.stock.deliveries ? [{ value: DELIVERIES, label: t('bar.screens.stock-tabs.deliveries'), icon: 'i-lucide-truck' }] : []),
  ...(data.value?.stock.counts ? [{ value: COUNTS, label: t('bar.screens.stock-tabs.counts'), icon: 'i-lucide-clipboard-list' }] : []),
])
const current = computed({
  get: () => route.path.startsWith(DELIVERIES) ? DELIVERIES : route.path.startsWith(COUNTS) ? COUNTS : LEVELS,
  set: (to: string) => void navigateTo(to),
})
</script>

<template>
  <TabStrip
    v-if="items.length > 1"
    class="mb-4"
  >
    <UTabs
      v-model="current"
      :items="items"
      :content="false"
      variant="link"
      :aria-label="t('bar.screens.stock-tabs.label')"
      :ui="{ list: 'overflow-x-auto overflow-y-hidden [scrollbar-width:none]', trigger: 'shrink-0', label: 'whitespace-nowrap overflow-visible' }"
    />
  </TabStrip>
</template>
