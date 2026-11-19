<!-- What a buyer sees the moment a booking is made, free or reserved: what the server answered, then
     the booking itself from its link (production, when, where, tickets) with the codes to show. The
     card about opening an account appears only when the email really carries that link. -->
<script setup lang="ts">
import type { BookingDoneOutcome, BookingView } from '../utils/booking'

const props = defineProps<{ outcome: BookingDoneOutcome }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { viewer } = useViewer()

const booking = ref<BookingView | null>(null)
watch(() => props.outcome.token, async (token) => {
  booking.value = null
  if (!token) return
  booking.value = await $api<BookingView>('/api/box-office/orders/link', { headers: { 'x-order-token': token } }).catch(() => null)
}, { immediate: true })
</script>

<template>
  <div class="space-y-6">
    <p v-if="outcome.state === 'reserved' && outcome.amountDueMinor !== undefined">
      {{ t('box-office.basket.done.reserved.body', { amount: money(outcome.amountDueMinor, outcome.currency ?? booking?.currency) }) }}
    </p>
    <p v-else-if="outcome.state === 'confirmed'">
      {{ t(outcome.token ? 'box-office.booking.done.confirmed' : 'box-office.basket.done.confirmed.body') }}
    </p>
    <BoxOfficeBookingDetails
      v-if="booking"
      :booking="booking"
      :desk-code="outcome.deskCode"
    />
    <template v-else>
      <p class="text-lg">
        {{ t('box-office.basket.reference', { reference: outcome.reference }) }}
      </p>
      <template v-if="outcome.state === 'reserved' && outcome.deskCode">
        <p class="text-lg">
          {{ t('box-office.basket.desk-code', { code: outcome.deskCode }) }}
        </p>
        <BoxOfficeTicketCode
          class="max-w-sm"
          :value="outcome.deskCode"
          :title="t('box-office.basket.desk-code-qr')"
          :number="outcome.deskCode"
        />
      </template>
    </template>
    <BoxOfficeSendPasses
      v-if="booking?.passes && outcome.token"
      :passes="booking.passes"
      :headers="{ 'x-order-token': outcome.token }"
      @sent="booking = { ...booking!, passes: $event }"
    />
    <BoxOfficeAccountCard
      v-if="outcome.accountLinkSent && !viewer.signedIn"
      :order-token="outcome.token"
    />
    <UButton
      v-if="outcome.token"
      :to="`/book/order/${outcome.token}`"
      variant="outline"
      color="neutral"
      :label="t('box-office.manage.open')"
    />
  </div>
</template>
