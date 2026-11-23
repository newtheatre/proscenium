<!-- Sell (Box office specification, part 5, "Console shell: box office"): the desk. It is Payments'
     till narrowed to Box office's panel; the combined till in live mode sells tickets and anything
     else in one payment. The till says when a sale is paid. -->
<script setup lang="ts">
const { t } = useT()
// On a phone the console's frame leaves the till little room, so Sell opens the live till, tickets only.
const { $api } = useNuxtApp()
onMounted(async () => {
  if (!window.matchMedia('(max-width: 639px)').matches) return // not-policy: the phone breakpoint
  const to = '/live/till?only=box-office'
  const access = await $api<{ decision: string }>('/api/core/access', { query: { path: '/live/till' } }).catch(() => null)
  if (access?.decision === 'allow') await navigateTo(to, { replace: true })
})
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
