<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { BULK_LIMIT, REJECTION_REASON_LIMIT } from '#shared/utils/approvals'
import { describePurpose, saysBookingState } from '#shared/utils/bookings'
import { EXTERNAL_REASON_LIMIT, saysExternalState, saysExternalStatus } from '#shared/utils/external-requests'
import { saysVerdict } from '#shared/utils/external-spaces'
import { formatLondon } from '#shared/utils/london'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Room requests', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UCheckbox = resolveComponent('UCheckbox')

interface Failure { reason: string, says: string }

interface Offer { id: string, spaceId: string, space: string, outcome: string, reason: string | null, by: string | null, recordedAt: number }

interface Request {
  id: string
  kind: 'room' | 'unlisted'
  userId: string
  requester: string
  title: string
  attendees: number | null
  startsAt: number
  endsAt: number
  status: string
  purpose: string | null
  where: string | null
  createdAt: number
  decidedAt: number | null
  // Ours only: judged as it is read, so the officer sees what is true today (C-109).
  roomId?: string
  room?: string
  reason?: string | null
  rejectionReason?: string | null
  escalatedAt?: number | null
  failures?: Failure[]
  sensitive?: boolean
  // Not ours only: nothing here holds a slot, and the form has its own deadline (C-120, C-121).
  preferredSpaceId?: string | null
  assignedSpaceId?: string | null
  preferredWarning?: string | null
  suReference?: string | null
  notes?: string | null
  formDueBy?: string | null
  convertedToRequestId?: string | null
  convertedToBookingId?: string | null
  offers?: Offer[]
}

interface Outcome { id: string, ok: boolean, says?: string }

const EVERY_ROOM = 'all'

const listing = ref<{ items: Request[], total: number, more: boolean, counts: { room: number, unlisted: number } } | null>(null)
const rooms = ref<{ id: string, name: string, isActive: boolean }[]>([])
// Read from the query, because /admin/su-requests redirects here filtered and officers were
// emailed that path. A value we do not recognise falls back rather than showing nothing.
const route = useRoute()
const asKind = String(route.query.kind ?? '')
const when = ref<'open' | 'all'>(String(route.query.when ?? '') === 'all' ? 'all' : 'open')
const kind = ref<'all' | 'room' | 'unlisted'>(asKind === 'room' || asKind === 'unlisted' ? asKind : 'all')
const room = ref(EVERY_ROOM)
const search = ref('')
const loading = ref(false)
const failure = ref<string | null>(null)
const selected = ref<string[]>([])
const toast = useToast()

const rejecting = ref(false)
const rejectionReason = ref('')
const moving = ref(false)
const moveTo = ref('')
const acting = ref(false)
// What the pending modal will decide on, kept because a selection can change behind a dialog.
const decidingOn = ref<string[]>([])

// A room we do not manage has its own verbs, because nothing about it is ours to decide (C-120).
const unlistedSubmitting = ref<Request | null>(null)
const unlistedAssigning = ref<Request | null>(null)
const unlistedRefusing = ref<Request | null>(null)
const unlistedRejecting = ref<Request | null>(null)
const reference = ref('')
const chosenSpace = ref<string | undefined>()
const despite = ref(false)
const blockedBy = ref<{ verdict: string, reason: string } | null>(null)
const inModal = ref<string | null>(null)
const refusalReason = ref('')
const noteToo = ref(true)
const noteVerdict = ref<'CAUTION' | 'UNSUITABLE'>('UNSUITABLE')
const unlistedRejectReason = ref('')

// Moving a request to the other kind (C-123). One reason field, because the member is shown it
// either way, and the direction is whichever row the officer started from.
const unlisting = ref<Request | null>(null)
const relisting = ref<Request | null>(null)
const moveReason = ref('')
const moveRoom = ref('')

async function unlist(): Promise<void> {
  const one = unlisting.value
  if (!one) return
  if (await act(`/api/admin/rooms/requests/${one.id}/unlist`, { reason: moveReason.value }, 'Moved, and the slot freed')) {
    unlisting.value = null
  }
}

async function relist(): Promise<void> {
  const one = relisting.value
  if (!one || !moveRoom.value) return
  if (await act(`/api/admin/rooms/external-requests/${one.id}/relist`, { roomId: moveRoom.value, reason: moveReason.value }, 'Moved into one of ours')) {
    relisting.value = null
  }
}

function beginMove(which: 'unlist' | 'relist', one: Request): void {
  inModal.value = null
  moveReason.value = ''
  moveRoom.value = ''
  if (which === 'unlist') unlisting.value = one
  else relisting.value = one
}

async function act(path: string, body: Record<string, unknown>, said: string): Promise<boolean> {
  acting.value = true
  failure.value = null
  try {
    await $fetch(path, { method: 'POST', body })
    toast.add({ title: said, icon: 'i-lucide-check', color: 'success' })
    await load()
    return true
  }
  catch (error) {
    // The one refusal a person may override: the room is one we have marked no good.
    const data = refusalData<{ note?: { verdict: string, reason: string }, needsDespite?: boolean }>(error)
    if (data?.needsDespite && data.note) {
      blockedBy.value = data.note
      return false
    }
    // Shown inside the modal: the page-root alert sits behind the overlay, so a 409 from a
    // colleague acting first reads as the button simply doing nothing.
    inModal.value = refusalText(error)
    return false
  }
  finally {
    acting.value = false
  }
}

async function submitUnlisted(): Promise<void> {
  const one = unlistedSubmitting.value
  if (!one) return
  if (await act(`/api/admin/rooms/external-requests/${one.id}/submit`, { suReference: reference.value }, 'Requested')) {
    unlistedSubmitting.value = null
  }
}

async function assignUnlisted(): Promise<void> {
  const one = unlistedAssigning.value
  if (!one || !chosenSpace.value) return
  const done = await act(`/api/admin/rooms/external-requests/${one.id}/assign`, {
    spaceId: chosenSpace.value,
    suReference: reference.value || null,
    despite: despite.value,
  }, 'Room recorded, and the member told')
  if (done) unlistedAssigning.value = null
}

async function refuseUnlisted(): Promise<void> {
  const one = unlistedRefusing.value
  if (!one || !chosenSpace.value) return
  const done = await act(`/api/admin/rooms/external-requests/${one.id}/refuse-assignment`, {
    spaceId: chosenSpace.value,
    reason: refusalReason.value,
    note: noteToo.value ? { verdict: noteVerdict.value, reason: refusalReason.value } : null,
  }, 'Recorded, and asked again')
  if (done) unlistedRefusing.value = null
}

async function rejectUnlisted(): Promise<void> {
  const one = unlistedRejecting.value
  if (!one) return
  if (await act(`/api/admin/rooms/external-requests/${one.id}/reject`, { reason: unlistedRejectReason.value }, 'Turned down')) {
    unlistedRejecting.value = null
  }
}

// An override is asserted about one room, so changing the room withdraws it. Without this, a
// despite ticked for a room we know is no good waves the next room through unseen.
watch(chosenSpace, () => {
  despite.value = false
  blockedBy.value = null
})

function begin(which: 'submit' | 'assign' | 'refuse' | 'reject', one: Request): void {
  inModal.value = null
  reference.value = one.suReference ?? ''
  // Never pre-selected. SpacePicker renders nothing until a search returns, so a value set here
  // arms the button while the box still looks empty, and one click records the wrong room.
  chosenSpace.value = undefined
  despite.value = false
  blockedBy.value = null
  refusalReason.value = ''
  noteToo.value = true
  noteVerdict.value = 'UNSUITABLE'
  unlistedRejectReason.value = ''

  if (which === 'submit') unlistedSubmitting.value = one
  if (which === 'assign') unlistedAssigning.value = one
  if (which === 'refuse') unlistedRefusing.value = one
  if (which === 'reject') unlistedRejecting.value = one
}

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    listing.value = await $fetch<typeof listing.value & object>('/api/admin/rooms/queue', {
      query: { when: when.value, kind: kind.value, ...(room.value === EVERY_ROOM ? {} : { room: room.value }) },
    })
    selected.value = selected.value.filter(id => listing.value!.items.some(item => item.id === id))
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    loading.value = false
  }
}

async function loadRooms(): Promise<void> {
  const answered = await $fetch<{ items: { id: string, name: string, isActive: boolean }[] }>('/api/admin/rooms')
  rooms.value = answered.items
}

// Searched here rather than in SQL: a triage queue is tens of rows, and every one of them is
// already on the page.
const shown = computed(() => {
  const items = listing.value?.items ?? []
  const term = search.value.trim().toLowerCase()
  if (!term) return items
  return items.filter(item => [item.requester, item.where ?? '', item.title, item.reason ?? '']
    .some(field => field.toLowerCase().includes(term)))
})

const allShownSelected = computed(() => shown.value.length > 0 && shown.value.every(item => selected.value.includes(item.id)))

function toggleAll(on: boolean): void {
  selected.value = on ? shown.value.slice(0, BULK_LIMIT).map(item => item.id) : []
}

function toggle(id: string, on: boolean): void {
  selected.value = on ? [...selected.value, id] : selected.value.filter(one => one !== id)
}

function span(request: Request): string {
  const from = formatLondon(new Date(request.startsAt * 1000), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const to = formatLondon(new Date(request.endsAt * 1000), { hour: '2-digit', minute: '2-digit' })
  return `${from} to ${to}`
}

async function decide(ids: string[], action: 'APPROVE' | 'REJECT', body: Record<string, unknown> = {}): Promise<void> {
  if (ids.length === 0) return
  acting.value = true
  failure.value = null
  try {
    const answered = await $fetch<{ ok: boolean, decided: number, outcomes: Outcome[] }>(
      '/api/admin/rooms/requests/decide', { method: 'POST', body: { ids, action, ...body } })

    const refused = answered.outcomes.filter(outcome => !outcome.ok)
    toast.add({
      title: answered.decided > 0
        ? `${plural(answered.decided, 'request')} ${action === 'APPROVE' ? 'approved' : 'rejected'}`
        : 'Nothing was decided',
      // A batch that partly failed says how many and why, rather than reading as a success.
      description: refused.length ? `${plural(refused.length, 'request')} could not be: ${refused[0]!.says}` : undefined,
      icon: refused.length ? 'i-lucide-triangle-alert' : 'i-lucide-check',
      color: refused.length ? 'warning' : 'success',
    })

    selected.value = selected.value.filter(id => refused.some(outcome => outcome.id === id))
    await load()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    acting.value = false
  }
}

function askToReject(ids: string[]): void {
  decidingOn.value = ids
  rejectionReason.value = ''
  rejecting.value = true
}

function askToMove(id: string): void {
  decidingOn.value = [id]
  moveTo.value = ''
  moving.value = true
}

async function confirmRejection(): Promise<void> {
  await decide(decidingOn.value, 'REJECT', { reason: rejectionReason.value })
  rejecting.value = false
}

async function confirmMove(): Promise<void> {
  await decide(decidingOn.value, 'APPROVE', { roomId: moveTo.value })
  moving.value = false
}

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (room.value !== EVERY_ROOM) {
    active.push({ key: 'room', label: rooms.value.find(one => one.id === room.value)?.name ?? 'One room', icon: 'i-lucide-door-open', clear: () => {
      room.value = EVERY_ROOM
    } })
  }
  if (when.value !== 'open') {
    active.push({ key: 'when', label: 'Including settled', icon: 'i-lucide-history', clear: () => {
      when.value = 'open'
    } })
  }
  if (kind.value !== 'all') {
    active.push({ key: 'kind', label: kind.value === 'room' ? 'Our rooms' : 'Rooms we do not manage', icon: 'i-lucide-filter', clear: () => {
      kind.value = 'all'
    } })
  }
  return active
})

function clearFilters(): void {
  search.value = ''
  room.value = EVERY_ROOM
  when.value = 'open'
  kind.value = 'all'
}

const roomOptions = computed(() => [
  { label: 'Every room', value: EVERY_ROOM },
  ...rooms.value.filter(one => one.isActive).map(one => ({ label: one.name, value: one.id })),
])

const moveOptions = computed(() => rooms.value
  .filter(one => one.isActive && one.id !== listing.value?.items.find(item => item.id === decidingOn.value[0])?.roomId)
  .map(one => ({ label: one.name, value: one.id })))

watch([when, room, kind], load)

const columns = computed<TableColumn<Request>[]>(() => [
  ...(when.value === 'open'
    ? [{
      id: 'select',
      header: () => h(UCheckbox, {
        'modelValue': allShownSelected.value,
        'aria-label': 'Select every request shown',
        'data-test': 'select-all',
        'onUpdate:modelValue': (on: boolean) => toggleAll(on),
      }),
      cell: ({ row }) => (row.original.kind === 'room'
        ? h(UCheckbox, {
            'modelValue': selected.value.includes(row.original.id),
            'aria-label': `Select ${row.original.requester}, ${row.original.where}`,
            'data-test': `select-${row.original.id}`,
            'onUpdate:modelValue': (on: boolean) => toggle(row.original.id, on),
          })
        : null),
    } satisfies TableColumn<Request>]
    : []),
  {
    id: 'who',
    header: 'Who and what',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex items-center gap-2' }, [
        h('span', {}, row.original.requester),
        row.original.kind === 'unlisted'
          ? h(UBadge, { color: 'info', variant: 'subtle', size: 'sm' }, () => 'Not ours')
          : null,
      ]),
      h('div', { class: 'text-xs text-muted' }, `${row.original.title} (${describePurpose(row.original.purpose)})`),
    ]),
  },
  {
    id: 'when',
    header: 'When',
    meta: { class: { td: 'whitespace-nowrap text-sm' } },
    cell: ({ row }) => h('div', {}, [
      h('div', {}, span(row.original)),
      h('div', { class: 'text-xs text-muted' }, row.original.where ?? 'No room yet'),
    ]),
  },
  {
    id: 'why',
    header: 'Why it is here',
    cell: ({ row }) => (row.original.kind === 'unlisted'
      ? h('div', { class: 'space-y-1' }, [
          h('div', { class: 'flex flex-wrap gap-1' }, [
            h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => saysExternalStatus(row.original.status)),
            row.original.preferredWarning
              ? h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm' }, () => row.original.preferredWarning!)
              : null,
          ]),
          row.original.formDueBy
            ? h('p', { 'class': 'text-sm', 'data-test': `due-${row.original.id}` }, `Form in by ${row.original.formDueBy}`)
            : null,
          row.original.notes ? h('p', { class: 'text-sm text-muted' }, row.original.notes) : null,
        ])
      : h('div', { class: 'space-y-1' }, [
          h('div', { class: 'flex flex-wrap gap-1' }, [
            ...(row.original.sensitive ? [h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm' }, () => 'Always asks')] : []),
            ...(row.original.failures ?? []).map(fail =>
              h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm', title: fail.says }, () => fail.says)),
          ]),
          row.original.reason ? h('p', { class: 'text-sm' }, row.original.reason) : null,
        ])),
  },
  ...(when.value === 'open'
    ? [{
      id: 'decide',
      header: '',
      meta: { class: { td: 'text-right whitespace-nowrap' } },
      // No action appears on a row it would refuse: the verbs differ by kind and by status,
      // and an officer clicking one that cannot apply learns nothing (C-122 criterion 5).
      cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, row.original.kind === 'unlisted'
        ? [
            row.original.status === 'REQUESTED'
              ? h(UButton, { 'size': 'sm', 'variant': 'subtle', 'data-test': `submit-${row.original.id}`, 'onClick': () => begin('submit', row.original) }, () => 'Form is in')
              : null,
            row.original.status === 'AWAITING_EXTERNAL' || row.original.status === 'CONFIRMED'
              ? h(UButton, { 'size': 'sm', 'variant': 'subtle', 'data-test': `assign-${row.original.id}`, 'onClick': () => begin('assign', row.original) }, () => row.original.status === 'CONFIRMED' ? 'Change room' : 'Record room')
              : null,
            row.original.status === 'AWAITING_EXTERNAL' || row.original.status === 'CONFIRMED'
              ? h(UButton, { 'size': 'sm', 'color': 'neutral', 'variant': 'ghost', 'data-test': `refuse-${row.original.id}`, 'onClick': () => begin('refuse', row.original) }, () => 'Send back')
              : null,
            row.original.status === 'REQUESTED' || row.original.status === 'AWAITING_EXTERNAL'
              ? h(UButton, { 'size': 'sm', 'color': 'error', 'variant': 'ghost', 'data-test': `turn-down-${row.original.id}`, 'onClick': () => begin('reject', row.original) }, () => 'Turn down')
              : null,
            h(UButton, { 'size': 'sm', 'color': 'neutral', 'variant': 'ghost', 'data-test': `relist-${row.original.id}`, 'onClick': () => beginMove('relist', row.original) }, () => 'Use one of ours'),
          ]
        : [
            h(UButton, {
              'size': 'sm',
              'variant': 'subtle',
              'loading': acting.value,
              'data-test': `approve-${row.original.id}`,
              'onClick': () => decide([row.original.id], 'APPROVE'),
            }, () => 'Approve'),
            h(UButton, {
              'size': 'sm',
              'color': 'neutral',
              'variant': 'ghost',
              'icon': 'i-lucide-arrow-right-left',
              'aria-label': `Approve ${row.original.requester} into another room`,
              'data-test': `move-${row.original.id}`,
              'onClick': () => askToMove(row.original.id),
            }),
            h(UButton, {
              'size': 'sm',
              'color': 'error',
              'variant': 'ghost',
              'data-test': `reject-${row.original.id}`,
              'onClick': () => askToReject([row.original.id]),
            }, () => 'Reject'),
            h(UButton, {
              'size': 'sm',
              'color': 'neutral',
              'variant': 'ghost',
              'data-test': `unlist-${row.original.id}`,
              'onClick': () => beginMove('unlist', row.original),
            }, () => 'Not one of ours'),
          ]),
    } satisfies TableColumn<Request>]
    : [{
      id: 'outcome',
      header: 'Answer',
      // A moved row is CANCELLED carrying a pointer, and "Not approved" would be the opposite of
      // what happened to it (C-123 criterion 5).
      cell: ({ row }) => h('div', {}, [
        h(UBadge, {
          color: row.original.status === 'CONFIRMED' ? 'success' : 'neutral',
          variant: 'subtle',
          size: 'sm',
        }, () => (row.original.kind === 'unlisted'
          ? saysExternalState(row.original)
          : saysBookingState(row.original))),
        row.original.rejectionReason ? h('p', { class: 'mt-1 text-sm text-muted' }, row.original.rejectionReason) : null,
      ]),
    } satisfies TableColumn<Request>]),
])

onMounted(async () => {
  await Promise.all([load(), loadRooms()])
})
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

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-inbox"
      title="Every request gets an answer"
      description="A request holds its slot while it waits, so leaving one here keeps the room blocked. One nobody answers is chased up and then lapses on its own."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A name, a room or what it is for"
      :active="activeFilters"
      :loading="loading"
      @clear="clearFilters"
    >
      <template #filters>
        <UFormField label="Show">
          <USelect
            v-model="when"
            data-test="requests-when"
            :items="[{ label: 'Open', value: 'open' }, { label: 'Everything', value: 'all' }]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Kind">
          <USelect
            v-model="kind"
            data-test="requests-kind"
            :items="[
              { label: 'All rooms', value: 'all' },
              { label: 'Our rooms', value: 'room' },
              { label: 'Rooms we do not manage', value: 'unlisted' },
            ]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Room">
          <USelect
            v-model="room"
            data-test="requests-room"
            :items="roomOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          v-if="selected.length"
          data-test="approve-selected"
          icon="i-lucide-check"
          :loading="acting"
          @click="decide(selected, 'APPROVE')"
        >
          Approve {{ plural(selected.length, 'request') }}
        </UButton>
        <UButton
          v-if="selected.length"
          data-test="reject-selected"
          icon="i-lucide-x"
          color="error"
          variant="outline"
          :loading="acting"
          @click="askToReject(selected)"
        >
          Reject
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="shown"
      :columns="columns"
      :loading="loading"
      data-test="requests-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ when === 'open'
            ? 'Nothing is waiting on a decision.'
            : 'Nothing has been decided yet.' }}
        </p>
      </template>
    </UTable>

    <p
      data-test="requests-total"
      class="text-sm text-muted"
    >
      {{ plural(shown.length, 'request') }}
    </p>

    <UModal
      v-model:open="rejecting"
      title="Say why"
      description="The requester is shown this word for word, so write it to them."
    >
      <template #body>
        <UFormField
          label="Why it is not approved"
          required
          :description="`Up to ${REJECTION_REASON_LIMIT} characters.`"
        >
          <UTextarea
            v-model="rejectionReason"
            :rows="3"
            :maxlength="REJECTION_REASON_LIMIT"
            class="w-full"
            data-test="rejection-reason"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton
          color="error"
          :loading="acting"
          :disabled="!rejectionReason.trim()"
          data-test="confirm-rejection"
          @click="confirmRejection"
        >
          Reject {{ plural(decidingOn.length, 'request') }}
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="rejecting = false"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="moving"
      title="Approve into another room"
      description="The booking moves, and the slot has to be free there too."
    >
      <template #body>
        <UFormField
          label="Room"
          required
        >
          <USelect
            v-model="moveTo"
            :items="moveOptions"
            value-key="value"
            placeholder="Choose a room"
            class="w-full"
            data-test="move-room"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton
          :loading="acting"
          :disabled="!moveTo"
          data-test="confirm-move"
          @click="confirmMove"
        >
          Approve into it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="moving = false"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="unlistedSubmitting !== null"
      title="The form is in"
      description="The member is told it is with them. Their reference, if they gave you one, makes reconciling the two sides possible later."
      @update:open="unlistedSubmitting = null"
    >
      <template #body>
        <UAlert
          v-if="inModal"
          class="mb-4"
          color="error"
          variant="subtle"
          :description="inModal"
          data-test="modal-failure"
        />
        <UFormField
          label="Their reference"
          hint="Optional"
        >
          <UInput
            v-model="reference"
            class="w-full"
            data-test="submit-reference"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton
          :loading="acting"
          data-test="submit-confirm"
          @click="submitUnlisted"
        >
          It is with them
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="unlistedSubmitting = null"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="unlistedAssigning !== null"
      title="What did they give us?"
      description="Recording the room confirms the request and tells the member which room they have."
      @update:open="unlistedAssigning = null"
    >
      <template #body>
        <UAlert
          v-if="inModal"
          class="mb-4"
          color="error"
          variant="subtle"
          :description="inModal"
          data-test="modal-failure"
        />
        <div class="space-y-4">
          <UFormField
            label="The room"
            required
          >
            <SpacePicker
              v-model="chosenSpace"
              :purpose="unlistedAssigning?.purpose ?? null"
            />
          </UFormField>

          <UFormField
            label="Their reference"
            hint="Optional"
          >
            <UInput
              v-model="reference"
              class="w-full"
            />
          </UFormField>

          <!-- The spreadsheet check, made into something that stops you rather than something
               you read past. -->
          <UAlert
            v-if="blockedBy"
            color="error"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="We know this room is no good for that"
            data-test="assign-blocked"
          >
            <template #description>
              <p>{{ blockedBy.reason }}</p>
              <UCheckbox
                v-model="despite"
                class="mt-3"
                label="Record it anyway"
                data-test="assign-despite"
              />
            </template>
          </UAlert>
        </div>
      </template>
      <template #footer>
        <UButton
          :loading="acting"
          :disabled="!chosenSpace || (blockedBy !== null && !despite)"
          data-test="assign-confirm"
          @click="assignUnlisted"
        >
          That is the room
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="unlistedAssigning = null"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="unlistedRefusing !== null"
      title="That room is no good"
      description="Recorded against the room, so the next person asking for it is warned. The request stays open."
      @update:open="unlistedRefusing = null"
    >
      <template #body>
        <UAlert
          v-if="inModal"
          class="mb-4"
          color="error"
          variant="subtle"
          :description="inModal"
          data-test="modal-failure"
        />
        <div class="space-y-4">
          <UFormField
            label="Which room they offered"
            required
          >
            <SpacePicker
              v-model="chosenSpace"
              :purpose="unlistedRefusing?.purpose ?? null"
            />
          </UFormField>

          <UFormField
            label="What was wrong with it"
            required
            :description="`Up to ${EXTERNAL_REASON_LIMIT} characters.`"
          >
            <UTextarea
              v-model="refusalReason"
              :rows="3"
              :maxlength="EXTERNAL_REASON_LIMIT"
              class="w-full"
              data-test="refuse-reason"
            />
          </UFormField>

          <UFormField
            v-if="noteToo"
            label="How bad is it"
            description="A one-off problem is a caution. Unsuitable refuses the room outright next time."
          >
            <div class="flex flex-wrap gap-1">
              <UButton
                v-for="verdict in ['CAUTION', 'UNSUITABLE'] as const"
                :key="verdict"
                size="sm"
                :color="noteVerdict === verdict ? (verdict === 'UNSUITABLE' ? 'error' : 'warning') : 'neutral'"
                :variant="noteVerdict === verdict ? 'solid' : 'outline'"
                :aria-pressed="noteVerdict === verdict"
                :data-test="`refuse-verdict-${verdict}`"
                @click="noteVerdict = verdict"
              >
                {{ saysVerdict(verdict) }}
              </UButton>
            </div>
          </UFormField>

          <UCheckbox
            v-model="noteToo"
            :label="`Remember this about the room for ${describePurpose(unlistedRefusing?.purpose ?? null).toLowerCase()}`"
            description="So the next person asking for it is warned before anybody is troubled."
            data-test="refuse-note"
          />
        </div>
      </template>
      <template #footer>
        <UButton
          color="warning"
          :loading="acting"
          :disabled="!chosenSpace || !refusalReason.trim()"
          data-test="refuse-confirm"
          @click="refuseUnlisted"
        >
          Ask them again
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="unlistedRefusing = null"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="unlistedRejecting !== null"
      title="Say why"
      description="The member is shown this word for word, so write it to them."
      @update:open="unlistedRejecting = null"
    >
      <template #body>
        <UAlert
          v-if="inModal"
          class="mb-4"
          color="error"
          variant="subtle"
          :description="inModal"
          data-test="modal-failure"
        />
        <UFormField
          label="Why it is not being requested"
          required
        >
          <UTextarea
            v-model="unlistedRejectReason"
            :rows="3"
            :maxlength="EXTERNAL_REASON_LIMIT"
            class="w-full"
            data-test="su-reject-reason"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton
          color="error"
          :loading="acting"
          :disabled="!unlistedRejectReason.trim()"
          data-test="su-reject-confirm"
          @click="rejectUnlisted"
        >
          Turn it down
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="unlistedRejecting = null"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="unlisting !== null"
      title="Ask for a room not listed here instead"
      description="The slot this is holding is freed straight away, and nothing is held until whoever manages the new room answers."
      @update:open="unlisting = null"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="inModal"
            color="error"
            variant="subtle"
            :description="inModal"
          />
          <UFormField
            label="Why"
            :hint="`${moveReason.length}/${REJECTION_REASON_LIMIT}`"
          >
            <UTextarea
              v-model="moveReason"
              :maxlength="REJECTION_REASON_LIMIT"
              class="w-full"
              data-test="unlist-reason"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton
          :loading="acting"
          :disabled="!moveReason.trim()"
          data-test="unlist-confirm"
          @click="unlist"
        >
          Move it, and free the slot
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="unlisting = null"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="relisting !== null"
      title="Use one of our rooms instead"
      description="This claims the room straight away, so it can fail if somebody else holds it for that span."
      @update:open="relisting = null"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="inModal"
            color="error"
            variant="subtle"
            :description="inModal"
          />
          <UFormField label="Room">
            <USelect
              v-model="moveRoom"
              :items="roomOptions.filter(one => one.value !== EVERY_ROOM)"
              value-key="value"
              class="w-full"
              data-test="relist-room"
            />
          </UFormField>
          <UFormField
            label="Why"
            :hint="`${moveReason.length}/${REJECTION_REASON_LIMIT}`"
          >
            <UTextarea
              v-model="moveReason"
              :maxlength="REJECTION_REASON_LIMIT"
              class="w-full"
              data-test="relist-reason"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton
          :loading="acting"
          :disabled="!moveRoom || !moveReason.trim()"
          data-test="relist-confirm"
          @click="relist"
        >
          Move it into that room
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="relisting = null"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
