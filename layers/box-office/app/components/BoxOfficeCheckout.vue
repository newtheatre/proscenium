<!-- Check and pay (Box office specification, part 6; BO-10, BO-12, R-1, R-7): the seats held, the
     countdown, the lines and total, the buyer's details, then pay now or reserve and pay on arrival,
     as the theatre allows. The countdown is announced to screen readers at fixed points, not every
     second. When it runs out the seats are released and the buyer is offered to choose again. Once
     the booking is made, this step says what happened and forgets the basket. On its own page and in
     the booking drawer (`drawer`), where Change tickets and releasing go back a step in the drawer. -->
<script setup lang="ts">
import { z } from 'zod'
import type { BookingDoneOutcome } from '../utils/booking'

type Timing = 'pay-now' | 'reserve' | 'buyer-chooses'
interface Basket { orderId: string, reference: string, state: string, expiresAt: number | null, currency: string, totalMinor: number, lines: { id: string, performanceId: string, bandId: string, ticketTypeId: string, amountMinor: number, listMinor?: number, pass?: string }[], passSales?: { name: string, priceName: string, amountMinor: number, fresh: boolean, reserveUnpaid: boolean }[], promo?: { code: string, savingMinor: number } | null }
interface Page { performance: { startsAt: number, venue: string }, production: { title: string, ageMin: number | null, ageRestricted: boolean }, timing: Timing, bands: { bandId: string, name: string, types: { ticketTypeId: string, name: string, unmet?: string }[] }[] }
type Outcome
  = | (BookingDoneOutcome & { state: 'confirmed', totalMinor: number })
    | (BookingDoneOutcome & { state: 'reserved' })
    | { state: 'confirm-email', expiresAt?: number }
    | { state: 'processing' }

interface CardStep { kind: 'client-secret', provider: string, secret: string, publishableKey: string }

const props = defineProps<{ drawer?: boolean }>()
const emit = defineEmits<{ change: [], released: [], title: [title: string] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { dateTime, time } = useDates()
const { money } = await useMoney()
const { viewer } = useViewer()
const { signOut } = useSignOut()
const route = useRoute()

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
const form = ref({ name: '', email: '', ageConfirmed: false })
// The bot check was passed when the seats were held; the basket's token carries that to here.
const headers = computed(() => ({ 'x-basket-token': remembered.value?.token ?? '' }))

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

// The part of the house is named only when the show prices more than one, and the kind of ticket
// not at all where there is only one to book, as Choose tickets shows it.
const names = computed(() => new Map((page.value?.bands ?? []).flatMap(b => b.types.map((type) => {
  const only = page.value!.bands.length === 1 && !type.unmet && b.types.filter(x => !x.unmet).length === 1
  return [`${b.bandId} ${type.ticketTypeId}`, only ? '' : page.value!.bands.length > 1 ? `${b.name}, ${type.name}` : type.name]
}))))
// Each line at its price before any promo code, which then has a line of its own above the total.
const lines = computed(() => {
  const grouped = new Map<string, { label: string, count: number, amountMinor: number }>()
  for (const l of basket.value?.lines ?? []) {
    const key = `${l.bandId} ${l.ticketTypeId}`
    // A pass's entry goes by the pass's name, with the kind of space when it is a wheelchair space (BO-64).
    const kind = names.value.get(key)
    const row = grouped.get(l.pass ? `pass ${l.pass} ${key}` : key) ?? { label: l.pass ? (kind ? `${l.pass}, ${kind}` : l.pass) : kind ?? '', count: 0, amountMinor: 0 }
    row.count++
    row.amountMinor += basket.value?.promo && !l.pass ? (l.listMinor ?? l.amountMinor) : l.amountMinor
    grouped.set(l.pass ? `pass ${l.pass} ${key}` : key, row)
  }
  // A pass paid for with this booking: bought here, or an earlier one still owed.
  const sales = (basket.value?.passSales ?? []).map(s => ({ label: t(s.fresh ? 'box-office.basket.pass-sale' : 'box-office.basket.pass-owed', { name: s.name, price: s.priceName }), count: 1, amountMinor: s.amountMinor }))
  return [...sales, ...grouped.values()]
})
const free = computed(() => basket.value?.totalMinor === 0)
// An amount, or Free when there is nothing to pay.
const amount = (minor: number) => (minor === 0 ? t('box-office.basket.free') : money(minor, basket.value?.currency))
// Where a signed-in buyer's tickets go: their account's audience address.
const sendTo = ref<string | null>(null)
watch(() => viewer.value.signedIn, async (signedIn) => {
  if (!signedIn) return
  const found = await $api<{ addresses: { address: string, audience: boolean }[] }>('/api/core/me/addresses').catch(() => null)
  sendTo.value = found?.addresses.find(a => a.audience)?.address ?? null
}, { immediate: true })

// Change tickets: back to Choose tickets with these choices filled; the seats stay held until the new
// choice is, and then this basket is let go. Cancel and release lets it go now.
function changeTickets() {
  if (!remembered.value) return
  if (props.drawer) return emit('change')
  return navigateTo({ path: remembered.value.back.split('?')[0], query: { change: '1' } })
}
async function release() {
  if (!basket.value || !remembered.value) return
  try {
    await $api(`/api/box-office/baskets/${encodeURIComponent(basket.value.orderId)}/release`, { method: 'POST', body: {}, headers: { 'x-basket-token': remembered.value.token } })
    const back = remembered.value.back
    forgetBasket()
    useToast().add({ title: t('box-office.basket.released'), color: 'success' })
    if (props.drawer) emit('released')
    else await navigateTo(back)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const canPay = computed(() => free.value || page.value?.timing !== 'reserve')
// A pass that must be paid for when it is bought cannot wait on a reservation.
const canReserve = computed(() => !free.value && page.value?.timing !== 'pay-now' && basket.value?.state === 'basket' && (basket.value.passSales ?? []).every(s => s.reserveUnpaid))
const detailsNeeded = computed(() => !viewer.value.signedIn)
// A production only for people over an age: the buyer says everyone using the tickets is.
const ageMin = computed(() => page.value?.production.ageRestricted ? page.value.production.ageMin : null)
// The buyer's details, checked as the reserve and checkout routes check them, beside each field.
const detailsSchema = computed(() => z.object({
  ...(detailsNeeded.value ? { name: z.string().trim().max(120), email: z.string().trim().email().max(254) } : {}), // not-policy: the routes' bounds
  ...(ageMin.value !== null ? { ageConfirmed: z.literal(true, { error: t('box-office.basket.age.needed') }) } : {}),
}))
const detailsForm = useTemplateRef('detailsForm')
/** Shows each problem beside its field; false while there is one. */
async function detailsValid(): Promise<boolean> {
  if (!detailsNeeded.value && ageMin.value === null) return true
  try {
    await detailsForm.value?.validate({})
    return true
  }
  catch {
    return false
  }
}
const body = computed(() => ({ expectedTotalMinor: basket.value!.totalMinor, ...(ageMin.value !== null ? { ageConfirmed: form.value.ageConfirmed } : {}), ...(detailsNeeded.value ? { email: form.value.email.trim(), name: form.value.name.trim() || undefined } : {}) }))

// The address the confirmation link went to, said back so a mistyped one is noticed.
const sentTo = ref('')
function done(result: Outcome) {
  if (result.state === 'confirm-email') sentTo.value = form.value.email.trim()
  outcome.value = result
  forgetBasket()
}

async function pay() {
  if (!basket.value || !remembered.value || !await detailsValid()) return
  refusal.value = null
  busy.value = true
  try {
    // A buyer back from a payment that did not go through is already past checkout.
    if (basket.value.state === 'basket') {
      const started = await $api<{ state: 'awaiting_payment' | 'confirmed', reference?: string, totalMinor?: number, expiresAt?: number, token?: string, accountLinkSent?: boolean }>(`/api/box-office/baskets/${encodeURIComponent(basket.value.orderId)}/checkout`, { method: 'POST', body: body.value, headers: headers.value })
      if (started.state === 'confirmed') return done({ state: 'confirmed', reference: started.reference!, totalMinor: started.totalMinor ?? 0, token: started.token, accountLinkSent: started.accountLinkSent })
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
    detailsForm.value?.setErrors(fieldErrors(refusal.value))
  }
  finally {
    busy.value = false
  }
}

async function reserve() {
  if (!basket.value || !await detailsValid()) return
  refusal.value = null
  busy.value = true
  try {
    const result = await $api<Outcome & { reference?: string }>(`/api/box-office/baskets/${encodeURIComponent(basket.value.orderId)}/reserve`, { method: 'POST', body: body.value, headers: headers.value })
    done(result)
  }
  catch (e) {
    refusal.value = toRefusal(e)
    detailsForm.value?.setErrors(fieldErrors(refusal.value))
  }
  finally {
    busy.value = false
  }
}
// Whoever frames this step (its page, or the drawer) heads it with this.
const title = computed(() => (outcome.value ? t(`box-office.basket.done.${outcome.value.state}.title`) : free.value ? t('box-office.basket.title-free') : t('box-office.basket.title')))
watch(title, value => emit('title', value), { immediate: true })
</script>

<template>
  <div class="space-y-6">
    <p
      v-if="loading"
      class="text-muted"
    >
      {{ t('box-office.basket.loading') }}
    </p>

    <template v-else-if="outcome">
      <BoxOfficeBookingDone
        v-if="outcome.state === 'confirmed' || outcome.state === 'reserved'"
        :outcome="{ currency: basket?.currency, ...outcome }"
      />
      <UAlert
        v-else-if="outcome.state === 'confirm-email'"
        color="neutral"
        variant="subtle"
        icon="i-lucide-mail"
        :title="sentTo ? t('box-office.basket.done.confirm-email.sent-to', { address: sentTo }) : t('box-office.basket.done.confirm-email.body')"
        :description="outcome.expiresAt ? t('box-office.basket.done.confirm-email.until', { until: time(outcome.expiresAt) }) : t('box-office.basket.done.confirm-email.junk')"
      />
      <p v-else>
        {{ t(`box-office.basket.done.${outcome.state}.body`) }}
      </p>
    </template>

    <EmptyState
      v-else-if="!basket"
      :title="t('box-office.basket.none.title')"
      :description="t('box-office.basket.none.description')"
      icon="i-lucide-shopping-basket"
    >
      <template
        v-if="!drawer"
        #actions
      >
        <UButton
          to="/whats-on"
          :label="t('box-office.basket.none.whats-on')"
        />
      </template>
    </EmptyState>

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
        <p
          v-if="ageMin !== null"
          class="flex items-center gap-2 text-sm font-medium"
        >
          <UIcon
            name="i-lucide-id-card"
            class="shrink-0"
          />
          {{ t('box-office.book.age.restricted', { age: ageMin }) }}
        </p>
        <ul class="divide-y divide-default">
          <li
            v-for="line in lines"
            :key="line.label"
            class="flex justify-between py-2"
          >
            <span>{{ ticketsLine(t, line.count, line.label) }}</span>
            <span>{{ amount(line.amountMinor) }}</span>
          </li>
          <li
            v-if="basket.promo"
            class="flex justify-between py-2"
          >
            <span>{{ t('box-office.basket.promo', { code: basket.promo.code }) }}</span>
            <span>{{ t('box-office.basket.saving', { amount: money(basket.promo.savingMinor, basket.currency) }) }}</span>
          </li>
        </ul>
        <p class="flex justify-between font-semibold">
          <span>{{ t('box-office.basket.total') }}</span>
          <span>{{ amount(basket.totalMinor) }}</span>
        </p>
        <div class="flex flex-wrap gap-2 pt-2">
          <UButton
            v-if="basket.state === 'basket'"
            color="neutral"
            variant="outline"
            icon="i-lucide-pencil"
            :label="t('box-office.basket.change')"
            @click="changeTickets"
          />
          <UButton
            v-if="basket.state === 'basket'"
            color="neutral"
            variant="ghost"
            loading-auto
            :label="t('box-office.basket.release')"
            @click="release"
          />
        </div>
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
        ref="detailsForm"
        class="space-y-4"
        :schema="detailsSchema"
        :state="form"
        novalidate
        @submit="canPay ? pay() : reserve()"
      >
        <RefusalNotice :refusal="refusal" />
        <template v-if="detailsNeeded">
          <UFormField
            name="name"
            :label="t('box-office.basket.name')"
          >
            <UInput
              v-model="form.name"
              autocomplete="name"
              maxlength="120"
            />
          </UFormField>
          <UFormField
            name="email"
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
          {{ sendTo ? t('box-office.basket.signed-in-to', { name: viewer.name ?? '', address: sendTo }) : t('box-office.basket.signed-in', { name: viewer.name ?? '' }) }}
          {{ t('box-office.basket.not-you') }}
          <UButton
            variant="link"
            class="p-0 align-baseline"
            :label="t('box-office.basket.sign-out')"
            @click="signOut()"
          />
        </p>
        <UFormField
          v-if="ageMin !== null"
          name="ageConfirmed"
        >
          <UCheckbox
            v-model="form.ageConfirmed"
            :label="t('box-office.basket.age.confirm', { age: ageMin })"
          />
        </UFormField>
        <!-- What the buyer agrees to by booking: the policy the box office declares (/policies/tickets). -->
        <p class="text-sm text-muted">
          {{ t('box-office.basket.terms.before') }}
          <ULink
            to="/policies/tickets"
            target="_blank"
            class="underline underline-offset-2"
          >{{ t('box-office.basket.terms.link') }}</ULink>{{ t('box-office.basket.terms.after') }}
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="canPay"
            type="submit"
            size="xl"
            class="justify-center max-sm:w-full"
            :loading="busy"
            :label="free ? t('box-office.basket.confirm') : t('box-office.basket.pay', { amount: money(basket.totalMinor, basket.currency) })"
          />
          <UButton
            v-if="canReserve"
            :type="canPay ? 'button' : 'submit'"
            size="xl"
            class="justify-center max-sm:w-full"
            :color="canPay ? 'neutral' : 'primary'"
            :variant="canPay ? 'outline' : 'solid'"
            :loading="busy"
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
</template>
