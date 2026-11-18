<!-- Choose tickets (Box office specification, part 6; BO-10, BO-11): one performance's ticket types
     and prices in each part of the house, with steppers. The button says what it will do and what it
     costs; pressing it holds the seats, which is when the countdown starts, and goes on to Check and
     pay. A companion ticket needs a paid ticket with it. No count of seats is ever shown. A member
     price the visitor is not signed in for can take a reference instead, such as a student ID: one
     box for each ticket, worded by Membership, shown only on that ticket type. -->
<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

interface TicketType { ticketTypeId: string, name: string, kind: string, proofNote: string | null, needsPaidTicket: boolean, amountMinor: number, most?: number, unmet?: string, remedy?: { label: string, to: string }, reference?: { label: string, field?: string, shape: string } }
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
const { viewer } = useViewer()
// Each reference box has an id of its own, so its label never points at the stepper (UFormField's id).
const referenceId = useId()
// The stepper's buttons are named for the ticket ("Add one Member ticket"), not just "Increment".
const named = (label: string) => ({ 'aria-label': label }) as unknown as ButtonProps
// Why a price cannot be chosen, and what to do: the source's way to put it right, or signing in.
const remedyOf = (type: TicketType) => type.remedy ?? (type.unmet && !viewer.value.signedIn ? { label: t('box-office.book.sign-in'), to: `/sign-in?next=${encodeURIComponent(route.fullPath)}` } : undefined)
// A price limited per person says so once the limit is reached.
const atMost = (bandId: string, type: TicketType) => type.most !== undefined && type.most < (data.value?.maxPerOrder ?? Infinity) && (counts.value[keyOf(bandId, type.ticketTypeId)] ?? 0) >= type.most
const keyOf = (bandId: string, typeId: string) => `${bandId} ${typeId}`
const chosen = computed(() => (data.value?.bands ?? []).flatMap(b => b.types.map(type => ({ band: b, type, quantity: counts.value[keyOf(b.bandId, type.ticketTypeId)] ?? 0 }))).filter(c => c.quantity > 0))
const quantity = computed(() => chosen.value.reduce((sum, c) => sum + c.quantity, 0))
// A promo code (BO-17), tried before holding so the saving shows; sent with the hold, which applies it again.
const promoInput = ref('')
const promo = ref<{ code: string, maxPerOrder: number | null, prices: { bandId: string, ticketTypeId: string, amountMinor: number }[] } | null>(null)
const promoRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const promoBusy = ref(false)
const promoPrice = (bandId: string, typeId: string) => promo.value?.prices.find(p => p.bandId === bandId && p.ticketTypeId === typeId)?.amountMinor
async function tryCode() {
  promoRefusal.value = null
  promoBusy.value = true
  try {
    promo.value = await $api(`/api/box-office/book/performances/${encodeURIComponent(performanceId.value)}/promo`, { query: { code: promoInput.value.trim() } })
  }
  catch (e) {
    promo.value = null
    promoRefusal.value = toRefusal(e)
  }
  finally {
    promoBusy.value = false
  }
}
function dropCode() {
  promo.value = null
  promoInput.value = ''
  promoRefusal.value = null
}
// The saving, as the server will work it out: the dearest eligible tickets first, up to the code's limit for one order.
const totalMinor = computed(() => {
  const each = chosen.value.flatMap(c => Array.from({ length: c.quantity }, () => ({ full: c.type.amountMinor, with: promoPrice(c.band.bandId, c.type.ticketTypeId) })))
  const eligible = each.filter(e => e.with !== undefined).sort((a, b) => b.full - a.full).slice(0, promo.value?.maxPerOrder ?? Infinity)
  const saving = eligible.reduce((sum, e) => sum + e.full - e.with!, 0)
  return each.reduce((sum, e) => sum + e.full, 0) - saving
})
const currency = computed(() => data.value?.currency ?? undefined)
const companionAlone = computed(() => chosen.value.length > 0 && chosen.value.every(c => c.type.needsPaidTicket))
const tooMany = computed(() => quantity.value > (data.value?.maxPerOrder ?? 0))
const siteKey = useRuntimeConfig().public.turnstile?.siteKey
const challenge = ref('')
const turnstile = useTemplateRef<{ reset: () => void }>('turnstile')
// References typed for a type the visitor may have only by giving one, one for each ticket in turn.
const references = ref<Record<string, string[]>>({})
const typing = (type: TicketType) => !!type.unmet && !!type.reference
const referencesOf = (bandId: string, typeId: string, count: number) => (references.value[keyOf(bandId, typeId)] ?? []).slice(0, count).map(r => r.trim())
function setReference(bandId: string, typeId: string, n: number, value: string) {
  const list = [...(references.value[keyOf(bandId, typeId)] ?? [])]
  list[n] = value
  references.value = { ...references.value, [keyOf(bandId, typeId)]: list }
  if (referenceRefusal.value) refusal.value = null
}
const helpOf = (type: TicketType) => typing(type) ? type.reference!.label : (type.unmet ?? type.proofNote ?? (type.needsPaidTicket ? t('box-office.book.needs-paid') : undefined))
const referencesMissing = computed(() => chosen.value.some(c => typing(c.type) && referencesOf(c.band.bandId, c.type.ticketTypeId, c.quantity).filter(Boolean).length < c.quantity))
const ready = computed(() => quantity.value > 0 && !companionAlone.value && !tooMany.value && !referencesMissing.value && (!siteKey || !!challenge.value))
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
// A refused reference is said beside the references typed; the notice at the top is for the rest.
const referenceRefusal = computed(() => refusal.value?.code.startsWith('box-office.requirement.reference-') ? refusal.value : null)
const busy = ref(false)

async function hold() {
  refusal.value = null
  busy.value = true
  try {
    const basket = await $api<{ orderId: string, token: string, expiresAt: number }>('/api/box-office/baskets', {
      method: 'POST',
      body: { performanceId: performanceId.value, lines: chosen.value.map(c => ({ bandId: c.band.bandId, ticketTypeId: c.type.ticketTypeId, quantity: c.quantity, ...(typing(c.type) ? { references: referencesOf(c.band.bandId, c.type.ticketTypeId, c.quantity) } : {}) })), promoCode: promo.value?.code },
      headers: challenge.value ? { 'cf-turnstile-response': challenge.value } : {},
    })
    rememberBasket({ orderId: basket.orderId, token: basket.token, back: route.fullPath })
    await navigateTo('/book/basket')
  }
  catch (e) {
    refusal.value = toRefusal(e)
    // The token was used up by the refused hold: run the check again for a new one.
    turnstile.value?.reset()
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
            <RefusalNotice :refusal="referenceRefusal ? null : refusal" />
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
                  :label="promoPrice(band.bandId, type.ticketTypeId) !== undefined ? t('box-office.book.type-with-code', { type: type.name, price: money(promoPrice(band.bandId, type.ticketTypeId)!, currency), was: money(type.amountMinor, currency) }) : t('box-office.book.type', { type: type.name, price: money(type.amountMinor, currency) })"
                  :help="helpOf(type)"
                  :error="typing(type) && counts[keyOf(band.bandId, type.ticketTypeId)] ? referenceRefusal?.reason : undefined"
                >
                  <template
                    v-if="remedyOf(type) || atMost(band.bandId, type)"
                    #help
                  >
                    {{ helpOf(type) }}
                    <span v-if="atMost(band.bandId, type)">{{ t('box-office.book.most', { count: type.most! }) }}</span>
                    <ULink
                      v-if="remedyOf(type)"
                      :to="remedyOf(type)!.to"
                      class="text-primary underline"
                    >
                      {{ remedyOf(type)!.label }}
                    </ULink>
                  </template>
                  <div class="space-y-2">
                    <UInputNumber
                      v-model="counts[keyOf(band.bandId, type.ticketTypeId)]"
                      :min="0"
                      :max="type.unmet && !typing(type) ? 0 : Math.min(data.maxPerOrder, type.most ?? data.maxPerOrder)"
                      :disabled="!!type.unmet && !typing(type)"
                      :default-value="0"
                      :increment="named(t('box-office.book.add', { type: type.name }))"
                      :decrement="named(t('box-office.book.remove', { type: type.name }))"
                    />
                    <template v-if="typing(type)">
                      <UInput
                        v-for="n in (counts[keyOf(band.bandId, type.ticketTypeId)] ?? 0)"
                        :id="`${referenceId}-${band.bandId}-${type.ticketTypeId}-${n}`"
                        :key="n"
                        :model-value="references[keyOf(band.bandId, type.ticketTypeId)]?.[n - 1] ?? ''"
                        :aria-label="t('box-office.book.reference', { label: type.reference!.field ?? type.reference!.label, n })"
                        :placeholder="t('box-office.book.reference-placeholder', { n })"
                        autocomplete="off"
                        maxlength="64"
                        class="block w-64"
                        @update:model-value="setReference(band.bandId, type.ticketTypeId, n - 1, String($event))"
                      />
                    </template>
                  </div>
                </UFormField>
              </template>
            </section>
            <UFormField
              :label="t('box-office.book.promo.label')"
              name="promoCode"
              :error="promoRefusal?.reason"
              :help="promo ? t('box-office.book.promo.applied', { code: promo.code }) : undefined"
            >
              <div class="flex flex-wrap items-center gap-2">
                <UInput
                  v-model="promoInput"
                  :disabled="!!promo"
                  autocomplete="off"
                  maxlength="40"
                  class="w-48"
                  @keydown.enter.prevent="tryCode"
                />
                <UButton
                  v-if="!promo"
                  :label="t('box-office.book.promo.apply')"
                  color="neutral"
                  variant="outline"
                  :loading="promoBusy"
                  :disabled="!promoInput.trim()"
                  @click="tryCode"
                />
                <UButton
                  v-else
                  :label="t('box-office.book.promo.remove')"
                  color="neutral"
                  variant="ghost"
                  @click="dropCode"
                />
              </div>
            </UFormField>
            <p
              v-if="companionAlone"
              class="text-sm text-error"
              role="alert"
            >
              {{ t('box-office.book.companion-alone') }}
            </p>
            <p
              v-if="referencesMissing"
              class="text-sm text-muted"
            >
              {{ t('box-office.book.references-missing') }}
            </p>
            <p
              v-if="tooMany"
              class="text-sm text-error"
              role="alert"
            >
              {{ t('box-office.book.too-many', { count: data.maxPerOrder }) }}
            </p>
            <TurnstileCheck
              ref="turnstile"
              @token="challenge = $event"
            />
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
