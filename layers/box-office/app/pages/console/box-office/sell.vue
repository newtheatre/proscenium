<!-- Sell (Box office specification, part 5, "Console shell: box office"): the desk. It is Payments'
     till with Box office's panel first, so tickets and anything else sold at the desk are one payment. -->
<script setup lang="ts">
const { t } = useT()
const { money } = await useMoney()
const toast = useToast()

function settled(sale: { intentId: string, amountMinor: number }) {
  toast.add({ title: t('box-office.screens.sell.sold', { amount: money(sale.amountMinor) }), color: 'success' })
}
</script>

<template>
  <PageFrame
    :title="t('box-office.navigation.sell.label')"
    :description="t('box-office.screens.sell.description')"
    width="full"
  >
    <PaymentsTill @settled="settled" />
  </PageFrame>
</template>
