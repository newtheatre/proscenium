<!-- Confirm your reservation (R-7): the link in the message sent to a buyer who reserved without
     signing in. Opening the link does nothing by itself, since mail scanners open links too; the
     buyer presses the button, and the reservation is made for the address the link was sent to. -->
<script setup lang="ts">
import type { BookingDoneOutcome } from '../../../utils/booking'

type Result = BookingDoneOutcome

definePageMeta({ key: 'box-office-confirm-reservation' })
const { t } = useT()
const { dateTime, time } = useDates()
const { money } = await useMoney()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const route = useRoute()
useSeoMeta({ title: () => t('box-office.confirm.title'), robots: 'noindex' })

// What the link is about to reserve, asked for with the token in a header so it stays out of addresses.
interface Waiting { show: string, startsAt: number, tickets: string, totalMinor: number, currency: string, email: string | null, expiresAt: number | null }
const waiting = ref<Waiting | null>(null)
onMounted(async () => {
  waiting.value = await $api<Waiting>('/api/box-office/reservations/confirm', { headers: { 'x-confirm-token': String(route.params.token) } }).catch(() => null)
})
const result = ref<Result | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function go() {
  refusal.value = null
  try {
    result.value = await $api<Result>('/api/box-office/reservations/confirm', { method: 'POST', body: { token: String(route.params.token) }, headers: { 'idempotency-key': crypto.randomUUID() } })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="result ? t(`box-office.basket.done.${result.state}.title`) : t('box-office.confirm.title')"
    width="reading"
  >
    <div class="space-y-6">
      <BoxOfficeBookingDone
        v-if="result"
        :outcome="result"
      />
      <template v-else>
        <PageSection
          v-if="waiting"
          :title="waiting.show"
          :description="dateTime(waiting.startsAt)"
        >
          <FactStrip
            :facts="[
              { label: t('box-office.confirm.tickets'), value: waiting.tickets },
              { label: t('box-office.confirm.to-pay'), value: waiting.totalMinor === 0 ? t('box-office.manage.free-price') : money(waiting.totalMinor, waiting.currency) },
            ]"
          />
          <p
            v-if="waiting.email"
            class="text-sm"
          >
            <span class="text-muted">{{ t('box-office.confirm.email') }}</span>
            <span class="ms-1 font-medium text-highlighted [overflow-wrap:anywhere]">{{ waiting.email }}</span>
          </p>
          <p
            v-if="waiting.expiresAt"
            class="text-sm text-muted"
          >
            {{ t('box-office.confirm.until', { until: time(waiting.expiresAt) }) }}
          </p>
        </PageSection>
        <p>{{ t('box-office.confirm.body') }}</p>
        <RefusalNotice :refusal="refusal" />
        <UButton
          size="xl"
          class="justify-center max-sm:w-full"
          loading-auto
          :label="t('box-office.confirm.button')"
          @click="go"
        />
      </template>
    </div>
  </PageFrame>
</template>
