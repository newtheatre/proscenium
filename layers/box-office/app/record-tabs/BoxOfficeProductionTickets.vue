<!-- The Tickets tab on a production's page (core.record-tab; show walkthrough, decision 1): the one
     place a run's tickets are set up (Matt, 21 Nov 2026). How the run is selling, a warning when
     performances are on sale while the production is still in draft, the run's seats, sections,
     prices (now or from a later date), wheelchair spaces, the whole run put on sale at once, and
     each performance with where its sales stand. A night given seats or prices of its own on its
     set-up keeps them and says so. A production with one price throughout has at most one section,
     which is not named: its seats are one number and its prices one per ticket type, until the
     house is split into sections here (show walkthrough, decision 4). -->
<script setup lang="ts">
// The Wheelchair space and the Access ticket take the lowest price the buyer can have, so neither is priced here.
const ACCESS_TYPES = ['box-office.wheelchair', 'box-office.access']
const props = defineProps<{ recordId: string }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { offer } = useUndo()
const toast = useToast()
const { dateTime } = useDates()
const { money } = await useMoney()
const { data, status, error, refresh } = await useProductionTickets(() => props.recordId)
const base = computed(() => `/api/box-office/productions/${encodeURIComponent(props.recordId)}/sales`)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

// On sale (or paused, so still bookable once put back) while buyers cannot find the production.
const sellingUnpublished = computed(() => !!data.value && data.value.production.state !== 'published'
  && data.value.performances.filter(p => p.sales === 'on_sale' || p.sales === 'paused').length)
const facts = computed(() => {
  const totals = data.value?.totals
  if (!totals) return []
  return [
    { label: t('box-office.production-tickets.performances'), value: totals.performances },
    { label: t('box-office.production-tickets.on-sale'), value: totals.onSale },
    { label: t('box-office.production-tickets.taken'), value: totals.capacity ? t('box-office.production-tickets.seats', { taken: totals.taken, capacity: totals.capacity }) : '0' },
  ]
})
const badge = (row: ProductionTicketsRow) => !row.scheduled && !row.past
  ? { tone: 'neutral' as const, label: t('box-office.performances.not-scheduled') }
  : saleStateBadge(row.sales, row.capacity, t)
const when = (row: ProductionTicketsRow) => row.label ? `${dateTime(row.startsAt)}, ${row.label}` : dateTime(row.startsAt)
const describe = (row: ProductionTicketsRow) => [
  row.capacity ? t('box-office.production-tickets.seats', { taken: row.taken, capacity: row.capacity }) : null,
  row.ownSeats ? t('box-office.production-tickets.own-seats') : null,
  row.ownPrices ? t('box-office.production-tickets.own-prices') : null,
].filter(Boolean).join(' · ') || undefined

// One price throughout: no more than one section, so none is named. With none yet, the seats are typed
// into a box of their own, and the one section is made when they are saved.
// Once the house is being split, the sections are shown and named even while there is only one.
const route = useRoute()
const splitting = ref(route.hash === '#sections')
const sectioned = computed(() => (data.value?.sections.length ?? 0) > 1 || splitting.value)
const wholeSeats = ref(0)
async function wholeHouse(): Promise<Record<string, number> | null> {
  const d = data.value!
  if (d.sections.length) return seats.value
  refusal.value = null
  try {
    const typed = wholeSeats.value
    await $api(`/api/box-office/productions/${encodeURIComponent(props.recordId)}/bands`, { method: 'POST', body: { name: t('box-office.setup.sections.whole-house'), kind: 'standard', sort: 0 } })
    await refresh()
    const only = data.value?.sections[0]
    wholeSeats.value = 0
    return only ? { [only.id]: typed } : null
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return null
  }
}

// The seats for the run: one number a section, for every night that follows the run.
const seats = ref<Record<string, number>>({})
watch(data, (d) => {
  if (d) seats.value = Object.fromEntries(d.sections.map(s => [s.id, d.runSeats[s.id] ?? 0]))
}, { immediate: true })
const coming = computed(() => (data.value?.performances ?? []).filter(p => !p.past))
const ownCount = computed(() => coming.value.filter(p => p.ownSeats).length)

interface RunResult { done: number, skipped: { performanceId: string, reason: string }[], performanceIds?: string[] }
async function saveSeats(confirmOverVenue = false, typed?: Record<string, number>) {
  const counts = typed ?? await wholeHouse()
  if (!counts) return
  const d = data.value!
  const pools = d.sections.map(s => ({ bandId: s.id, capacity: counts[s.id] ?? 0 }))
  const before = d.sections.map(s => ({ bandId: s.id, capacity: d.runSeats[s.id] ?? 0 }))
  refusal.value = null
  try {
    const result = await $api<RunResult>(`${base.value}/seats`, { method: 'PUT', body: { pools, confirmOverVenue } })
    await refresh()
    const changed = result.performanceIds ?? []
    offer(t('box-office.production-tickets.run-seats.saved', { count: result.done }), changed.length
      ? async () => {
        await $api(`${base.value}/seats`, { method: 'PUT', body: { pools: before, performanceIds: changed, confirmOverVenue: true } })
        await refresh()
      }
      : undefined)
    if (result.skipped.length) toast.add({ title: t('box-office.production-tickets.run-seats.skipped', { count: result.skipped.length }), color: 'warning' })
  }
  catch (e) {
    const r = toRefusal(e)
    if (r?.code === 'box-office.capacity.confirm-over-venue' && await confirm({ verb: t('box-office.setup.capacity.over-verb'), thing: t('box-office.setup.capacity.over-thing'), consequence: r.reason, button: t('box-office.setup.capacity.over-button') })) return saveSeats(true, counts)
    refusal.value = r
  }
}

// The run's prices: what each ticket type costs in each section at every performance without its own.
interface TicketType { id: string, name: string, kind: string, active: boolean, available?: boolean, managedBy?: string | null }
const { data: types } = await useAPI<{ ticketTypes: TicketType[] }>('/api/box-office/ticket-types', { key: 'box-office:ticket-types', default: () => ({ ticketTypes: [] }) })
// As on a performance's set-up: complimentary tickets are never priced, a Wheelchair space follows the others.
const wheelchairSold = computed(() => (types.value?.ticketTypes ?? []).some(type => type.active && type.available !== false && ACCESS_TYPES.includes(type.managedBy ?? '')))
const priced = computed(() => (types.value?.ticketTypes ?? []).filter(type => type.active && type.available !== false && type.kind !== 'complimentary' && !ACCESS_TYPES.includes(type.managedBy ?? '')))
const cell = (bandId: string, typeId: string) => `${bandId} ${typeId}`
const runPrice = (bandId: string, typeId: string) => data.value?.runPrices.find(p => p.bandId === bandId && p.ticketTypeId === typeId)?.amountMinor ?? null
const prices = ref<Record<string, number | null>>({})
watch([data, priced], () => {
  const d = data.value
  if (d) prices.value = Object.fromEntries(d.sections.flatMap(s => priced.value.map(type => [cell(s.id, type.id), runPrice(s.id, type.id)])))
}, { immediate: true })
// When a change takes effect: now, or from a moment set ahead, such as the end of an early-bird offer.
const takes = ref<'now' | 'later'>('now')
const whens = computed(() => (['now', 'later'] as const).map(value => ({ value, label: t(`box-office.setup.prices.when.${value}`) })))
const from = ref<number | null>(null)
const soon = Date.now()
const pricesUrl = computed(() => `/api/box-office/productions/${encodeURIComponent(props.recordId)}/prices`)
async function savePrices() {
  const d = data.value!
  const rows = d.sections.flatMap(s => priced.value.map(type => ({ bandId: s.id, ticketTypeId: type.id, performanceId: null, amountMinor: prices.value[cell(s.id, type.id)] ?? null })))
    .filter(r => r.amountMinor !== runPrice(r.bandId, r.ticketTypeId))
  if (!rows.length) {
    toast.add({ title: t('box-office.setup.prices.unchanged'), color: 'neutral' })
    return
  }
  const at = takes.value === 'later' ? from.value : null
  const before = rows.map(r => ({ ...r, amountMinor: runPrice(r.bandId, r.ticketTypeId) }))
  // A change made now is put back; one set for later is cancelled instead.
  const undo = at !== null
    ? () => Promise.all(rows.map(r => $api(`${pricesUrl.value}/cancel-scheduled`, { method: 'POST', body: { bandId: r.bandId, ticketTypeId: r.ticketTypeId, performanceId: null, from: at } })))
    : () => $api(pricesUrl.value, { method: 'POST', body: { prices: before } })
  refusal.value = null
  try {
    await $api(pricesUrl.value, { method: 'POST', body: { prices: rows, ...(at !== null ? { from: at } : {}) } })
    await refresh()
    offer(at !== null ? t('box-office.setup.prices.scheduled', { when: dateTime(at) }) : t('box-office.setup.prices.saved'), async () => {
      await undo()
      await refresh()
    })
    takes.value = 'now'
    from.value = null
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// The run's changes set for later, in words, naming the section only where there is more than one.
type Coming = NonNullable<ProductionTickets['scheduledPrices']>[number]
const typeName = (typeId: string) => types.value?.ticketTypes.find(type => type.id === typeId)?.name ?? ''
const sectionName = (bandId: string) => data.value?.sections.find(s => s.id === bandId)?.name ?? ''
const becomes = (s: Coming) => s.amountMinor === null ? t('box-office.setup.prices.coming.unsold') : money(s.amountMinor)
const comingLine = (s: Coming) => sectioned.value
  ? t('box-office.setup.prices.coming.line', { band: sectionName(s.bandId), type: typeName(s.ticketTypeId), becomes: becomes(s), when: dateTime(s.from) })
  : t('box-office.setup.prices.coming.line-whole', { type: typeName(s.ticketTypeId), becomes: becomes(s), when: dateTime(s.from) })
const comingCancel = (s: Coming) => sectioned.value
  ? t('box-office.setup.prices.coming.cancel-label', { type: typeName(s.ticketTypeId), band: sectionName(s.bandId), when: dateTime(s.from) })
  : t('box-office.setup.prices.coming.cancel-label-whole', { type: typeName(s.ticketTypeId), when: dateTime(s.from) })
async function cancelScheduled(s: Coming) {
  refusal.value = null
  try {
    await $api(`${pricesUrl.value}/cancel-scheduled`, { method: 'POST', body: { bandId: s.bandId, ticketTypeId: s.ticketTypeId, performanceId: null, from: s.from } })
    await refresh()
    // Undo sets the same change for the same moment again.
    offer(t('box-office.setup.prices.coming.cancelled'), async () => {
      await $api(pricesUrl.value, { method: 'POST', body: { prices: [{ bandId: s.bandId, ticketTypeId: s.ticketTypeId, performanceId: null, amountMinor: s.amountMinor }], from: s.from } })
      await refresh()
    })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// The whole run on sale at once.
const notOnSale = computed(() => coming.value.filter(p => p.scheduled && p.sales !== 'on_sale' && p.sales !== 'closed').length)
async function openRun() {
  refusal.value = null
  try {
    const result = await $api<RunResult>(`${base.value}/open`, { method: 'POST', body: {} })
    await refresh()
    toast.add({
      title: t('box-office.setup.run.opened', { count: result.done }),
      description: result.skipped.length ? t('box-office.setup.run.open-skipped', { count: result.skipped.length }) : undefined,
      color: result.skipped.length ? 'warning' : 'success',
    })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <div
      v-if="data"
      class="space-y-4"
    >
      <UAlert
        v-if="sellingUnpublished"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="t('box-office.production-tickets.draft-on-sale.title', { count: sellingUnpublished })"
        :description="t('box-office.production-tickets.draft-on-sale.description')"
      />
      <RefusalNotice :refusal="refusal" />
      <EmptyState
        v-if="!data.performances.length"
        :title="t('box-office.production-tickets.empty.title')"
        :description="t('box-office.production-tickets.empty.description')"
        icon="i-lucide-ticket"
      />
      <template v-else>
        <FactStrip
          :facts="facts"
          framed
        />

        <PageSection
          :title="t('box-office.production-tickets.run-seats.title')"
          :description="ownCount ? t('box-office.production-tickets.run-seats.own', { count: ownCount }) : t(sectioned ? 'box-office.production-tickets.run-seats.description' : 'box-office.production-tickets.run-seats.description-whole')"
        >
          <UForm
            class="space-y-4"
            :state="seats"
            novalidate
            @submit="saveSeats()"
          >
            <UFormField
              v-if="!data.sections.length"
              :label="t('box-office.setup.capacity.whole')"
            >
              <FieldNumber
                v-model="wholeSeats"
                class="w-40"
                :min="0"
              />
            </UFormField>
            <UFormField
              v-for="s in data.sections"
              :key="s.id"
              :label="sectioned ? s.name : t('box-office.setup.capacity.whole')"
            >
              <FieldNumber
                v-model="seats[s.id]"
                class="w-40"
                :min="0"
              />
            </UFormField>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                type="submit"
                :label="t('box-office.production-tickets.run-seats.save')"
              />
            </div>
          </UForm>
          <template
            v-if="!sectioned"
            #footer
          >
            <p class="text-sm text-muted">
              {{ t('box-office.setup.sections.split-help') }}
            </p>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-split"
              :label="t('box-office.setup.sections.split')"
              @click="splitting = true"
            />
          </template>
        </PageSection>

        <BoxOfficeRunSections
          v-if="sectioned"
          :production-id="props.recordId"
          :sections="data.sections"
          @changed="refresh()"
        />

        <PageSection
          v-if="data.sections.length"
          :title="t('box-office.setup.prices.title')"
          :description="t(sectioned ? 'box-office.production-tickets.run-prices.description' : 'box-office.production-tickets.run-prices.description-whole')"
        >
          <p
            v-if="!priced.length"
            class="text-sm text-muted"
          >
            {{ t('box-office.setup.prices.no-types') }}
            <ULink to="/admin/modules/box-office/ticket-types">
              {{ t('box-office.navigation.ticket-types.label') }}
            </ULink>
          </p>
          <UForm
            v-else
            class="space-y-6"
            :state="prices"
            :validate="() => needs({ from: takes === 'later' ? from : true })"
            novalidate
            @submit="savePrices"
          >
            <p
              v-if="wheelchairSold"
              class="text-sm text-muted"
            >
              {{ t('box-office.setup.prices.wheelchair') }}
            </p>
            <fieldset
              v-for="s in data.sections"
              :key="s.id"
              class="grid grid-cols-2 items-start gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            >
              <legend
                v-if="sectioned"
                class="mb-3 font-medium"
              >
                {{ s.name }}
              </legend>
              <UFormField
                v-for="type in priced"
                :key="type.id"
              >
                <template #label>
                  <span
                    v-if="sectioned"
                    class="sr-only"
                  >{{ s.name }}, </span>{{ type.name }}<span class="sr-only"> {{ t('box-office.production-tickets.price') }}</span>
                </template>
                <FieldMoney v-model="prices[cell(s.id, type.id)]" />
              </UFormField>
            </fieldset>
            <UFormField :label="t('box-office.setup.prices.when.label')">
              <URadioGroup
                v-model="takes"
                orientation="horizontal"
                variant="table"
                :items="whens"
              />
            </UFormField>
            <UFormField
              v-if="takes === 'later'"
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
            <UButton
              type="submit"
              :label="t(takes === 'later' ? 'box-office.setup.prices.save-later' : 'box-office.setup.prices.save')"
            />
          </UForm>
          <div
            v-if="data.scheduledPrices?.length"
            class="mt-6 space-y-2"
          >
            <h3 class="font-medium">
              {{ t('box-office.setup.prices.coming.title') }}
            </h3>
            <ul class="divide-y divide-default">
              <li
                v-for="s in data.scheduledPrices"
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
        </PageSection>

        <PageSection
          v-if="notOnSale"
          :title="t('box-office.production-tickets.open.title')"
          :description="t('box-office.production-tickets.open.description')"
        >
          <UButton
            icon="i-lucide-play"
            :label="t('box-office.setup.run.open', { count: notOnSale })"
            @click="openRun"
          />
        </PageSection>

        <BoxOfficeRunLayout
          :production-id="props.recordId"
          @changed="refresh()"
        />

        <h2 class="pt-2 font-semibold text-highlighted">
          {{ t('box-office.production-tickets.nights') }}
        </h2>
        <RecordList :label="t('box-office.record-tabs.production.label')">
          <RecordListItem
            v-for="row in data.performances"
            :key="row.id"
            :to="`/console/box-office/performances/${encodeURIComponent(row.id)}`"
            :name="when(row)"
            :description="describe(row)"
            :muted="row.past"
          >
            <StatusBadge
              :tone="badge(row).tone"
              :label="badge(row).label"
            />
          </RecordListItem>
        </RecordList>
      </template>
    </div>
  </DataBoundary>
</template>
