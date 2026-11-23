<!-- Check and pay on an address of its own (BoxOfficeCheckout): where a card payment on the
     provider's page comes back to, and where "Tickets held" in the header leads. Booking itself
     does both steps on the performance's page or in the drawer. -->
<script setup lang="ts">
definePageMeta({ key: 'box-office-basket' })
const { t } = useT()
const title = ref(t('box-office.basket.title'))
useSeoMeta({ title: () => title.value, robots: 'noindex' })
</script>

<template>
  <PageFrame :title="title">
    <BoxOfficeCheckout
      class="max-w-2xl"
      @title="title = $event"
    />
  </PageFrame>
</template>
