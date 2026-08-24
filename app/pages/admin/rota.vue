/**
 * Admin: the front-of-house rota. A confirmed shift is what scopes the show
 * night screen and the access-needs rule, so this page is a control (ADR-0019).
 */
<script setup lang="ts">
import { canManageShifts } from '~~/shared/utils/abilities'

definePageMeta({
  layout: 'admin',
  middleware: ['staff'],
  title: 'Rota',
})

interface ShiftRow {
  id: string
  role: 'DUTY_MANAGER' | 'DOOR' | 'BAR'
  status: 'OPEN' | 'CLAIMED' | 'CONFIRMED' | 'DECLINED'
  needsEligibilityReview: boolean
  userId: string | null
  userName: string | null
  performanceId: string
  startsAt: string
  showTitle: string
  venueName: string
}

interface Unstaffed {
  performanceId: string
  startsAt: string
  showTitle: string
  venueName: string
}

const ROLE_LABELS: Record<ShiftRow['role'], string> = {
  DUTY_MANAGER: 'Duty manager',
  DOOR: 'Door',
  BAR: 'Bar',
}

const { user } = useUserSession()
const canManage = computed(() => (user.value ? canManageShifts(user.value) : false))

const toast = useToast()
const requestFetch = useRequestFetch()

const days = ref(28)
// Not `window`: that shadows the global for the whole setup scope. London,
// not UTC, or the last day drops off the range between 23:00 and midnight.
const rotaWindow = computed(() => {
  const start = new Date()
  const end = new Date(start.getTime() + days.value * 24 * 60 * 60 * 1000)
  return { from: londonDay(start), to: londonDay(end) }
})

const { data: shiftData, status, refresh } = await useAsyncData(
  'admin-rota-shifts',
  () => requestFetch<ShiftRow[]>('/api/shifts', { query: rotaWindow.value }),
  { watch: [rotaWindow] },
)

const { data: unstaffedData, refresh: refreshUnstaffed } = await useAsyncData(
  'admin-rota-unstaffed',
  () => requestFetch<Unstaffed[]>('/api/shifts/unstaffed'),
)

/** Always an array: a null binding is the render-loop trap (ADR-0012). */
const shifts = computed<ShiftRow[]>(() => shiftData.value ?? [])
const unstaffed = computed<Unstaffed[]>(() => unstaffedData.value ?? [])

const performances = computed(() => {
  const byPerformance = new Map<string, { key: string, startsAt: string, showTitle: string, venueName: string, slots: ShiftRow[] }>()
  for (const shift of shifts.value) {
    const existing = byPerformance.get(shift.performanceId)
    if (existing) existing.slots.push(shift)
    else {
      byPerformance.set(shift.performanceId, {
        key: shift.performanceId,
        startsAt: shift.startsAt,
        showTitle: shift.showTitle,
        venueName: shift.venueName,
        slots: [shift],
      })
    }
  }
  return [...byPerformance.values()]
})

function statusColour(shift: ShiftRow) {
  if (shift.status === 'CONFIRMED') return 'success'
  if (shift.status === 'CLAIMED') return 'warning'
  if (shift.status === 'DECLINED') return 'error'
  return 'neutral'
}

async function reload() {
  await Promise.all([refresh(), refreshUnstaffed()])
}

// ── Assigning ────────────────────────────────────────────────────

const assigning = ref<ShiftRow | null>(null)
const search = ref('')
const results = ref<Array<{ id: string, name: string, email: string }>>([])
const searching = ref(false)

async function runSearch() {
  if (search.value.trim().length < 2) {
    results.value = []
    return
  }
  searching.value = true
  try {
    const page = await requestFetch<Paginated<{ id: string, name: string, email: string }>>(
      '/api/users', { query: { q: search.value.trim(), limit: 10 } },
    )
    results.value = page.rows
  }
  finally {
    searching.value = false
  }
}

function openAssign(shift: ShiftRow) {
  assigning.value = shift
  search.value = ''
  results.value = []
}

async function save(shift: ShiftRow, body: Record<string, unknown>) {
  try {
    await requestFetch(`/api/shifts/${shift.id}`, { method: 'PUT', body })
    await reload()
    return true
  }
  catch (error) {
    toast.add({
      title: 'That did not save',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage ?? 'Try again.',
      color: 'error',
    })
    return false
  }
}

async function assign(userId: string) {
  const shift = assigning.value
  if (!shift) return
  if (await save(shift, { userId, status: 'CONFIRMED' })) assigning.value = null
}

async function clear(shift: ShiftRow) {
  await save(shift, { userId: null })
}

async function confirmClaim(shift: ShiftRow) {
  await save(shift, { status: 'CONFIRMED' })
}

// ── Adding and removing slots ────────────────────────────────────

const assignOpen = computed({
  get: () => assigning.value !== null,
  set: (open: boolean) => {
    if (!open) assigning.value = null
  },
})

const addingTo = ref<string | null>(null)
const newRole = ref<ShiftRow['role']>('DOOR')

async function addSlot(performanceId: string) {
  try {
    await requestFetch(`/api/performances/${performanceId}/shifts`, {
      method: 'POST',
      body: { role: newRole.value },
    })
    addingTo.value = null
    await reload()
  }
  catch (error) {
    toast.add({
      title: 'That slot was not added',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage ?? 'Try again.',
      color: 'error',
    })
  }
}

async function removeSlot(shift: ShiftRow) {
  try {
    await requestFetch(`/api/shifts/${shift.id}`, { method: 'DELETE' })
    await reload()
  }
  catch {
    toast.add({ title: 'That slot was not removed', color: 'error' })
  }
}

interface TemplateSlot { role: string, count: number }
interface Templates {
  roles: readonly string[]
  defaults: Array<{ venueId: string | null, role: string, count: number }>
  overrides: Array<{ venueId: string | null, role: string, count: number }>
  venues: Array<{ id: string, name: string }>
  configured: boolean
}

const { data: templateData, refresh: refreshTemplates } = await useAsyncData(
  'rota-templates',
  () => requestFetch<Templates>('/api/shifts/templates'),
)

/**
 * Without a default template nothing is ever stamped, at creation or by hand,
 * so the rota silently stays empty. That is worth saying loudly.
 */
const templatesConfigured = computed(() => templateData.value?.configured ?? true)
const roles = computed(() => templateData.value?.roles ?? [])

const templateOpen = ref(false)
const templateSlots = ref<TemplateSlot[]>([])
const savingTemplate = ref(false)

function openTemplate() {
  const existing = templateData.value?.defaults ?? []
  templateSlots.value = roles.value.map(role => ({
    role,
    count: existing.find(d => d.role === role)?.count ?? 0,
  }))
  templateOpen.value = true
}

async function saveTemplate() {
  savingTemplate.value = true
  try {
    await requestFetch('/api/shifts/templates', {
      method: 'PUT',
      body: { venueId: null, slots: templateSlots.value },
    })
    templateOpen.value = false
    await refreshTemplates()
    toast.add({ title: 'Template saved', icon: 'i-lucide-check', color: 'success' })
  }
  catch (error) {
    toast.add({
      title: 'Not saved',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    savingTemplate.value = false
  }
}

const stamping = ref(false)

/**
 * Performances created before the rota existed have no shifts, and nothing
 * stamped them retrospectively. Idempotent, so it is safe to press twice.
 */
async function stampShifts() {
  stamping.value = true
  try {
    const result = await requestFetch<{ performances: number, slots: number, withoutTemplate: number }>(
      '/api/shifts/stamp', { method: 'POST' },
    )
    if (result.performances) {
      toast.add({
        title: `Stamped ${result.slots} shift${result.slots === 1 ? '' : 's'} onto ${result.performances} performance${result.performances === 1 ? '' : 's'}`,
        icon: 'i-lucide-check',
        color: 'success',
      })
      await Promise.all([refresh(), refreshUnstaffed()])
    }
    else if (result.withoutTemplate) {
      // Do not report success: nothing was stamped and nothing can be until a
      // template exists, which is the actual problem to fix.
      toast.add({
        title: `${result.withoutTemplate} performance${result.withoutTemplate === 1 ? '' : 's'} have no shifts`,
        description: 'There is no shift template to stamp, so set one up first.',
        color: 'warning',
      })
    }
    else {
      toast.add({ title: 'Every performance already has its shifts', icon: 'i-lucide-check' })
    }
  }
  catch (error) {
    toast.add({
      title: 'Could not stamp the rota',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    stamping.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">
          Rota
        </h1>
        <p class="text-sm text-muted">
          Who is working each performance. Exactly one confirmed duty manager per performance.
        </p>
      </div>
      <div class="flex items-end gap-3">
        <UButton
          variant="subtle"
          icon="i-lucide-list-checks"
          label="Shift template"
          @click="openTemplate"
        />
        <UButton
          variant="subtle"
          icon="i-lucide-stamp"
          :loading="stamping"
          :disabled="!templatesConfigured"
          label="Stamp missing shifts"
          @click="stampShifts"
        />
        <UFormField
          label="Show the next"
          class="w-40"
        >
          <USelect
            v-model="days"
            :items="[{ label: '7 days', value: 7 }, { label: '28 days', value: 28 }, { label: '90 days', value: 90 }]"
          />
        </UFormField>
      </div>
    </div>

    <UAlert
      v-if="!templatesConfigured"
      icon="i-lucide-triangle-alert"
      color="warning"
      variant="subtle"
      title="No shift template is set up"
      description="Nothing is stamped onto a performance without one, so the rota stays empty however many performances there are. Set the template and then stamp."
      :actions="[{ label: 'Set the template', color: 'warning', variant: 'solid', onClick: openTemplate }]"
      class="mb-4"
    />

    <UAlert
      v-if="unstaffed.length"
      icon="i-lucide-triangle-alert"
      color="error"
      variant="subtle"
      :title="`${unstaffed.length} performance${unstaffed.length === 1 ? '' : 's'} within a week with no duty manager`"
    >
      <template #description>
        <ul class="mt-1 space-y-1">
          <li
            v-for="row in unstaffed"
            :key="row.performanceId"
          >
            {{ formatDateTime(row.startsAt) }}: {{ row.showTitle }} ({{ row.venueName }})
          </li>
        </ul>
      </template>
    </UAlert>

    <div
      v-if="status === 'pending'"
      class="text-sm text-muted"
    >
      Loading the rota…
    </div>

    <UCard v-else-if="!performances.length">
      <p class="text-sm text-muted">
        No performances in this window. Shifts are stamped from the venue's template when a
        performance is created; use <strong>Stamp missing shifts</strong> for anything created
        before the rota existed.
      </p>
    </UCard>

    <UCard
      v-for="performance in performances"
      :key="performance.key"
    >
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="font-medium">
              {{ performance.showTitle }}
            </p>
            <p class="text-sm text-muted">
              {{ formatDateTime(performance.startsAt) }} · {{ performance.venueName }}
            </p>
          </div>
          <UButton
            v-if="canManage"
            size="xs"
            variant="ghost"
            icon="i-lucide-plus"
            label="Add slot"
            @click="() => { addingTo = addingTo === performance.key ? null : performance.key }"
          />
        </div>
      </template>

      <div
        v-if="addingTo === performance.key"
        class="mb-4 flex items-end gap-2"
      >
        <UFormField
          label="Role"
          class="w-48"
        >
          <USelect
            v-model="newRole"
            :items="[
              { label: 'Duty manager', value: 'DUTY_MANAGER' },
              { label: 'Door', value: 'DOOR' },
              { label: 'Bar', value: 'BAR' },
            ]"
          />
        </UFormField>
        <UButton
          label="Add"
          @click="addSlot(performance.key)"
        />
      </div>

      <ul class="divide-y divide-default">
        <li
          v-for="slot in performance.slots"
          :key="slot.id"
          class="flex flex-wrap items-center justify-between gap-3 py-2"
        >
          <div class="flex items-center gap-3">
            <UBadge
              :color="slot.role === 'DUTY_MANAGER' ? 'primary' : 'neutral'"
              variant="subtle"
            >
              {{ ROLE_LABELS[slot.role] }}
            </UBadge>
            <span :class="slot.userName ? '' : 'text-muted italic'">
              {{ slot.userName ?? 'Open' }}
            </span>
            <UBadge
              :color="statusColour(slot)"
              variant="soft"
              size="sm"
            >
              {{ slot.status.toLowerCase() }}
            </UBadge>
            <UBadge
              v-if="slot.needsEligibilityReview"
              color="warning"
              variant="soft"
              size="sm"
            >
              check training
            </UBadge>
          </div>

          <div
            v-if="canManage"
            class="flex items-center gap-1"
          >
            <UButton
              v-if="slot.status === 'CLAIMED'"
              size="xs"
              variant="soft"
              label="Confirm"
              @click="confirmClaim(slot)"
            />
            <UButton
              size="xs"
              variant="ghost"
              :label="slot.userId ? 'Reassign' : 'Assign'"
              @click="openAssign(slot)"
            />
            <UButton
              v-if="slot.userId"
              size="xs"
              variant="ghost"
              label="Clear"
              @click="clear(slot)"
            />
            <UButton
              size="xs"
              variant="ghost"
              color="error"
              icon="i-lucide-trash-2"
              @click="removeSlot(slot)"
            />
          </div>
        </li>
      </ul>
    </UCard>

    <UModal
      v-model:open="assignOpen"
      :title="assigning ? `Assign ${ROLE_LABELS[assigning.role]}` : ''"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Search by name or email"
            help="They need an account here already."
          >
            <UInput
              v-model="search"
              placeholder="At least two characters"
              @keyup.enter="runSearch"
            />
          </UFormField>
          <UButton
            label="Search"
            :loading="searching"
            @click="runSearch"
          />

          <ul
            v-if="results.length"
            class="divide-y divide-default"
          >
            <li
              v-for="person in results"
              :key="person.id"
              class="flex items-center justify-between gap-3 py-2"
            >
              <div>
                <p class="text-sm font-medium">
                  {{ person.name }}
                </p>
                <p class="text-xs text-muted">
                  {{ person.email }}
                </p>
              </div>
              <UButton
                size="xs"
                label="Assign"
                @click="assign(person.id)"
              />
            </li>
          </ul>
          <p
            v-else-if="search && !searching"
            class="text-sm text-muted"
          >
            Nobody found.
          </p>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="templateOpen"
      title="Shift template"
    >
      <template #body>
        <p class="mb-4 text-sm text-muted">
          The slots stamped onto every new performance at a venue we run. Set a role to zero to
          leave it off the rota.
        </p>
        <div class="space-y-3">
          <UFormField
            v-for="slot in templateSlots"
            :key="slot.role"
            :label="slot.role.replace('_', ' ').toLowerCase()"
            class="capitalize"
          >
            <UInput
              v-model.number="slot.count"
              type="number"
              min="0"
              max="20"
              class="w-24"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="() => { templateOpen = false }"
          />
          <UButton
            :loading="savingTemplate"
            label="Save template"
            @click="saveTemplate"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
