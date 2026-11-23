<!-- The sales report (Box office specification, part 6, "Sales report"): for one production, tickets
     sold, reserved and complimentary, how many came in and the face value, by performance, then by
     ticket type and by channel. Complimentary tickets are counted apart and add nothing to face
     value. Someone who may export downloads it as CSV. -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console' })

interface PerformanceRow { id: string, label: string | null, startsAt: number, state: string, capacity: number, sold: number, reserved: number, complimentary: number, admitted: number, valueMinor: number }
interface Report {
  production: { id: string, title: string }
  currency: string
  performances: PerformanceRow[]
  byType: { ticketTypeId: string, name: string, kind: string, tickets: number, valueMinor: number }[]
  byChannel: { channel: string, tickets: number, valueMinor: number }[]
  totals: { sold: number, reserved: number, complimentary: number, admitted: number, valueMinor: number }
}

const { t } = useT()
const route = useRoute()
const router = useRouter()
const { money } = await useMoney()
const { dateTime } = useDates()

const productionId = computed({
  get: () => (route.query.productionId as string | undefined) ?? undefined,
  set: value => router.replace({ query: { ...route.query, productionId: value } }),
})
const { data, status, error, refresh } = await useAPI<{ productions: { id: string, title: string }[], report: Report, canExport: boolean }>(
  '/api/box-office/reports/sales', { query: computed(() => ({ productionId: productionId.value })), key: 'box-office:reports:sales' },
)
const chosen = computed({
  get: () => productionId.value ?? data.value?.report.production.id,
  set: (value) => { productionId.value = value },
})
const productionItems = computed(() => (data.value?.productions ?? []).map(p => ({ value: p.id, label: p.title })))

const right = { class: { th: 'text-right', td: 'text-right tabular-nums' } }
const totals = computed(() => data.value?.report.totals)
const currency = computed(() => data.value?.report.currency ?? 'GBP')
// Every footer cell says something: an empty string is drawn as nothing on the server but as an
// empty text node in the browser, which Vue reports as a hydration mismatch. Capacity totals too.
const capacity = computed(() => (data.value?.report.performances ?? []).reduce((sum, p) => sum + p.capacity, 0))
const count = (key: 'capacity' | 'sold' | 'reserved' | 'complimentary' | 'admitted', header: string): TableColumn<PerformanceRow> => ({
  accessorKey: key,
  header,
  footer: () => String(key === 'capacity' ? capacity.value : totals.value?.[key] ?? 0),
  meta: right,
})
const performanceColumns = computed<TableColumn<PerformanceRow>[]>(() => [
  { id: 'performance', header: t('box-office.reports.performance'), accessorFn: p => [p.label, dateTime(p.startsAt)].filter(Boolean).join(', '), footer: () => t('box-office.reports.total') },
  count('capacity', t('box-office.reports.capacity')),
  count('sold', t('box-office.reports.sold')),
  count('reserved', t('box-office.reports.reserved')),
  count('complimentary', t('box-office.reports.complimentary')),
  count('admitted', t('box-office.reports.admitted')),
  { id: 'value', header: t('box-office.reports.value'), accessorFn: p => money(p.valueMinor, currency.value), footer: () => money(totals.value?.valueMinor ?? 0, currency.value), meta: right },
])
const typeColumns = computed<TableColumn<Report['byType'][number]>[]>(() => [
  { accessorKey: 'name', header: t('box-office.reports.ticket-type') },
  { accessorKey: 'tickets', header: t('box-office.reports.tickets'), meta: right },
  { id: 'value', header: t('box-office.reports.value'), accessorFn: r => money(r.valueMinor, currency.value), meta: right },
])
const channelColumns = computed<TableColumn<Report['byChannel'][number]>[]>(() => [
  { id: 'channel', header: t('box-office.reports.channel'), accessorFn: r => t(`box-office.orders.channel.${r.channel}`) },
  { accessorKey: 'tickets', header: t('box-office.reports.tickets'), meta: right },
  { id: 'value', header: t('box-office.reports.value'), accessorFn: r => money(r.valueMinor, currency.value), meta: right },
])
const csv = computed(() => data.value ? `/api/box-office/reports/sales.csv?productionId=${encodeURIComponent(data.value.report.production.id)}` : undefined)
</script>

<template>
  <PageFrame
    :title="t('box-office.navigation.reports.label')"
    :description="t('box-office.reports.description')"
  >
    <template
      v-if="data?.canExport"
      #primary
    >
      <UButton
        :to="csv"
        external
        download
        :label="t('box-office.reports.export')"
        icon="i-lucide-download"
        color="neutral"
        variant="outline"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: loaded }">
        <div class="space-y-8">
          <UFormField :label="t('box-office.reports.production')">
            <USelectMenu
              v-model="chosen"
              class="sm:w-96"
              value-key="value"
              :items="productionItems"
            />
          </UFormField>
          <EmptyState
            v-if="!loaded.report.performances.length"
            :title="t('box-office.reports.empty.title')"
            :description="t('box-office.reports.empty.description')"
            icon="i-lucide-chart-column"
          />
          <template v-else>
            <UTable
              :data="loaded.report.performances"
              :columns="performanceColumns"
              :caption="t('box-office.reports.by-performance', { production: loaded.report.production.title })"
            />
            <PageSection
              v-if="loaded.report.byType.length"
              :title="t('box-office.reports.by-type')"
            >
              <UTable
                :data="loaded.report.byType"
                :columns="typeColumns"
                :caption="t('box-office.reports.by-type')"
              />
            </PageSection>
            <PageSection
              v-if="loaded.report.byChannel.length"
              :title="t('box-office.reports.by-channel')"
            >
              <UTable
                :data="loaded.report.byChannel"
                :columns="channelColumns"
                :caption="t('box-office.reports.by-channel')"
              />
            </PageSection>
            <p class="text-sm text-muted">
              {{ t('box-office.reports.how') }}
            </p>
          </template>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
