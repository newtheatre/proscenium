<!-- The combined till in live mode (selling proposal, 17 November 2026): the show-night screen, on a
     tablet at the box office counter or the bar. Every panel the seller may use, as tabs over one
     basket and one payment. Box office's Sell is the same till narrowed to tickets, in the console. -->
<script setup lang="ts">
const { t } = useT()
</script>

<template>
  <PageLive :title="t('payments.navigation.live-till.label')">
    <PaymentsTill live />
  </PageLive>
</template>
