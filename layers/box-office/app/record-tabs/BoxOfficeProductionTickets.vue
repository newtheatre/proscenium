<!-- The Tickets tab on a production's page (core.record-tab; show walkthrough, decision 1): how the
     run is selling, a warning when performances are on sale while the production is still in draft,
     the seats for the whole run set once, the whole run put on sale at once, and each performance
     with where its sales stand. A night whose seats were changed on its own set-up keeps them (a
     per-night override) and says so; it opens its set-up for anything else of its own. -->
<script setup lang="ts">
const props = defineProps<{ recordId: string }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { offer } = useUndo()
const toast = useToast()
const { dateTime } = useDates()
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
].filter(Boolean).join(' · ') || undefined

// The seats for the run: one number a section, for every night that follows the run.
const seats = ref<Record<string, number>>({})
watch(data, (d) => {
  if (d) seats.value = Object.fromEntries(d.sections.map(s => [s.id, d.runSeats[s.id] ?? 0]))
}, { immediate: true })
const coming = computed(() => (data.value?.performances ?? []).filter(p => !p.past))
const ownCount = computed(() => coming.value.filter(p => p.ownSeats).length)
const firstToCome = computed(() => coming.value[0] ?? data.value?.performances[0])

interface RunResult { done: number, skipped: { performanceId: string, reason: string }[], performanceIds?: string[] }
async function saveSeats(confirmOverVenue = false) {
  const d = data.value!
  const pools = d.sections.map(s => ({ bandId: s.id, capacity: seats.value[s.id] ?? 0 }))
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
    if (r?.code === 'box-office.capacity.confirm-over-venue' && await confirm({ verb: t('box-office.setup.capacity.over-verb'), thing: t('box-office.setup.capacity.over-thing'), consequence: r.reason, button: t('box-office.setup.capacity.over-button') })) return saveSeats(true)
    refusal.value = r
  }
}

// The run's prices: what each ticket type costs in each section at every performance without its own.
interface TicketType { id: string, name: string, kind: string, active: boolean, available?: boolean, managedBy?: string | null }
const { data: types } = await useAPI<{ ticketTypes: TicketType[] }>('/api/box-office/ticket-types', { key: 'box-office:ticket-types', default: () => ({ ticketTypes: [] }) })
// As on a performance's set-up: complimentary tickets are never priced, a Wheelchair space follows the others.
const priced = computed(() => (types.value?.ticketTypes ?? []).filter(type => type.active && type.available !== false && type.kind !== 'complimentary' && type.managedBy !== 'box-office.wheelchair'))
const cell = (bandId: string, typeId: string) => `${bandId} ${typeId}`
const runPrice = (bandId: string, typeId: string) => data.value?.runPrices.find(p => p.bandId === bandId && p.ticketTypeId === typeId)?.amountMinor ?? null
const prices = ref<Record<string, number | null>>({})
watch([data, priced], () => {
  const d = data.value
  if (d) prices.value = Object.fromEntries(d.sections.flatMap(s => priced.value.map(type => [cell(s.id, type.id), runPrice(s.id, type.id)])))
}, { immediate: true })
async function savePrices() {
  const d = data.value!
  const rows = d.sections.flatMap(s => priced.value.map(type => ({ bandId: s.id, ticketTypeId: type.id, performanceId: null, amountMinor: prices.value[cell(s.id, type.id)] ?? null })))
    .filter(r => r.amountMinor !== runPrice(r.bandId, r.ticketTypeId))
  if (!rows.length) {
    toast.add({ title: t('box-office.setup.prices.unchanged'), color: 'neutral' })
    return
  }
  const before = rows.map(r => ({ ...r, amountMinor: runPrice(r.bandId, r.ticketTypeId) }))
  const url = `/api/box-office/productions/${encodeURIComponent(props.recordId)}/prices`
  refusal.value = null
  try {
    await $api(url, { method: 'POST', body: { prices: rows } })
    await refresh()
    offer(t('box-office.setup.prices.saved'), async () => {
      await $api(url, { method: 'POST', body: { prices: before } })
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
          :description="ownCount ? t('box-office.production-tickets.run-seats.own', { count: ownCount }) : t('box-office.production-tickets.run-seats.description')"
        >
          <p
            v-if="!data.sections.length"
            class="text-sm text-muted"
          >
            {{ t('box-office.production-tickets.run-seats.no-sections') }}
            <ULink
              v-if="firstToCome"
              :to="`/console/box-office/performances/${encodeURIComponent(firstToCome.id)}`"
            >
              {{ t('box-office.production-tickets.open-set-up') }}
            </ULink>
          </p>
          <UForm
            v-else
            class="space-y-4"
            :state="seats"
            novalidate
            @submit="saveSeats()"
          >
            <UFormField
              v-for="s in data.sections"
              :key="s.id"
              :label="s.name"
            >
              <UInputNumber
                v-model="seats[s.id]"
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
            v-if="notOnSale"
            #footer
          >
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-play"
              :label="t('box-office.setup.run.open', { count: notOnSale })"
              @click="openRun"
            />
          </template>
        </PageSection>

        <PageSection
          v-if="data.sections.length"
          :title="t('box-office.setup.prices.title')"
          :description="t('box-office.production-tickets.run-prices.description')"
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
            novalidate
            @submit="savePrices"
          >
            <fieldset
              v-for="s in data.sections"
              :key="s.id"
              class="space-y-3"
            >
              <legend class="font-medium">
                {{ s.name }}
              </legend>
              <UFormField
                v-for="type in priced"
                :key="type.id"
              >
                <template #label>
                  <span class="sr-only">{{ s.name }}, </span>{{ type.name }}<span class="sr-only"> {{ t('box-office.production-tickets.price') }}</span>
                </template>
                <FieldMoney v-model="prices[cell(s.id, type.id)]" />
              </UFormField>
            </fieldset>
            <UButton
              type="submit"
              :label="t('box-office.setup.prices.save')"
            />
          </UForm>
        </PageSection>

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
