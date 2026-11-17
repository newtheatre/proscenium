<!-- Confirm your reservation (R-7): the link in the message sent to a buyer who reserved without
     signing in. Opening the link does nothing by itself, since mail scanners open links too; the
     buyer presses the button, and the reservation is made for the address the link was sent to. -->
<script setup lang="ts">
type Result
  = | { state: 'reserved', reference: string, token: string, deskCode: string, currency: string, amountDueMinor: number }
    | { state: 'confirmed', reference: string, currency: string, totalMinor: number }

definePageMeta({ key: 'box-office-confirm-reservation' })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { money } = await useMoney()
const route = useRoute()
useSeoMeta({ title: () => t('box-office.confirm.title'), robots: 'noindex' })

const result = ref<Result | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)

async function go() {
  refusal.value = null
  busy.value = true
  try {
    result.value = await $api<Result>('/api/box-office/reservations/confirm', { method: 'POST', body: { token: String(route.params.token) }, headers: { 'idempotency-key': crypto.randomUUID() } })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader :title="result ? t(`box-office.basket.done.${result.state}.title`) : t('box-office.confirm.title')" />
      <UPageBody>
        <div class="max-w-2xl space-y-6">
          <template v-if="result?.state === 'reserved'">
            <p>{{ t('box-office.basket.done.reserved.body', { amount: money(result.amountDueMinor, result.currency) }) }}</p>
            <p class="text-lg">
              {{ t('box-office.basket.reference', { reference: result.reference }) }}
            </p>
            <p class="text-lg">
              {{ t('box-office.basket.desk-code', { code: result.deskCode }) }}
            </p>
            <QrCode
              :value="result.deskCode"
              :label="t('box-office.basket.desk-code-qr')"
            />
            <p class="text-sm text-muted">
              {{ t('box-office.basket.done.reserved.note') }}
            </p>
            <UButton
              :to="`/book/order/${result.token}`"
              variant="outline"
              color="neutral"
              :label="t('box-office.manage.open')"
            />
          </template>
          <template v-else-if="result">
            <p>{{ t('box-office.basket.done.confirmed.body') }}</p>
            <p class="text-lg">
              {{ t('box-office.basket.reference', { reference: result.reference }) }}
            </p>
          </template>
          <template v-else>
            <p>{{ t('box-office.confirm.body') }}</p>
            <RefusalNotice :refusal="refusal" />
            <UButton
              size="lg"
              :loading="busy"
              :label="t('box-office.confirm.button')"
              @click="go"
            />
          </template>
        </div>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
