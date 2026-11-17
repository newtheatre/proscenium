<!-- Bar › Sell: Payments' till with the bar's panel only. On show nights the combined till in live
     mode (/live/till) sells tickets and drinks on one payment. -->
<script setup lang="ts">
const { t } = useT()
</script>

<template>
  <PageFrame :title="t('bar.navigation.sell.label')">
    <PaymentsTill :modules="['bar']" />
  </PageFrame>
</template>
