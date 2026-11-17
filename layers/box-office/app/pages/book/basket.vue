<!-- Check and pay (Box office specification, part 6; BO-10, BO-12, R-1, R-7): the seats held, the
     countdown, the lines and total, the buyer's details, then pay now or reserve and pay on arrival,
     as the theatre allows. The countdown is announced to screen readers at fixed points, not every
     second. When it runs out the seats are released and the buyer is offered to choose again. Once
     the booking is made, this page says what happened and forgets the basket. -->
<script setup lang="ts">
type Timing = 'pay-now' | 'reserve' | 'buyer-chooses'
interface Basket { orderId: string, reference: string, state: string, expiresAt: number | null, currency: string, totalMinor: number, lines: { id: string, performanceId: string, bandId: string, ticketTypeId: string, amountMinor: number }[] }
interface Page { performance: { startsAt: number, venue: string }, production: { title: string }, timing: Timing, bands: { bandId: string, name: string, types: { ticketTypeId: string, name: string }[] }[] }
type Outcome
  = | { state: 'confirmed', reference: string, totalMinor: number }
    | { state: 'reserved', reference: string, token: string, deskCode: string, amountDueMinor: number }
    | { state: 'confirm-email' }
    | { state: 'processing' }

interface CardStep { kind: 'client-secret', provider: string, secret: string, publishableKey: string }

definePageMeta({ key: 'box-office-basket' })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { dateTime, time } = useDates()
const { money } = await useMoney()
const { viewer } = useViewer()
const route = useRoute()
useSeoMeta({ title: () => t('box-office.basket.title'), robots: 'noindex' })

const remembered = ref<ReturnType<typeof recallBasket>>(null)
const basket = ref<Basket | null>(null)
const page = ref<Page | null>(null)
const loading = ref(true)
const outcome = ref<Outcome | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
// The card form, once the provider takes the card on this page; and whether we are asking if it paid.
const card = ref<CardStep | null>(null)
const checking = ref(false)
const returnUrl = ref('')
const form = ref({ name: '', email: '' })
const siteKey = useRuntimeConfig().public.turnstile?.siteKey
const challenge = ref('')
const headers = computed(() => ({ 'x-basket-token': remembered.value?.token ?? '', ...(challenge.value ? { 'cf-turnstile-response': challenge.value } : {}) }))

onMounted(async () => {
  remembered.value = recallBasket()
  if (remembered.value) {
    try {
      basket.value = await $api<Basket>(`/api/box-office/baskets/${encodeURIComponent(remembered.value.orderId)}`, { headers: { 'x-basket-token': remembered.value.token } })
      // Back from the provider's page with the payment made.
      if (basket.value.state === 'confirmed') done({ state: 'confirmed', reference: basket.value.reference, totalMinor: basket.value.totalMinor })
      // Back from the bank's own page: ask whether the money arrived, unless the bank said no.
      else if (basket.value.state === 'awaiting_payment' && route.query.redirect_status) {
        if (route.query.redirect_status === 'failed') refusal.value = { code: 'box-office.basket.card-failed', reason: t('box-office.basket.card-failed') } as ReturnType<typeof toRefusal>
        else void settle()
      }
      const performanceId = basket.value.lines[0]?.performanceId
      if (performanceId) page.value = await $api<Page>(`/api/box-office/book/performances/${encodeURIComponent(performanceId)}`)
    }
    catch {
      basket.value = null
    }
  }
  returnUrl.value = `${window.location.origin}/book/basket`
  loading.value = false
})

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Asks, a few times over a few seconds, whether the payment has settled. A slow bank is told it will be emailed. */
async function settle() {
  if (!basket.value || !remembered.value) return
  const { orderId } = basket.value
  const token = remembered.value.token
  checking.value = true
  refusal.value = null
  try {
    for (let i = 0; i < 8; i++) {
      const now: Basket = await $api<Basket>(`/api/box-office/baskets/${encodeURIComponent(orderId)}/check`, { method: 'POST', body: {}, headers: { 'x-basket-token': token } })
      basket.value = now
      if (now.state === 'confirmed') return done({ state: 'confirmed', reference: now.reference, totalMinor: now.totalMinor })
      if (now.state !== 'awaiting_payment') return
      await sleep(1500)
    }
    done({ state: 'processing' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    checking.value = false
  }
}

// The countdown: the seconds left, and a sentence for screen readers at fixed points only.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => clearInterval(timer))
const left = computed(() => basket.value?.expiresAt ? Math.max(0, Math.floor((basket.value.expiresAt - now.value) / 1000)) : 0)
const lapsed = computed(() => !!basket.value && !outcome.value && (!['basket', 'awaiting_payment'].includes(basket.value.state) || left.value === 0))
const clock = computed(() => `${Math.floor(left.value / 60)}:${String(left.value % 60).padStart(2, '0')}`)
const announced = computed(() => {
  const minutes = Math.ceil(left.value / 60)
  return [10, 5, 2, 1].includes(minutes) && left.value % 60 === 0 ? t('box-office.basket.left-minutes', { count: minutes }) : null
})
const spoken = ref('')
watch(announced, (v) => {
  if (v) spoken.value = v
})

const names = computed(() => new Map((page.value?.bands ?? []).flatMap(b => b.types.map(type => [`${b.bandId} ${type.ticketTypeId}`, `${b.name}, ${type.name}`]))))
const lines = computed(() => {
  const grouped = new Map<string, { label: string, count: number, amountMinor: number }>()
  for (const l of basket.value?.lines ?? []) {
    const key = `${l.bandId} ${l.ticketTypeId}`
    const row = grouped.get(key) ?? { label: names.value.get(key) ?? '', count: 0, amountMinor: 0 }
    row.count++
    row.amountMinor += l.amountMinor
    grouped.set(key, row)
  }
  return [...grouped.values()]
})
const free = computed(() => basket.value?.totalMinor === 0)
const canPay = computed(() => free.value || page.value?.timing !== 'reserve')
const canReserve = computed(() => !free.value && page.value?.timing !== 'pay-now' && basket.value?.state === 'basket')
const detailsNeeded = computed(() => !viewer.value.signedIn)
const ready = computed(() => (!detailsNeeded.value || /.+@.+\..+/.test(form.value.email.trim())) && (!siteKey || !!challenge.value))
const body = computed(() => ({ expectedTotalMinor: basket.value!.totalMinor, ...(detailsNeeded.value ? { email: form.value.email.trim(), name: form.value.name.trim() || undefined } : {}) }))

function done(result: Outcome) {
  outcome.value = result
  forgetBasket()
}

async function pay() {
  if (!basket.value || !remembered.value) return
  refusal.value = null
  busy.value = true
  try {
    // A buyer back from a payment that did not go through is already past checkout.
    if (basket.value.state === 'basket') {
      const started = await $api<{ state: 'awaiting_payment' | 'confirmed', reference?: string, totalMinor?: number, expiresAt?: number }>(`/api/box-office/baskets/${encodeURIComponent(basket.value.orderId)}/checkout`, { method: 'POST', body: body.value, headers: headers.value })
      if (started.state === 'confirmed') return done({ state: 'confirmed', reference: started.reference!, totalMinor: started.totalMinor ?? 0 })
      basket.value = { ...basket.value, state: 'awaiting_payment', expiresAt: started.expiresAt ?? basket.value.expiresAt }
    }
    const next = await $api<{ next: { kind: string, url?: string }, settled: boolean }>(`/api/box-office/baskets/${encodeURIComponent(basket.value.orderId)}/pay`, { method: 'POST', body: {}, headers: { 'x-basket-token': remembered.value.token, 'idempotency-key': crypto.randomUUID() } })
    if (next.next.kind === 'client-secret') {
      card.value = next.next as unknown as CardStep
      return
    }
    if ((next.next.kind === 'redirect' || next.next.kind === 'handoff') && next.next.url) return navigateTo(next.next.url, { external: true })
    if (next.settled) return done({ state: 'confirmed', reference: basket.value.reference, totalMinor: basket.value.totalMinor })
    refusal.value = { code: 'box-office.basket.pay-unavailable', reason: t('box-office.basket.pay-unavailable'), remedy: canReserve.value ? t('box-office.basket.pay-unavailable-reserve') : undefined } as ReturnType<typeof toRefusal>
  }
  catch (e) {
    refusal.value = toRefusal(e)
    challenge.value = ''
  }
  finally {
    busy.value = false
  }
}

async function reserve() {
  if (!basket.value) return
  refusal.value = null
  busy.value = true
  try {
    const result = await $api<Outcome & { reference?: string }>(`/api/box-office/baskets/${encodeURIComponent(basket.value.orderId)}/reserve`, { method: 'POST', body: body.value, headers: headers.value })
    done(result)
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
  <UContainer>
    <UPage>
      <UPageHeader :title="outcome ? t(`box-office.basket.done.${outcome.state}.title`) : t('box-office.basket.title')" />
      <UPageBody>
        <div class="max-w-2xl space-y-6">
          <p
            v-if="loading"
            class="text-muted"
          >
            {{ t('box-office.basket.loading') }}
          </p>

          <template v-else-if="outcome">
            <template v-if="outcome.state === 'confirmed'">
              <p>{{ t('box-office.basket.done.confirmed.body') }}</p>
              <p class="text-lg">
                {{ t('box-office.basket.reference', { reference: outcome.reference }) }}
              </p>
            </template>
            <template v-else-if="outcome.state === 'reserved'">
              <p>{{ t('box-office.basket.done.reserved.body', { amount: money(outcome.amountDueMinor, basket?.currency) }) }}</p>
              <p class="text-lg">
                {{ t('box-office.basket.reference', { reference: outcome.reference }) }}
              </p>
              <p class="text-lg">
                {{ t('box-office.basket.desk-code', { code: outcome.deskCode }) }}
              </p>
              <QrCode
                :value="outcome.deskCode"
                :label="t('box-office.basket.desk-code-qr')"
              />
              <p class="text-sm text-muted">
                {{ t('box-office.basket.done.reserved.note') }}
              </p>
              <UButton
                :to="`/book/order/${outcome.token}`"
                variant="outline"
                color="neutral"
                :label="t('box-office.manage.open')"
              />
            </template>
            <p v-else>
              {{ t(`box-office.basket.done.${outcome.state}.body`) }}
            </p>
          </template>

          <EmptyState
            v-else-if="!basket"
            :title="t('box-office.basket.none.title')"
            :description="t('box-office.basket.none.description')"
            icon="i-lucide-shopping-basket"
          />

          <template v-else-if="lapsed">
            <UAlert
              color="warning"
              variant="subtle"
              icon="i-lucide-timer-off"
              role="alert"
              :title="t('box-office.basket.lapsed.title')"
              :description="t('box-office.basket.lapsed.description')"
            />
            <UButton
              :to="remembered?.back ?? '/'"
              :label="t('box-office.basket.lapsed.again')"
            />
          </template>

          <template v-else>
            <p
              class="flex items-center gap-2 font-medium"
              role="timer"
            >
              <UIcon name="i-lucide-timer" />
              <span>{{ t('box-office.basket.countdown', { time: clock }) }}</span>
            </p>
            <p
              class="sr-only"
              aria-live="polite"
            >
              {{ spoken }}
            </p>

            <section
              v-if="page"
              class="space-y-2"
            >
              <h2 class="text-lg font-semibold">
                {{ page.production.title }}
              </h2>
              <p class="text-sm text-muted">
                {{ t('box-office.book.when', { when: dateTime(page.performance.startsAt), venue: page.performance.venue }) }}
              </p>
              <ul class="divide-y divide-default">
                <li
                  v-for="line in lines"
                  :key="line.label"
                  class="flex justify-between py-2"
                >
                  <span>{{ t('box-office.basket.line', { count: line.count, label: line.label }) }}</span>
                  <span>{{ money(line.amountMinor, basket.currency) }}</span>
                </li>
              </ul>
              <p class="flex justify-between font-semibold">
                <span>{{ t('box-office.basket.total') }}</span>
                <span>{{ money(basket.totalMinor, basket.currency) }}</span>
              </p>
            </section>

            <p
              v-if="checking"
              class="flex items-center gap-2"
              role="status"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="animate-spin"
              />
              {{ t('box-office.basket.checking') }}
            </p>
            <div
              v-else-if="card"
              class="space-y-4"
            >
              <RefusalNotice :refusal="refusal" />
              <PaymentsCardForm
                :next="card"
                :label="t('box-office.basket.pay', { amount: money(basket.totalMinor, basket.currency) })"
                :return-url="returnUrl"
                @submitted="settle"
              />
            </div>
            <UForm
              v-else
              class="space-y-4"
              :state="form"
              @submit="canPay ? pay() : reserve()"
            >
              <RefusalNotice :refusal="refusal" />
              <template v-if="detailsNeeded">
                <UFormField :label="t('box-office.basket.name')">
                  <UInput
                    v-model="form.name"
                    autocomplete="name"
                    maxlength="120"
                  />
                </UFormField>
                <UFormField
                  :label="t('box-office.basket.email')"
                  :help="t('box-office.basket.email-help')"
                  required
                >
                  <UInput
                    v-model="form.email"
                    type="email"
                    autocomplete="email"
                    maxlength="254"
                  />
                </UFormField>
              </template>
              <p
                v-else
                class="text-sm text-muted"
              >
                {{ t('box-office.basket.signed-in', { name: viewer.name ?? '' }) }}
              </p>
              <TurnstileCheck @token="challenge = $event" />
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-if="canPay"
                  type="submit"
                  size="lg"
                  :loading="busy"
                  :disabled="!ready"
                  :label="free ? t('box-office.basket.confirm') : t('box-office.basket.pay', { amount: money(basket.totalMinor, basket.currency) })"
                />
                <UButton
                  v-if="canReserve"
                  :type="canPay ? 'button' : 'submit'"
                  size="lg"
                  :color="canPay ? 'neutral' : 'primary'"
                  :variant="canPay ? 'outline' : 'solid'"
                  :loading="busy"
                  :disabled="!ready"
                  :label="t('box-office.basket.reserve', { amount: money(basket.totalMinor, basket.currency) })"
                  @click="canPay ? reserve() : undefined"
                />
              </div>
              <p
                v-if="canReserve"
                class="text-sm text-muted"
              >
                {{ t('box-office.basket.reserve-help', { until: basket.expiresAt ? time(basket.expiresAt) : '' }) }}
              </p>
            </UForm>
          </template>
        </div>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
