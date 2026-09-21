<script setup lang="ts">
import { saysWarningLevel } from '#shared/utils/content-warnings'
import { formatLondon } from '#shared/utils/london'
import { HUB_KPI_LABELS, compApprovalLine, groupedBoardCode, housePercentLine, hubKpis, nightHeaderLine, passPressureAdvice, runningTimeLine, saysSeatsLeft } from '#shared/utils/night-hub'
import { saysLatecomerPolicy } from '#shared/utils/programme'
import { saysShiftRole } from '#shared/utils/rota'
import { saysPrice } from '#shared/utils/ticket-types'
import { activePerformanceId } from '#shared/utils/tonight'
import type { HubHouse } from '#shared/utils/night-hub'
import type { ShiftRole } from '#shared/utils/rota'

definePageMeta({ layout: 'tonight', docs: '/docs/show-night/at-a-glance' })
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
  contentNotes: string | null
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
const toast = useToast()
const data = ref<DutyManagerTonight | null>(null)
const syncedAt = ref<Date | null>(null)
const failure = ref<string | null>(null)
const asked = ref(false)

// The hub hands the house over in the query, so a matinee day opens on the one that was chosen
// there rather than on whatever the clock would have picked (E-127 criterion 2).
const chosenId = ref<string | null>(typeof route.query.performanceId === 'string' ? route.query.performanceId : null)

let timer: ReturnType<typeof setInterval> | undefined

// The two pending queues the duty manager decides (D-117, F-110): tickets at the box office and
// drinks at the till. Each is hidden when its own route refuses this viewer, never pre-judged.
interface PendingComp {
  id: string
  // A bar ask carries the house it was made at; null is a night with no house there (F-126).
  performanceId?: string | null
  requestedBy: string
  requestedByName: string
  reason: string
  expired: boolean
}
interface PendingBarComp { request: PendingComp, priced: { totalPence: number, lines: { productName: string, variantLabel: string, qty: number }[] } }

const ticketComps = ref<PendingComp[] | null>(null)
const barComps = ref<PendingBarComp[] | null>(null)
const viewer = useViewer()

async function loadComps(performanceId: string): Promise<void> {
  const [tickets, bar] = await Promise.all([
    request<{ items: PendingComp[] }>('/api/box-office/desk/comp-requests', { query: { performanceId } }).catch(() => null),
    request<{ requests: PendingBarComp[] }>('/api/till/comp-requests', { query: { performanceId } }).catch(() => null),
  ])
  ticketComps.value = tickets?.items.filter(one => !one.expired) ?? null
  barComps.value = bar?.requests.filter(one => !one.request.expired) ?? null
}

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

const pendingComps = computed(() => [
  ...(ticketComps.value ?? []).map(one => ({ queue: 'TICKET' as const, request: one, priced: null })),
  ...(barComps.value ?? []).map(row => ({ queue: 'BAR' as const, request: row.request, priced: row.priced })),
])

const deciding = ref<string | null>(null)
const approving = ref<{ queue: 'TICKET' | 'BAR', id: string, line: string } | null>(null)
const approveFailure = ref<string | null>(null)
const declining = ref<{ queue: 'TICKET' | 'BAR', id: string } | null>(null)
const declineReason = ref('')
const declineFailure = ref<string | null>(null)

// Which house an ask was made at, in words. The queue is the venue's whole night, so on a
// two-house day this is what says which one a row belongs to (F-126).
function houseOf(performanceId: string | null | undefined): string | null {
  const house = performances.value.find(one => one.performanceId === performanceId)
  return house ? `${house.showTitle}, ${timeOf(house.startsAt)}` : null
}

const compRoute = (queue: 'TICKET' | 'BAR', id: string): string =>
  (queue === 'TICKET' ? `/api/box-office/desk/comp-requests/${id}` : `/api/till/comp-requests/${id}`)

// One tap gives money away, so the amount and who asked are read back first; declining already
// stops for a reason, and this is the other half of that pair (issue 1150 item 10).
function openApprove(queue: 'TICKET' | 'BAR', id: string, requestedByName: string, totalPence: number | null): void {
  approving.value = { queue, id, line: compApprovalLine(requestedByName, totalPence) }
  approveFailure.value = null
}

async function approveComp(): Promise<void> {
  const target = approving.value
  if (!target) return
  deciding.value = target.id
  approveFailure.value = null
  try {
    await $fetch(`${compRoute(target.queue, target.id)}/approve`, { method: 'POST' })
    toast.add({ title: 'Comp approved', icon: 'i-lucide-check', color: 'success' })
    approving.value = null
    if (selectedId.value) await loadComps(selectedId.value)
  }
  catch (refused) {
    approveFailure.value = refusalText(refused)
  }
  finally {
    deciding.value = null
  }
}

function openDecline(queue: 'TICKET' | 'BAR', id: string): void {
  declining.value = { queue, id }
  declineReason.value = ''
  declineFailure.value = null
}

async function declineComp(): Promise<void> {
  const target = declining.value
  if (!target || !declineReason.value.trim()) return
  deciding.value = target.id
  declineFailure.value = null
  try {
    await $fetch(`${compRoute(target.queue, target.id)}/decline`, { method: 'POST', body: { reason: declineReason.value.trim() } })
    toast.add({ title: 'Comp declined', icon: 'i-lucide-check', color: 'success' })
    declining.value = null
    if (selectedId.value) await loadComps(selectedId.value)
  }
  catch (refused) {
    declineFailure.value = refusalText(refused)
  }
  finally {
    deciding.value = null
  }
}

setNightSubject(() => ({
  title: selected.value?.showTitle ?? 'Tonight',
  meta: selected.value ? nightHeaderLine(selected.value.startsAt, selected.value.venueName) : null,
}))

// `/api/tonight/duty-manager` answers only a duty manager, so an answer is the fact that this
// viewer can close tonight; a door or bar shift gets the screen's own action instead (0009).
const canClose = computed(() => data.value !== null)

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

// The queues ride the same poll as the numbers, so a request asked for mid-interval appears
// without the duty manager reloading anything.
async function refresh(): Promise<void> {
  await load()
  if (selectedId.value) await loadComps(selectedId.value)
}

watch(selectedId, (id) => {
  if (id) loadComps(id)
})

onMounted(() => {
  refresh()
  timer = setInterval(refresh, POLL_MS)
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
          <!-- The hub's own tiles and its own words: one duty manager reads both screens in one
               interval, and a second vocabulary is a second house (issue 1150 item 10). -->
          <div class="grid grid-cols-4 gap-1">
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
              :value="String(kpis.toCome)"
              :label="HUB_KPI_LABELS.toCome"
            />
            <NightKpi
              :value="saysSeatsLeft(kpis.seatsLeft)"
              :label="HUB_KPI_LABELS.seatsLeft"
              tone="good"
            />
          </div>

          <UProgress
            v-if="kpis.soldPercent !== null"
            :model-value="kpis.soldPercent"
            color="secondary"
            size="md"
            class="mt-4"
            data-test="glance-progress"
          />
          <p
            class="mt-2 text-sm text-muted"
            data-test="glance-percent"
          >
            {{ housePercentLine(kpis.soldPercent) }}
          </p>
        </NightBlock>

        <!-- Both queues in one place, because the person deciding is one person: the box office
             asks for a ticket and the till asks for a round, and neither waits on the other. -->
        <NightBlock
          v-if="pendingComps.length"
          title="Comp requests"
          data-test="glance-comp-requests"
        >
          <ul class="space-y-3">
            <li
              v-for="pending in pendingComps"
              :key="pending.request.id"
              class="space-y-2 rounded-lg bg-default p-3"
              :data-test="`comp-request-${pending.request.id}`"
            >
              <p class="font-semibold">
                {{ pending.queue === 'TICKET' ? 'Ticket' : 'Bar' }}<span v-if="pending.priced"> · {{ saysPrice(pending.priced.totalPence) }}</span>
              </p>
              <p class="text-sm">
                {{ pending.request.reason }}
              </p>
              <p
                v-if="pending.priced"
                class="text-sm text-muted"
              >
                {{ pending.priced.lines.map(line => `${line.qty} × ${line.productName}, ${line.variantLabel}`).join(' · ') }}
              </p>
              <p class="font-mono text-xs text-muted">
                asked by {{ pending.request.requestedByName }}
              </p>
              <p
                v-if="houseOf(pending.request.performanceId)"
                class="text-xs text-muted"
                :data-test="`comp-house-${pending.request.id}`"
              >
                Asked at {{ houseOf(pending.request.performanceId) }}
              </p>
              <p
                v-if="viewer && viewer.id === pending.request.requestedBy"
                class="text-sm text-muted"
              >
                Your own request: somebody else decides it.
              </p>
              <div
                v-else
                class="flex flex-wrap gap-2"
              >
                <UButton
                  color="secondary"
                  class="min-h-12"
                  :data-test="`approve-comp-${pending.request.id}`"
                  @click="openApprove(pending.queue, pending.request.id, pending.request.requestedByName, pending.priced?.totalPence ?? null)"
                >
                  Approve
                </UButton>
                <UButton
                  color="neutral"
                  variant="outline"
                  class="min-h-12"
                  :data-test="`decline-comp-${pending.request.id}`"
                  @click="openDecline(pending.queue, pending.request.id)"
                >
                  Decline
                </UButton>
              </div>
            </li>
          </ul>
        </NightBlock>

        <NightBlock
          title="Pass pressure"
          data-test="glance-passes"
        >
          <div class="flex items-baseline justify-between gap-3">
            <p>Passes covering tonight</p>
            <p class="shrink-0 font-mono">
              <span class="text-lg font-bold">{{ selected.passesCovering }}</span>
              <span class="text-muted"> vs {{ kpis.seatsLeft === null ? 'an uncapped house' : `${kpis.seatsLeft} seats free` }}</span>
            </p>
          </div>
          <p class="mt-2 text-sm text-muted">
            {{ passPressureAdvice(selected.passesCovering, kpis.seatsLeft) }}
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
              v-if="selected.contentNotes"
              class="py-2"
              data-test="glance-content-notes"
            >
              <dt class="text-muted">
                Notes
              </dt>
              <dd class="whitespace-pre-line">
                {{ selected.contentNotes }}
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

    <UModal
      :open="approving !== null"
      title="Approve this comp"
      :description="approving?.line"
      @update:open="approving = null"
    >
      <template #body>
        <div
          class="space-y-4"
          data-test="approve-comp-form"
        >
          <UAlert
            v-if="approveFailure"
            data-test="approve-comp-failure"
            color="error"
            variant="subtle"
            :description="approveFailure"
          />

          <div class="flex flex-wrap gap-2">
            <UButton
              color="secondary"
              class="min-h-12"
              :loading="deciding !== null"
              data-test="approve-comp-submit"
              @click="approveComp()"
            >
              Approve the comp
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              class="min-h-12"
              @click="approving = null"
            >
              Back
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="declining !== null"
      title="Decline this comp"
      description="The reason goes on the record and the person who asked sees it."
      @update:open="declining = null"
    >
      <template #body>
        <form
          class="space-y-4"
          data-test="decline-comp-form"
          @submit.prevent="declineComp"
        >
          <UAlert
            v-if="declineFailure"
            data-test="decline-comp-failure"
            color="error"
            variant="subtle"
            :description="declineFailure"
          />

          <UFormField
            label="Why"
            required
          >
            <UInput
              v-model="declineReason"
              class="w-full"
              data-test="decline-comp-reason"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              class="min-h-12"
              :loading="deciding !== null"
              :disabled="!declineReason.trim()"
              data-test="decline-comp-submit"
            >
              Decline it
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              class="min-h-12"
              @click="declining = null"
            >
              Back
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <template #actions>
      <NightAction
        v-if="canClose"
        label="Close the night"
        icon="i-lucide-moon-star"
        color="neutral"
        variant="outline"
        :to="selectedId ? `/tonight/checklist?performanceId=${selectedId}` : '/tonight/checklist'"
      />
      <NightAction
        v-else
        label="Refresh the numbers"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="!asked"
        @press="refresh()"
      />
    </template>
  </NightScreen>
</template>
