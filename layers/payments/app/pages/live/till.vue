<!-- The combined till in live mode (selling proposal, 17 November 2026): the show-night screen, on a
     tablet at the box office counter or the bar. Every panel the seller may use, as tabs over one
     basket and one payment. Box office's Sell is the same till narrowed to tickets, in the console. -->
<script setup lang="ts">
const { t } = useT()
// Another screen may open the till narrowed to its own module, such as Box office's Sell on a phone.
const route = useRoute()
const only = computed(() => typeof route.query.only === 'string' && route.query.only ? route.query.only.split(',') : undefined)
</script>

<template>
  <PageLive :title="t('payments.navigation.live-till.label')">
    <PaymentsTill
      live
      :modules="only"
    />
  </PageLive>
</template>
