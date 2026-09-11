<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { hubKpis, nightHeaderLine } from '#shared/utils/night-hub'
import { activePerformanceId } from '#shared/utils/tonight'
import type { HubHouse } from '#shared/utils/night-hub'

definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Tonight' })

interface Performance {
  performanceId: string
  showTitle: string
  venueName: string
  startsAt: number
  doorsAt: number | null
  house: HubHouse
}
interface DutyManagerTonight { night: string, venueId: string, performances: Performance[] }
interface ChecklistEntry { phase: 'PRE' | 'POST', label: string, required: boolean, done: boolean }

// Every 20 seconds while the screen is open, so house numbers move on their own (criterion 3).
const POLL_MS = 20_000

const request = useRequestFetch()
const data = ref<DutyManagerTonight | null>(null)
const checklist = ref<ChecklistEntry[]>([])
const syncedAt = ref<Date | null>(null)
const staleness = ref<string | null>(null)
const asked = ref(false)

const authority = useNightAuthority()
const chosenId = ref<string | null>(null)

let timer: ReturnType<typeof setInterval> | undefined

// Neither fetch depends on the other's answer, so they run together. The checklist one still
// runs before house open, so its banner has data the instant `houseOpen` turns true.
async function load(): Promise<void> {
  const [dutyManager, checklistFetch] = await Promise.allSettled([
    request<DutyManagerTonight>('/api/tonight/duty-manager'),
    request<{ items: ChecklistEntry[] }>('/api/tonight/checklist'),
  ])

  if (dutyManager.status === 'fulfilled') {
    data.value = dutyManager.value
    syncedAt.value = new Date()
    staleness.value = null
  }
  else {
    // Not tonight's duty manager: the tiles below stand on their own, since each screen guards
    // itself (E-111 criterion 5). Still a definite answer, so it still counts as synced.
    if (refusalStatus(dutyManager.reason) === 403 || refusalStatus(dutyManager.reason) === 401) {
      syncedAt.value = new Date()
      staleness.value = null
    }
    // Anything else, including a dropped connection: the last-fetched values stay on screen,
    // and NightStale is what says they are no longer current. Never a spinner (criterion 3).
    else {
      staleness.value = refusalText(dutyManager.reason)
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

const showsTill = computed(() => authority.value.roles.includes('BAR'))

function timeOf(at: number): string {
  return formatLondon(new Date(at * 1000), { timeStyle: 'short' })
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
      v-if="staleness"
      data-test="tonight-stale-warning"
      color="warning"
      variant="subtle"
      :description="`Showing what was last loaded: ${staleness}`"
    />

    <UAlert
      v-if="houseOpen && incompletePre.length > 0"
      data-test="checklist-warning"
      color="warning"
      variant="subtle"
      title="Pre-show checklist incomplete"
      :description="incompletePre.map(item => item.label).join(', ')"
    />

    <!-- One tap to the house you are working, on a matinee day (E-127 criterion 2); a single
         performance has nothing to switch between, so this stays out of the way entirely. -->
    <div
      v-if="performances.length > 1"
      class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      data-test="performance-switcher"
    >
      <UButton
        v-for="performance in performances"
        :key="performance.performanceId"
        size="sm"
        class="min-h-12 shrink-0"
        :color="performance.performanceId === selectedId ? 'primary' : 'neutral'"
        :variant="performance.performanceId === selectedId ? 'solid' : 'subtle'"
        :data-test="`choose-${performance.performanceId}`"
        @click="chosenId = performance.performanceId"
      >
        {{ performance.showTitle }}, {{ timeOf(performance.startsAt) }}
      </UButton>
    </div>

    <div
      v-if="kpis"
      class="grid grid-cols-3 gap-2"
      data-test="tonight-kpis"
    >
      <NightKpi
        :value="String(kpis.reserved)"
        :of="kpis.capacity === null ? null : String(kpis.capacity)"
        label="reserved"
      />
      <NightKpi
        :value="String(kpis.collected)"
        label="collected"
        tone="gold"
      />
      <NightKpi
        :value="kpis.headroom === null ? 'Uncapped' : String(kpis.headroom)"
        label="walk-up headroom"
        tone="good"
      />
    </div>

    <div
      class="grid grid-cols-2 gap-3"
      data-test="tonight-hub"
    >
      <NightTile
        label="Scan ticket"
        hint="QR · ref · name"
        icon="i-lucide-scan-line"
        tone="gold"
        to="/tonight/door"
        data-test="tile-scan"
      />
      <NightTile
        label="Tonight at a glance"
        hint="Numbers · show info"
        icon="i-lucide-gauge"
        :to="scoped('/tonight/glance')"
        data-test="tile-glance"
      />
      <NightTile
        label="Admit pass holder"
        hint="Season and comp passes"
        icon="i-lucide-contact"
        to="/tonight/door?mode=pass"
        data-test="tile-passes"
      />
      <NightTile
        label="Backstage"
        hint="House open · clearance"
        icon="i-lucide-messages-square"
        to="/tonight/board"
        data-test="tile-backstage"
      />
      <NightTile
        label="Emergency"
        hint="Evac · first aid · 999"
        icon="i-lucide-siren"
        tone="danger"
        to="/tonight/emergency"
        data-test="tile-emergency"
      />
      <NightTile
        label="Contacts and incidents"
        hint="Who's on · log"
        icon="i-lucide-phone"
        :to="scoped('/tonight/incidents')"
        data-test="tile-contacts"
      />
      <!-- A bar shift works the till from here rather than from a menu it cannot see (F-101). -->
      <NightTile
        v-if="showsTill"
        label="Till"
        hint="Bar sales"
        icon="i-lucide-store"
        to="/tonight/till"
        data-test="tile-till"
      />
    </div>

    <p class="pt-2 text-center text-sm text-muted">
      The door never sells tickets: unpaid and walk-ups go to the bar.
    </p>
  </div>
</template>
