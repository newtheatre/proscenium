<script setup lang="ts">
import { saysDay, saysDayRange, saysClock, saysDayLong } from '#shared/utils/when'
import { boardNights, boardWindowFromQuery, defaultBoardWindow, openingsOnNightHref, saysStaffing } from '#shared/utils/rota-board'
import { SHIFT_ROLES, saysShiftRole, saysShiftStatus, saysStamped } from '#shared/utils/rota'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { BoardEntry, BoardNight } from '#shared/utils/rota-board'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'

definePageMeta({ layout: 'console', title: 'Rota', middleware: 'console', docs: '/docs/rota/rota-board' })

interface RosterShift {
  shiftId: string
  role: ShiftRole
  slot: number
  status: ShiftStatus
  holderName: string | null
}

interface RosterPerformance {
  performanceId: string
  showTitle: string
  venueId: string
  venueName: string
  startsAt: number
  isExternal: boolean
  hasTemplate: boolean
  isRetired: boolean
  isPublished: boolean
  shifts: RosterShift[]
}

// Staffed here as a performance is; planned, resized and cancelled on Bar openings (0250).
interface RosterOpening {
  openingId: string
  label: string
  venueName: string
  night: string
  startsAt: number
  endsAt: number
  shifts: { shiftId: string, slot: number, status: ShiftStatus, holderName: string | null }[]
}

type Board = { items: BoardEntry<RosterPerformance, RosterOpening>[], waiting: number }

interface Candidate { id: string, name: string, email: string, eligible: boolean, reason: string | null, movable?: boolean }

// A row the board acts on: a performance's shift or a bar opening's slot, each with its own routes.
type SlotKind = 'shift' | 'opening'
interface BoardSlot { kind: SlotKind, shiftId: string, status: ShiftStatus, holderName: string | null }

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)

// The approvals queue is this filter, and it lives in the URL so the old address can land on it
// (E-105 criterion 2). It reads every claim to confirm from tonight on, whatever the window.
const route = useRoute()

// A span, not a K-129 condition, read from and kept in the address so it can be linked (0214).
const window = reactive(boardWindowFromQuery(route.query, new Date()))
watch(() => [window.from, window.to], ([from, to]) => {
  const opened = defaultBoardWindow(new Date())
  const shown = from === opened.from && to === opened.to ? { from: undefined, to: undefined } : { from, to }
  void navigateTo({ query: { ...route.query, ...shown, until: undefined } }, { replace: true })
})
// Back and Forward change the address under a mounted board; settling equal values writes nothing back.
watch(() => [route.query.from, route.query.to, route.query.until], () => {
  Object.assign(window, boardWindowFromQuery(route.query, new Date()))
})
const waiting = computed<boolean>({
  get: () => route.query.waiting === 'true',
  set: (on) => {
    void navigateTo({ query: { ...route.query, waiting: on ? 'true' : undefined } }, { replace: true })
  },
})

const { data, status, refresh, error } = await useAsyncData(
  'rota-shifts-board',
  () => request<Board>('/api/admin/rota/shifts/board', {
    query: { from: window.from, to: window.to, waiting: waiting.value || undefined },
  }),
  { watch: [() => window.from, () => window.to, waiting], default: (): Board => ({ items: [], waiting: 0 }) },
)
const readFailure = useListFailure(error, 'The rota could not be read.')

// The sidebar's Rota badge is this count, so it moves when a claim here is answered (0253).
const { refresh: refreshCounts } = useNavCounts()
watch(() => data.value.waiting, () => {
  void refreshCounts()
})

// One row per show night, so an evening's house and its bar opening are staffed together (0252).
const nights = computed(() => boardNights(data.value.items))
const planningNight = ref<string | null>(null)

function nightCounts(row: BoardNight<RosterPerformance, RosterOpening>): { confirmed: number, slots: number } {
  const shifts = row.entries.flatMap(entry => entry.shifts)
  return { confirmed: shifts.filter(shift => shift.status === 'CONFIRMED').length, slots: shifts.length }
}

async function plannedOnNight(): Promise<void> {
  planningNight.value = null
  await refresh()
}

const opened = defaultBoardWindow(new Date())

const activeFilters = computed<ActiveFilter[]>(() => {
  if (waiting.value) {
    return [{
      key: 'waiting',
      label: 'Waiting for confirmation',
      icon: 'i-lucide-hourglass',
      clear: () => {
        waiting.value = false
      },
    }]
  }
  if (window.from === opened.from && window.to === opened.to) return []
  return [{
    key: 'window',
    label: `${saysDayRange(window.from, window.to)}`,
    icon: 'i-lucide-calendar-range',
    clear: () => Object.assign(window, defaultBoardWindow(new Date())),
  }]
})

function clearFilters(): void {
  waiting.value = false
  Object.assign(window, defaultBoardWindow(new Date()))
}

function spanOf(startsAt: number): string {
  return `${saysDay(startsAt)} · ${saysClock(startsAt)}`
}

interface Staffed { shifts: { status: ShiftStatus }[] }

function confirmedCount(entry: Staffed): number {
  return entry.shifts.filter(shift => shift.status === 'CONFIRMED').length
}

const toneClass = { success: 'text-success', warning: 'text-warning', neutral: 'text-muted' } as const

// Stamps the venue's template onto every night there from tonight that misses a slot (issue 1319).
async function addMissing(entry: RosterPerformance): Promise<void> {
  failure.value = null
  try {
    const answer = await $fetch<{ stamped: number, filled: number }>(`/api/admin/rota/templates/${entry.venueId}/stamp`, { method: 'POST' })
    toast.add({ ...saysStamped(answer), icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

function hoursOf(opening: RosterOpening): string {
  return `${spanOf(opening.startsAt)} to ${saysClock(opening.endsAt)}`
}

const statusColor: Record<ShiftStatus, 'success' | 'warning' | 'neutral' | 'error'> = {
  OPEN: 'neutral',
  CLAIMED: 'warning',
  CONFIRMED: 'success',
  DECLINED: 'error',
  CANCELLED: 'neutral',
}

// Assigning a person onto an open or declined shift or slot; the modal searches its own route.
const assigning = ref<BoardSlot | null>(null)
// An ad hoc shift's role narrows the same eligibility search an existing shift's id would.
const adding = ref<{ performanceId: string, role: ShiftRole | undefined } | null>(null)
const submitting = ref(false)
const candidateSearch = ref('')
const candidateSettled = useDebounced(candidateSearch, 250)
const chosen = ref<Candidate | null>(null)

const { data: candidateData, status: candidateStatus } = await useAsyncData(
  () => `shift-candidates-${adding.value?.performanceId}-${adding.value?.role}-${candidateSettled.value}`,
  () => {
    const term = candidateSettled.value.trim()
    if (term.length < 2) return Promise.resolve({ items: [] as Candidate[] })
    if (adding.value?.role) {
      return request<{ items: Candidate[] }>('/api/admin/rota/candidates', { query: { search: term, role: adding.value.role, performanceId: adding.value.performanceId } })
    }
    return Promise.resolve({ items: [] as Candidate[] })
  },
  { watch: [candidateSettled, () => adding.value?.role], default: (): { items: Candidate[] } => ({ items: [] }), getCachedData: () => undefined },
)

const options = computed(() => candidateData.value.items.map(candidate => ({ ...candidate, value: candidate.id, label: candidate.name })))

// A role's number is said only where the performance has more than one of it (0211).
function saysRow(shifts: readonly RosterShift[], shift: RosterShift): string {
  const role = saysShiftRole(shift.role)
  return shifts.filter(one => one.role === shift.role).length > 1 ? `${role} ${shift.slot}` : role
}

function slotOf(kind: SlotKind, shift: Omit<BoardSlot, 'kind'>): BoardSlot {
  return { kind, shiftId: shift.shiftId, status: shift.status, holderName: shift.holderName }
}

function openAssign(kind: SlotKind, shift: Omit<BoardSlot, 'kind'>): void {
  assigning.value = slotOf(kind, shift)
  failure.value = null
}

function choose(option: Candidate | undefined): void {
  chosen.value = option ?? null
}

// Somebody on another shift of this performance can be moved onto this one, never doubled up (0211).
async function submitAssign(candidate: Candidate, move: boolean): Promise<void> {
  const row = assigning.value
  if (!row) return
  submitting.value = true
  try {
    await $fetch(row.kind === 'opening' ? `/api/rota/openings/shifts/${row.shiftId}/assign` : `/api/admin/rota/shifts/${row.shiftId}/assign`, {
      method: 'POST',
      body: row.kind === 'opening' ? { userId: candidate.id } : { userId: candidate.id, move },
    })
    toast.add({ title: 'Assigned', icon: 'i-lucide-check', color: 'success' })
    assigning.value = null
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    submitting.value = false
  }
}

// Confirming a claim, through E-105's approval route; the waiting filter is where the queue is worked.
const { confirmingId, confirm, declining, declineOffered, declineFailure, declineWorking, openDecline, closeDecline, submitDecline } = useClaimAnswer<BoardSlot>({
  route: slot => slot.kind === 'opening' ? `/api/rota/openings/shifts/${slot.shiftId}` : `/api/admin/rota/approvals/${slot.shiftId}`,
  id: slot => slot.shiftId,
  confirmedTitle: () => 'Confirmed',
  declinedDescription: slot => slot.kind === 'opening'
    ? `${slot.holderName ?? 'The claimant'} is told why. The slot is back on offer once they dismiss it or you reassign it.`
    : `${slot.holderName ?? 'The claimant'} is told why, and the shift stays off the open list until it is reassigned.`,
  failure,
  refresh,
})

const unconfirming = ref<BoardSlot | null>(null)
const unconfirmFailure = ref<string | null>(null)
const unconfirmWorking = ref(false)

async function unconfirm(): Promise<void> {
  const shift = unconfirming.value
  if (!shift) return
  unconfirmWorking.value = true
  unconfirmFailure.value = null
  try {
    await $fetch(shift.kind === 'opening' ? `/api/rota/openings/shifts/${shift.shiftId}/unconfirm` : `/api/admin/rota/shifts/${shift.shiftId}/unconfirm`, { method: 'POST' })
    toast.add({ title: 'Unconfirmed', description: 'The shift is open again.', icon: 'i-lucide-undo-2', color: 'neutral' })
    unconfirming.value = null
    await refresh()
  }
  catch (error) {
    unconfirmFailure.value = refusalText(error)
  }
  finally {
    unconfirmWorking.value = false
  }
}

// Adding a one-off shift outside the template (issue 933).
function beginAdding(performanceId: string): void {
  adding.value = { performanceId, role: undefined }
  chosen.value = null
  candidateSearch.value = ''
  failure.value = null
}

async function submitAdd(): Promise<void> {
  const form = adding.value
  if (!form || !form.role) return
  submitting.value = true
  try {
    await $fetch('/api/admin/rota/shifts/add', {
      method: 'POST',
      body: { performanceId: form.performanceId, role: form.role, userId: chosen.value?.id },
    })
    toast.add({ title: 'Shift added', icon: 'i-lucide-check', color: 'success' })
    adding.value = null
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    submitting.value = false
  }
}

const roleOptions = SHIFT_ROLES.map(role => ({ label: saysShiftRole(role), value: role }))

// A page alert renders behind an open modal's overlay, where nobody can read it, so a refusal
// is shown wherever the action was taken.
const modalOpen = computed(() => assigning.value !== null || adding.value !== null || unconfirming.value !== null || declining.value !== null || planningNight.value !== null)

watch(modalOpen, (nowOpen) => {
  if (!nowOpen) failure.value = null
})
</script>

<template>
  <ReadGate
    :failure="readFailure"
    class="space-y-6"
    @retry="refresh"
  >
    <UAlert
      v-if="failure && !modalOpen"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <p class="text-sm text-muted">
      A confirmed shift is what lights up the show-night screen.
    </p>

    <RotaTabs current="board" />

    <RotaFlow step="board" />

    <AdminToolbar
      :active="activeFilters"
      :loading="status === 'pending'"
      :searchable="false"
      @clear="clearFilters"
    >
      <template #actions>
        <p
          class="text-sm text-muted"
          data-test="board-span"
        >
          {{ waiting ? 'Every claim waiting, from tonight on' : `${saysDay(window.from)} to ${saysDay(window.to)}` }}
        </p>
      </template>
      <template #filters>
        <UCheckbox
          v-model="waiting"
          data-test="board-waiting"
          :label="`Waiting for confirmation (${data.waiting})`"
          description="Every claim still to confirm, whatever the dates."
        />
        <UFormField label="From">
          <DateField
            v-model="window.from"
            data-test="board-from"
            :disabled="waiting"
          />
        </UFormField>
        <UFormField label="Until">
          <DateField
            v-model="window.to"
            data-test="board-until"
            :disabled="waiting"
          />
        </UFormField>
      </template>
    </AdminToolbar>

    <div
      v-if="status === 'pending'"
      class="flex items-center gap-3 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="animate-spin"
      />
      Reading the rota
    </div>

    <p
      v-else-if="data.items.length === 0"
      class="text-sm text-muted"
      data-test="board-empty"
    >
      <template v-if="waiting">
        No claim is waiting for confirmation.
      </template>
      <template v-else>
        No performance or bar opening between {{ saysDayLong(window.from) }} and
        {{ saysDayLong(window.to) }} carries a shift. Widen the dates, or stamp a venue's template onto
        the diary.
      </template>
    </p>

    <div
      v-else
      class="space-y-8"
      data-test="rota-board"
    >
      <section
        v-for="row in nights"
        :key="row.night"
        :data-test="`night-${row.night}`"
      >
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-default pb-2">
          <h2 class="font-semibold">
            {{ saysDayLong(row.night) }}
          </h2>
          <div class="flex items-center gap-3">
            <p
              class="text-sm text-muted"
              :data-test="`night-confirmed-${row.night}`"
            >
              {{ nightCounts(row).confirmed }}/{{ nightCounts(row).slots }} confirmed
            </p>
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-beer"
              :data-test="`plan-opening-${row.night}`"
              @click="planningNight = row.night"
            >
              Plan a bar opening
            </UButton>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <template
            v-for="entry in row.entries"
            :key="entry.kind === 'opening' ? `opening-${entry.openingId}` : `performance-${entry.performanceId}`"
          >
            <UCard
              v-if="entry.kind === 'opening'"
              class="ring-info/40 bg-info/5"
              :data-test="`opening-${entry.openingId}`"
            >
              <template #header>
                <div>
                  <div class="flex items-center justify-between gap-2">
                    <p class="font-semibold">
                      {{ hoursOf(entry) }}
                    </p>
                    <UBadge
                      color="info"
                      variant="subtle"
                      size="sm"
                      icon="i-lucide-beer"
                    >
                      Bar opening
                    </UBadge>
                  </div>
                  <p class="text-sm text-muted">
                    {{ entry.label }} · {{ entry.venueName }}
                  </p>
                </div>
              </template>

              <ul class="space-y-2">
                <li
                  v-for="shift in entry.shifts"
                  :key="shift.shiftId"
                  class="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2"
                  :class="shift.status === 'OPEN' || shift.status === 'DECLINED' ? 'border-warning' : 'border-default'"
                  :data-test="`opening-shift-${shift.shiftId}`"
                >
                  <div class="min-w-0">
                    <p class="text-xs text-muted">
                      {{ saysShiftRole('BAR') }}
                    </p>
                    <p class="font-medium">
                      {{ shift.holderName ?? 'Unfilled' }}
                    </p>
                  </div>
                  <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
                    <!-- An open slot already reads Unfilled with a warning border; Open beside it says it twice. -->
                    <UBadge
                      v-if="shift.status !== 'OPEN'"
                      :color="statusColor[shift.status]"
                      variant="subtle"
                      size="sm"
                    >
                      {{ saysShiftStatus(shift.status) }}
                    </UBadge>

                    <UButton
                      v-if="shift.status === 'OPEN' || shift.status === 'DECLINED'"
                      size="xs"
                      variant="subtle"
                      icon="i-lucide-user-plus"
                      :data-test="`assign-${shift.shiftId}`"
                      @click="openAssign('opening', shift)"
                    >
                      Assign
                    </UButton>
                    <template v-else-if="shift.status === 'CLAIMED'">
                      <UButton
                        size="xs"
                        color="secondary"
                        variant="subtle"
                        icon="i-lucide-check"
                        :loading="confirmingId === shift.shiftId"
                        :disabled="confirmingId !== null && confirmingId !== shift.shiftId"
                        :data-test="`confirm-${shift.shiftId}`"
                        @click="confirm(slotOf('opening', shift))"
                      >
                        Confirm
                      </UButton>
                      <UButton
                        size="xs"
                        color="error"
                        variant="ghost"
                        icon="i-lucide-x"
                        :disabled="confirmingId === shift.shiftId"
                        :data-test="`decline-${shift.shiftId}`"
                        @click="openDecline(slotOf('opening', shift))"
                      >
                        Decline
                      </UButton>
                    </template>
                    <UButton
                      v-else-if="shift.status === 'CONFIRMED'"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-undo-2"
                      :data-test="`unconfirm-${shift.shiftId}`"
                      @click="unconfirmFailure = null; unconfirming = slotOf('opening', shift)"
                    >
                      Unconfirm
                    </UButton>
                  </div>
                </li>
              </ul>

              <template #footer>
                <div class="flex items-center justify-between">
                  <p
                    class="text-sm text-muted"
                    :data-test="`confirmed-count-${entry.openingId}`"
                  >
                    {{ confirmedCount(entry) }}/{{ entry.shifts.length }} confirmed
                  </p>
                  <p
                    class="text-sm"
                    :class="toneClass[saysStaffing(entry).tone]"
                  >
                    {{ saysStaffing(entry).says }}
                  </p>
                </div>
                <UButton
                  block
                  size="sm"
                  variant="outline"
                  color="neutral"
                  class="mt-3"
                  icon="i-lucide-arrow-right"
                  trailing
                  :to="openingsOnNightHref(entry.night)"
                  :data-test="`manage-opening-${entry.openingId}`"
                >
                  Slots and cancelling on Bar openings
                </UButton>
              </template>
            </UCard>

            <UCard
              v-else
              :data-test="`performance-${entry.performanceId}`"
            >
              <template #header>
                <div>
                  <p class="font-semibold">
                    {{ spanOf(entry.startsAt) }}
                  </p>
                  <p class="text-sm text-muted">
                    {{ entry.showTitle }}
                  </p>
                  <UBadge
                    v-if="!entry.isPublished"
                    class="mt-1"
                    color="warning"
                    variant="subtle"
                    size="sm"
                    :data-test="`draft-${entry.performanceId}`"
                  >
                    Draft show: not offered to members yet
                  </UBadge>
                </div>
              </template>

              <ul class="space-y-2">
                <li
                  v-for="shift in entry.shifts"
                  :key="shift.shiftId"
                  class="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2"
                  :class="shift.status === 'OPEN' || shift.status === 'DECLINED' ? 'border-warning' : 'border-default'"
                  :data-test="`shift-${shift.shiftId}`"
                >
                  <div class="min-w-0">
                    <p class="text-xs text-muted">
                      {{ saysRow(entry.shifts, shift) }}
                    </p>
                    <p class="font-medium">
                      {{ shift.holderName ?? 'Unfilled' }}
                    </p>
                  </div>

                  <!-- Wraps under the name rather than out of the card, three cards to a row (0140). -->
                  <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
                    <UBadge
                      v-if="shift.status !== 'OPEN'"
                      :color="statusColor[shift.status]"
                      variant="subtle"
                      size="sm"
                    >
                      {{ saysShiftStatus(shift.status) }}
                    </UBadge>

                    <UButton
                      v-if="shift.status === 'OPEN' || shift.status === 'DECLINED'"
                      size="xs"
                      variant="subtle"
                      icon="i-lucide-user-plus"
                      :data-test="`assign-${shift.shiftId}`"
                      @click="openAssign('shift', shift)"
                    >
                      Assign
                    </UButton>
                    <template v-else-if="shift.status === 'CLAIMED'">
                      <UButton
                        size="xs"
                        color="secondary"
                        variant="subtle"
                        icon="i-lucide-check"
                        :loading="confirmingId === shift.shiftId"
                        :disabled="confirmingId !== null && confirmingId !== shift.shiftId"
                        :data-test="`confirm-${shift.shiftId}`"
                        @click="confirm(slotOf('shift', shift))"
                      >
                        Confirm
                      </UButton>
                      <UButton
                        size="xs"
                        color="error"
                        variant="ghost"
                        icon="i-lucide-x"
                        :disabled="confirmingId === shift.shiftId"
                        :data-test="`decline-${shift.shiftId}`"
                        @click="openDecline(slotOf('shift', shift))"
                      >
                        Decline
                      </UButton>
                    </template>
                    <UButton
                      v-else-if="shift.status === 'CONFIRMED'"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-undo-2"
                      :data-test="`unconfirm-${shift.shiftId}`"
                      @click="unconfirmFailure = null; unconfirming = slotOf('shift', shift)"
                    >
                      Unconfirm
                    </UButton>
                  </div>
                </li>
              </ul>

              <template #footer>
                <div class="flex items-center justify-between">
                  <p
                    v-if="entry.shifts.length"
                    class="text-sm text-muted"
                    :data-test="`confirmed-count-${entry.performanceId}`"
                  >
                    {{ confirmedCount(entry) }}/{{ entry.shifts.length }} confirmed
                  </p>
                  <p
                    class="text-sm"
                    :class="toneClass[saysStaffing(entry).tone]"
                  >
                    {{ saysStaffing(entry).says }}
                  </p>
                </div>
                <template v-if="entry.shifts.length === 0 && !entry.isExternal">
                  <UButton
                    v-if="entry.hasTemplate"
                    block
                    size="sm"
                    class="mt-3"
                    icon="i-lucide-list-plus"
                    :data-test="`add-missing-${entry.performanceId}`"
                    @click="addMissing(entry)"
                  >
                    Add missing shifts
                  </UButton>
                  <UButton
                    v-else-if="!entry.isRetired"
                    block
                    size="sm"
                    variant="outline"
                    class="mt-3"
                    icon="i-lucide-arrow-right"
                    trailing
                    to="/rota/manage/templates"
                    :data-test="`set-up-template-${entry.performanceId}`"
                  >
                    Set up the venue's template
                  </UButton>
                </template>
                <UButton
                  block
                  size="sm"
                  variant="outline"
                  color="neutral"
                  class="mt-3"
                  icon="i-lucide-plus"
                  :data-test="`add-shift-${entry.performanceId}`"
                  @click="beginAdding(entry.performanceId)"
                >
                  Add a shift
                </UButton>
              </template>
            </UCard>
          </template>
        </div>
      </section>
    </div>

    <PlanOpeningModal
      :open="planningNight !== null"
      :evening="planningNight ?? undefined"
      @close="planningNight = null"
      @planned="plannedOnNight"
    />

    <AssignShiftModal
      :open="assigning !== null"
      :target="assigning ? { kind: assigning.kind, id: assigning.shiftId } : null"
      :loading="submitting"
      :failure="failure"
      @close="assigning = null"
      @assign="submitAssign"
    />

    <UModal
      :open="adding !== null"
      title="Add a shift"
      description="One more place on this performance, outside the venue's template. Leave nobody chosen to leave it open for a member to claim."
      @update:open="value => { if (!value) adding = null }"
    >
      <template #body>
        <UAlert
          v-if="failure"
          data-test="failure"
          class="mb-4"
          color="error"
          variant="subtle"
          :description="failure"
        />
        <div
          v-if="adding"
          class="space-y-4"
        >
          <UFormField label="Role">
            <USelectMenu
              v-model="adding.role"
              :items="roleOptions"
              value-key="value"
              placeholder="Choose a role"
              class="w-full"
              data-test="add-shift-role"
            />
          </UFormField>

          <UFormField
            label="Person"
            hint="Optional: leave it open for a member to claim"
          >
            <UInputMenu
              class="w-full"
              :model-value="options.find(option => option.value === chosen?.id)"
              :items="options"
              :loading="candidateStatus === 'pending'"
              placeholder="Name or address"
              :search-input="{ icon: 'i-lucide-search' }"
              :content="{ hideWhenEmpty: true }"
              ignore-filter
              icon="i-lucide-user"
              data-test="add-shift-candidate"
              @update:model-value="choose"
              @update:search-term="value => candidateSearch = value"
            >
              <template #item-label="{ item }">
                <span class="flex items-center gap-1.5">
                  {{ item.name }}
                  <UBadge
                    :color="item.eligible ? 'success' : 'neutral'"
                    variant="subtle"
                    size="sm"
                  >
                    {{ item.eligible ? 'Eligible' : 'Locked' }}
                  </UBadge>
                  <span
                    v-if="item.reason"
                    class="text-xs text-muted"
                    data-test="candidate-reason"
                  >{{ item.reason }}</span>
                </span>
              </template>
              <template #empty>
                <span class="text-sm text-muted">
                  {{ candidateSearch.trim().length < 2 ? 'Type at least two characters' : 'Nobody matches that' }}
                </span>
              </template>
            </UInputMenu>
          </UFormField>

          <UButton
            :disabled="!adding.role || (chosen !== null && !chosen.eligible)"
            :loading="submitting"
            data-test="add-shift-submit"
            @click="submitAdd"
          >
            Add
          </UButton>
        </div>
      </template>
    </UModal>

    <ConfirmModal
      :open="unconfirming !== null"
      name="unconfirm-shift"
      :title="unconfirming ? `Unconfirm ${unconfirming.holderName ?? 'this shift'}` : ''"
      :verb="unconfirming ? `Unconfirm ${unconfirming.holderName ?? 'the shift'}` : ''"
      consequence="The shift is open again and whoever held it is told they are off it."
      :loading="unconfirmWorking"
      :failure="unconfirmFailure"
      @update:open="value => { if (!value) unconfirming = null }"
      @confirm="unconfirm"
    />

    <DeclineClaimModal
      :open="declining !== null"
      :title="declining ? `Decline ${declining.holderName ?? 'this claim'}` : ''"
      consequence="Say why: the claimant sees this word for word, and the shift stays off the open list until an officer reassigns it."
      :offered="declineOffered"
      :loading="declineWorking"
      :failure="declineFailure"
      @close="closeDecline"
      @decline="submitDecline"
    />
  </ReadGate>
</template>
