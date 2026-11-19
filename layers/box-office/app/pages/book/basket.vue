<!-- Check and pay, as a page of its own (BoxOfficeCheckout): where Choose tickets on its own page
     goes, and where a card payment on the provider's page comes back to. -->
<script setup lang="ts">
definePageMeta({ key: 'box-office-basket' })
const { t } = useT()
const title = ref(t('box-office.basket.title'))
useSeoMeta({ title: () => title.value, robots: 'noindex' })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader :title="title" />
      <UPageBody>
        <BoxOfficeCheckout
          class="max-w-2xl"
          @title="title = $event"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
