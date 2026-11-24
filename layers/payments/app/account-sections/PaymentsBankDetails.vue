<!-- Payments' card on My account, shown only to somebody who has given bank details: which ones, masked. -->
<script setup lang="ts">
const props = defineProps<{ headingId: string }>()
const { t } = useT()
const { data } = await useAPI<{ payee: { held: boolean, initial: string | null, lastDigits: string | null } | null }>('/api/payments/payees/mine', { key: 'payments:payee:mine' })
</script>

<template>
  <AccountCard
    :heading-id="props.headingId"
    :title="t('payments.screens.bank-details.title')"
    :description="data?.payee?.held ? t('payments.screens.bank-details.masked', { initial: data.payee.initial ?? '', digits: data.payee.lastDigits ?? '' }) : t('payments.screens.bank-details.none')"
    to="/account/bank-details"
    icon="i-lucide-landmark"
  />
</template>
