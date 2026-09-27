<script setup lang="ts">
import { HUB_KPI_LABELS, checklistHint, hubKpis, hubTiles, nightHeaderLine, saysSeatsLeft, staleBannerLine } from '#shared/utils/night-hub'
import { activePerformanceId } from '#shared/utils/tonight'
import type { HubHouse, HubTileId } from '#shared/utils/night-hub'

definePageMeta({ layout: 'tonight', docs: '/docs/tonight' })
useSeoMeta({ title: 'Tonight' })

interface Performance {
  performanceId: string
  showTitle: string
  venueName: string
  startsAt: number
  doorsAt: number | null
  house: HubHouse
}
interface HouseTonight { night: string, venueId: string, performances: Performance[] }
interface ChecklistEntry { phase: 'PRE' | 'POST', label: string, required: boolean, done: boolean }

// Every 20 seconds while the screen is open, so house numbers move on their own (criterion 3).
const POLL_MS = 20_000

const request = useRequestFetch()
const data = ref<HouseTonight | null>(null)
const checklist = ref<ChecklistEntry[]>([])
const syncedAt = ref<Date | null>(null)
// Two pieces, because a refusal that said nothing of its own is still staleness: the reason is
// what follows the colon, and an empty one leaves the sentence alone.
const stale = ref(false)
const staleReason = ref('')
const asked = ref(false)

const authority = useNightAuthority()
const chosenId = ref<string | null>(null)

let timer: ReturnType<typeof setInterval> | undefined

// Neither fetch depends on the other's answer, so they run together. The checklist one still
// runs before house open, so its banner has data the instant `houseOpen` turns true.
async function load(): Promise<void> {
  // The house is every role's to read, so a door or bar shift sees the numbers too (issue 1307).
  const [houseFetch, checklistFetch] = await Promise.allSettled([
    request<HouseTonight>('/api/tonight/house'),
    request<{ items: ChecklistEntry[] }>('/api/tonight/checklist'),
  ])

  if (houseFetch.status === 'fulfilled') {
    data.value = houseFetch.value
    syncedAt.value = new Date()
    stale.value = false
  }
  else {
    // No shift tonight at all: the tiles below stand on their own, since each screen guards
    // itself (E-111 criterion 5). Still a definite answer, so it still counts as synced.
    if (refusalStatus(houseFetch.reason) === 403 || refusalStatus(houseFetch.reason) === 401) {
      syncedAt.value = new Date()
      stale.value = false
    }
    // Anything else, including a dropped connection: the last-fetched values stay on screen,
    // and NightStale is what says they are no longer current. Never a spinner (criterion 3).
    else {
      stale.value = true
      staleReason.value = refusalText(houseFetch.reason, '')
    }
  }

  // Best-effort: a screen that cannot reach the checklist still shows the rest (E-114 criterion 6
  // is a warning, not a blocker of the house numbers above it).
  if (checklistFetch.status === 'fulfilled') checklist.value = checklistFetch.value.items

  asked.value = true
}

const performances = computed(() => data.value?.performances ?? [])

// The clock chooses until somebody taps, and then the tap holds: a duty manager looking at the
// matinee while the evening's doors open is looking at it deliberately (E-127 criterion 2).
const activeId = computed(() => activePerformanceId(performances.value, Date.now() / 1000))
const selectedId = computed(() => chosenId.value ?? activeId.value)
const selected = computed(() => performances.value.find(one => one.performanceId === selectedId.value) ?? null)

const kpis = computed(() => selected.value ? hubKpis(selected.value.house) : null)

setNightSubject(() => ({
  title: selected.value?.showTitle ?? 'Tonight',
  meta: selected.value ? nightHeaderLine(selected.value.startsAt, selected.value.venueName) : null,
}))

// From house open: doors, or curtain where none is set (E-114 criterion 6).
const houseOpen = computed(() => {
  const now = Date.now() / 1000
  return performances.value.some(performance => now >= (performance.doorsAt ?? performance.startsAt))
})
const incompletePre = computed(() => checklist.value.filter(item => item.phase === 'PRE' && item.required && !item.done))

// Only the screens that already take a performance carry it; the rest resolve tonight's own.
const scoped = (to: string): string => selectedId.value ? `${to}?performanceId=${selectedId.value}` : to

// Each tile where the viewer's own authority opens it; every tile until the roles are known, or
// with no signal, since each screen guards itself anyway (issue 1304, E-111 criterion 5).
const tiles = computed(() => hubTiles(authority.value.known ? authority.value.roles : null))
const noRole = computed(() => authority.value.known && authority.value.roles.length === 0)

const HUB_TILES: Record<HubTileId, { label: string, hint: string, icon: string, to: string, scoped: boolean, testId: string }> = {
  'door': { label: 'Door', hint: 'QR · ref · name', icon: 'i-lucide-scan-line', to: '/tonight/door', scoped: false, testId: 'door' },
  'till': { label: 'Till', hint: 'Bar sales', icon: 'i-lucide-store', to: '/tonight/till', scoped: false, testId: 'till' },
  'glance': { label: 'Tonight at a glance', hint: 'Numbers · show info', icon: 'i-lucide-gauge', to: '/tonight/glance', scoped: true, testId: 'glance' },
  'checklist': { label: 'Checklist', hint: '', icon: 'i-lucide-list-checks', to: '/tonight/checklist', scoped: true, testId: 'checklist' },
  'report': { label: 'Night report', hint: 'Read · sign off', icon: 'i-lucide-file-signature', to: '/tonight/report', scoped: true, testId: 'report' },
  'age-checks': { label: 'Challenge 25', hint: 'Log a check · register', icon: 'i-lucide-id-card', to: '/tonight/age-checks', scoped: false, testId: 'age-checks' },
  'backstage': { label: 'Backstage', hint: 'House open · clearance', icon: 'i-lucide-messages-square', to: '/tonight/board', scoped: false, testId: 'backstage' },
  'contacts': { label: 'Contacts and incidents', hint: 'Who\'s on · log', icon: 'i-lucide-phone', to: '/tonight/incidents', scoped: true, testId: 'contacts' },
  'emergency': { label: 'Emergency', hint: 'Evac · first aid · 999', icon: 'i-lucide-siren', to: '/tonight/emergency', scoped: false, testId: 'emergency' },
}

onMounted(() => {
  load()
  timer = setInterval(load, POLL_MS)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="mx-auto w-full max-w-md space-y-4">
    <div class="flex justify-end">
      <NightStale
        :at="syncedAt"
        :busy="!asked"
      />
    </div>

    <UAlert
      v-if="stale"
      data-test="tonight-stale-warning"
      color="warning"
      variant="subtle"
      :description="staleBannerLine(staleReason)"
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
      v-if="authority.roles.includes('DUTY_MANAGER')"
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
      <p class="font-semibold">
        You are not on shift tonight.
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
        v-for="tile in tiles"
        :key="tile.id"
        :label="HUB_TILES[tile.id].label"
        :hint="tile.id === 'checklist' ? checklistHint(checklist, houseOpen) : HUB_TILES[tile.id].hint"
        :icon="HUB_TILES[tile.id].icon"
        :tone="tile.id === 'emergency' ? 'danger' : tile.gold ? 'gold' : 'neutral'"
        :to="HUB_TILES[tile.id].scoped ? scoped(HUB_TILES[tile.id].to) : HUB_TILES[tile.id].to"
        :data-test="`tile-${HUB_TILES[tile.id].testId}`"
      />
    </div>
    <p class="pt-2 text-center text-sm text-muted">
      The door never sells tickets: unpaid and walk-ups go to the bar.
    </p>
  </div>
</template>
