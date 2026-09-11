<script setup lang="ts">
import { saysWarningLevel } from '#shared/utils/content-warnings'
import { formatLondon } from '#shared/utils/london'
import { groupedBoardCode, hubKpis, nightHeaderLine, passPressureAdvice, runningTimeLine } from '#shared/utils/night-hub'
import { saysLatecomerPolicy } from '#shared/utils/programme'
import { saysShiftRole } from '#shared/utils/rota'
import { activePerformanceId } from '#shared/utils/tonight'
import type { HubHouse } from '#shared/utils/night-hub'
import type { ShiftRole } from '#shared/utils/rota'

definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Tonight at a glance' })

interface AccessTonight { firstName: string, party: number, wording: string }
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
  house: HubHouse
  passesCovering: number
  access: AccessTonight[]
  warnings: Warning[]
  team: TeamMember[]
}
interface DutyManagerTonight { night: string, venueId: string, performances: Performance[] }

// Every 20 seconds while the screen is open, so house numbers move on their own (E-112
// criterion 3).
const POLL_MS = 20_000

const route = useRoute()
const request = useRequestFetch()
const data = ref<DutyManagerTonight | null>(null)
const syncedAt = ref<Date | null>(null)
const failure = ref<string | null>(null)
const asked = ref(false)

// The hub hands the house over in the query, so a matinee day opens on the one that was chosen
// there rather than on whatever the clock would have picked (E-127 criterion 2).
const chosenId = ref<string | null>(typeof route.query.performanceId === 'string' ? route.query.performanceId : null)

let timer: ReturnType<typeof setInterval> | undefined

async function load(): Promise<void> {
  try {
    data.value = await request<DutyManagerTonight>('/api/tonight/duty-manager')
    syncedAt.value = new Date()
    failure.value = null
  }
  catch (refused) {
    // The last-fetched values stay on screen; NightStale says they are no longer current.
    failure.value = refusalText(refused)
  }
  finally {
    asked.value = true
  }
}

const performances = computed(() => data.value?.performances ?? [])
const activeId = computed(() => activePerformanceId(performances.value, Date.now() / 1000))
const selectedId = computed(() => chosenId.value ?? activeId.value)
const selected = computed(() => performances.value.find(one => one.performanceId === selectedId.value) ?? null)
const kpis = computed(() => selected.value ? hubKpis(selected.value.house) : null)

setNightSubject(() => ({
  title: selected.value?.showTitle ?? 'Tonight',
  meta: selected.value ? nightHeaderLine(selected.value.startsAt, selected.value.venueName) : null,
}))

const guidance = computed(() => {
  const performance = selected.value
  if (!performance) return 'Not yet stated'
  const said = [
    performance.ageGuidance,
    ...performance.warnings.map(warning => warning.level ? `${warning.title}: ${saysWarningLevel(warning.level)}` : warning.title),
  ].filter(Boolean)
  return said.length ? said.join(' · ') : 'Age guidance not yet stated'
})

function timeOf(at: number): string {
  return formatLondon(new Date(at * 1000), { timeStyle: 'short' })
}

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

onMounted(() => {
  load()
  timer = setInterval(load, POLL_MS)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <NightScreen
    title="Tonight at a glance"
    :stale="syncedAt"
    :busy="!asked"
  >
    <div class="space-y-4">
      <UAlert
        v-if="failure && !selected"
        data-test="glance-failure"
        color="error"
        variant="subtle"
        :description="failure"
      />

      <UAlert
        v-else-if="failure"
        data-test="glance-stale-warning"
        color="warning"
        variant="subtle"
        :description="`Showing what was last loaded: ${failure}`"
      />

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

      <template v-if="selected && kpis">
        <NightBlock
          title="The numbers"
          data-test="glance-numbers"
        >
          <div class="grid grid-cols-4 gap-1 text-center">
            <div>
              <p class="font-mono text-xl font-bold tabular-nums">
                {{ kpis.reserved }}
              </p>
              <p class="text-xs text-muted">
                reserved
              </p>
            </div>
            <div>
              <p class="font-mono text-xl font-bold tabular-nums text-secondary">
                {{ kpis.collected }}
              </p>
              <p class="text-xs text-muted">
                collected
              </p>
            </div>
            <div>
              <p class="font-mono text-xl font-bold tabular-nums">
                {{ kpis.toCome }}
              </p>
              <p class="text-xs text-muted">
                to come
              </p>
            </div>
            <div>
              <p class="font-mono text-xl font-bold tabular-nums text-success">
                {{ kpis.headroom === null ? '∞' : kpis.headroom }}
              </p>
              <p class="text-xs text-muted">
                walk-ups OK
              </p>
            </div>
          </div>

          <template v-if="kpis.collectedPercent !== null">
            <UProgress
              :model-value="kpis.collectedPercent"
              color="secondary"
              size="md"
              class="mt-4"
              data-test="glance-progress"
            />
            <p class="mt-2 text-sm text-muted">
              {{ kpis.collectedPercent }}% of house collected or expected
            </p>
          </template>
          <p
            v-else
            class="mt-3 text-sm text-muted"
          >
            This house is uncapped, so there is no percentage to read.
          </p>
        </NightBlock>

        <NightBlock
          title="Pass pressure"
          data-test="glance-passes"
        >
          <div class="flex items-baseline justify-between gap-3">
            <p>Passes covering tonight</p>
            <p class="shrink-0 font-mono">
              <span class="text-lg font-bold">{{ selected.passesCovering }}</span>
              <span class="text-muted"> vs {{ kpis.headroom === null ? 'an uncapped house' : `${kpis.headroom} seats free` }}</span>
            </p>
          </div>
          <p class="mt-2 text-sm text-muted">
            {{ passPressureAdvice(selected.passesCovering, kpis.headroom) }}
          </p>
        </NightBlock>

        <NightBlock
          title="Show info"
          data-test="glance-show-info"
        >
          <dl class="divide-y divide-default">
            <div class="flex items-baseline justify-between gap-4 py-2">
              <dt class="shrink-0 text-muted">
                Running time
              </dt>
              <dd class="text-right">
                {{ runningTimeLine(selected.durationMinutes, selected.intervalCount, selected.intervalMinutes) }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-4 py-2">
              <dt class="shrink-0 text-muted">
                Latecomers
              </dt>
              <dd class="text-right">
                {{ saysLatecomerPolicy(selected.latecomerPolicy) }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-4 py-2">
              <dt class="shrink-0 text-muted">
                Guidance
              </dt>
              <dd class="text-right">
                {{ guidance }}
              </dd>
            </div>
            <div
              v-if="selected.doorsAt"
              class="flex items-baseline justify-between gap-4 py-2"
            >
              <dt class="shrink-0 text-muted">
                Doors
              </dt>
              <dd class="text-right font-mono">
                {{ timeOf(selected.doorsAt) }}
              </dd>
            </div>
          </dl>
        </NightBlock>

        <!-- First name, party size and the wording the officer agreed: the flags themselves never
             leave the encrypted payload, whatever a mockup shows (D-127 criterion 3). -->
        <NightBlock
          v-if="selected.access.length"
          title="Access tonight"
          data-test="glance-access"
        >
          <ul class="space-y-3">
            <li
              v-for="person in selected.access"
              :key="`${person.firstName}-${person.party}-${person.wording}`"
            >
              <p class="font-semibold">
                {{ person.firstName }} · party of {{ person.party }}
              </p>
              <p class="text-sm text-muted">
                {{ person.wording }}
              </p>
            </li>
          </ul>
        </NightBlock>

        <NightBlock
          title="On tonight"
          data-test="glance-team"
        >
          <ul
            class="divide-y divide-default"
            data-test="team-list"
          >
            <li
              v-for="member in selected.team"
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
                  class="min-h-12 min-w-12 justify-center"
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
        </NightBlock>

        <!-- Shown only on request, never polled or cached: a code sitting on screen is a code
             anyone walking past has read (E-120 criteria 2, 5). -->
        <NightBlock
          title="Backstage code"
          data-test="board-code"
        >
          <UAlert
            v-if="boardCodeFailure"
            data-test="board-code-failure"
            color="error"
            variant="subtle"
            :description="boardCodeFailure"
          />
          <p
            v-else-if="boardCode"
            class="flex items-center justify-between gap-2"
          >
            <span
              class="font-mono text-2xl font-bold tracking-widest"
              data-test="board-code-value"
            >{{ groupedBoardCode(boardCode) }}</span>
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              class="min-h-12"
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
            class="min-h-12"
            :loading="revealingCode"
            data-test="board-code-reveal"
            @click="revealCode"
          >
            Show tonight's code
          </UButton>
        </NightBlock>
      </template>

      <p
        v-if="asked && performances.length === 0 && !failure"
        class="text-muted"
      >
        Nothing running tonight.
      </p>
    </div>

    <template #actions>
      <NightAction
        label="Close the night"
        icon="i-lucide-moon-star"
        color="neutral"
        variant="outline"
        to="/tonight/checklist"
      />
      <p class="text-center text-xs text-muted">
        Duty manager only: releases no-shows and sends the report.
      </p>
    </template>
  </NightScreen>
</template>
