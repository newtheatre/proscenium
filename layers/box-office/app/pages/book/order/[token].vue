<!-- Manage booking (Box office specification, part 6; R-2): the page the link in every booking
     message opens, with no sign-in. It leads with the performance, then the tickets, each with its
     code to be scanned at the door (a reservation shows its box office code instead), and what is
     still to pay. Free tickets can be handed back here until the performance starts. A reservation can be cancelled here, whole or some of its tickets, and the seats go
     back on sale at once. A paid booking can be cancelled here too when the theatre allows it and the
     cut-off has not passed, and the price less the fee goes back to the card; otherwise the box
     office changes it. Nothing about the buyer is shown, since anyone holding the link sees this page.
     The signed-in owner opens the same page from My tickets, by the order's id. -->
<script setup lang="ts">
import type { BookingView } from '../../../utils/booking'

type Order = BookingView

definePageMeta({ key: 'box-office-manage-booking' })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { dateTime } = useDates()
const { money } = await useMoney()
const route = useRoute()
const { viewer } = useViewer()
const token = computed(() => String(route.params.token))
// /book/order/mine?order=<id> is the same page for the signed-in owner, from My tickets: the booking
// is found by its id and their account, since only the link's hash is kept. A link token is never
// "mine", which is too short to be one.
const ownerOrder = computed(() => token.value === 'mine' ? String(route.query.order ?? '') : null)
useSeoMeta({ title: () => t('box-office.manage.title'), robots: 'noindex' })

const headers = computed((): Record<string, string> => ownerOrder.value !== null ? { 'x-order-id': ownerOrder.value } : { 'x-order-token': token.value })
const { data: order, error } = await useAPI<Order>('/api/box-office/orders/link', { key: `box-office:manage:${ownerOrder.value ?? token.value}`, headers })
const kindOf = bookingLineName
const reserved = computed(() => order.value?.state === 'reserved')
// The buyer's own cancellation of what they paid for, on the theatre's terms.
const terms = computed(() => order.value?.state === 'confirmed' ? order.value.buyerCancel : null)
const cancellable = computed(() => !!order.value?.lines.length && (reserved.value || !!terms.value))
// Free tickets are handed back, not refunded.
const free = computed(() => order.value?.state === 'confirmed' && order.value.totalMinor === 0)
const words = computed(() => terms.value ? (free.value ? 'free' : 'refund') : 'cancel')
const refunded = ref<number | null>(null)

function refundFor(ids: string[]) {
  const fee = terms.value?.feeMinor ?? 0
  return (order.value?.lines ?? []).filter(l => ids.includes(l.id)).reduce((sum, l) => sum + l.amountMinor - Math.min(fee, l.amountMinor), 0)
}
const chosen = ref<string[]>([])
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
const cancelled = ref<number | null>(null)

function toggle(id: string, on: boolean | 'indeterminate') {
  chosen.value = on === true ? [...chosen.value, id] : chosen.value.filter(x => x !== id)
}

async function cancel(all: boolean) {
  if (!order.value) return
  const ids = all ? order.value.lines.map(l => l.id) : chosen.value
  const count = ids.length
  const paid = !!terms.value && !free.value
  const back = paid ? refundFor(ids) : 0
  const ok = await confirm({
    verb: t('box-office.manage.cancel.verb'),
    thing: t(`box-office.manage.${words.value}.thing`, { count }),
    consequence: paid
      ? t('box-office.manage.refund.consequence', { amount: money(back, order.value.currency) })
      : t('box-office.manage.cancel.consequence'),
    button: t('box-office.manage.cancel.button', { count }),
  })
  if (!ok) return
  refusal.value = null
  busy.value = true
  try {
    order.value = await $api<Order>('/api/box-office/orders/link/cancel', { method: 'POST', body: all ? {} : { lineIds: chosen.value }, headers: { ...headers.value, 'idempotency-key': crypto.randomUUID() } })
    cancelled.value = count
    refunded.value = back > 0 ? back : null
    chosen.value = []
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
      <UPageHeader :title="t('box-office.manage.title')" />
      <UPageBody>
        <div class="max-w-2xl space-y-6">
          <EmptyState
            v-if="error || !order"
            :title="t('box-office.manage.not-found.title')"
            :description="t('box-office.manage.not-found.description')"
            icon="i-lucide-ticket-x"
          />
          <template v-else>
            <UAlert
              v-if="cancelled"
              color="success"
              variant="subtle"
              icon="i-lucide-check"
              role="status"
              :title="t('box-office.manage.cancelled', { count: cancelled })"
              :description="refunded ? t('box-office.manage.refunded', { amount: money(refunded, order.currency) }) : undefined"
            />
            <BoxOfficeBookingDetails :booking="order" />
            <BoxOfficeAccountCard
              v-if="order.accountUnclaimed && !viewer.signedIn && ownerOrder === null"
              :order-token="token"
            />

            <section
              v-if="cancellable"
              class="space-y-4"
            >
              <h2 class="text-lg font-semibold">
                {{ t('box-office.manage.cancel.title') }}
              </h2>
              <p
                v-if="terms"
                class="text-sm text-muted"
              >
                {{ free ? t('box-office.manage.free.terms', { until: dateTime(terms.until) }) : terms.feeMinor > 0
                  ? t('box-office.manage.refund.terms', { until: dateTime(terms.until), fee: money(terms.feeMinor, order.currency) })
                  : t('box-office.manage.refund.terms-free', { until: dateTime(terms.until) }) }}
              </p>
              <RefusalNotice :refusal="refusal" />
              <fieldset
                v-if="order.lines.length > 1"
                class="space-y-2"
              >
                <legend class="mb-2 text-sm">
                  {{ t(`box-office.manage.${words}.some`) }}
                </legend>
                <UCheckbox
                  v-for="(line, i) in order.lines"
                  :key="line.id"
                  :model-value="chosen.includes(line.id)"
                  :label="t(kindOf(line) ? 'box-office.manage.cancel.line' : 'box-office.manage.cancel.line-plain', { n: i + 1, type: kindOf(line), price: line.amountMinor === 0 ? t('box-office.manage.free-price') : money(line.amountMinor, order.currency) })"
                  @update:model-value="toggle(line.id, $event)"
                />
              </fieldset>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-if="order.lines.length > 1"
                  color="error"
                  variant="outline"
                  :loading="busy"
                  :disabled="!chosen.length || chosen.length === order.lines.length"
                  :label="chosen.length ? t('box-office.manage.cancel.button', { count: chosen.length }) : t('box-office.manage.cancel.none')"
                  @click="cancel(false)"
                />
                <UButton
                  color="error"
                  variant="outline"
                  :loading="busy"
                  :label="t(`box-office.manage.${words}.all`)"
                  @click="cancel(true)"
                />
              </div>
            </section>
            <p
              v-else-if="order.state === 'confirmed'"
              class="text-sm text-muted"
            >
              {{ t('box-office.manage.paid-help') }}
            </p>
          </template>
        </div>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
