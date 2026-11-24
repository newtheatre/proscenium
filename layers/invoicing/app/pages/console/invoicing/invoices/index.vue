<!-- Invoices (IE-08, wireframe S1): drafts first, then those still owed by when they fall due, with
     overdue beside the badge, then paid ones below a divider. -->
<script setup lang="ts">
import type { InvoiceShown } from '../../../../composables/useInvoiceText'

interface Row { id: string, number: string | null, billToName: string, issueOn: string | null, dueOn: string | null, totalMinor: number, allocatedMinor: number, state: string, currency: string, shown: InvoiceShown, overdueDays: number }

const { t } = useT()
const { day } = useDates()
const text = useInvoiceText()
const { data, status, error, refresh } = await useAPI<{ invoices: Row[], canDraft: boolean }>('/api/invoicing/invoices', { key: 'invoicing:invoices' })
const current = computed(() => (data.value?.invoices ?? []).filter(i => i.state !== 'closed'))
const paid = computed(() => (data.value?.invoices ?? []).filter(i => i.state === 'closed'))

const name = (i: Row) => i.number ? t('invoicing.screens.invoices.numbered', { number: i.number, name: i.billToName }) : (i.billToName || t('invoicing.screens.invoices.untitled'))
function describe(i: Row) {
  const owed = i.totalMinor - i.allocatedMinor
  return [
    text.money(i.totalMinor, i.currency),
    i.state === 'open' && i.allocatedMinor ? t('invoicing.screens.invoices.owed', { amount: text.money(owed, i.currency) }) : null,
    i.dueOn && i.state === 'open' ? t('invoicing.screens.invoices.due', { date: day(i.dueOn) }) : null,
    i.issueOn && i.state === 'closed' ? day(i.issueOn) : null,
  ].filter(Boolean).join(' · ')
}
</script>

<template>
  <PageFrame :title="t('invoicing.navigation.invoices.label')">
    <template #primary>
      <PageActions :actions="data?.canDraft ? [{ label: t('invoicing.screens.new.title'), icon: 'i-lucide-plus', to: '/console/invoicing/invoices/new' }] : []" />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.invoices.length"
        icon="i-lucide-receipt-text"
        :title="t('invoicing.screens.invoices.empty')"
        :description="t('invoicing.screens.invoices.empty-help')"
      />
      <div
        v-else
        class="space-y-4"
      >
        <RecordList
          v-if="current.length"
          :label="t('invoicing.navigation.invoices.label')"
        >
          <RecordListItem
            v-for="i in current"
            :key="i.id"
            :to="`/console/invoicing/invoices/${i.id}`"
            icon="i-lucide-receipt-text"
            :name="name(i)"
            :description="describe(i)"
          >
            <template #default>
              <StatusBadge
                v-if="text.overdue(i.overdueDays)"
                tone="danger"
                :label="text.overdue(i.overdueDays)!"
              />
              <StatusBadge
                v-else
                :tone="text.state(i.shown).tone"
                :label="text.state(i.shown).label"
              />
            </template>
          </RecordListItem>
        </RecordList>
        <CollapsibleDivider
          :label="t('invoicing.screens.invoices.paid')"
          :count="paid.length"
        >
          <RecordList :label="t('invoicing.screens.invoices.paid')">
            <RecordListItem
              v-for="i in paid"
              :key="i.id"
              :to="`/console/invoicing/invoices/${i.id}`"
              icon="i-lucide-receipt-text"
              :name="name(i)"
              :description="describe(i)"
              muted
            />
          </RecordList>
        </CollapsibleDivider>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
