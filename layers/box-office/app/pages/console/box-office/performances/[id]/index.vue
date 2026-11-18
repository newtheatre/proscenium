<!-- A performance's sales set-up (Box office specification, part 6, "Performance set-up"; BO-01,
     BO-04): what is still missing before it can go on sale, how many of each band to sell, what each
     ticket type costs in each band, and when sales open and close. A production's bands are shared
     by all its performances, and so are its prices unless this performance is given its own, which
     can be handed back to the production's at any time; capacity and the sale window are this
     performance's own. A price change can be set to take effect later, such as when an early-bird
     offer ends; changes still to come are listed under the prices and can be cancelled. -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

interface Band { id: string, name: string, kind: string, sort: number }
interface Pool { bandId: string, capacity: number, claimed: number }
interface Price { bandId: string, ticketTypeId: string, amountMinor: number }
interface TicketType { id: string, name: string, kind: string, active: boolean, available?: boolean, managedBy?: string | null }
interface PriceLayer { bandId: string, ticketTypeId: string, production: number | null, own: { amountMinor: number | null } | null }
interface ScheduledPrice { bandId: string, ticketTypeId: string, performanceId: string | null, amountMinor: number | null, inherits: boolean, from: number }
interface Setup {
  sales: { state: SaleState, onSaleAt: number | null, offSaleAt: number | null, maxPerOrder: number | null, holdMinutes: number | null } | null
  houseCapacity: number | null
  pools: Pool[]
  prices: Price[]
  priceLayers: PriceLayer[]
  scheduledPrices: ScheduledPrice[]
  checklist: { code: string, done: boolean }[]
  performance: { id: string, productionId: string, title: string, label: string | null, startsAt: number, state: string }
  bands: Band[]
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
const activeTypes = computed(() => (types.value?.ticketTypes ?? []).filter(type => type.active && type.available !== false && type.kind !== 'complimentary' && type.managedBy !== 'box-office.wheelchair'))
const wheelchairSold = computed(() => (types.value?.ticketTypes ?? []).some(type => type.active && type.available !== false && type.managedBy === 'box-office.wheelchair'))

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const base = computed(() => `/api/box-office/performances/${encodeURIComponent(id.value)}/sales`)
// Does the act, then says so, with an Undo that does its reverse where there is one.
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

// Capacity: one number for each band of the production.
const capacity = ref<Record<string, number>>({})
// Prices: one amount for each band and ticket type, in the minor unit; null is not sold. They are
// edited for every performance of the production, or for this one alone.
const prices = ref<Record<string, number | null>>({})
const scope = ref<'all' | 'this'>('all')
const scopes = computed(() => (['all', 'this'] as const).map(value => ({ value, label: t(`box-office.setup.prices.scope.${value}`) })))
// When a change takes effect: now, or from a moment set ahead.
const when = ref<'now' | 'later'>('now')
const whens = computed(() => (['now', 'later'] as const).map(value => ({ value, label: t(`box-office.setup.prices.when.${value}`) })))
const from = ref<number | null>(null)
const soon = Date.now()
// The sale window and limits.
const windowForm = ref({ onSaleAt: null as number | null, offSaleAt: null as number | null, maxPerOrder: null as number | null, holdMinutes: null as number | null })
const cell = (bandId: string, typeId: string) => `${bandId} ${typeId}`
watch(data, (d) => {
  if (!d) return
  capacity.value = Object.fromEntries(d.bands.map(b => [b.id, d.pools.find(p => p.bandId === b.id)?.capacity ?? 0]))
  seedPrices()
  windowForm.value = { onSaleAt: d.sales?.onSaleAt ?? null, offSaleAt: d.sales?.offSaleAt ?? null, maxPerOrder: d.sales?.maxPerOrder ?? null, holdMinutes: d.sales?.holdMinutes ?? null }
}, { immediate: true })

async function saveCapacity(confirmOverVenue = false) {
  const pools = Object.entries(capacity.value).map(([bandId, n]) => ({ bandId, capacity: n ?? 0 }))
  const before = (data.value?.pools ?? []).map(p => ({ bandId: p.bandId, capacity: p.capacity }))
  refusal.value = null
  try {
    await $api(base.value, { method: 'PUT', body: { pools, confirmOverVenue } })
    await refresh()
    // Putting the old numbers back was allowed before, so it needs no second confirming.
    offer(t('box-office.setup.capacity.saved'), before.length
      ? async () => {
        await $api(base.value, { method: 'PUT', body: { pools: before, confirmOverVenue: true } })
        await refresh()
      }
      : undefined)
  }
  catch (e) {
    const r = toRefusal(e)
    if (r?.code === 'box-office.capacity.confirm-over-venue' && await confirm({ verb: t('box-office.setup.capacity.over-verb'), thing: t('box-office.setup.capacity.over-thing'), consequence: r.reason, button: t('box-office.setup.capacity.over-button') })) return saveCapacity(true)
    refusal.value = r
  }
}
async function saveWindow() {
  const s = data.value?.sales
  const before = { onSaleAt: s?.onSaleAt ?? null, offSaleAt: s?.offSaleAt ?? null, maxPerOrder: s?.maxPerOrder ?? null, holdMinutes: s?.holdMinutes ?? null }
  await act(() => $api(base.value, { method: 'PUT', body: windowForm.value }), t('box-office.setup.window.saved'), () => $api(base.value, { method: 'PUT', body: before }))
}
function layer(bandId: string, typeId: string): PriceLayer {
  return data.value?.priceLayers.find(l => l.bandId === bandId && l.ticketTypeId === typeId) ?? { bandId, ticketTypeId: typeId, production: null, own: null }
}
// What the box shows: the production's price, or, for this performance only, its own or else the production's.
function shown(l: PriceLayer): number | null {
  return scope.value === 'this' && l.own ? l.own.amountMinor : l.production
}
function seedPrices() {
  const d = data.value
  if (!d) return
  prices.value = Object.fromEntries(d.bands.flatMap(b => activeTypes.value.map(type => [cell(b.id, type.id), shown(layer(b.id, type.id))])))
}
watch([scope, activeTypes], seedPrices)

function priceHelp(bandId: string, typeId: string): string | undefined {
  const l = layer(bandId, typeId)
  if (scope.value === 'all') {
    if (!l.own) return undefined
    return l.own.amountMinor === null ? t('box-office.setup.prices.own-elsewhere-unsold') : t('box-office.setup.prices.own-elsewhere', { amount: money(l.own.amountMinor) })
  }
  if (!l.own) return l.production === null ? t('box-office.setup.prices.inherited-none') : t('box-office.setup.prices.inherited')
  return l.production === null ? t('box-office.setup.prices.own-none') : t('box-office.setup.prices.own', { amount: money(l.production) })
}

const pricesUrl = (d: Setup) => `/api/box-office/productions/${encodeURIComponent(d.performance.productionId)}/prices`
async function savePrices() {
  const d = data.value!
  const performanceId = scope.value === 'this' ? d.performance.id : null
  // Only what changed is sent, so a performance's own price is made only where it differs.
  const rows = d.bands.flatMap(b => activeTypes.value.map(type => ({ bandId: b.id, ticketTypeId: type.id, performanceId, amountMinor: prices.value[cell(b.id, type.id)] ?? null })))
    .filter(p => p.amountMinor !== shown(layer(p.bandId, p.ticketTypeId)))
  if (!rows.length) {
    toast.add({ title: t('box-office.setup.prices.unchanged'), color: 'neutral' })
    return
  }
  const later = when.value === 'later' && from.value !== null
  const at = from.value
  // Undo puts back what each box showed: the production's price, this performance's own, or
  // following the production again; a change set for later is cancelled instead.
  const before = rows.map((p) => {
    const l = layer(p.bandId, p.ticketTypeId)
    if (!p.performanceId) return { ...p, amountMinor: l.production }
    return l.own ? { ...p, amountMinor: l.own.amountMinor } : { ...p, amountMinor: null, inherit: true }
  })
  const undo = later
    ? () => Promise.all(rows.map(p => $api(`${pricesUrl(d)}/cancel-scheduled`, { method: 'POST', body: { bandId: p.bandId, ticketTypeId: p.ticketTypeId, performanceId: p.performanceId, from: at } })))
    : () => $api(pricesUrl(d), { method: 'POST', body: { prices: before } })
  const saved = await act(() => $api(pricesUrl(d), { method: 'POST', body: { prices: rows, ...(later ? { from: at } : {}) } }),
    later ? t('box-office.setup.prices.scheduled', { when: dateTime(at!) }) : t('box-office.setup.prices.saved'), undo)
  if (saved && later) {
    when.value = 'now'
    from.value = null
  }
}

// Changes set for later, in words: which ticket, what it becomes, from when, and for which performances.
const typeName = (typeId: string) => types.value?.ticketTypes.find(type => type.id === typeId)?.name ?? ''
const bandName = (bandId: string) => data.value?.bands.find(b => b.id === bandId)?.name ?? ''
function becomes(s: ScheduledPrice): string {
  if (s.inherits) return t('box-office.setup.prices.coming.inherits')
  return s.amountMinor === null ? t('box-office.setup.prices.coming.unsold') : money(s.amountMinor)
}
async function cancelScheduled(s: ScheduledPrice) {
  const d = data.value!
  // Undo sets the same change for the same moment again.
  const again = { bandId: s.bandId, ticketTypeId: s.ticketTypeId, performanceId: s.performanceId, amountMinor: s.inherits ? null : s.amountMinor, ...(s.inherits ? { inherit: true } : {}) }
  await act(() => $api(`${pricesUrl(d)}/cancel-scheduled`, { method: 'POST', body: { bandId: s.bandId, ticketTypeId: s.ticketTypeId, performanceId: s.performanceId, from: s.from } }), t('box-office.setup.prices.coming.cancelled'),
    () => $api(pricesUrl(d), { method: 'POST', body: { prices: [again], from: s.from } }))
}
async function inherit(bandId: string, typeId: string) {
  const d = data.value!
  const own = layer(bandId, typeId).own
  await act(() => $api(pricesUrl(d), { method: 'POST', body: { prices: [{ bandId, ticketTypeId: typeId, performanceId: d.performance.id, amountMinor: null, inherit: true }] } }), t('box-office.setup.prices.reverted'),
    own ? () => $api(pricesUrl(d), { method: 'POST', body: { prices: [{ bandId, ticketTypeId: typeId, performanceId: d.performance.id, amountMinor: own.amountMinor }] } }) : undefined)
}

// Copying another performance's set-up (BO-02).
interface Source { id: string, title: string, label: string | null, startsAt: number }
const { data: sources } = await useAPI<{ performances: Source[] }>(() => `${base.value}/sources`, { key: `box-office:setup:sources:${id.value}`, default: () => ({ performances: [] }) })
const sourceItems = computed(() => (sources.value?.performances ?? []).map(p => ({ value: p.id, label: [p.title, dateTime(p.startsAt), p.label].filter(Boolean).join(' · ') })))
const copyFrom = ref<string | undefined>(undefined)
async function copySetup(confirmOverVenue = false) {
  const from = sourceItems.value.find(s => s.value === copyFrom.value)
  if (!from) return
  if (!confirmOverVenue && !await confirm({ verb: t('box-office.setup.copy.verb'), thing: from.label, consequence: t('box-office.setup.copy.consequence'), button: t('box-office.setup.copy.button') })) return
  refusal.value = null
  try {
    const done = await $api<{ bands: number, pools: number, prices: number }>(`${base.value}/copy`, { method: 'POST', body: { fromPerformanceId: from.value, confirmOverVenue } })
    toast.add({ title: t('box-office.setup.copy.done'), description: t('box-office.setup.copy.done-detail', done), color: 'success' })
    copyFrom.value = undefined
    await refresh()
  }
  catch (e) {
    const r = toRefusal(e)
    if (r?.code === 'box-office.capacity.confirm-over-venue' && await confirm({ verb: t('box-office.setup.capacity.over-verb'), thing: t('box-office.setup.capacity.over-thing'), consequence: r.reason, button: t('box-office.setup.capacity.over-button') })) return copySetup(true)
    refusal.value = r
  }
}

const band = ref({ name: '', kind: 'standard' as 'standard' | 'wheelchair' | 'restricted_view' })
const bandKinds = computed(() => (['standard', 'wheelchair', 'restricted_view'] as const).map(value => ({ value, label: t(`box-office.setup.bands.kind.${value}`) })))
async function addBand() {
  const d = data.value!
  if (await act(() => $api(`/api/box-office/productions/${encodeURIComponent(d.performance.productionId)}/bands`, { method: 'POST', body: { name: band.value.name.trim(), kind: band.value.kind, sort: d.bands.length } }), t('box-office.setup.bands.added'))) band.value = { name: '', kind: 'standard' }
}

// The production's bands: renamed in a dialogue, removed while nothing is priced or sold in them.
const bandsUrl = (d: Setup) => `/api/box-office/productions/${encodeURIComponent(d.performance.productionId)}/bands`
const renaming = ref<Band | null>(null)
const newName = ref('')
const renameOpen = computed({ get: () => !!renaming.value, set: (v) => { if (!v) renaming.value = null } })
function startRename(b: Band) {
  newName.value = b.name
  renaming.value = b
}
async function rename() {
  const d = data.value!
  const b = renaming.value
  if (!b || !newName.value.trim()) return
  const url = `${bandsUrl(d)}/${encodeURIComponent(b.id)}`
  if (await act(() => $api(url, { method: 'PATCH', body: { name: newName.value.trim() } }), t('box-office.setup.bands.renamed'), () => $api(url, { method: 'PATCH', body: { name: b.name } }))) renaming.value = null
}
async function removeBand(b: Band) {
  const d = data.value!
  await act(() => $api(`${bandsUrl(d)}/${encodeURIComponent(b.id)}`, { method: 'DELETE' }), t('box-office.setup.bands.removed', { name: b.name }),
    () => $api(bandsUrl(d), { method: 'POST', body: { name: b.name, kind: b.kind, sort: b.sort } }))
}
const bandActions = (b: Band) => [[
  { label: t('box-office.setup.bands.rename'), icon: 'i-lucide-pencil', onSelect: () => startRename(b) },
  { label: t('box-office.setup.bands.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { void removeBand(b) } },
]]

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

// A missing way to pay is fixed under Payments, so that line links there.
const CHECK_LINKS: Record<string, string> = { payment: '/admin/modules/payments/providers' }
const checks = computed(() => (data.value?.checklist ?? []).map(c => ({ id: c.code, done: c.done, sentence: t(`box-office.setup.check.${c.code}`), link: CHECK_LINKS[c.code] })))
const trail = computed(() => [{ label: t('box-office.navigation.performances.label'), to: '/console/box-office/performances' }])
const totalCapacity = computed(() => Object.values(capacity.value).reduce((sum, n) => sum + (n ?? 0), 0))
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

        <div class="space-y-8">
          <RefusalNotice :refusal="refusal" />
          <div
            v-if="d.sales && d.sales.state !== 'draft'"
            class="flex flex-wrap gap-4"
          >
            <ULink
              :to="`/console/box-office/performances/${encodeURIComponent(d.performance.id)}/door`"
              class="inline-flex items-center gap-1 text-sm"
            >
              <UIcon name="i-lucide-door-open" />
              {{ t('box-office.door.title') }}
            </ULink>
            <ULink
              :to="`/console/box-office/performances/${encodeURIComponent(d.performance.id)}/change`"
              class="inline-flex items-center gap-1 text-sm"
            >
              <UIcon name="i-lucide-calendar-x" />
              {{ t('box-office.change.link') }}
            </ULink>
          </div>
          <RecordChecks
            :title="t('box-office.setup.checklist')"
            :checks="checks"
          />

          <PageSection
            :title="t('box-office.setup.copy.title')"
            :description="t('box-office.setup.copy.description')"
          >
            <p
              v-if="!sourceItems.length"
              class="text-sm text-muted"
            >
              {{ t('box-office.setup.copy.none') }}
            </p>
            <UForm
              v-else
              :state="{ copyFrom }"
              novalidate
              @submit="copySetup()"
            >
              <UFormField :label="t('box-office.setup.copy.from')">
                <div class="flex flex-wrap gap-2">
                  <USelectMenu
                    v-model="copyFrom"
                    class="min-w-72 flex-1"
                    :items="sourceItems"
                    value-key="value"
                    :placeholder="t('box-office.setup.copy.placeholder')"
                  />
                  <UButton
                    type="submit"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-copy"
                    :label="t('box-office.setup.copy.button')"
                    :disabled="!copyFrom"
                  />
                </div>
              </UFormField>
            </UForm>
          </PageSection>

          <PageSection
            :title="t('box-office.setup.bands.title')"
            :description="t('box-office.setup.bands.description')"
          >
            <RecordList
              v-if="d.bands.length"
              class="mb-4"
              :label="t('box-office.setup.bands.title')"
            >
              <RecordListItem
                v-for="b in d.bands"
                :key="b.id"
                :name="b.name"
                :description="t(`box-office.setup.bands.kind.${b.kind}`)"
              >
                <RowActions
                  :items="bandActions(b)"
                  :label="t('box-office.setup.bands.actions', { name: b.name })"
                />
              </RecordListItem>
            </RecordList>
            <UForm
              class="flex flex-wrap items-end gap-2"
              :state="band"
              :validate="() => needs({ name: band.name })"
              novalidate
              @submit="addBand"
            >
              <UFormField
                name="name"
                :label="t('box-office.setup.bands.name')"
                class="grow"
              >
                <UInput
                  v-model="band.name"
                  maxlength="60"
                />
              </UFormField>
              <UFormField :label="t('box-office.setup.bands.kind.label')">
                <USelect
                  v-model="band.kind"
                  :items="bandKinds"
                />
              </UFormField>
              <UButton
                type="submit"
                :label="t('box-office.setup.bands.add')"
                color="neutral"
                variant="outline"
              />
            </UForm>
          </PageSection>

          <PageSection
            :title="t('box-office.setup.capacity.title')"
            :description="d.houseCapacity ? t('box-office.setup.capacity.house', { capacity: d.houseCapacity, total: totalCapacity }) : t('box-office.setup.capacity.description')"
          >
            <UForm
              class="space-y-4"
              :state="capacity"
              novalidate
              @submit="saveCapacity()"
            >
              <p
                v-if="!d.bands.length"
                class="text-sm text-muted"
              >
                {{ t('box-office.setup.bands.none') }}
              </p>
              <UFormField
                v-for="b in d.bands"
                :key="b.id"
                :label="b.name"
                :help="t('box-office.setup.capacity.taken', { count: d.pools.find(p => p.bandId === b.id)?.claimed ?? 0 })"
              >
                <UInputNumber
                  v-model="capacity[b.id]"
                  :min="0"
                />
              </UFormField>
              <UButton
                v-if="d.bands.length"
                type="submit"
                :label="t('box-office.setup.capacity.save')"
              />
            </UForm>
          </PageSection>

          <PageSection
            :title="t('box-office.setup.prices.title')"
            :description="t('box-office.setup.prices.description')"
          >
            <p
              v-if="wheelchairSold && activeTypes.length"
              class="mb-4 text-sm text-muted"
            >
              {{ t('box-office.setup.prices.wheelchair') }}
            </p>
            <p
              v-if="!activeTypes.length"
              class="text-sm text-muted"
            >
              {{ t('box-office.setup.prices.no-types') }}
              <ULink to="/admin/modules/box-office/ticket-types">
                {{ t('box-office.navigation.ticket-types.label') }}
              </ULink>
            </p>
            <UForm
              v-else-if="d.bands.length"
              class="space-y-6"
              :state="prices"
              :validate="() => needs({ from: when === 'later' ? from : true })"
              novalidate
              @submit="savePrices"
            >
              <UFormField :label="t('box-office.setup.prices.scope.label')">
                <URadioGroup
                  v-model="scope"
                  orientation="horizontal"
                  variant="table"
                  :items="scopes"
                />
              </UFormField>
              <UFormField :label="t('box-office.setup.prices.when.label')">
                <URadioGroup
                  v-model="when"
                  orientation="horizontal"
                  variant="table"
                  :items="whens"
                />
              </UFormField>
              <UFormField
                v-if="when === 'later'"
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
              <fieldset
                v-for="b in d.bands"
                :key="b.id"
                class="space-y-3"
              >
                <legend class="font-medium">
                  {{ b.name }}
                </legend>
                <UFormField
                  v-for="type in activeTypes"
                  :key="type.id"
                  :label="type.name"
                  :help="priceHelp(b.id, type.id)"
                >
                  <div class="flex flex-wrap items-center gap-2">
                    <FieldMoney v-model="prices[cell(b.id, type.id)]" />
                    <UButton
                      v-if="scope === 'this' && layer(b.id, type.id).own"
                      color="neutral"
                      variant="link"
                      icon="i-lucide-undo-2"
                      :label="t('box-office.setup.prices.revert')"
                      @click="inherit(b.id, type.id)"
                    />
                  </div>
                </UFormField>
              </fieldset>
              <UButton
                type="submit"
                :label="t(when === 'later' ? 'box-office.setup.prices.save-later' : 'box-office.setup.prices.save')"
              />
            </UForm>
            <div
              v-if="d.scheduledPrices.length"
              class="mt-6 space-y-2"
            >
              <h3 class="font-medium">
                {{ t('box-office.setup.prices.coming.title') }}
              </h3>
              <ul class="divide-y divide-default">
                <li
                  v-for="s in d.scheduledPrices"
                  :key="`${s.bandId} ${s.ticketTypeId} ${s.performanceId} ${s.from}`"
                  class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    {{ t('box-office.setup.prices.coming.line', { band: bandName(s.bandId), type: typeName(s.ticketTypeId), becomes: becomes(s), when: dateTime(s.from) }) }}
                    <span class="text-muted">· {{ t(s.performanceId ? 'box-office.setup.prices.scope.this' : 'box-office.setup.prices.scope.all') }}</span>
                  </span>
                  <UButton
                    color="neutral"
                    variant="link"
                    icon="i-lucide-x"
                    :label="t('box-office.setup.prices.coming.cancel')"
                    :aria-label="t('box-office.setup.prices.coming.cancel-label', { type: typeName(s.ticketTypeId), band: bandName(s.bandId), when: dateTime(s.from) })"
                    @click="cancelScheduled(s)"
                  />
                </li>
              </ul>
            </div>
          </PageSection>

          <PageSection
            :title="t('box-office.setup.window.title')"
            :description="t('box-office.setup.window.description')"
          >
            <UForm
              class="space-y-4"
              :state="windowForm"
              novalidate
              @submit="saveWindow"
            >
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
              <UFormField
                :label="t('box-office.setup.window.max-per-order')"
                :help="t('box-office.setup.window.default-help')"
              >
                <UInputNumber
                  v-model="windowForm.maxPerOrder"
                  :min="1"
                  :max="500"
                />
              </UFormField>
              <UFormField
                :label="t('box-office.setup.window.hold')"
                :help="t('box-office.setup.window.default-help')"
              >
                <UInputNumber
                  v-model="windowForm.holdMinutes"
                  :min="1"
                  :max="60"
                />
              </UFormField>
              <UButton
                type="submit"
                :label="t('box-office.setup.window.save')"
              />
            </UForm>
          </PageSection>
        </div>
        <UModal
          v-model:open="renameOpen"
          :title="t('box-office.setup.bands.rename')"
        >
          <template #body>
            <UForm
              class="flex items-end gap-2"
              :state="{ newName }"
              :validate="() => needs({ newName })"
              novalidate
              @submit="rename"
            >
              <UFormField
                name="newName"
                :label="t('box-office.setup.bands.name')"
                class="grow"
              >
                <UInput
                  v-model="newName"
                  maxlength="60"
                  autofocus
                />
              </UFormField>
              <UButton
                type="submit"
                :label="t('box-office.setup.bands.rename')"
              />
            </UForm>
          </template>
        </UModal>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
