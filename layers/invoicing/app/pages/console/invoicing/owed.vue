<!-- Owed to us (IE-18, wireframe S5): each customer with open invoices, most overdue first, with what
     they owe in each ageing band; a row opens to their invoices. The bands' totals sit above. -->
<script setup lang="ts">
type Band = 'current' | '1-30' | '31-60' | '61-90' | 'over-90'
interface Debtor { key: string, name: string, owedMinor: number, daysOverdue: number, bands: Record<Band, number>, invoices: { id: string, number: string, dueOn: string, owedMinor: number, daysOverdue: number }[] }

const BANDS: Band[] = ['current', '1-30', '31-60', '61-90', 'over-90']
const { t } = useT()
const { day } = useDates()
const text = useInvoiceText()
const { data, status, error, refresh } = await useAPI<{ currency: string | null, totals: Record<Band, number>, debtors: Debtor[] }>('/api/invoicing/debtors', { key: 'invoicing:debtors' })
const money = (minor: number) => text.money(minor, data.value?.currency ?? 'GBP')
const facts = computed(() => BANDS.map(b => ({ label: t(`invoicing.screens.owed.bands.${b}`), value: money(data.value?.totals[b] ?? 0) })))
const describe = (d: Debtor) => [
  t('invoicing.screens.owed.count', { n: d.invoices.length }),
  text.overdue(d.daysOverdue),
].filter(Boolean).join(' · ')
const invoiceLine = (i: Debtor['invoices'][number]) => [t('invoicing.screens.invoices.due', { date: day(i.dueOn) }), text.overdue(i.daysOverdue)].filter(Boolean).join(' · ')
</script>

<template>
  <PageFrame
    :title="t('invoicing.navigation.owed.label')"
    :description="t('invoicing.screens.owed.help')"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.debtors.length"
        icon="i-lucide-hourglass"
        :title="t('invoicing.screens.owed.empty')"
      />
      <div
        v-else
        class="space-y-6"
      >
        <FactStrip
          :facts="facts"
          row
        />
        <RecordList :label="t('invoicing.navigation.owed.label')">
          <RecordListItem
            v-for="d in data.debtors"
            :key="d.key"
            icon="i-lucide-building-2"
            :name="d.name"
            :description="describe(d)"
            align="start"
          >
            <span class="text-sm tabular-nums">{{ money(d.owedMinor) }}</span>
            <template #below>
              <ul class="mt-2 space-y-1 text-sm">
                <li
                  v-for="i in d.invoices"
                  :key="i.id"
                >
                  <ULink :to="`/console/invoicing/invoices/${i.id}`">
                    {{ i.number }}
                  </ULink>
                  <span class="text-muted"> · {{ money(i.owedMinor) }} · {{ invoiceLine(i) }}</span>
                </li>
              </ul>
            </template>
          </RecordListItem>
        </RecordList>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
