<!-- Bar sales (S3): newest first, found by reference, filtered by outlet, state and whether refunded,
     all kept in the address. A row opens the sale. A table on a laptop, a list on a phone. -->
<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'

type State = 'open' | 'awaiting_payment' | 'paid' | 'void'
interface Row { reference: string, at: number, outlet: string, items: number, totalMinor: number, refundedMinor: number, state: State }

const { t } = useT()
const route = useRoute()
const router = useRouter()
const { money } = await useMoney()
const { dateTime } = useDates()

// Chosen by width after hydration, so one form is drawn and a field or a label is never there twice.
const phone = useScreenQuery('(max-width: 639px)')
const ALL = 'all'
const param = (key: string) => computed({
  get: () => (route.query[key] as string | undefined) ?? ALL,
  set: (v: string) => void router.replace({ query: { ...route.query, [key]: v === ALL ? undefined : v } }),
})
const outlet = param('outlet')
const state = param('state')
const refunded = param('refunded')
const search = ref((route.query.q as string | undefined) ?? '')
watchDebounced(search, v => void router.replace({ query: { ...route.query, q: v.trim() || undefined } }), { debounce: 300 })
const query = computed(() => ({
  q: (route.query.q as string | undefined) || undefined,
  outlet: outlet.value === ALL ? undefined : outlet.value,
  state: state.value === ALL ? undefined : state.value,
  refunded: refunded.value === ALL ? undefined : refunded.value,
}))
const { data, status, error, refresh } = await useAPI<{ rows: Row[], outlets: { id: string, name: string }[] }>('/api/bar/sales', { key: 'bar:sales', query })

const states: State[] = ['paid', 'awaiting_payment', 'open', 'void']
const stateLabel = (s: State) => t(`bar.screens.sales.state.${s}`)
const tone = (s: State) => s === 'paid' ? 'success' as const : s === 'void' ? 'neutral' as const : 'warning' as const
const outletItems = computed(() => [{ value: ALL, label: t('bar.screens.sales.every-outlet') }, ...(data.value?.outlets ?? []).map(o => ({ value: o.id, label: o.name }))])
const stateItems = computed(() => [{ value: ALL, label: t('bar.screens.sales.every-state') }, ...states.map(s => ({ value: s, label: stateLabel(s) }))])
const refundedItems = computed(() => [{ value: ALL, label: t('bar.screens.sales.any') }, { value: 'yes', label: t('bar.screens.sales.has-refund') }])
const columns = computed(() => [
  { id: 'reference', header: t('bar.screens.sales.reference') },
  { id: 'at', header: t('bar.screens.sales.when') },
  { accessorKey: 'outlet', header: t('bar.screens.sales.outlet') },
  { accessorKey: 'items', header: t('bar.screens.sales.items') },
  { id: 'total', header: t('bar.screens.sales.total') },
  { id: 'state', header: t('bar.screens.sales.state-heading') },
])
</script>

<template>
  <PageFrame :title="t('bar.navigation.sales.label')">
    <div class="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <UFormField
        :label="t('bar.screens.sales.find')"
        class="max-sm:col-span-2"
      >
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :placeholder="t('bar.screens.sales.find-placeholder')"
        />
      </UFormField>
      <UFormField :label="t('bar.screens.sales.outlet')">
        <USelect
          v-model="outlet"
          :items="outletItems"
        />
      </UFormField>
      <UFormField :label="t('bar.screens.sales.state-heading')">
        <USelect
          v-model="state"
          :items="stateItems"
        />
      </UFormField>
      <UFormField
        :label="t('bar.screens.sales.refunds')"
        class="max-sm:col-span-2"
      >
        <USelect
          v-model="refunded"
          :items="refundedItems"
        />
      </UFormField>
    </div>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <EmptyState
          v-if="!d.rows.length"
          :title="t('bar.screens.sales.empty.title')"
          :description="t('bar.screens.sales.empty.description')"
          icon="i-lucide-receipt"
        />
        <RecordList
          v-if="d.rows.length && phone"
          :label="t('bar.navigation.sales.label')"
        >
          <RecordListItem
            v-for="r in d.rows"
            :key="r.reference"
            :to="`/console/bar/sales/${r.reference}`"
            :name="r.reference"
            :description="[dateTime(r.at), r.outlet, r.state === 'paid' ? null : stateLabel(r.state)].filter(Boolean).join(' · ')"
          >
            <span class="text-right text-sm">
              <span class="block font-medium tabular-nums">{{ money(r.totalMinor) }}</span>
              <span
                v-if="r.refundedMinor"
                class="block text-muted"
              >{{ t('bar.screens.sales.refunded', { amount: money(r.refundedMinor) }) }}</span>
            </span>
          </RecordListItem>
        </RecordList>
        <UTable
          v-else-if="d.rows.length"
          :data="d.rows"
          :columns="columns"
          :caption="t('bar.navigation.sales.label')"
          :meta="{ class: { tr: 'cursor-pointer' } }"
          @select="(_event: Event, row: { original: Row }) => navigateTo(`/console/bar/sales/${row.original.reference}`)"
        >
          <template #reference-cell="{ row }">
            <ULink
              :to="`/console/bar/sales/${row.original.reference}`"
              class="font-medium"
            >
              {{ row.original.reference }}
            </ULink>
          </template>
          <template #at-cell="{ row }">
            {{ dateTime(row.original.at) }}
          </template>
          <template #total-cell="{ row }">
            {{ money(row.original.totalMinor) }}<span
              v-if="row.original.refundedMinor"
              class="text-muted"
            > · {{ t('bar.screens.sales.refunded', { amount: money(row.original.refundedMinor) }) }}</span>
          </template>
          <template #state-cell="{ row }">
            <StatusBadge
              :tone="tone(row.original.state)"
              :label="stateLabel(row.original.state)"
            />
          </template>
        </UTable>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
