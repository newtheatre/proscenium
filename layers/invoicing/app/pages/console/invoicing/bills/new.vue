<!-- Logging a supplier's bill (IE-19). Saving keeps it as a draft, where the supplier's file is
     attached before it is submitted. -->
<script setup lang="ts">
import type { BillBody, BillChoices } from '../../../../composables/useBillDraft'

const { t } = useT()
const { $api } = useNuxtApp()
const { data: settings } = usePublicSettings()
const currency = computed(() => (settings.value?.['core.locale.currency']?.value as string | undefined) ?? 'GBP')
const { data, status, error, refresh } = await useAPI<{ choices: BillChoices }>('/api/invoicing/bills/new', { key: 'invoicing:bill-choices' })
const idempotency = crypto.randomUUID()

async function submit(body: BillBody) {
  const made = await $api<{ billId: string }>('/api/invoicing/bills', { method: 'POST', headers: { 'idempotency-key': idempotency }, body })
  await navigateTo(`/console/invoicing/bills/${made.billId}`)
}
</script>

<template>
  <PageFrame
    :title="t('invoicing.screens.bills.new')"
    :trail="[{ label: t('invoicing.navigation.bills.label'), to: '/console/invoicing/bills' }]"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="data && !data.choices.accounts.length"
        icon="i-lucide-book-open"
        :title="t('invoicing.screens.bill.no-accounts')"
        :description="t('invoicing.screens.bill.no-accounts-help')"
      />
      <InvoicingBillEditor
        v-else-if="data"
        :choices="data.choices"
        :currency="currency"
        :save-label="t('invoicing.screens.bill.save-new')"
        :submit="submit"
      />
    </DataBoundary>
  </PageFrame>
</template>
