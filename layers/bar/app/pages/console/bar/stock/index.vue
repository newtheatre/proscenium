<!-- Stock (S7): how much of each item every location holds, in the unit people count in. A level below
     nought is shown in words, as a sign that a delivery or a count is missing; stock never stops a
     sale. A location that has never held an item shows a dash. Pressing a row reads how the item
     moved; its menu writes stock off or moves it between locations. An amount to
     write off or move is typed in the unit people count in, in packs or in base units; taking more
     than a location holds is said plainly and asked about first. Setting up items and locations is
     in Admin. A table on a laptop, a list on a phone; a right click on a row is its menu. -->
<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'

interface Item {
  id: string
  name: string
  baseUnit: StockUnit
  countUnitSize: number
  packSize: number
  packName: string
  reorderLevel: number | null
  levels: { locationId: string, quantity: number }[]
  total: number
  low: boolean
}
interface Movement { id: string, stockItemId: string, locationId: string, kind: string, quantity: number, reason: string | null, by: string | null, at: number }

const { t } = useT()
const route = useRoute()
const router = useRouter()
const { $api } = useNuxtApp()
const { dateTime } = useDates()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { offer } = useUndo()
const { number, amount: stockAmount, entryUnits } = useStockAmounts()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ items: Item[], locations: { id: string, name: string }[], wastageReasons: { id: string, label: string }[], can: { receive: boolean, waste: boolean } }>('/api/bar/stock/levels', { key: 'bar:stock-levels' })

const ALL = 'all'
const location = computed({
  get: () => (route.query.location as string | undefined) ?? ALL,
  set: (v: string) => void router.replace({ query: { ...route.query, location: v === ALL ? undefined : v } }),
})
const showing = computed({
  get: () => (route.query.show as string | undefined) ?? ALL,
  set: (v: string) => void router.replace({ query: { ...route.query, show: v === ALL ? undefined : v } }),
})
const search = ref((route.query.q as string | undefined) ?? '')
watchDebounced(search, v => void router.replace({ query: { ...route.query, q: v.trim() || undefined } }), { debounce: 300 })

const filtersOn = computed(() => Number(location.value !== ALL) + Number(showing.value !== ALL))
const clearFilters = () => void router.replace({ query: { ...route.query, location: undefined, show: undefined } })
const locationItems = computed(() => [{ value: ALL, label: t('bar.screens.stock-levels.every-location') }, ...(data.value?.locations ?? []).map(l => ({ value: l.id, label: l.name }))])
const showItems = computed(() => [
  { value: ALL, label: t('bar.screens.stock-levels.show-all') },
  { value: 'low', label: t('bar.screens.stock-levels.show-low') },
  { value: 'below-zero', label: t('bar.screens.stock-levels.show-below-zero') },
])
// Null where the location has never held the item: shown as a dash, not as nought.
const missing = (i: Item) => i.levels.some(l => l.quantity < 0)
const levelAt = (i: Item, locationId: string) => i.levels.find(l => l.locationId === locationId)?.quantity ?? null
const shown = (i: Item) => location.value === ALL ? (i.levels.length ? i.total : null) : levelAt(i, location.value)
const rows = computed(() => (data.value?.items ?? []).filter((i) => {
  const q = ((route.query.q as string | undefined) ?? '').toLowerCase()
  if (q && !i.name.toLowerCase().includes(q)) return false
  if (showing.value === 'low') return i.low
  if (showing.value === 'below-zero') return missing(i)
  return true
}))

// "1.5 bottles (1,050 ml)"; a can is counted as itself. Below nought it says so in words, and so does never held.
function amount(i: Item, quantity: number | null): string {
  if (quantity === null) return t('bar.screens.stock-levels.none')
  const text = stockAmount(i, Math.abs(quantity))
  return quantity < 0 ? t('bar.screens.stock-levels.below-zero', { amount: text }) : text
}
const columns = computed(() => [
  { accessorKey: 'name', header: t('bar.screens.stock-levels.item') },
  ...(location.value === ALL ? (data.value?.locations ?? []).map(l => ({ id: `at-${l.id}`, header: l.name })) : []),
  { id: 'total', header: location.value === ALL ? t('bar.screens.stock-levels.total') : t('bar.screens.stock-levels.here') },
  { id: 'state', header: t('bar.screens.stock-levels.state') },
  { id: 'actions' },
])

// Write off, or move: one item, an amount typed in its count unit, its packs or its base unit.
const act = ref<{ kind: 'waste' | 'move', item: Item, locationId: string, toLocationId: string, reasonId: string, quantity: number | null, unit: EntryUnit['value'] } | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function open(kind: 'waste' | 'move', item: Item) {
  refusal.value = null
  const from = location.value !== ALL ? location.value : item.levels.find(l => l.quantity > 0)?.locationId ?? data.value?.locations[0]?.id ?? ''
  act.value = { kind, item, locationId: from, toLocationId: data.value?.locations.find(l => l.id !== from)?.id ?? '', reasonId: '', quantity: null, unit: entryUnits(item)[0]!.value }
}
const actUnits = computed(() => act.value ? entryUnits(act.value.item) : [])
// What was typed, in base units: what the server is sent.
const baseQuantity = computed(() => {
  const a = act.value
  if (!a?.quantity) return 0
  return Math.round(a.quantity * (actUnits.value.find(u => u.value === a.unit)?.size ?? 1))
})
const held = computed(() => act.value ? levelAt(act.value.item, act.value.locationId) ?? 0 : 0)
const takesTooMuch = computed(() => !!act.value?.locationId && baseQuantity.value > held.value)
const otherLocations = computed(() => (data.value?.locations ?? []).filter(l => l.id !== act.value?.locationId).map(l => ({ value: l.id, label: l.name })))
const reasonItems = computed(() => (data.value?.wastageReasons ?? []).map(r => ({ value: r.id, label: r.label })))
async function save() {
  const a = act.value!
  refusal.value = null
  const quantity = baseQuantity.value
  // Taking more than is there is allowed (a level may go below nought until a count), but asked about.
  if (takesTooMuch.value) {
    const ok = await confirm({
      verb: a.kind === 'waste' ? t('bar.screens.stock-levels.waste') : t('bar.screens.stock-levels.move'),
      thing: t('bar.screens.stock-levels.amount-of', { amount: stockAmount(a.item, quantity), name: a.item.name }),
      consequence: t('bar.screens.stock-levels.more-than-held-consequence', { location: locationName(a.locationId), amount: amount(a.item, held.value) }),
    })
    if (!ok) return
  }
  const lines = [{ stockItemId: a.item.id, quantity }]
  try {
    if (a.kind === 'waste') {
      await $api('/api/bar/stock/wastage', { method: 'POST', body: { locationId: a.locationId, reasonTermId: a.reasonId, lines } })
      toast.add({ title: t('bar.screens.stock-levels.wasted', { name: a.item.name }), color: 'success' })
    }
    else {
      await $api('/api/bar/stock/transfers', { method: 'POST', body: { fromLocationId: a.locationId, toLocationId: a.toLocationId, lines } })
      // A move is undone by moving it back.
      offer(t('bar.screens.stock-levels.moved', { name: a.item.name }), async () => {
        await $api('/api/bar/stock/transfers', { method: 'POST', body: { fromLocationId: a.toLocationId, toLocationId: a.locationId, lines } })
        await refresh()
      })
    }
    act.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const needsFor = (a: NonNullable<typeof act.value>) => needs({
  locationId: a.locationId,
  quantity: baseQuantity.value >= 1 ? true : null,
  reasonId: a.kind === 'waste' ? a.reasonId : true,
  toLocationId: a.kind === 'move' ? a.toLocationId : true,
})

// How an item moved, newest first.
const history = ref<{ item: Item, rows: Movement[] } | null>(null)
async function openHistory(item: Item) {
  const answer = await $api<{ movements: Movement[] }>('/api/bar/stock/movements', { query: { item: item.id } })
  history.value = { item, rows: answer.movements }
}
const locationName = (id: string) => data.value?.locations.find(l => l.id === id)?.name ?? ''
const kindLabel = (k: string) => t(`bar.screens.stock-levels.kinds.${k}`)

function actions(i: Item) {
  return [
    ...(data.value?.can.waste ? [{ label: t('bar.screens.stock-levels.waste'), icon: 'i-lucide-trash-2', onSelect: () => open('waste', i) }] : []),
    ...(data.value?.can.receive && (data.value?.locations.length ?? 0) > 1 ? [{ label: t('bar.screens.stock-levels.move'), icon: 'i-lucide-arrow-right-left', onSelect: () => open('move', i) }] : []),
    { label: t('bar.screens.stock-levels.history'), icon: 'i-lucide-history', onSelect: () => openHistory(i) },
  ]
}

// UTable's row handlers fall through TableOrList; on a phone they land on the list itself, with no row.
const menuItems = shallowRef<ReturnType<typeof rowMenu>>([])
const touch = useScreenQuery('(hover: none)')
function menuFor(event: Event, row?: { original: Item }) {
  menuItems.value = row?.original ? rowMenu(actions(row.original), undefined, t('core.list.open-new-tab')) : []
  if (!menuItems.value.length) event.stopPropagation()
}
function pressed(_event: Event, row?: { original: Item }) {
  if (row?.original) void openHistory(row.original)
}
// Off a row (the headings) this menu stays shut; a phone's row opens its own and stops there.
function outsideRow(event: Event) {
  if (!(event.target as HTMLElement).closest('tbody tr, li')) event.stopPropagation()
}
</script>

<template>
  <PageFrame :title="t('bar.navigation.stock-levels.label')">
    <template #primary>
      <UButton
        v-if="data?.can.receive"
        to="/console/bar/stock/deliveries/new"
        icon="i-lucide-truck"
        :label="t('bar.screens.deliveries.record')"
      />
    </template>
    <BarStockTabs />
    <div class="mb-6 flex items-end gap-2">
      <UFormField
        :label="t('bar.screens.stock-levels.find')"
        class="min-w-0 flex-1 sm:max-w-xs"
      >
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :placeholder="t('bar.screens.stock-levels.find-placeholder')"
        />
      </UFormField>
      <FilterPanel
        :count="filtersOn"
        @clear="clearFilters"
      >
        <UFormField :label="t('bar.screens.stock-levels.location')">
          <USelectMenu
            v-model="location"
            :items="locationItems"
            value-key="value"
          />
        </UFormField>
        <UFormField :label="t('bar.screens.stock-levels.show')">
          <USelect
            v-model="showing"
            :items="showItems"
          />
        </UFormField>
      </FilterPanel>
    </div>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <EmptyState
          v-if="!d.items.length"
          :title="t('bar.screens.stock-levels.empty.title')"
          :description="t('bar.screens.stock-levels.empty.description')"
          icon="i-lucide-package"
        />
        <p
          v-else-if="!rows.length"
          class="text-sm text-muted"
        >
          {{ t('bar.screens.stock-levels.no-match') }}
        </p>
        <UContextMenu
          v-if="rows.length"
          :modal="false"
          :items="menuItems"
          :disabled="touch"
        >
          <div
            class="[&_tbody_tr]:cursor-pointer"
            @contextmenu.capture="outsideRow"
          >
            <TableOrList
              :rows="rows"
              :columns="columns"
              :label="t('bar.navigation.stock-levels.label')"
              :on-select="pressed"
              :on-contextmenu="menuFor"
            >
              <!-- On a phone: one row an item, its level at each location under its name. -->
              <template #item="{ row: i }">
                <RecordListItem :name="i.name">
                  <template
                    v-if="location === ALL && d.locations.length > 1"
                    #description
                  >
                    <span
                      v-for="l in d.locations"
                      :key="l.id"
                      class="block"
                    >{{ l.name }}: <span :class="['tabular-nums', (levelAt(i, l.id) ?? 0) < 0 && 'text-error']">{{ amount(i, levelAt(i, l.id)) }}</span></span>
                  </template>
                  <span :class="['text-sm font-medium tabular-nums', (shown(i) ?? 0) < 0 && 'text-error', shown(i) === null && 'text-muted']">{{ amount(i, shown(i)) }}</span>
                  <RowActions
                    :label="t('bar.screens.stock.item-actions', { name: i.name })"
                    :items="actions(i)"
                  />
                  <template
                    v-if="i.low || missing(i)"
                    #below
                  >
                    <StatusBadge
                      v-if="missing(i)"
                      tone="danger"
                      :label="t('bar.screens.stock-levels.missing')"
                    />
                    <StatusBadge
                      v-else
                      tone="warning"
                      :label="t('bar.screens.stock.low')"
                    />
                  </template>
                </RecordListItem>
              </template>
              <template #name-cell="{ row }">
                <span class="font-medium">{{ row.original.name }}</span>
              </template>
              <template
                v-for="l in d.locations"
                :key="l.id"
                #[`at-${l.id}-cell`]="{ row }"
              >
                <span :class="['tabular-nums', (levelAt(row.original, l.id) ?? 0) < 0 && 'text-error', levelAt(row.original, l.id) === null && 'text-muted']">{{ amount(row.original, levelAt(row.original, l.id)) }}</span>
              </template>
              <template #total-cell="{ row }">
                <span :class="['font-medium tabular-nums', (shown(row.original) ?? 0) < 0 && 'text-error', shown(row.original) === null && 'text-muted']">{{ amount(row.original, shown(row.original)) }}</span>
              </template>
              <template #state-cell="{ row }">
                <StatusBadge
                  v-if="missing(row.original)"
                  tone="danger"
                  :label="t('bar.screens.stock-levels.missing')"
                />
                <StatusBadge
                  v-else-if="row.original.low"
                  tone="warning"
                  :label="t('bar.screens.stock.low')"
                />
              </template>
              <template #actions-cell="{ row }">
                <RowActions
                  :label="t('bar.screens.stock.item-actions', { name: row.original.name })"
                  :items="actions(row.original)"
                />
              </template>
            </TableOrList>
          </div>
        </UContextMenu>
      </template>
    </DataBoundary>

    <UModal
      :open="!!act"
      :title="act ? t(act.kind === 'waste' ? 'bar.screens.stock-levels.waste-title' : 'bar.screens.stock-levels.move-title', { name: act.item.name }) : ''"
      @update:open="v => { if (!v) act = null }"
    >
      <template #body>
        <UForm
          v-if="act"
          id="bar-stock-act"
          :state="act"
          :validate="() => needsFor(act!)"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="act.kind === 'waste' ? t('bar.screens.stock-levels.location') : t('bar.screens.stock-levels.from')"
            name="locationId"
            required
          >
            <USelectMenu
              v-model="act.locationId"
              :items="locationItems.filter(l => l.value !== ALL)"
              value-key="value"
            />
          </UFormField>
          <UFormField
            v-if="act.kind === 'move'"
            :label="t('bar.screens.stock-levels.to')"
            name="toLocationId"
            required
          >
            <USelectMenu
              v-model="act.toLocationId"
              :items="otherLocations"
              value-key="value"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.stock-levels.quantity')"
            :help="act.locationId ? t('bar.screens.stock-levels.holds', { amount: amount(act.item, held) }) : undefined"
            name="quantity"
            required
          >
            <UFieldGroup>
              <FieldNumber
                v-model="act.quantity"
                :min="0"
                :step="act.unit === 'base' ? 1 : 0.1"
                :format-options="{ maximumFractionDigits: act.unit === 'base' ? 0 : 2 }"
              />
              <USelect
                v-model="act.unit"
                :items="actUnits"
                :aria-label="t('bar.screens.stock-levels.quantity-unit')"
                class="w-32"
              />
            </UFieldGroup>
          </UFormField>
          <p
            v-if="baseQuantity && act.unit !== 'base'"
            class="text-sm text-muted"
          >
            {{ t('bar.screens.stock-levels.in-base', { amount: `${number(baseQuantity, 0)} ${t(`bar.screens.stock.units.${act.item.baseUnit}`)}` }) }}
          </p>
          <UAlert
            v-if="takesTooMuch"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('bar.screens.stock-levels.more-than-held', { location: locationName(act.locationId), amount: amount(act.item, held) })"
          />
          <UFormField
            v-if="act.kind === 'waste'"
            :label="t('bar.screens.stock-levels.reason')"
            name="reasonId"
            required
          >
            <USelectMenu
              v-model="act.reasonId"
              :items="reasonItems"
              value-key="value"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-stock-act"
          :label="act?.kind === 'waste' ? t('bar.screens.stock-levels.waste') : t('bar.screens.stock-levels.move')"
        />
      </template>
    </UModal>

    <USlideover
      :open="!!history"
      :title="history ? t('bar.screens.stock-levels.history-title', { name: history.item.name }) : ''"
      @update:open="v => { if (!v) history = null }"
    >
      <template #body>
        <p
          v-if="history && !history.rows.length"
          class="text-sm text-muted"
        >
          {{ t('bar.screens.stock-levels.no-history') }}
        </p>
        <RecordList
          v-else-if="history"
          :label="t('bar.screens.stock-levels.history-title', { name: history.item.name })"
        >
          <RecordListItem
            v-for="m in history.rows"
            :key="m.id"
            :name="`${kindLabel(m.kind)} · ${locationName(m.locationId)}`"
            :description="[dateTime(m.at), m.reason, m.by].filter(Boolean).join(' · ')"
          >
            <span :class="['text-sm tabular-nums', m.quantity < 0 ? 'text-error' : 'text-success']">{{ m.quantity > 0 ? '+' : '−' }}{{ amount(history.item, Math.abs(m.quantity)) }}</span>
          </RecordListItem>
        </RecordList>
      </template>
    </USlideover>
  </PageFrame>
</template>
