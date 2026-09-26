<script setup lang="ts">
import { saysDay, saysClock, saysDayLong } from '#shared/utils/when'
import { defaultBoardWindow, openingsOnNightHref, saysStaffing } from '#shared/utils/rota-board'
import { SHIFT_ROLES, saysShiftRole, saysShiftStatus } from '#shared/utils/rota'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { BoardEntry } from '#shared/utils/rota-board'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'

definePageMeta({ layout: 'console', title: 'Rota board', middleware: 'console', docs: '/docs/rota/rota-board' })

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
  shifts: RosterShift[]
}

// Shown, never acted on here: an opening is staffed on its own screen (E-130 criterion 8).
interface RosterOpening {
  openingId: string
  label: string
  venueName: string
  night: string
  startsAt: number
  endsAt: number
  shifts: { shiftId: string, slot: number, status: ShiftStatus, holderName: string | null }[]
}

type Board = { items: BoardEntry<RosterPerformance, RosterOpening>[] }

interface Candidate { id: string, name: string, email: string, eligible: boolean }

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)

// A span the officer is working on rather than a filter over a fixed set of rows, so it is a
// pair of date fields and not a K-129 condition, as the utilisation report's span is.
const window = reactive(defaultBoardWindow(new Date()))

const { data, status, refresh } = await useAsyncData(
  'rota-shifts-board',
  () => request<Board>('/api/admin/rota/shifts/board', {
    query: { from: window.from, to: window.to },
  }),
  { watch: [() => window.from, () => window.to], default: (): Board => ({ items: [] }) },
)

const opened = defaultBoardWindow(new Date())

const activeFilters = computed<ActiveFilter[]>(() => {
  if (window.from === opened.from && window.to === opened.to) return []
  return [{
    key: 'window',
    label: `${saysDay(window.from)} to ${saysDay(window.to)}`,
    icon: 'i-lucide-calendar-range',
    clear: () => Object.assign(window, defaultBoardWindow(new Date())),
  }]
})

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
    const answer = await $fetch<{ stamped: number }>(`/api/admin/rota/templates/${entry.venueId}/stamp`, { method: 'POST' })
    toast.add({ title: `${plural(answer.stamped, 'shift')} added`, icon: 'i-lucide-check', color: 'success' })
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

// Assigning a person, onto an open or claimed shift, or into the "add a shift" form below.
const assigning = ref<{ shiftId: string, role: ShiftRole } | null>(null)
// Declared before the candidate search below reads it: an ad hoc shift's role narrows the same
// eligibility search an existing shift's id would.
const adding = ref<{ performanceId: string, role: ShiftRole | undefined, slot: number } | null>(null)
const submitting = ref(false)
const candidateSearch = ref('')
const candidateSettled = useDebounced(candidateSearch, 250)
const chosen = ref<Candidate | null>(null)

const { data: candidateData, status: candidateStatus } = await useAsyncData(
  () => `shift-candidates-${assigning.value?.shiftId ?? adding.value?.role ?? 'none'}-${candidateSettled.value}`,
  () => {
    const term = candidateSettled.value.trim()
    if (term.length < 2) return Promise.resolve({ items: [] as Candidate[] })
    if (assigning.value) {
      return request<{ items: Candidate[] }>(`/api/admin/rota/shifts/${assigning.value.shiftId}/candidates`, { query: { search: term } })
    }
    if (adding.value?.role) {
      return request<{ items: Candidate[] }>('/api/admin/rota/candidates', { query: { search: term, role: adding.value.role } })
    }
    return Promise.resolve({ items: [] as Candidate[] })
  },
  { watch: [candidateSettled, assigning, () => adding.value?.role], default: (): { items: Candidate[] } => ({ items: [] }), getCachedData: () => undefined },
)

const options = computed(() => candidateData.value.items.map(candidate => ({ ...candidate, value: candidate.id, label: candidate.name })))

function openAssign(shift: RosterShift): void {
  assigning.value = { shiftId: shift.shiftId, role: shift.role }
  chosen.value = null
  candidateSearch.value = ''
  failure.value = null
}

function choose(option: Candidate | undefined): void {
  chosen.value = option ?? null
}

async function submitAssign(): Promise<void> {
  const row = assigning.value
  if (!row || !chosen.value) return
  submitting.value = true
  try {
    await $fetch(`/api/admin/rota/shifts/${row.shiftId}/assign`, { method: 'POST', body: { userId: chosen.value.id } })
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

// Confirming a claim inline, the same route the approvals queue answers with.
async function confirm(shift: RosterShift): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/rota/approvals/${shift.shiftId}/approve`, { method: 'POST' })
    toast.add({ title: 'Confirmed', icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

const unconfirming = ref<RosterShift | null>(null)
const unconfirmFailure = ref<string | null>(null)
const unconfirmWorking = ref(false)

async function unconfirm(): Promise<void> {
  const shift = unconfirming.value
  if (!shift) return
  unconfirmWorking.value = true
  unconfirmFailure.value = null
  try {
    await $fetch(`/api/admin/rota/shifts/${shift.shiftId}/unconfirm`, { method: 'POST' })
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
  adding.value = { performanceId, role: undefined, slot: 1 }
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
      body: { performanceId: form.performanceId, role: form.role, slot: form.slot, userId: chosen.value?.id },
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
const modalOpen = computed(() => assigning.value !== null || adding.value !== null || unconfirming.value !== null)

watch(modalOpen, (nowOpen) => {
  if (!nowOpen) failure.value = null
})
</script>

<template>
  <div class="space-y-6">
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

    <RotaFlow step="board" />

    <AdminToolbar
      :active="activeFilters"
      :loading="status === 'pending'"
      :searchable="false"
      @clear="Object.assign(window, defaultBoardWindow(new Date()))"
    >
      <template #filters>
        <UFormField label="From">
          <DateField
            v-model="window.from"
            data-test="board-from"
          />
        </UFormField>
        <UFormField label="Until">
          <DateField
            v-model="window.to"
            data-test="board-until"
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
      No performance or bar opening between {{ saysDayLong(window.from) }} and
      {{ saysDayLong(window.to) }} carries a shift. Widen the dates, or stamp a venue's template onto
      the diary.
    </p>

    <div
      v-else
      class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      data-test="rota-board"
    >
      <template
        v-for="entry in data.items"
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
              class="flex items-center justify-between gap-2 rounded-lg border p-2"
              :class="shift.status === 'OPEN' || shift.status === 'DECLINED' ? 'border-warning' : 'border-default'"
              :data-test="`opening-shift-${shift.shiftId}`"
            >
              <div>
                <p class="text-xs text-muted">
                  {{ saysShiftRole('BAR') }}
                </p>
                <p class="font-medium">
                  {{ shift.holderName ?? 'Unfilled' }}
                </p>
              </div>
              <UBadge
                :color="statusColor[shift.status]"
                variant="subtle"
                size="sm"
              >
                {{ saysShiftStatus(shift.status) }}
              </UBadge>
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
              Staff it on Bar openings
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
            </div>
          </template>

          <ul class="space-y-2">
            <li
              v-for="shift in entry.shifts"
              :key="shift.shiftId"
              class="flex items-center justify-between gap-2 rounded-lg border p-2"
              :class="shift.status === 'OPEN' || shift.status === 'DECLINED' ? 'border-warning' : 'border-default'"
              :data-test="`shift-${shift.shiftId}`"
            >
              <div>
                <p class="text-xs text-muted">
                  {{ saysShiftRole(shift.role) }}
                </p>
                <p class="font-medium">
                  {{ shift.holderName ?? 'Unfilled' }}
                </p>
              </div>

              <div class="flex items-center gap-2">
                <UBadge
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
                  @click="openAssign(shift)"
                >
                  Assign
                </UButton>
                <UButton
                  v-else-if="shift.status === 'CLAIMED'"
                  size="xs"
                  color="secondary"
                  variant="subtle"
                  icon="i-lucide-check"
                  :data-test="`confirm-${shift.shiftId}`"
                  @click="confirm(shift)"
                >
                  Confirm
                </UButton>
                <UButton
                  v-else-if="shift.status === 'CONFIRMED'"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-undo-2"
                  :data-test="`unconfirm-${shift.shiftId}`"
                  @click="unconfirmFailure = null; unconfirming = shift"
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

    <UModal
      :open="assigning !== null"
      title="Assign this shift"
      description="Search by name or address. Eligibility is checked live, the same gate self-claiming uses."
      @update:open="assigning = null"
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
        <div class="space-y-4">
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
            data-test="assign-candidate"
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
              </span>
            </template>
            <template #empty>
              <span class="text-sm text-muted">
                {{ candidateSearch.trim().length < 2 ? 'Type at least two characters' : 'Nobody matches that' }}
              </span>
            </template>
          </UInputMenu>

          <UButton
            :disabled="!chosen || !chosen.eligible"
            :loading="submitting"
            data-test="assign-submit"
            @click="submitAssign"
          >
            Assign
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="adding !== null"
      title="Add a shift"
      description="A one-off, outside the venue's template. Leave nobody chosen to leave it open."
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
            label="Slot"
            hint="The role's ordinal on this performance: 1 for the first door shift, 2 for the second"
          >
            <UInputNumber
              v-model="adding.slot"
              :min="1"
              class="w-full"
              data-test="add-shift-slot"
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
  </div>
</template>
