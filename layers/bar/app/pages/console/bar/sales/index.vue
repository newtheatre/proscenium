<!-- Bar sales (S3): newest first, found by reference, filtered by outlet, opening, state and whether
     refunded, all kept in the address. A row opens the sale. A table on a laptop, a list on a phone.
     Above them, for someone who may close an outlet, what is trading now (S5): closing voids the sales
     left unpaid, and waits while a payment is still being taken. -->
<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'

type State = 'open' | 'awaiting_payment' | 'paid' | 'void'
interface Opening { id: string, outlet: string, operatingDay: string, state: 'open' | 'closed', openedAt: number, closedAt: number | null, paidMinor: number, sales: number, waiting: number, unpaid: number }
interface Row { reference: string, at: number, outlet: string, items: number, totalMinor: number, refundedMinor: number, state: State }

const { t } = useT()
const route = useRoute()
const router = useRouter()
const { money } = await useMoney()
const { dateTime, day, time } = useDates()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()

const ALL = 'all'
const param = (key: string) => computed({
  get: () => (route.query[key] as string | undefined) ?? ALL,
  set: (v: string) => void router.replace({ query: { ...route.query, [key]: v === ALL ? undefined : v } }),
})
const outlet = param('outlet')
const state = param('state')
const refunded = param('refunded')
const opening = param('opening')
const search = ref((route.query.q as string | undefined) ?? '')
watchDebounced(search, v => void router.replace({ query: { ...route.query, q: v.trim() || undefined } }), { debounce: 300 })
const query = computed(() => ({
  q: (route.query.q as string | undefined) || undefined,
  outlet: outlet.value === ALL ? undefined : outlet.value,
  state: state.value === ALL ? undefined : state.value,
  refunded: refunded.value === ALL ? undefined : refunded.value,
  opening: opening.value === ALL ? undefined : opening.value,
}))
const { data, status, error, refresh } = await useAPI<{ rows: Row[], outlets: { id: string, name: string }[], openings: Opening[] }>('/api/bar/sales', { key: 'bar:sales', query })
// Someone who may close an outlet but not read its sales still finds the openings here.
const closerOnly = computed(() => (error.value as { statusCode?: number } | null)?.statusCode === 403)
const { data: alone, refresh: refreshAlone } = await useAPI<{ openings: Opening[] }>('/api/bar/openings', { key: 'bar:openings', immediate: closerOnly.value })
const openings = computed(() => closerOnly.value ? alone.value?.openings ?? [] : data.value?.openings ?? [])
const trading = computed(() => openings.value.filter(o => o.state === 'open'))
const chosen = computed(() => openings.value.find(o => o.id === opening.value))
const openingName = (o: Opening) => t('bar.screens.openings.name', { outlet: o.outlet, day: day(o.operatingDay) })
const describe = (o: Opening) => [
  t('bar.screens.openings.takings', { amount: money(o.paidMinor), count: o.sales }),
  o.state === 'open' ? t('bar.screens.openings.since', { time: time(o.openedAt) }) : t('bar.screens.openings.closed-at', { time: time(o.closedAt!) }),
].join(' · ')
async function close(o: Opening) {
  const ok = await confirm({
    verb: t('bar.screens.openings.close'),
    thing: o.outlet,
    consequence: o.unpaid ? t('bar.screens.openings.close-voids', { count: o.unpaid }) : t('bar.screens.openings.close-plain'),
    button: t('bar.screens.openings.close-title', { outlet: o.outlet }),
  })
  if (!ok) return
  try {
    await $api(`/api/bar/openings/${o.id}/close` as string, { method: 'POST', body: {} })
    toast.add({ title: t('bar.screens.openings.closed', { outlet: o.outlet }), color: 'success' })
    await (closerOnly.value ? refreshAlone() : refresh())
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, description: toRefusal(e).remedy, color: 'error' })
  }
}

const states: State[] = ['paid', 'awaiting_payment', 'open', 'void']
const stateLabel = (s: State) => t(`bar.screens.sales.state.${s}`)
const tone = (s: State) => s === 'paid' ? 'success' as const : s === 'void' ? 'neutral' as const : 'warning' as const
const outletItems = computed(() => [{ value: ALL, label: t('bar.screens.sales.every-outlet') }, ...(data.value?.outlets ?? []).map(o => ({ value: o.id, label: o.name }))])
const stateItems = computed(() => [{ value: ALL, label: t('bar.screens.sales.every-state') }, ...states.map(s => ({ value: s, label: stateLabel(s) }))])
const openingItems = computed(() => [{ value: ALL, label: t('bar.screens.sales.every-opening') }, ...openings.value.map(o => ({ value: o.id, label: openingName(o) }))])
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
    <RecordList
      v-if="closerOnly ? openings.length : trading.length"
      :label="t('bar.screens.openings.trading')"
      class="mb-6"
    >
      <RecordListItem
        v-for="o in (closerOnly ? openings : trading)"
        :key="o.id"
        :name="closerOnly ? openingName(o) : o.outlet"
        :description="describe(o)"
        :muted="o.state === 'closed'"
      >
        <StatusBadge
          :tone="o.state === 'open' ? 'success' : 'neutral'"
          :label="t(`bar.screens.openings.states.${o.state}`)"
        />
        <UButton
          v-if="o.state === 'open'"
          color="neutral"
          variant="outline"
          size="sm"
          :label="t('bar.screens.openings.close-title', { outlet: o.outlet })"
          :disabled="o.waiting > 0"
          @click="close(o)"
        />
      </RecordListItem>
    </RecordList>
    <EmptyState
      v-if="closerOnly && !openings.length"
      icon="i-lucide-clock"
      :title="t('bar.screens.openings.empty-title')"
      :description="t('bar.screens.openings.empty')"
    />
    <div
      v-if="!closerOnly"
      :class="['mb-6 grid grid-cols-2 gap-4', openings.length ? 'sm:grid-cols-5' : 'sm:grid-cols-4']"
    >
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
      <UFormField
        v-if="openings.length"
        :label="t('bar.screens.sales.opening')"
      >
        <USelect
          v-model="opening"
          :items="openingItems"
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
        :class="openings.length ? '' : 'max-sm:col-span-2'"
      >
        <USelect
          v-model="refunded"
          :items="refundedItems"
        />
      </UFormField>
    </div>
    <p
      v-if="chosen"
      class="mb-4 text-sm text-muted"
    >
      {{ openingName(chosen) }}: {{ describe(chosen) }}
    </p>
    <DataBoundary
      v-if="!closerOnly"
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
        <TableOrList
          v-if="d.rows.length"
          :rows="d.rows"
          :columns="columns"
          :label="t('bar.navigation.sales.label')"
          :to="(r: Row) => `/console/bar/sales/${r.reference}`"
        >
          <template #item="{ row: r }">
            <RecordListItem
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
          </template>
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
        </TableOrList>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
