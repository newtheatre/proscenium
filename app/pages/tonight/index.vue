<script setup lang="ts">
import { HUB_KPI_LABELS, NO_HUB_HOUSE, checklistHint, curtainIsDown, hubHouseAfter, hubHouseRefused, hubKpis, hubTiles, nightHeaderLine, saysSeatsLeft, staleBannerLine } from '#shared/utils/night-hub'
import { activePerformanceId } from '#shared/utils/tonight'
import type { ChecklistEntry, TonightChecklist } from '#shared/utils/checklist'
import type { HubHouse, HubHouseRead, HubHouseState, HubTileId } from '#shared/utils/night-hub'

definePageMeta({ layout: 'tonight', docs: '/docs/tonight' })
useSeoMeta({ title: 'Tonight' })

interface Performance {
  performanceId: string
  showTitle: string
  venueName: string
  startsAt: number
  doorsAt: number | null
  durationMinutes: number | null
  intervalCount: number
  intervalMinutes: number | null
  house: HubHouse
}
interface HouseTonight { night: string, venueId: string, performances: Performance[] }

// Every 20 seconds while the screen is open, so house numbers move on their own (criterion 3).
const POLL_MS = 20_000

const request = useRequestFetch()
const chosenId = ref<string | null>(null)

let timer: ReturnType<typeof setInterval> | undefined

// Resolved before a served `/tonight` render; on a phone arriving from elsewhere it lands after the
// first paint, and every tile shows until it does (issue 1304, issue 1521).
const authority = useNightAuthority()
const dutyManager = computed(() => authority.value.roles.includes('DUTY_MANAGER'))
// A count open for tonight's bar shift to take (decision 0099), asked only of somebody on the bar
// and again with every poll, so the tile comes and goes as a stocktake is opened and applied.
const onTheBar = computed(() => authority.value.known && authority.value.roles.includes('BAR'))

async function readHouse(): Promise<HubHouseRead<HouseTonight>> {
  // The house is every role's to read, so a door or bar shift sees the numbers too (issue 1307).
  const read = await settleRead(() => request<HouseTonight>('/api/tonight/house'), '')
  return read.kind === 'READ' ? { kind: 'READ', house: read.value } : hubHouseRefused(read.status, read.failure)
}

// The duty manager's alone to read: any other shift would be refused on every poll. Best-effort,
// since E-114 criterion 6 is a warning and never blocks the house numbers above it.
async function readChecklist(): Promise<ChecklistEntry[] | null> {
  if (!dutyManager.value) return null
  const read = await settleRead(() => request<TonightChecklist>('/api/tonight/checklist'))
  return read.kind === 'READ' ? read.value.items : null
}

async function readStocktake(): Promise<boolean> {
  if (!onTheBar.value) return false
  const read = await settleRead(() => request<{ stocktake: unknown }>('/api/admin/bar/stocktakes/open'))
  return read.kind === 'READ' && read.value.stocktake !== null
}

interface HubRead { house: HubHouseRead<HouseTonight>, checklist: ChecklistEntry[] | null, stocktakeOpen: boolean, at: number }

// None depends on another's answer, so they run together. The checklist is read before house
// open too, so its banner has data the instant `houseOpen` turns true.
async function readHub(): Promise<HubRead> {
  const [house, items, stocktakeOpen] = await Promise.all([readHouse(), readChecklist(), readStocktake()])
  return { house, checklist: items, stocktakeOpen, at: Date.now() }
}

const shown = ref<HubHouseState<HouseTonight>>({ ...NO_HUB_HOUSE })
// A null read keeps what the banner last had.
const checklist = ref<ChecklistEntry[]>([])
const stocktakeOpen = ref(false)
const { now, stamp } = useNightClock()

function apply(read: HubRead): void {
  shown.value = hubHouseAfter(shown.value, read.house, read.at)
  if (read.checklist) checklist.value = read.checklist
  stocktakeOpen.value = read.stocktakeOpen
  stamp(read.at)
}

const waiting = useServedRead('tonight-hub', readHub, apply)

// Roles that land after the first read, on a phone arriving from elsewhere, need not wait a poll.
watch(dutyManager, async (holds) => {
  const items = holds ? await readChecklist() : null
  if (items) checklist.value = items
})
watch(onTheBar, async (holds) => {
  if (holds) stocktakeOpen.value = await readStocktake()
})

const performances = computed(() => shown.value.house?.performances ?? [])

// The clock chooses until somebody taps, and then the tap holds: a duty manager looking at the
// matinee while the evening's doors open is looking at it deliberately (E-127 criterion 2).
const activeId = computed(() => activePerformanceId(performances.value, now.value / 1000))
const selectedId = computed(() => chosenId.value ?? activeId.value)
const selected = computed(() => performances.value.find(one => one.performanceId === selectedId.value) ?? null)

const kpis = computed(() => selected.value ? hubKpis(selected.value.house) : null)

setNightSubject(() => ({
  title: selected.value?.showTitle ?? 'Tonight',
  meta: selected.value ? nightHeaderLine(selected.value.startsAt, selected.value.venueName) : null,
}))

// From house open: doors, or curtain where none is set (E-114 criterion 6).
const houseOpen = computed(() => performances.value.some(performance => now.value / 1000 >= (performance.doorsAt ?? performance.startsAt)))
const incompletePre = computed(() => checklist.value.filter(item => item.phase === 'PRE' && item.required && !item.done))

// Only the screens that already take a performance carry it; the rest resolve tonight's own.
const scoped = (to: string): string => selectedId.value ? `${to}?performanceId=${selectedId.value}` : to

// After the house on screen comes down, the duty manager's own job is the report (issue 1315).
const curtainDown = computed(() => selected.value ? curtainIsDown(selected.value, now.value / 1000) : false)
// Each tile where the viewer's own authority opens it; every tile where no role could be answered,
// signed out or with no signal, since each screen guards itself anyway (issue 1304, E-111 5).
const tiles = computed(() => hubTiles(authority.value.known ? authority.value.roles : null, curtainDown.value))
const noRole = computed(() => authority.value.known && authority.value.roles.length === 0)

const HUB_TILES: Record<HubTileId | 'stocktake', { label: string, hint: string, icon: string, to: string, scoped: boolean }> = {
  'door': { label: 'Door', hint: 'QR · ref · name', icon: 'i-lucide-scan-line', to: '/tonight/door', scoped: false },
  'till': { label: 'Till', hint: 'Bar sales', icon: 'i-lucide-store', to: '/tonight/till', scoped: false },
  'stocktake': { label: 'Stocktake', hint: 'Count the bar', icon: 'i-lucide-clipboard-list', to: '/tonight/stocktake', scoped: false },
  'glance': { label: 'Tonight at a glance', hint: 'Numbers · show info', icon: 'i-lucide-gauge', to: '/tonight/glance', scoped: true },
  'checklist': { label: 'Checklist', hint: '', icon: 'i-lucide-list-checks', to: '/tonight/checklist', scoped: true },
  'report': { label: 'Night report', hint: 'The draft so far', icon: 'i-lucide-file-signature', to: '/tonight/report', scoped: true },
  'age-checks': { label: 'Challenge 25', hint: 'Log a check · register', icon: 'i-lucide-id-card', to: '/tonight/age-checks', scoped: false },
  'backstage': { label: 'Backstage', hint: 'House open · clearance', icon: 'i-lucide-messages-square', to: '/tonight/board', scoped: false },
  'contacts': { label: 'Contacts and incidents', hint: 'Who\'s on · log', icon: 'i-lucide-phone', to: '/tonight/incidents', scoped: true },
  'message': { label: 'Message tonight\'s audience', hint: 'Ticket holders · rota', icon: 'i-lucide-megaphone', to: '/tonight/message', scoped: true },
  'emergency': { label: 'Emergency', hint: 'Evac · first aid · 999', icon: 'i-lucide-siren', to: '/tonight/emergency', scoped: false },
}

// A tile says what is left rather than repeating its own name (issue 1150 item 3).
function tileHint(id: HubTileId | 'stocktake'): string {
  if (id === 'checklist') return checklistHint(checklist.value, houseOpen.value)
  if (id === 'report' && curtainDown.value) return 'Sign off and close'
  return HUB_TILES[id].hint
}

// The Stocktake tile follows the till's while a count is open (0099).
const shownTiles = computed(() => tiles.value.flatMap(tile =>
  tile.id === 'till' && stocktakeOpen.value ? [tile, { id: 'stocktake' as const, gold: false }] : [tile]))

async function poll(): Promise<void> {
  apply(await readHub())
}

// The first read is the served one, or the one under way, so the first poll waits its turn.
onMounted(() => {
  timer = setInterval(poll, POLL_MS)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="mx-auto w-full max-w-md space-y-4">
    <div class="flex justify-end">
      <NightStale
        :at="shown.syncedAt"
        :busy="waiting"
      />
    </div>

    <UAlert
      v-if="shown.stale"
      data-test="tonight-stale-warning"
      color="warning"
      variant="subtle"
      :description="staleBannerLine(shown.staleReason)"
    />

    <UAlert
      v-if="houseOpen && incompletePre.length > 0"
      data-test="checklist-warning"
      color="warning"
      variant="subtle"
      title="Pre-show checklist incomplete"
      :description="incompletePre.map(item => item.label).join(', ')"
    />

    <!-- A single performance has nothing to switch between, so this stays out of the way. -->
    <NightPerformanceSwitcher
      v-if="performances.length > 1"
      :performances="performances"
      :selected-id="selectedId"
      @choose="chosenId = $event"
    />

    <div
      v-if="kpis"
      class="grid grid-cols-3 gap-2"
      data-test="tonight-kpis"
    >
      <NightKpi
        :value="String(kpis.sold)"
        :of="kpis.capacity === null ? null : String(kpis.capacity)"
        :label="HUB_KPI_LABELS.sold"
      />
      <NightKpi
        :value="String(kpis.admitted)"
        :label="HUB_KPI_LABELS.admitted"
        tone="gold"
      />
      <NightKpi
        :value="saysSeatsLeft(kpis.seatsLeft)"
        :label="HUB_KPI_LABELS.seatsLeft"
        tone="good"
      />
    </div>

    <!-- The duty manager's comps wait here too, since an ask lapses in minutes (issue 1304). -->
    <NightCompQueue
      v-if="dutyManager"
      title="Waiting on you"
      test-id="hub-waiting-on-you"
      :performance-id="selectedId"
      :houses="performances"
    />

    <!-- No role tonight: one card rather than tiles that each refuse (issue 1304). -->
    <div
      v-if="noRole"
      class="space-y-3 rounded-xl bg-elevated p-4 ring-1 ring-default"
      data-test="hub-no-role"
    >
      <p
        class="font-semibold"
        data-test="hub-no-role-says"
      >
        {{ authority.refusal ?? 'You are not on shift tonight.' }}
      </p>
      <p class="text-sm text-muted">
        Your shifts, and the ones still open, are on your rota.
      </p>
      <UButton
        to="/rota"
        size="xl"
        block
        icon="i-lucide-calendar-days"
        class="min-h-12"
        data-test="hub-my-rota"
      >
        My rota
      </UButton>
    </div>

    <div
      class="grid grid-cols-2 gap-3"
      data-test="tonight-hub"
    >
      <!-- The viewer's own job first and in gold, then the rest in the order a night taps them,
           Emergency last and red so a thumb in the dark never lands on it by accident (E-112 1). -->
      <NightTile
        v-for="tile in shownTiles"
        :key="tile.id"
        :label="HUB_TILES[tile.id].label"
        :hint="tileHint(tile.id)"
        :icon="HUB_TILES[tile.id].icon"
        :tone="tile.id === 'emergency' ? 'danger' : tile.gold ? 'gold' : 'neutral'"
        :to="HUB_TILES[tile.id].scoped ? scoped(HUB_TILES[tile.id].to) : HUB_TILES[tile.id].to"
        :data-test="`tile-${tile.id}`"
      />
    </div>
    <p class="pt-2 text-center text-sm text-muted">
      The door never sells tickets: unpaid and walk-ups go to the bar.
    </p>
  </div>
</template>
