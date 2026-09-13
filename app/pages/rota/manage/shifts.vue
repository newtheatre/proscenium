<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { SHIFT_ROLES, saysShiftRole, saysShiftStatus } from '#shared/utils/rota'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'

definePageMeta({ layout: 'console', title: 'Rota', middleware: 'console' })

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
  venueName: string
  startsAt: number
  shifts: RosterShift[]
}

interface Candidate { id: string, name: string, email: string, eligible: boolean }

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)

const { data, status, refresh } = await useAsyncData(
  'rota-shifts-board',
  () => request<{ items: RosterPerformance[] }>('/api/admin/rota/shifts/board'),
  { default: (): { items: RosterPerformance[] } => ({ items: [] }) },
)

function spanOf(startsAt: number): string {
  return formatLondon(new Date(startsAt * 1000), { weekday: 'short', day: 'numeric', month: 'short' })
    + ' · ' + formatLondon(new Date(startsAt * 1000), { timeStyle: 'short' })
}

function confirmedCount(performance: RosterPerformance): number {
  return performance.shifts.filter(shift => shift.status === 'CONFIRMED').length
}

function staffingLabel(performance: RosterPerformance): string {
  return confirmedCount(performance) === performance.shifts.length ? 'Fully staffed' : 'Needs people'
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
      return $fetch<{ items: Candidate[] }>(`/api/admin/rota/shifts/${assigning.value.shiftId}/candidates`, { query: { search: term } })
    }
    if (adding.value?.role) {
      return $fetch<{ items: Candidate[] }>('/api/admin/rota/candidates', { query: { search: term, role: adding.value.role } })
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

async function unconfirm(shift: RosterShift): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/rota/shifts/${shift.shiftId}/unconfirm`, { method: 'POST' })
    toast.add({ title: 'Unconfirmed', description: 'The shift is open again.', icon: 'i-lucide-undo-2', color: 'neutral' })
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
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
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UPageHeader
      title="Rota"
      description="A confirmed shift is what lights up the show-night screen."
    />

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
      Nothing is stamped for a performance yet.
    </p>

    <div
      v-else
      class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      data-test="rota-board"
    >
      <UCard
        v-for="performance in data.items"
        :key="performance.performanceId"
        :data-test="`performance-${performance.performanceId}`"
      >
        <template #header>
          <div>
            <p class="font-semibold">
              {{ spanOf(performance.startsAt) }}
            </p>
            <p class="text-sm text-muted">
              {{ performance.showTitle }}
            </p>
          </div>
        </template>

        <ul class="space-y-2">
          <li
            v-for="shift in performance.shifts"
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
                @click="unconfirm(shift)"
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
              :data-test="`confirmed-count-${performance.performanceId}`"
            >
              {{ confirmedCount(performance) }}/{{ performance.shifts.length }} confirmed
            </p>
            <p
              class="text-sm"
              :class="staffingLabel(performance) === 'Fully staffed' ? 'text-success' : 'text-warning'"
            >
              {{ staffingLabel(performance) }}
            </p>
          </div>
          <UButton
            block
            size="sm"
            variant="outline"
            color="neutral"
            class="mt-3"
            icon="i-lucide-plus"
            :data-test="`add-shift-${performance.performanceId}`"
            @click="beginAdding(performance.performanceId)"
          >
            Add a shift
          </UButton>
        </template>
      </UCard>
    </div>

    <UModal
      :open="assigning !== null"
      title="Assign this shift"
      description="Search by name or address. Eligibility is checked live, the same gate self-claiming uses."
      @update:open="assigning = null"
    >
      <template #body>
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
  </div>
</template>
