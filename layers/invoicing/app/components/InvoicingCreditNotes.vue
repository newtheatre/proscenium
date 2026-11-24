<!-- The credit notes against an invoice, or the invoice a credit note is against. -->
<script setup lang="ts">
defineProps<{ notes: { id: string, number: string, totalMinor: number, issueOn: string }[], credits: { id: string, number: string } | null, currency: string }>()

const { t } = useT()
const { day } = useDates()
const text = useInvoiceText()
</script>

<template>
  <PageSection
    v-if="credits"
    :title="t('invoicing.screens.credit.against')"
  >
    <RecordList :label="t('invoicing.screens.credit.against')">
      <RecordListItem
        :to="`/console/invoicing/invoices/${credits.id}`"
        icon="i-lucide-receipt-text"
        :name="credits.number"
      />
    </RecordList>
  </PageSection>
  <PageSection
    v-if="notes.length"
    :title="t('invoicing.screens.credit.notes')"
  >
    <RecordList :label="t('invoicing.screens.credit.notes')">
      <RecordListItem
        v-for="n in notes"
        :key="n.id"
        :to="`/console/invoicing/invoices/${n.id}`"
        icon="i-lucide-receipt"
        :name="n.number"
        :description="day(n.issueOn)"
      >
        <span class="text-sm tabular-nums">{{ text.money(n.totalMinor, currency) }}</span>
      </RecordListItem>
    </RecordList>
  </PageSection>
</template>
