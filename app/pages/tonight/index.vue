<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { saysWarningLevel } from '#shared/utils/content-warnings'
import { saysLatecomerPolicy } from '#shared/utils/programme'
import { saysShiftRole } from '#shared/utils/rota'
import { activePerformanceId } from '#shared/utils/tonight'
import type { ShiftRole } from '#shared/utils/rota'

definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Tonight' })

interface TeamMember { shiftId: string, role: ShiftRole, filled: boolean, name: string | null, phone: string | null }
interface Warning { title: string, level: string | null }
interface Performance {
  performanceId: string
  showTitle: string
  venueName: string
  startsAt: number
  doorsAt: number | null
  durationMinutes: number | null
  intervalCount: number
  intervalMinutes: number | null
  latecomerPolicy: string | null
  ageGuidance: string | null
  house: { sold: number, admitted: number, capacity: number | null, remaining: number | null }
  warnings: Warning[]
  team: TeamMember[]
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
// Assumed true until the first answer says otherwise, so the screen never flashes the fallback
// hub before it has asked.
const isDutyManager = ref(true)
const asked = ref(false)

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
    isDutyManager.value = true
  }
  else {
    // Not tonight's duty manager: the fallback hub below, not a failure banner. Still a definite
    // answer from the server, so it still counts as synced (NightStale is never hidden).
    if (refusalStatus(dutyManager.reason) === 403 || refusalStatus(dutyManager.reason) === 401) {
      isDutyManager.value = false
      syncedAt.value = new Date()
      staleness.value = null
    }
    // Anything else, including a dropped connection: the last-fetched values stay on screen,
    // and NightStale is what says they are no longer current. Never a spinner (criterion 3).
    else {
      staleness.value = refusalText(dutyManager.reason)
    }
  }

  // Best-effort: a screen that cannot reach the checklist still shows the rest (criterion 6
  // is a warning, not a blocker of the house numbers above it).
  if (checklistFetch.status === 'fulfilled') checklist.value = checklistFetch.value.items

  asked.value = true
}

// From house open: doors, or curtain where none is set (E-114 criterion 6).
const houseOpen = computed(() => {
  const now = Date.now() / 1000
  return (data.value?.performances ?? []).some(performance => now >= (performance.doorsAt ?? performance.startsAt))
})
const incompletePre = computed(() => checklist.value.filter(item => item.phase === 'PRE' && item.required && !item.done))

// The one unmistakable "which house" answer a matinee day needs (E-127 criterion 2); a single
// performance has nothing to switch between, so the badge and the tab bar both stay hidden.
const activeId = computed(() => activePerformanceId(data.value?.performances ?? [], Date.now() / 1000))

function jumpTo(performanceId: string): void {
  document.querySelector(`[data-test="performance-${performanceId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => {
  load()
  timer = setInterval(load, POLL_MS)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function spanOf(startsAt: number): string {
  return formatLondon(new Date(startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
}

function timeOf(at: number): string {
  return formatLondon(new Date(at * 1000), { timeStyle: 'short' })
}

function houseLine(house: Performance['house']): string {
  const remaining = house.remaining === null ? 'uncapped' : `${house.remaining} left`
  return `${house.sold} sold · ${house.admitted} admitted · ${remaining}`
}

// Shown only on request, never polled or cached: a code sitting on screen is a code anyone
// walking past has read (E-120 criteria 2, 5).
const boardCode = ref<string | null>(null)
const boardCodeFailure = ref<string | null>(null)
const revealingCode = ref(false)

// Typed explicitly (0053): inferring it from the route map alone has grown too deep for tsc.
async function revealCode(): Promise<void> {
  revealingCode.value = true
  boardCodeFailure.value = null
  try {
    boardCode.value = (await $fetch<{ code: string }>('/api/tonight/board/code')).code
  }
  catch (refused) {
    boardCodeFailure.value = refusalText(refused)
  }
  finally {
    revealingCode.value = false
  }
}

function hideCode(): void {
  boardCode.value = null
  boardCodeFailure.value = null
}
</script>

<template>
  <NightScreen
    title="Tonight"
    :hint="isDutyManager ? undefined : 'Your own shifts open their screens below.'"
    :stale="syncedAt"
    :busy="!asked"
  >
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

    <div
      v-if="isDutyManager && data"
      class="space-y-6"
      data-test="duty-manager-screen"
    >
      <!-- Running order, one tap to the active house (E-127 criterion 2); a single performance
           has nothing to switch between, so this stays out of the way entirely. -->
      <div
        v-if="data.performances.length > 1"
        class="flex flex-wrap gap-2"
        data-test="performance-switcher"
      >
        <UButton
          v-for="performance in data.performances"
          :key="performance.performanceId"
          size="sm"
          :color="performance.performanceId === activeId ? 'primary' : 'neutral'"
          :variant="performance.performanceId === activeId ? 'solid' : 'subtle'"
          :data-test="`jump-${performance.performanceId}`"
          @click="jumpTo(performance.performanceId)"
        >
          {{ performance.showTitle }}, {{ timeOf(performance.startsAt) }}
        </UButton>
      </div>

      <section
        v-for="performance in data.performances"
        :key="performance.performanceId"
        class="space-y-4 rounded-lg border p-4"
        :class="performance.performanceId === activeId ? 'border-primary' : 'border-default'"
        :data-test="`performance-${performance.performanceId}`"
      >
        <div>
          <p class="nnt-headline flex items-center gap-2 text-lg">
            {{ performance.showTitle }}
            <UBadge
              v-if="performance.performanceId === activeId && data.performances.length > 1"
              color="primary"
              variant="subtle"
              size="sm"
              data-test="active-now"
            >
              Active now
            </UBadge>
          </p>
          <p class="text-sm text-muted">
            {{ spanOf(performance.startsAt) }}
            <template v-if="performance.doorsAt">
              · doors {{ timeOf(performance.doorsAt) }}
            </template>
          </p>
        </div>

        <div data-test="house-numbers">
          <p class="text-sm text-muted">
            House
          </p>
          <p class="text-base font-semibold">
            {{ houseLine(performance.house) }}
          </p>
        </div>

        <p
          v-if="performance.intervalCount > 0"
          class="text-sm"
        >
          {{ performance.intervalCount }} interval{{ performance.intervalCount > 1 ? 's' : '' }}
          <template v-if="performance.intervalMinutes">
            of {{ performance.intervalMinutes }} minutes
          </template>
        </p>

        <p class="text-sm">
          {{ saysLatecomerPolicy(performance.latecomerPolicy) }}
        </p>

        <p
          v-if="performance.ageGuidance"
          class="text-sm"
        >
          {{ performance.ageGuidance }}
        </p>

        <ul
          v-if="performance.warnings.length"
          class="flex flex-wrap gap-2"
          data-test="content-warnings"
        >
          <li
            v-for="warning in performance.warnings"
            :key="warning.title"
          >
            <UBadge
              color="neutral"
              variant="subtle"
              size="sm"
            >
              {{ warning.title }}<template v-if="warning.level">
                : {{ saysWarningLevel(warning.level) }}
              </template>
            </UBadge>
          </li>
        </ul>

        <div>
          <p class="text-sm text-muted">
            Team
          </p>
          <ul
            class="mt-1 divide-y divide-default"
            data-test="team-list"
          >
            <li
              v-for="member in performance.team"
              :key="member.shiftId"
              class="flex items-center justify-between gap-3 py-2"
              :data-test="`team-${member.shiftId}`"
            >
              <span>{{ saysShiftRole(member.role) }}</span>
              <span
                v-if="member.filled"
                class="flex items-center gap-2"
              >
                {{ member.name }}
                <UButton
                  v-if="member.phone"
                  :to="`tel:${member.phone}`"
                  size="xs"
                  variant="subtle"
                  icon="i-lucide-phone"
                  :aria-label="`Call ${member.name}`"
                />
              </span>
              <span
                v-else
                class="text-muted"
              >
                Unfilled
              </span>
            </li>
          </ul>
        </div>
      </section>

      <p
        v-if="data.performances.length === 0"
        class="text-muted"
      >
        Nothing running tonight.
      </p>

      <div
        class="rounded-lg border border-default p-4"
        data-test="board-code"
      >
        <p class="text-sm text-muted">
          Backstage board
        </p>
        <UAlert
          v-if="boardCodeFailure"
          data-test="board-code-failure"
          color="error"
          variant="subtle"
          :description="boardCodeFailure"
        />
        <p
          v-else-if="boardCode"
          class="mt-1 flex items-center justify-between gap-2"
        >
          <span
            class="font-mono text-2xl tracking-widest"
            data-test="board-code-value"
          >{{ boardCode }}</span>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            data-test="board-code-hide"
            @click="hideCode"
          >
            Hide
          </UButton>
        </p>
        <UButton
          v-else
          size="sm"
          color="neutral"
          variant="subtle"
          class="mt-1"
          :loading="revealingCode"
          data-test="board-code-reveal"
          @click="revealCode"
        >
          Show tonight's code
        </UButton>
      </div>
    </div>

    <p
      v-else-if="!isDutyManager"
      class="text-muted"
    >
      Open your own screen below, or ask the FOH officer if you expect to see tonight's evening
      here.
    </p>

    <!-- Navigational, not the primary action: a grid in the content, not the sticky thumb-zone
         slot (E-112 criterion 4), but still thumb-sized rather than `NightAction`'s own selector. -->
    <div class="mt-6 grid grid-cols-2 gap-2">
      <UButton
        to="/tonight/incidents"
        color="neutral"
        variant="subtle"
        icon="i-lucide-clipboard-list"
        size="lg"
        class="min-h-12"
        data-test="link-incidents"
      >
        Incident log
      </UButton>
      <UButton
        to="/tonight/age-checks"
        color="neutral"
        variant="subtle"
        icon="i-lucide-id-card"
        size="lg"
        class="min-h-12"
        data-test="link-age-checks"
      >
        Challenge 25
      </UButton>
      <UButton
        to="/tonight/checklist"
        color="neutral"
        variant="subtle"
        icon="i-lucide-list-checks"
        size="lg"
        class="min-h-12"
        data-test="link-checklist"
      >
        Checklist
      </UButton>
      <UButton
        to="/tonight/emergency"
        color="neutral"
        variant="subtle"
        icon="i-lucide-siren"
        size="lg"
        class="min-h-12"
        data-test="link-emergency"
      >
        Emergency card
      </UButton>
      <UButton
        to="/tonight/board"
        color="neutral"
        variant="subtle"
        icon="i-lucide-radio"
        size="lg"
        class="min-h-12"
        data-test="link-board"
      >
        Backstage board
      </UButton>
    </div>

    <template #actions>
      <NightAction
        label="Till"
        icon="i-lucide-store"
        color="neutral"
        to="/tonight/till"
      />
    </template>
  </NightScreen>
</template>
