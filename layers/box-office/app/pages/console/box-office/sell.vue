<!-- Sell (Box office specification, part 5, "Console shell: box office"): the desk. It is Payments'
     till narrowed to Box office's panel; the combined till in live mode sells tickets and anything
     else in one payment. -->
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
    <PaymentsTill
      :modules="['box-office']"
      @settled="settled"
    />
  </PageFrame>
</template>
