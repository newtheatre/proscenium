<!-- Pay (tab 5, "Pay"; rules A2, P3): the fee for the person's own application, paid online. Pay
     opens the payment and starts it with the online provider: its card form on this page, or its own
     page and back. Coming back, the page asks whether the money arrived, and the membership starts
     when it has. Nobody is asked to pay while the theatre is still checking the application. -->
<script setup lang="ts">
interface Pay { membershipId: string, schemeName: string, state: 'to-pay' | 'checking' | 'paid' | 'closed', amountMinor: number | null, currency: string | null, expiresAt: number | null, online: boolean }
interface CardStep { kind: 'client-secret', provider: string, secret: string, publishableKey: string }

const route = useRoute()
const id = computed(() => String(route.params.id))
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const { data, status, error, refresh } = await useAPI<Pay>(() => `/api/membership-fees/mine/${id.value}`, { key: `membership-fees:pay:${id.value}` })
useSeoMeta({ title: () => t('membership-fees.pay.title'), robots: 'noindex' })

const amount = computed(() => data.value?.amountMinor && data.value.currency ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: data.value.currency }).format(data.value.amountMinor / 100) : '') // not-policy: minor units to units
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const card = ref<CardStep | null>(null)
const checking = ref(false)
const processing = ref(false)
const returnUrl = ref('')
onMounted(() => {
  returnUrl.value = `${window.location.origin}/account/membership/${id.value}/pay`
  // Back from the bank's own page: ask whether the money arrived, unless the bank said no.
  if (route.query.redirect_status === 'failed') refusal.value = { code: 'membership-fees.pay.card-failed', reason: t('membership-fees.pay.card-failed') } as ReturnType<typeof toRefusal>
  else if (route.query.redirect_status) void settle()
})

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
/** Asks, a few times over a few seconds, whether the payment has settled. */
async function settle() {
  checking.value = true
  refusal.value = null
  try {
    for (let i = 0; i < 8; i++) {
      await $api(`/api/membership-fees/mine/${id.value}/check` as string, { method: 'POST', body: {} })
      await refresh()
      if (data.value?.state !== 'to-pay') return
      await sleep(1500)
    }
    processing.value = true
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    checking.value = false
  }
}

async function pay() {
  refusal.value = null
  try {
    await $api(`/api/membership-fees/mine/${id.value}/checkout` as string, { method: 'POST', body: {} })
    const next = await $api<{ next: { kind: string, url?: string }, settled: boolean }>(`/api/membership-fees/mine/${id.value}/pay` as string, { method: 'POST', body: {}, headers: { 'idempotency-key': crypto.randomUUID() } })
    if (next.next.kind === 'client-secret') {
      card.value = next.next as unknown as CardStep
      return
    }
    if ((next.next.kind === 'redirect' || next.next.kind === 'handoff') && next.next.url) return navigateTo(next.next.url, { external: true })
    if (next.settled) return settle()
    refusal.value = { code: 'membership-fees.pay.unavailable', reason: t('membership-fees.pay.unavailable') } as ReturnType<typeof toRefusal>
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="t('membership-fees.pay.title')"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data"
        class="space-y-6"
      >
        <PageSection :title="data.schemeName">
          <p v-if="data.state === 'paid'">
            {{ t('membership-fees.pay.paid', { scheme: data.schemeName }) }}
          </p>
          <p v-else-if="data.state === 'checking'">
            {{ t('membership-fees.pay.checking') }}
          </p>
          <p v-else-if="data.state === 'closed'">
            {{ t('membership-fees.pay.closed') }}
          </p>
          <template v-else>
            <p>{{ t('membership-fees.pay.amount', { amount }) }}</p>
            <p
              v-if="data.expiresAt"
              class="text-sm text-muted"
            >
              {{ t('membership-fees.pay.by', { date: day(new Date(data.expiresAt).toISOString().slice(0, 10)) }) }}
            </p>
          </template>
        </PageSection>

        <template v-if="data.state === 'to-pay'">
          <p
            v-if="checking"
            class="flex items-center gap-2"
            role="status"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="animate-spin"
            />
            {{ t('membership-fees.pay.asking') }}
          </p>
          <p
            v-else-if="processing"
            role="status"
          >
            {{ t('membership-fees.pay.processing') }}
          </p>
          <p
            v-else-if="!data.online"
            class="text-muted"
          >
            {{ t('membership-fees.pay.no-online') }}
          </p>
          <div
            v-else-if="card"
            class="space-y-4"
          >
            <RefusalNotice :refusal="refusal" />
            <PaymentsCardForm
              :next="card"
              :label="t('membership-fees.pay.button', { amount })"
              :return-url="returnUrl"
              @submitted="settle"
            />
          </div>
          <div
            v-else
            class="space-y-4"
          >
            <RefusalNotice :refusal="refusal" />
            <UButton
              :label="t('membership-fees.pay.button', { amount })"
              loading-auto
              @click="pay"
            />
          </div>
        </template>

        <UButton
          color="neutral"
          variant="link"
          to="/account/membership"
          :label="t('membership-fees.pay.back')"
        />
      </div>
    </DataBoundary>
  </PageFrame>
</template>
