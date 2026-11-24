<!-- A new draft invoice (IE-08). Saving keeps it as a draft to check before it is issued. -->
<script setup lang="ts">
import type { DraftBody, DraftChoices } from '../../../../composables/useInvoiceDraft'

const { t } = useT()
const { $api } = useNuxtApp()
const { data: settings } = usePublicSettings()
const currency = computed(() => (settings.value?.['core.locale.currency']?.value as string | undefined) ?? 'GBP')
const { data, status, error, refresh } = await useAPI<DraftChoices>('/api/invoicing/invoices/new', { key: 'invoicing:draft-choices' })
const idempotency = crypto.randomUUID()

async function submit(body: DraftBody) {
  const made = await $api<{ invoiceId: string }>('/api/invoicing/invoices', { method: 'POST', headers: { 'idempotency-key': idempotency }, body })
  await navigateTo(`/console/invoicing/invoices/${made.invoiceId}`)
}
</script>

<template>
  <PageFrame
    :title="t('invoicing.screens.new.title')"
    :trail="[{ label: t('invoicing.navigation.invoices.label'), to: '/console/invoicing/invoices' }]"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="data && !data.accounts.length"
        icon="i-lucide-book-open"
        :title="t('invoicing.screens.draft.no-accounts')"
        :description="t('invoicing.screens.draft.no-accounts-help')"
      />
      <InvoicingDraftEditor
        v-else-if="data"
        :choices="data"
        :currency="currency"
        :save-label="t('invoicing.screens.draft.save-new')"
        :submit="submit"
      />
    </DataBoundary>
  </PageFrame>
</template>
