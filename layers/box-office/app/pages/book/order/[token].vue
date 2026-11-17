<!-- Manage booking (Box office specification, part 6; R-2): the page the link in every booking
     message opens, with no sign-in. It shows the reference, the performance, the tickets and what is
     still to pay. A reservation can be cancelled here, whole or some of its tickets, and the seats go
     back on sale at once; a paid booking is changed by the box office. Nothing about the buyer is
     shown, since anyone holding the link sees this page. -->
<script setup lang="ts">
interface Order { orderId: string, reference: string, state: string, currency: string, totalMinor: number, amountDueMinor: number, releaseAt: number | null, lines: { id: string, performanceId: string, ticketType: string, amountMinor: number }[] }
interface Page { performance: { startsAt: number, venue: string }, production: { title: string } }

definePageMeta({ key: 'box-office-manage-booking' })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { dateTime } = useDates()
const { money } = await useMoney()
const route = useRoute()
const token = computed(() => String(route.params.token))
useSeoMeta({ title: () => t('box-office.manage.title'), robots: 'noindex' })

const headers = computed(() => ({ 'x-order-token': token.value }))
const { data: order, error } = await useAPI<Order>('/api/box-office/orders/link', { key: `box-office:manage:${token.value}`, headers })
const performanceId = computed(() => order.value?.lines[0]?.performanceId)
// A performance that has passed or been cancelled is not on the public pages: the booking still shows.
const { data: page } = await useAPI<Page>(() => `/api/box-office/book/performances/${encodeURIComponent(performanceId.value ?? '')}`, { key: `box-office:manage:page:${performanceId.value}`, immediate: !!performanceId.value })

const lines = computed(() => {
  const grouped = new Map<string, { label: string, count: number, amountMinor: number }>()
  for (const l of order.value?.lines ?? []) {
    const row = grouped.get(l.ticketType) ?? { label: l.ticketType, count: 0, amountMinor: 0 }
    row.count++
    row.amountMinor += l.amountMinor
    grouped.set(l.ticketType, row)
  }
  return [...grouped.values()]
})
const reserved = computed(() => order.value?.state === 'reserved')
const chosen = ref<string[]>([])
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
const cancelled = ref<number | null>(null)

function toggle(id: string, on: boolean | 'indeterminate') {
  chosen.value = on === true ? [...chosen.value, id] : chosen.value.filter(x => x !== id)
}

async function cancel(all: boolean) {
  if (!order.value) return
  const count = all ? order.value.lines.length : chosen.value.length
  const ok = await confirm({
    verb: t('box-office.manage.cancel.verb'),
    thing: t('box-office.manage.cancel.thing', { count }),
    consequence: t('box-office.manage.cancel.consequence'),
    button: t('box-office.manage.cancel.button', { count }),
  })
  if (!ok) return
  refusal.value = null
  busy.value = true
  try {
    order.value = await $api<Order>('/api/box-office/orders/link/cancel', { method: 'POST', body: all ? {} : { lineIds: chosen.value }, headers: { ...headers.value, 'idempotency-key': crypto.randomUUID() } })
    cancelled.value = count
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
            />
            <section class="space-y-2">
              <h2
                v-if="page"
                class="text-lg font-semibold"
              >
                {{ page.production.title }}
              </h2>
              <p
                v-if="page"
                class="text-sm text-muted"
              >
                {{ t('box-office.book.when', { when: dateTime(page.performance.startsAt), venue: page.performance.venue }) }}
              </p>
              <p class="text-lg">
                {{ t('box-office.basket.reference', { reference: order.reference }) }}
              </p>
              <UBadge
                color="neutral"
                variant="subtle"
                :label="t(`box-office.manage.state.${order.state}`)"
              />
              <ul
                v-if="lines.length"
                class="divide-y divide-default"
              >
                <li
                  v-for="line in lines"
                  :key="line.label"
                  class="flex justify-between py-2"
                >
                  <span>{{ t('box-office.basket.line', { count: line.count, label: line.label }) }}</span>
                  <span>{{ money(line.amountMinor, order.currency) }}</span>
                </li>
              </ul>
              <p
                v-if="order.amountDueMinor > 0"
                class="font-semibold"
              >
                {{ t('box-office.manage.due', { amount: money(order.amountDueMinor, order.currency) }) }}
              </p>
            </section>

            <section
              v-if="reserved && order.lines.length"
              class="space-y-4"
            >
              <h2 class="text-lg font-semibold">
                {{ t('box-office.manage.cancel.title') }}
              </h2>
              <RefusalNotice :refusal="refusal" />
              <fieldset
                v-if="order.lines.length > 1"
                class="space-y-2"
              >
                <legend class="mb-2 text-sm">
                  {{ t('box-office.manage.cancel.some') }}
                </legend>
                <UCheckbox
                  v-for="(line, i) in order.lines"
                  :key="line.id"
                  :model-value="chosen.includes(line.id)"
                  :label="t('box-office.manage.cancel.line', { n: i + 1, type: line.ticketType, price: money(line.amountMinor, order.currency) })"
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
                  :label="t('box-office.manage.cancel.button', { count: chosen.length || 0 })"
                  @click="cancel(false)"
                />
                <UButton
                  color="error"
                  variant="outline"
                  :loading="busy"
                  :label="t('box-office.manage.cancel.all')"
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
