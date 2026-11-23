<!-- One night's sales set-up (Box office specification, part 6, "Performance set-up"; BO-01, BO-04).
     A run's tickets are set up on its production's Tickets tab; this page holds only what is this
     night's own (Matt, 21 Nov 2026): whether it is on sale, what is still missing, when it sells and
     its limits, each showing the theatre's value until given its own, and one card for where this
     night differs from the run: its seats, its prices and its wheelchair spaces. One Save at the
     foot saves whatever changed, with one Undo. -->
<script setup lang="ts">
// The Wheelchair space and the Access ticket take the lowest price the buyer can have, so neither is priced here.
const ACCESS_TYPES = ['box-office.wheelchair', 'box-office.access']
definePageMeta({ layout: 'console' })

interface Band { id: string, name: string, kind: string, sort: number }
interface Pool { bandId: string, capacity: number, claimed: number }
interface TicketType { id: string, name: string, kind: string, active: boolean, available?: boolean, managedBy?: string | null }
interface PriceLayer { bandId: string, ticketTypeId: string, production: number | null, own: { amountMinor: number | null } | null }
interface ScheduledPrice { bandId: string, ticketTypeId: string, performanceId: string | null, amountMinor: number | null, inherits: boolean, from: number }
interface Limits { maxPerOrder: number | null, holdMinutes: number | null, releaseMinutes: number | null }
interface Setup {
  sales: ({ state: SaleState, onSaleAt: number | null, offSaleAt: number | null } & Limits) | null
  houseCapacity: number | null
  pools: Pool[]
  priceLayers: PriceLayer[]
  scheduledPrices: ScheduledPrice[]
  checklist: { code: string, done: boolean }[]
  performance: { id: string, productionId: string, productionState: string, title: string, label: string | null, startsAt: number, state: string }
  bands: Band[]
  run: { seats: Record<string, number>, ownSeats: boolean }
  defaults: Limits
}

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { offer } = useUndo()
const { dateTime } = useDates()
const { money } = await useMoney()
const route = useRoute()
const id = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useAPI<Setup>(() => `/api/box-office/performances/${encodeURIComponent(id.value)}/sales`, { key: `box-office:setup:${id.value}` })
const { data: types } = await useAPI<{ ticketTypes: TicketType[] }>('/api/box-office/ticket-types', { key: 'box-office:ticket-types', default: () => ({ ticketTypes: [] }) })
// Complimentary tickets are issued by approving a request, never priced; a type whose module is off is
// not sold; a Wheelchair space costs the lowest price the buyer can have, so it is not priced here.
const activeTypes = computed(() => (types.value?.ticketTypes ?? []).filter(type => type.active && type.available !== false && type.kind !== 'complimentary' && !ACCESS_TYPES.includes(type.managedBy ?? '')))

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const base = computed(() => `/api/box-office/performances/${encodeURIComponent(id.value)}/sales`)
const runUrl = computed(() => `/console/box-office/performances/run/${encodeURIComponent(data.value?.performance.productionId ?? '')}`)
const pricesUrl = computed(() => `/api/box-office/productions/${encodeURIComponent(data.value?.performance.productionId ?? '')}/prices`)
// Does one act at once, then says so, with an Undo that does its reverse where there is one.
async function act(run: () => Promise<unknown>, done: string, undo?: () => Promise<unknown>): Promise<boolean> {
  refusal.value = null
  try {
    await run()
    await refresh()
    offer(done, undo && (async () => {
      await undo()
      await refresh()
    }))
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return false
  }
}

// What the one Save holds: when it sells and its limits, this night's seats, and this night's prices.
const WINDOW = ['onSaleAt', 'offSaleAt', 'maxPerOrder', 'holdMinutes', 'releaseMinutes'] as const
type Window = Record<typeof WINDOW[number], number | null>
const windowForm = ref<Window>({ onSaleAt: null, offSaleAt: null, maxPerOrder: null, holdMinutes: null, releaseMinutes: null })
const savedWindow = (d: Setup): Window => ({ onSaleAt: d.sales?.onSaleAt ?? null, offSaleAt: d.sales?.offSaleAt ?? null, maxPerOrder: d.sales?.maxPerOrder ?? null, holdMinutes: d.sales?.holdMinutes ?? null, releaseMinutes: d.sales?.releaseMinutes ?? null })
const capacity = ref<Record<string, number>>({})
const savedSeats = (d: Setup, bandId: string) => d.pools.find(p => p.bandId === bandId)?.capacity ?? 0
// One amount for each section and ticket type, in the minor unit; null is not sold.
const prices = ref<Record<string, number | null>>({})
// Prices being handed back to the run: saved as following it again, not as an amount of their own.
const handingBack = ref(new Set<string>())
const cell = (bandId: string, typeId: string) => `${bandId} ${typeId}`
function layer(bandId: string, typeId: string): PriceLayer {
  return data.value?.priceLayers.find(l => l.bandId === bandId && l.ticketTypeId === typeId) ?? { bandId, ticketTypeId: typeId, production: null, own: null }
}
// What a box starts at: this night's own price, or else the run's.
const shown = (l: PriceLayer): number | null => l.own ? l.own.amountMinor : l.production
function seed() {
  const d = data.value
  if (!d) return
  windowForm.value = savedWindow(d)
  capacity.value = Object.fromEntries(d.bands.map(b => [b.id, savedSeats(d, b.id)]))
  prices.value = Object.fromEntries(d.bands.flatMap(b => activeTypes.value.map(type => [cell(b.id, type.id), shown(layer(b.id, type.id))])))
  handingBack.value = new Set()
}
watch([data, activeTypes], seed, { immediate: true })
// When a change of price takes effect: now, or from a moment set ahead.
const takes = ref<'now' | 'later'>('now')
const whens = computed(() => (['now', 'later'] as const).map(value => ({ value, label: t(`box-office.setup.prices.when.${value}`) })))
const from = ref<number | null>(null)
const soon = Date.now()

const sectioned = computed(() => (data.value?.bands.length ?? 0) > 1)
const seating = computed(() => (data.value?.bands ?? []).filter(b => b.kind !== 'wheelchair'))
const runHasSeats = computed(() => Object.keys(data.value?.run.seats ?? {}).length > 0)
const differsFromRun = (bandId: string) => runHasSeats.value && (capacity.value[bandId] ?? 0) !== (data.value?.run.seats[bandId] ?? 0)
function followRunSeats() {
  for (const b of seating.value) capacity.value[b.id] = data.value?.run.seats[b.id] ?? 0
}
function seatsHelp(d: Setup, b: Band): string {
  const taken = t('box-office.setup.capacity.taken', { count: d.pools.find(p => p.bandId === b.id)?.claimed ?? 0 })
  return runHasSeats.value && b.kind !== 'wheelchair' ? `${taken}. ${t('box-office.setup.own.run-sells', { count: d.run.seats[b.id] ?? 0 })}` : taken
}
function priceHelp(bandId: string, typeId: string): string {
  const l = layer(bandId, typeId)
  if (handingBack.value.has(cell(bandId, typeId)) || !l.own) return l.production === null ? t('box-office.setup.prices.inherited-none') : t('box-office.setup.prices.inherited')
  return l.production === null ? t('box-office.setup.prices.own-none') : t('box-office.setup.prices.own', { amount: money(l.production) })
}
function handBack(bandId: string, typeId: string) {
  handingBack.value.add(cell(bandId, typeId))
  prices.value[cell(bandId, typeId)] = layer(bandId, typeId).production
}

// What has changed and not been saved, part by part.
const seatsChanged = computed(() => !!data.value && data.value.bands.some(b => (capacity.value[b.id] ?? 0) !== savedSeats(data.value!, b.id)))
const windowChanged = computed(() => !!data.value && WINDOW.some(k => (windowForm.value[k] ?? null) !== savedWindow(data.value!)[k]))
const priceRows = computed(() => (data.value?.bands ?? []).flatMap(b => activeTypes.value.map((type) => {
  const key = cell(b.id, type.id)
  const l = layer(b.id, type.id)
  const row = { bandId: b.id, ticketTypeId: type.id, performanceId: id.value }
  if (handingBack.value.has(key)) return l.own ? { ...row, amountMinor: null, inherit: true } : null
  return (prices.value[key] ?? null) !== shown(l) ? { ...row, amountMinor: prices.value[key] ?? null } : null
})).filter(r => r !== null))
const layout = useTemplateRef<{ dirty: boolean, own: boolean, commit: () => Promise<(() => Promise<void>) | null> }>('layout')
const dirty = computed(() => seatsChanged.value || windowChanged.value || priceRows.value.length > 0 || !!layout.value?.dirty)

// The one Save: each part that changed is saved in turn, and one Undo puts every one of them back.
const saving = ref(false)
async function save(confirmOverVenue = false): Promise<void> {
  const d = data.value
  if (!d) return
  if (!dirty.value) {
    toast.add({ title: t('box-office.setup.unchanged'), color: 'neutral' })
    return
  }
  refusal.value = null
  saving.value = true
  const undo: (() => Promise<unknown>)[] = []
  let message = t('box-office.setup.saved')
  try {
    if (seatsChanged.value || windowChanged.value) {
      const seats = seatsChanged.value
      const pools = d.bands.map(b => ({ bandId: b.id, capacity: capacity.value[b.id] ?? 0 }))
      const before = { ...(seats ? { pools: d.bands.map(b => ({ bandId: b.id, capacity: savedSeats(d, b.id) })) } : {}), ...(windowChanged.value ? savedWindow(d) : {}) }
      await $api(base.value, { method: 'PUT', body: { ...(seats ? { pools } : {}), ...(windowChanged.value ? windowForm.value : {}), confirmOverVenue } })
      // Putting the old numbers back was allowed before, so it needs no second confirming.
      undo.push(() => $api(base.value, { method: 'PUT', body: { ...before, confirmOverVenue: true } }))
    }
    const rows = priceRows.value
    if (rows.length) {
      const at = takes.value === 'later' ? from.value : null
      await $api(pricesUrl.value, { method: 'POST', body: { prices: rows, ...(at !== null ? { from: at } : {}) } })
      // A change made now goes back to what each box held; one set for later is cancelled instead.
      const before = rows.map((r) => {
        const own = layer(r.bandId, r.ticketTypeId).own
        return own ? { bandId: r.bandId, ticketTypeId: r.ticketTypeId, performanceId: r.performanceId, amountMinor: own.amountMinor } : { bandId: r.bandId, ticketTypeId: r.ticketTypeId, performanceId: r.performanceId, amountMinor: null, inherit: true }
      })
      undo.push(at !== null
        ? () => Promise.all(rows.map(r => $api(`${pricesUrl.value}/cancel-scheduled`, { method: 'POST', body: { bandId: r.bandId, ticketTypeId: r.ticketTypeId, performanceId: r.performanceId, from: at } })))
        : () => $api(pricesUrl.value, { method: 'POST', body: { prices: before } }))
      if (at !== null) message = t('box-office.setup.saved-later', { when: dateTime(at) })
      takes.value = 'now'
      from.value = null
    }
    const back = await layout.value?.commit()
    if (back) undo.push(back)
  }
  catch (e) {
    const r = toRefusal(e)
    // Selling above the space is asked about once; the seats are the first part saved, so nothing is half done.
    if (r?.code === 'box-office.capacity.confirm-over-venue' && !undo.length && await confirm({ verb: t('box-office.setup.capacity.over-verb'), thing: t('box-office.setup.capacity.over-thing'), consequence: r.reason, button: t('box-office.setup.capacity.over-button') })) return save(true)
    refusal.value = r
    if (undo.length) message = t('box-office.setup.saved-part')
  }
  finally {
    saving.value = false
  }
  if (!undo.length) return
  // After a part was refused, what was typed for it stays in its boxes rather than being lost.
  const typed = refusal.value ? { window: { ...windowForm.value }, capacity: { ...capacity.value }, prices: { ...prices.value }, back: new Set(handingBack.value) } : null
  await refresh()
  // The boxes are filled again from what was read, a tick later; the typed values go back after that.
  await nextTick()
  if (typed) {
    windowForm.value = typed.window
    capacity.value = typed.capacity
    prices.value = typed.prices
    handingBack.value = typed.back
  }
  offer(message, async () => {
    for (const step of undo.reverse()) await step()
    await refresh()
  })
}

// This night's own price changes still to come; the run's are on its Tickets tab.
const coming = computed(() => (data.value?.scheduledPrices ?? []).filter(s => s.performanceId !== null))
const runComing = computed(() => (data.value?.scheduledPrices ?? []).filter(s => s.performanceId === null).length)
const typeName = (typeId: string) => types.value?.ticketTypes.find(type => type.id === typeId)?.name ?? ''
const bandName = (bandId: string) => data.value?.bands.find(b => b.id === bandId)?.name ?? ''
function becomes(s: ScheduledPrice): string {
  if (s.inherits) return t('box-office.setup.prices.coming.inherits')
  return s.amountMinor === null ? t('box-office.setup.prices.coming.unsold') : money(s.amountMinor)
}
const comingLine = (s: ScheduledPrice) => sectioned.value
  ? t('box-office.setup.prices.coming.line', { band: bandName(s.bandId), type: typeName(s.ticketTypeId), becomes: becomes(s), when: dateTime(s.from) })
  : t('box-office.setup.prices.coming.line-whole', { type: typeName(s.ticketTypeId), becomes: becomes(s), when: dateTime(s.from) })
const comingCancel = (s: ScheduledPrice) => sectioned.value
  ? t('box-office.setup.prices.coming.cancel-label', { type: typeName(s.ticketTypeId), band: bandName(s.bandId), when: dateTime(s.from) })
  : t('box-office.setup.prices.coming.cancel-label-whole', { type: typeName(s.ticketTypeId), when: dateTime(s.from) })
async function cancelScheduled(s: ScheduledPrice) {
  // Undo sets the same change for the same moment again.
  const again = { bandId: s.bandId, ticketTypeId: s.ticketTypeId, performanceId: s.performanceId, amountMinor: s.inherits ? null : s.amountMinor, ...(s.inherits ? { inherit: true } : {}) }
  await act(() => $api(`${pricesUrl.value}/cancel-scheduled`, { method: 'POST', body: { bandId: s.bandId, ticketTypeId: s.ticketTypeId, performanceId: s.performanceId, from: s.from } }), t('box-office.setup.prices.coming.cancelled'),
    () => $api(pricesUrl.value, { method: 'POST', body: { prices: [again], from: s.from } }))
}

// Opening and pausing undo each other. Opening for the first time has no Undo: a draft cannot be
// put back, only paused.
const opening = () => $api(`${base.value}/open`, { method: 'POST', body: {} })
const pausing = () => $api(`${base.value}/pause`, { method: 'POST', body: {} })
async function open() {
  await act(opening, t('box-office.setup.opened'), data.value?.sales?.state === 'paused' ? pausing : undefined)
}
async function pause() {
  await act(pausing, t('box-office.setup.paused'), opening)
}

// Seats and prices are the run's, set on its Tickets tab; a missing way to pay is fixed under Payments.
const checks = computed(() => (data.value?.checklist ?? []).map(c => ({ id: c.code, done: c.done, sentence: t(`box-office.setup.check.${c.code}`), link: c.code === 'payment' ? '/admin/modules/payments/providers' : c.code === 'capacity' || c.code === 'prices' ? runUrl.value : undefined })))
const trail = computed(() => [{ label: t('box-office.navigation.performances.label'), to: '/console/box-office/performances' }, ...(data.value ? [{ label: data.value.performance.title, to: runUrl.value }] : [])])
// Once a performance has gone on sale and nothing is missing, the checklist folds to one line.
const folded = computed(() => !!data.value?.sales && data.value.sales.state !== 'draft' && checks.value.every(c => c.done))

// Where this night differs, in a line, and the card open when it does.
const ownPrices = computed(() => (data.value?.priceLayers ?? []).filter(l => l.own).length)
const differs = computed(() => [
  data.value?.run.ownSeats ? t('box-office.setup.own.seats') : null,
  ownPrices.value ? t('box-office.setup.own.prices', { count: ownPrices.value }) : null,
  layout.value?.own ? t('box-office.setup.own.wheelchair') : null,
].filter(Boolean).join(', '))
const ownOpen = ref(route.hash === '#own' || !!data.value?.run.ownSeats || ownPrices.value > 0)
const ownId = useId()

// Leaving with anything changed but not saved asks once.
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true
  return confirm({ verb: t('core.form.leave'), thing: t('core.form.leave-thing'), consequence: t('core.form.leave-consequence') })
})
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageFrame
        :title="t('box-office.setup.title', { title: d.performance.title, when: dateTime(d.performance.startsAt) })"
        :trail="trail"
        long-title
      >
        <template #status>
          <StatusBadge v-bind="saleStateBadge(d.sales?.state ?? null, d.pools.reduce((sum, p) => sum + p.capacity, 0), t)" />
        </template>
        <template #primary>
          <UButton
            v-if="d.sales?.state === 'on_sale'"
            :label="t('box-office.setup.pause.button')"
            color="neutral"
            variant="outline"
            @click="pause"
          />
          <UButton
            v-else
            :label="t('box-office.setup.open')"
            icon="i-lucide-play"
            :disabled="checks.some(c => !c.done)"
            @click="open"
          />
        </template>
        <template #footer>
          <!-- The note comes first: the bar is set to its end, so Save never moves when the note appears. -->
          <p
            v-if="dirty"
            class="self-center text-sm text-muted"
          >
            {{ t('box-office.setup.unsaved') }}
          </p>
          <UButton
            type="submit"
            form="night-set-up"
            :loading="saving"
            :label="t('box-office.setup.save')"
          />
        </template>

        <UForm
          id="night-set-up"
          class="space-y-8"
          :state="windowForm"
          :validate="() => needs({ from: takes === 'later' && priceRows.length ? from : true })"
          novalidate
          @submit="save()"
        >
          <RefusalNotice :refusal="refusal" />
          <UAlert
            v-if="d.performance.productionState !== 'published'"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('box-office.setup.unpublished.title')"
            :description="t('box-office.setup.unpublished.description')"
            :actions="[{ label: t('box-office.setup.unpublished.link'), to: `/console/programme/productions/${encodeURIComponent(d.performance.productionId)}`, color: 'neutral', variant: 'outline' }]"
          />
          <div class="flex flex-wrap gap-4">
            <ULink
              :to="runUrl"
              class="inline-flex items-center gap-1 text-sm"
            >
              <UIcon name="i-lucide-ticket" />
              {{ t('box-office.setup.run-link') }}
            </ULink>
            <ULink
              v-if="d.sales && d.sales.state !== 'draft'"
              :to="`/console/box-office/performances/${encodeURIComponent(d.performance.id)}/door`"
              class="inline-flex items-center gap-1 text-sm"
            >
              <UIcon name="i-lucide-door-open" />
              {{ t('box-office.door.title') }}
            </ULink>
          </div>
          <p
            v-if="folded"
            class="flex items-center gap-2 text-sm"
          >
            <UIcon
              name="i-lucide-circle-check"
              class="size-4 shrink-0 text-success"
            />
            {{ t('box-office.setup.checklist-done') }}
          </p>
          <RecordChecks
            v-else
            :title="t('box-office.setup.checklist')"
            :checks="checks"
          />

          <PageSection
            :title="t('box-office.setup.window.title')"
            :description="t('box-office.setup.window.description')"
          >
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                :label="t('box-office.setup.window.on-sale')"
                :help="t('box-office.setup.window.on-sale-help')"
              >
                <FieldDateTime v-model="windowForm.onSaleAt" />
              </UFormField>
              <UFormField
                :label="t('box-office.setup.window.off-sale')"
                :help="t('box-office.setup.window.off-sale-help')"
              >
                <FieldDateTime v-model="windowForm.offSaleAt" />
              </UFormField>
            </div>
            <div class="grid gap-4 sm:grid-cols-3">
              <UFormField :label="t('box-office.setup.window.max-per-order')">
                <DefaultedNumber
                  v-model="windowForm.maxPerOrder"
                  :fallback="d.defaults.maxPerOrder"
                  :min="1"
                  :max="500"
                  :label="t('box-office.setup.window.max-per-order')"
                />
              </UFormField>
              <UFormField :label="t('box-office.setup.window.hold')">
                <DefaultedMinutes
                  v-model="windowForm.holdMinutes"
                  :fallback="d.defaults.holdMinutes"
                  :min="1"
                  :max="60"
                  :label="t('box-office.setup.window.hold')"
                />
              </UFormField>
              <UFormField
                :label="t('box-office.setup.window.release')"
                :help="windowForm.releaseMinutes === null && d.defaults.releaseMinutes === null ? t('box-office.setup.window.release-none') : t('box-office.setup.window.release-help')"
              >
                <DefaultedMinutes
                  v-model="windowForm.releaseMinutes"
                  :fallback="d.defaults.releaseMinutes"
                  :min="0"
                  :max="1440"
                  :label="t('box-office.setup.window.release')"
                />
              </UFormField>
            </div>
          </PageSection>

          <BoxOfficeWheelchairStanding
            :performance-id="d.performance.id"
            @changed="refresh()"
          />

          <PageSection
            id="own"
            :title="t('box-office.setup.own.title')"
            :description="t('box-office.setup.own.description')"
          >
            <template #actions>
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                :trailing-icon="ownOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                :label="t(ownOpen ? 'box-office.setup.own.hide' : 'box-office.setup.own.show')"
                :aria-expanded="ownOpen"
                :aria-controls="ownId"
                @click="ownOpen = !ownOpen"
              />
            </template>
            <p class="text-sm">
              {{ differs ? t('box-office.setup.own.differs', { what: differs }) : t('box-office.setup.own.follows') }}
            </p>
            <div
              v-show="ownOpen"
              :id="ownId"
              class="space-y-8"
            >
              <section class="space-y-3">
                <div>
                  <h3 class="font-medium text-highlighted">
                    {{ t('box-office.setup.capacity.title') }}
                  </h3>
                  <p class="text-sm text-muted">
                    {{ sectioned
                      ? (d.houseCapacity ? t('box-office.setup.capacity.house', { capacity: d.houseCapacity, total: Object.values(capacity).reduce((sum, n) => sum + (n ?? 0), 0) }) : t('box-office.setup.capacity.description'))
                      : (d.houseCapacity ? t('box-office.setup.capacity.house-whole', { capacity: d.houseCapacity }) : t('box-office.setup.capacity.description-whole')) }}
                  </p>
                </div>
                <p
                  v-if="!d.bands.length"
                  class="text-sm text-muted"
                >
                  {{ t('box-office.setup.own.no-run') }}
                  <ULink :to="runUrl">
                    {{ t('box-office.setup.run-link') }}
                  </ULink>
                </p>
                <div
                  v-else
                  class="flex flex-wrap gap-x-6 gap-y-4"
                >
                  <UFormField
                    v-for="b in d.bands"
                    :key="b.id"
                    :label="sectioned ? b.name : t('box-office.setup.capacity.whole')"
                    :help="seatsHelp(d, b)"
                  >
                    <FieldNumber
                      v-model="capacity[b.id]"
                      class="w-40"
                      :min="0"
                    />
                  </UFormField>
                </div>
                <UButton
                  v-if="seating.some(b => differsFromRun(b.id))"
                  color="neutral"
                  variant="link"
                  class="px-0"
                  icon="i-lucide-undo-2"
                  :label="t('box-office.setup.own.follow-seats')"
                  @click="followRunSeats"
                />
              </section>

              <section
                v-if="d.bands.length"
                class="space-y-4"
              >
                <div>
                  <h3 class="font-medium text-highlighted">
                    {{ t('box-office.setup.prices.title') }}
                  </h3>
                  <p class="text-sm text-muted">
                    {{ t('box-office.setup.own.prices-description') }}
                  </p>
                </div>
                <p
                  v-if="!activeTypes.length"
                  class="text-sm text-muted"
                >
                  {{ t('box-office.setup.prices.no-types') }}
                  <ULink to="/admin/modules/box-office/ticket-types">
                    {{ t('box-office.navigation.ticket-types.label') }}
                  </ULink>
                </p>
                <template v-else>
                  <fieldset
                    v-for="b in d.bands"
                    :key="b.id"
                    class="grid grid-cols-2 items-start gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                  >
                    <legend
                      v-if="sectioned"
                      class="mb-3 font-medium"
                    >
                      {{ b.name }}
                    </legend>
                    <UFormField
                      v-for="type in activeTypes"
                      :key="type.id"
                      :help="priceHelp(b.id, type.id)"
                    >
                      <!-- Each box is named for its section too, so a screen reader does not hear "Member" twice. -->
                      <template #label>
                        <span
                          v-if="sectioned"
                          class="sr-only"
                        >{{ b.name }}, </span>{{ type.name }}<span class="sr-only"> {{ t('box-office.setup.prices.price') }}</span>
                      </template>
                      <div class="flex flex-wrap items-center gap-2">
                        <FieldMoney
                          v-model="prices[cell(b.id, type.id)]"
                          @update:model-value="handingBack.delete(cell(b.id, type.id))"
                        />
                        <UButton
                          v-if="layer(b.id, type.id).own && !handingBack.has(cell(b.id, type.id))"
                          color="neutral"
                          variant="link"
                          icon="i-lucide-undo-2"
                          :label="t('box-office.setup.prices.revert')"
                          @click="handBack(b.id, type.id)"
                        />
                      </div>
                    </UFormField>
                  </fieldset>
                  <UFormField
                    v-if="priceRows.length"
                    :label="t('box-office.setup.prices.when.label')"
                  >
                    <URadioGroup
                      v-model="takes"
                      orientation="horizontal"
                      variant="table"
                      :items="whens"
                    />
                  </UFormField>
                  <UFormField
                    v-if="priceRows.length && takes === 'later'"
                    name="from"
                    :label="t('box-office.setup.prices.when.from')"
                    :help="t('box-office.setup.prices.when.from-help')"
                    required
                  >
                    <FieldDateTime
                      v-model="from"
                      :min="soon"
                    />
                  </UFormField>
                </template>
                <div
                  v-if="coming.length"
                  class="space-y-2"
                >
                  <h4 class="font-medium">
                    {{ t('box-office.setup.prices.coming.title') }}
                  </h4>
                  <ul class="divide-y divide-default">
                    <li
                      v-for="s in coming"
                      :key="`${s.bandId} ${s.ticketTypeId} ${s.from}`"
                      class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span>{{ comingLine(s) }}</span>
                      <UButton
                        color="neutral"
                        variant="link"
                        icon="i-lucide-x"
                        :label="t('box-office.setup.prices.coming.cancel')"
                        :aria-label="comingCancel(s)"
                        @click="cancelScheduled(s)"
                      />
                    </li>
                  </ul>
                </div>
                <p
                  v-if="runComing"
                  class="text-sm text-muted"
                >
                  {{ t('box-office.setup.own.run-coming', { count: runComing }) }}
                  <ULink :to="runUrl">
                    {{ t('box-office.setup.run-link') }}
                  </ULink>
                </p>
              </section>

              <BoxOfficeSeatingLayout
                ref="layout"
                :performance-id="d.performance.id"
                @changed="refresh()"
              />
            </div>
          </PageSection>
        </UForm>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
