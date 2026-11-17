<!-- Choose tickets (Box office specification, part 6; BO-10, BO-11): one performance's ticket types
     and prices in each part of the house, with steppers. The button says what it will do and what it
     costs; pressing it holds the seats, which is when the countdown starts, and goes on to Check and
     pay. A companion ticket needs a paid ticket with it. No count of seats is ever shown. -->
<script setup lang="ts">
interface TicketType { ticketTypeId: string, name: string, kind: string, proofNote: string | null, needsPaidTicket: boolean, amountMinor: number, most?: number, unmet?: string }
interface Page {
  performance: { id: string, startsAt: number, venue: string, state: string }
  production: { id: string, slug: string, title: string, subtitle: string | null }
  state: 'none' | 'draft' | 'on_sale' | 'paused' | 'closed'
  onSaleAt: number | null
  currency: string | null
  maxPerOrder: number
  bands: { bandId: string, name: string, soldOut: boolean, types: TicketType[] }[]
}

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { dateTime } = useDates()
const { money } = await useMoney()
const route = useRoute()
const performanceId = computed(() => String(route.params.performance))

const { data, error } = await useAPI<Page>(() => `/api/box-office/book/performances/${encodeURIComponent(performanceId.value)}`, { key: `box-office:book:${performanceId.value}` })
if (error.value || !data.value) throw createError({ statusCode: 404, statusMessage: t('box-office.book.not-found'), fatal: true })
// The production's address may have changed since the link was made: go to the current one.
if (data.value.production.slug !== route.params.production)
  await navigateTo(`/book/${data.value.production.slug}/${data.value.performance.id}`, { replace: true, redirectCode: 301 })
useSeoMeta({ title: () => t('box-office.book.title', { title: data.value?.production.title ?? '' }), robots: 'noindex' })

const counts = ref<Record<string, number>>({})
const keyOf = (bandId: string, typeId: string) => `${bandId} ${typeId}`
const chosen = computed(() => (data.value?.bands ?? []).flatMap(b => b.types.map(type => ({ band: b, type, quantity: counts.value[keyOf(b.bandId, type.ticketTypeId)] ?? 0 }))).filter(c => c.quantity > 0))
const quantity = computed(() => chosen.value.reduce((sum, c) => sum + c.quantity, 0))
const totalMinor = computed(() => chosen.value.reduce((sum, c) => sum + c.quantity * c.type.amountMinor, 0))
const currency = computed(() => data.value?.currency ?? undefined)
const companionAlone = computed(() => chosen.value.length > 0 && chosen.value.every(c => c.type.needsPaidTicket))
const tooMany = computed(() => quantity.value > (data.value?.maxPerOrder ?? 0))
const siteKey = useRuntimeConfig().public.turnstile?.siteKey
const challenge = ref('')
const ready = computed(() => quantity.value > 0 && !companionAlone.value && !tooMany.value && (!siteKey || !!challenge.value))
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)

async function hold() {
  refusal.value = null
  busy.value = true
  try {
    const basket = await $api<{ orderId: string, token: string, expiresAt: number }>('/api/box-office/baskets', {
      method: 'POST',
      body: { performanceId: performanceId.value, lines: chosen.value.map(c => ({ bandId: c.band.bandId, ticketTypeId: c.type.ticketTypeId, quantity: c.quantity })) },
      headers: challenge.value ? { 'cf-turnstile-response': challenge.value } : {},
    })
    rememberBasket({ orderId: basket.orderId, token: basket.token, back: route.fullPath })
    await navigateTo('/book/basket')
  }
  catch (e) {
    refusal.value = toRefusal(e)
    challenge.value = ''
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UContainer v-if="data">
    <UPage>
      <UPageHeader
        :title="data.production.title"
        :description="t('box-office.book.when', { when: dateTime(data.performance.startsAt), venue: data.performance.venue })"
      />
      <UPageBody>
        <div class="max-w-2xl space-y-6">
          <UAlert
            v-if="data.state !== 'on_sale'"
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            :title="t(`box-office.book.state.${data.state}`, { when: data.onSaleAt ? dateTime(data.onSaleAt) : '' })"
          />
          <template v-else>
            <RefusalNotice :refusal="refusal" />
            <section
              v-for="band in data.bands"
              :key="band.bandId"
              class="space-y-3"
            >
              <h2 class="text-lg font-semibold">
                {{ band.name }}
              </h2>
              <p
                v-if="band.soldOut"
                class="text-sm text-muted"
              >
                {{ t('box-office.book.sold-out') }}
              </p>
              <template v-else>
                <UFormField
                  v-for="type in band.types"
                  :key="type.ticketTypeId"
                  :label="t('box-office.book.type', { type: type.name, price: money(type.amountMinor, currency) })"
                  :help="type.unmet ?? type.proofNote ?? (type.needsPaidTicket ? t('box-office.book.needs-paid') : undefined)"
                >
                  <UInputNumber
                    v-model="counts[keyOf(band.bandId, type.ticketTypeId)]"
                    :min="0"
                    :max="type.unmet ? 0 : Math.min(data.maxPerOrder, type.most ?? data.maxPerOrder)"
                    :disabled="!!type.unmet"
                    :default-value="0"
                  />
                </UFormField>
              </template>
            </section>
            <p
              v-if="companionAlone"
              class="text-sm text-error"
              role="alert"
            >
              {{ t('box-office.book.companion-alone') }}
            </p>
            <p
              v-if="tooMany"
              class="text-sm text-error"
              role="alert"
            >
              {{ t('box-office.book.too-many', { count: data.maxPerOrder }) }}
            </p>
            <TurnstileCheck @token="challenge = $event" />
            <UButton
              size="lg"
              :loading="busy"
              :disabled="!ready"
              :label="quantity ? t('box-office.book.hold', { count: quantity, total: money(totalMinor, currency) }) : t('box-office.book.choose')"
              @click="hold"
            />
          </template>
        </div>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
