<!-- A performance's sales set-up (Box office specification, part 6, "Performance set-up"; BO-01,
     BO-04): what is still missing before it can go on sale, how many of each band to sell, what each
     ticket type costs in each band, and when sales open and close. A production's bands and prices
     are shared by all its performances; capacity and the sale window are this performance's own. -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

type Sales = 'draft' | 'on_sale' | 'paused' | 'closed'
interface Band { id: string, name: string, kind: string, sort: number }
interface Pool { bandId: string, capacity: number, claimed: number }
interface Price { bandId: string, ticketTypeId: string, amountMinor: number }
interface TicketType { id: string, name: string, kind: string, active: boolean, available?: boolean }
interface Setup {
  sales: { state: Sales, onSaleAt: number | null, offSaleAt: number | null, maxPerOrder: number | null, holdMinutes: number | null } | null
  houseCapacity: number | null
  pools: Pool[]
  prices: Price[]
  checklist: { code: string, done: boolean }[]
  performance: { id: string, productionId: string, title: string, label: string | null, startsAt: number, state: string }
  bands: Band[]
}

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { dateTime } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useAPI<Setup>(() => `/api/box-office/performances/${encodeURIComponent(id.value)}/sales`, { key: `box-office:setup:${id.value}` })
const { data: types } = await useAPI<{ ticketTypes: TicketType[] }>('/api/box-office/ticket-types', { key: 'box-office:ticket-types', default: () => ({ ticketTypes: [] }) })
// Complimentary tickets are issued by approving a request, never priced; a type whose module is off is not sold.
const activeTypes = computed(() => (types.value?.ticketTypes ?? []).filter(type => type.active && type.available !== false && type.kind !== 'complimentary'))

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const base = computed(() => `/api/box-office/performances/${encodeURIComponent(id.value)}/sales`)
async function act(run: () => Promise<unknown>, done: string): Promise<boolean> {
  refusal.value = null
  try {
    await run()
    toast.add({ title: done, color: 'success' })
    await refresh()
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return false
  }
}

// Capacity: one number for each band of the production.
const capacity = ref<Record<string, number>>({})
// Prices: one amount for each band and ticket type, in the minor unit; null is not sold.
const prices = ref<Record<string, number | null>>({})
// The sale window and limits.
const windowForm = ref({ onSaleAt: null as number | null, offSaleAt: null as number | null, maxPerOrder: null as number | null, holdMinutes: null as number | null })
const cell = (bandId: string, typeId: string) => `${bandId} ${typeId}`
watch(data, (d) => {
  if (!d) return
  capacity.value = Object.fromEntries(d.bands.map(b => [b.id, d.pools.find(p => p.bandId === b.id)?.capacity ?? 0]))
  prices.value = Object.fromEntries(d.prices.map(p => [cell(p.bandId, p.ticketTypeId), p.amountMinor]))
  windowForm.value = { onSaleAt: d.sales?.onSaleAt ?? null, offSaleAt: d.sales?.offSaleAt ?? null, maxPerOrder: d.sales?.maxPerOrder ?? null, holdMinutes: d.sales?.holdMinutes ?? null }
}, { immediate: true })

async function saveCapacity(confirmOverVenue = false) {
  const pools = Object.entries(capacity.value).map(([bandId, n]) => ({ bandId, capacity: n ?? 0 }))
  refusal.value = null
  try {
    await $api(base.value, { method: 'PUT', body: { pools, confirmOverVenue } })
    toast.add({ title: t('box-office.setup.capacity.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    const r = toRefusal(e)
    if (r?.code === 'box-office.capacity.confirm-over-venue' && await confirm({ verb: t('box-office.setup.capacity.over-verb'), thing: t('box-office.setup.capacity.over-thing'), consequence: r.reason, button: t('box-office.setup.capacity.over-button') })) return saveCapacity(true)
    refusal.value = r
  }
}
async function saveWindow() {
  await act(() => $api(base.value, { method: 'PUT', body: windowForm.value }), t('box-office.setup.window.saved'))
}
async function savePrices() {
  const d = data.value!
  const rows = d.bands.flatMap(b => activeTypes.value.map(type => ({ bandId: b.id, ticketTypeId: type.id, amountMinor: prices.value[cell(b.id, type.id)] ?? null })))
    .filter(p => p.amountMinor !== null || d.prices.some(old => old.bandId === p.bandId && old.ticketTypeId === p.ticketTypeId))
  if (!rows.length) return
  await act(() => $api(`/api/box-office/productions/${encodeURIComponent(d.performance.productionId)}/prices`, { method: 'POST', body: { prices: rows } }), t('box-office.setup.prices.saved'))
}

const band = ref({ name: '', kind: 'standard' as 'standard' | 'wheelchair' | 'restricted_view' })
const bandKinds = computed(() => (['standard', 'wheelchair', 'restricted_view'] as const).map(value => ({ value, label: t(`box-office.setup.bands.kind.${value}`) })))
async function addBand() {
  const d = data.value!
  if (await act(() => $api(`/api/box-office/productions/${encodeURIComponent(d.performance.productionId)}/bands`, { method: 'POST', body: { name: band.value.name.trim(), kind: band.value.kind, sort: d.bands.length } }), t('box-office.setup.bands.added'))) band.value = { name: '', kind: 'standard' }
}

async function open() {
  await act(() => $api(`${base.value}/open`, { method: 'POST', body: {} }), t('box-office.setup.opened'))
}
async function pause() {
  const d = data.value!
  if (!await confirm({ verb: t('box-office.setup.pause.verb'), thing: t('box-office.setup.thing', { title: d.performance.title }), consequence: t('box-office.setup.pause.consequence') })) return
  await act(() => $api(`${base.value}/pause`, { method: 'POST', body: {} }), t('box-office.setup.paused'))
}

const TONES = { draft: 'neutral', on_sale: 'success', paused: 'warning', closed: 'neutral' } as const
const checks = computed(() => (data.value?.checklist ?? []).map(c => ({ id: c.code, done: c.done, sentence: t(`box-office.setup.check.${c.code}`) })))
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
          <StatusBadge
            :tone="d.sales ? TONES[d.sales.state] : 'neutral'"
            :label="d.sales ? t(`box-office.performances.sales.${d.sales.state}`) : t('box-office.performances.not-set-up')"
          />
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
            :title="t('box-office.setup.capacity.title')"
            :description="d.houseCapacity ? t('box-office.setup.capacity.house', { capacity: d.houseCapacity, total: totalCapacity }) : t('box-office.setup.capacity.description')"
          >
            <UForm
              class="space-y-4"
              :state="capacity"
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
            :title="t('box-office.setup.bands.title')"
            :description="t('box-office.setup.bands.description')"
          >
            <UForm
              class="flex flex-wrap items-end gap-2"
              :state="band"
              @submit="addBand"
            >
              <UFormField
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
                :disabled="!band.name.trim()"
              />
            </UForm>
          </PageSection>

          <PageSection
            :title="t('box-office.setup.prices.title')"
            :description="t('box-office.setup.prices.description')"
          >
            <p
              v-if="!activeTypes.length"
              class="text-sm text-muted"
            >
              {{ t('box-office.setup.prices.no-types') }}
              <ULink to="/console/box-office/ticket-types">
                {{ t('box-office.navigation.ticket-types.label') }}
              </ULink>
            </p>
            <UForm
              v-else-if="d.bands.length"
              class="space-y-6"
              :state="prices"
              @submit="savePrices"
            >
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
                >
                  <FieldMoney v-model="prices[cell(b.id, type.id)]" />
                </UFormField>
              </fieldset>
              <UButton
                type="submit"
                :label="t('box-office.setup.prices.save')"
              />
            </UForm>
          </PageSection>

          <PageSection
            :title="t('box-office.setup.window.title')"
            :description="t('box-office.setup.window.description')"
          >
            <UForm
              class="space-y-4"
              :state="windowForm"
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
      </PageFrame>
    </template>
  </DataBoundary>
</template>
