<!-- Confirm your reservation (R-7): the link in the message sent to a buyer who reserved without
     signing in. Opening the link does nothing by itself, since mail scanners open links too; the
     buyer presses the button, and the reservation is made for the address the link was sent to. -->
<script setup lang="ts">
import type { BookingDoneOutcome } from '../../../utils/booking'

type Result = BookingDoneOutcome

definePageMeta({ key: 'box-office-confirm-reservation' })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
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
          <BoxOfficeBookingDone
            v-if="result"
            :outcome="result"
          />
          <template v-else>
            <p>{{ t('box-office.confirm.body') }}</p>
            <RefusalNotice :refusal="refusal" />
            <UButton
              size="xl"
              class="justify-center max-sm:w-full"
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
