<!-- Thank you (P4, FR-08): the gift by its link. Back from paying, the page asks whether the money
     arrived; once it has, the reference, amount, fund and date. A payment that did not complete
     sends the donor back to try again. -->
<script setup lang="ts">
interface Thanks { state: 'pending' | 'received' | 'abandoned' | 'refunded', reference: string | null, amountMinor: number, currency: string, fund: string, receivedOn: string | null }

definePageMeta({ key: 'fundraising-thanks' })
const { t } = useT()
const { $api } = useNuxtApp()
const { money } = useMoneyText()
const { dayLong } = useDates()
const route = useRoute()
const token = computed(() => String(route.params.token))
const path = computed(() => `/api/fundraising/give/${encodeURIComponent(token.value)}`)
const { data, status, error, refresh } = await useAPI<Thanks>(() => path.value, { key: `fundraising:thanks:${token.value}` })
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }, { name: 'robots', content: 'noindex' }] })
useSeoMeta({ title: () => t('fundraising.thanks.title') })

const asking = ref(false)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
onMounted(async () => {
  if (data.value?.state !== 'pending' || route.query.redirect_status === 'failed') return
  asking.value = true
  try {
    for (let i = 0; i < 8 && data.value?.state === 'pending'; i++) { // not-policy: a few seconds of asking
      await $api(`${path.value}/check` as string, { method: 'POST', body: {} })
      await refresh()
      if (data.value?.state === 'pending') await sleep(1500) // not-policy: between asks
    }
  }
  finally {
    asking.value = false
  }
})
</script>

<template>
  <PageFrame
    :title="t(data?.state === 'received' || data?.state === 'refunded' ? 'fundraising.thanks.title' : 'fundraising.thanks.waiting-title')"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: gift }">
        <div class="space-y-6">
          <template v-if="gift.state === 'received' || gift.state === 'refunded'">
            <p>{{ t('fundraising.thanks.body', { amount: money(gift.amountMinor, gift.currency), fund: gift.fund }) }}</p>
            <FactStrip
              :facts="[
                { label: t('fundraising.thanks.reference'), value: gift.reference ?? '' },
                { label: t('fundraising.thanks.amount'), value: money(gift.amountMinor, gift.currency) },
                { label: t('fundraising.thanks.date'), value: gift.receivedOn ? dayLong(gift.receivedOn) : '', strong: false },
              ]"
            />
          </template>
          <p
            v-else-if="gift.state === 'pending' && asking"
            class="flex items-center gap-2"
            role="status"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="animate-spin"
            />
            {{ t('fundraising.thanks.asking') }}
          </p>
          <p
            v-else-if="gift.state === 'pending'"
            role="status"
          >
            {{ t('fundraising.thanks.processing') }}
          </p>
          <template v-else>
            <p>{{ t('fundraising.thanks.not-completed') }}</p>
            <UButton
              to="/support/give"
              :label="t('fundraising.thanks.try-again')"
            />
          </template>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
