<!-- Sell (Box office specification, part 5, "Console shell: box office"): the desk. It is Payments'
     till narrowed to Box office's panel; the combined till in live mode sells tickets and anything
     else in one payment. The till says when a sale is paid. -->
<script setup lang="ts">
const { t } = useT()
</script>

<template>
  <PageFrame
    :title="t('box-office.navigation.sell.label')"
    :description="t('box-office.screens.sell.description')"
    width="full"
  >
    <PaymentsTill :modules="['box-office']" />
  </PageFrame>
</template>
