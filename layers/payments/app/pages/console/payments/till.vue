<!-- The till on its own (Box office specification, part 4): every panel the seller may use, for a
     theatre that sells at the desk without a box office, such as a bar. Box office's Sell screen is
     the same till with its own panel first. -->
<script setup lang="ts">
const { t } = useT()
</script>

<template>
  <PageFrame
    :title="t('payments.navigation.till.label')"
    :description="t('payments.screens.till.description')"
    width="full"
  >
    <PaymentsTill />
  </PageFrame>
</template>
