<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { saysWarningLevel } from '#shared/utils/content-warnings'
import { saysLatecomerPolicy } from '#shared/utils/programme'
import { saysShiftRole } from '#shared/utils/rota'
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

// Every 20 seconds while the screen is open, so house numbers move on their own (criterion 3).
const POLL_MS = 20_000

const request = useRequestFetch()
const data = ref<DutyManagerTonight | null>(null)
const syncedAt = ref<Date | null>(null)
const staleness = ref<string | null>(null)
// Assumed true until the first answer says otherwise, so the screen never flashes the fallback
// hub before it has asked.
const isDutyManager = ref(true)
const asked = ref(false)

let timer: ReturnType<typeof setInterval> | undefined

async function load(): Promise<void> {
  try {
    const answered = await request<DutyManagerTonight>('/api/tonight/duty-manager')
    data.value = answered
    syncedAt.value = new Date()
    staleness.value = null
    isDutyManager.value = true
  }
  catch (refused) {
    // Not tonight's duty manager: the fallback hub below, not a failure banner.
    if (refusalStatus(refused) === 403 || refusalStatus(refused) === 401) {
      isDutyManager.value = false
    }
    // Anything else, including a dropped connection: the last-fetched values stay on screen,
    // and NightStale is what says they are no longer current. Never a spinner (criterion 3).
    else {
      staleness.value = refusalText(refused)
    }
  }
  finally {
    asked.value = true
  }
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

    <div
      v-if="isDutyManager && data"
      class="space-y-6"
      data-test="duty-manager-screen"
    >
      <section
        v-for="performance in data.performances"
        :key="performance.performanceId"
        class="space-y-4 rounded-lg border border-default p-4"
        :data-test="`performance-${performance.performanceId}`"
      >
        <div>
          <p class="nnt-headline text-lg">
            {{ performance.showTitle }}
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
    </div>

    <p
      v-else-if="!isDutyManager"
      class="text-muted"
    >
      Open your own screen below, or ask the FOH officer if you expect to see tonight's evening
      here.
    </p>

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
