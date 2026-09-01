<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { BULK_LIMIT, REJECTION_REASON_LIMIT } from '#shared/utils/approvals'
import { describePurpose } from '#shared/utils/bookings'
import { formatLondon } from '#shared/utils/london'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'admin', title: 'Room requests', middleware: 'signed-in' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UCheckbox = resolveComponent('UCheckbox')

interface Failure { reason: string, says: string }

interface Request {
  id: string
  roomId: string
  room: string
  userId: string
  requester: string
  title: string
  attendees: number | null
  startsAt: number
  endsAt: number
  status: string
  purpose: string | null
  reason: string | null
  rejectionReason: string | null
  createdAt: number
  escalatedAt: number | null
  decidedAt: number | null
  failures: Failure[]
  sensitive: boolean
  isExternal: boolean
}

interface Outcome { id: string, ok: boolean, says?: string }

const EVERY_ROOM = 'all'

const listing = ref<{ items: Request[], total: number } | null>(null)
const rooms = ref<{ id: string, name: string, isActive: boolean }[]>([])
const when = ref<'waiting' | 'decided'>('waiting')
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

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    listing.value = await $fetch<{ items: Request[], total: number }>('/api/admin/rooms/requests', {
      query: { when: when.value, ...(room.value === EVERY_ROOM ? {} : { room: room.value }) },
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
  return items.filter(item => [item.requester, item.room, item.title, item.reason ?? '']
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
  if (when.value !== 'waiting') {
    active.push({ key: 'when', label: 'Already decided', icon: 'i-lucide-history', clear: () => {
      when.value = 'waiting'
    } })
  }
  return active
})

function clearFilters(): void {
  search.value = ''
  room.value = EVERY_ROOM
  when.value = 'waiting'
}

const roomOptions = computed(() => [
  { label: 'Every room', value: EVERY_ROOM },
  ...rooms.value.filter(one => one.isActive).map(one => ({ label: one.name, value: one.id })),
])

const moveOptions = computed(() => rooms.value
  .filter(one => one.isActive && one.id !== listing.value?.items.find(item => item.id === decidingOn.value[0])?.roomId)
  .map(one => ({ label: one.name, value: one.id })))

watch([when, room], load)

const columns = computed<TableColumn<Request>[]>(() => [
  ...(when.value === 'waiting'
    ? [{
      id: 'select',
      header: () => h(UCheckbox, {
        'modelValue': allShownSelected.value,
        'aria-label': 'Select every request shown',
        'data-test': 'select-all',
        'onUpdate:modelValue': (on: boolean) => toggleAll(on),
      }),
      cell: ({ row }) => h(UCheckbox, {
        'modelValue': selected.value.includes(row.original.id),
        'aria-label': `Select ${row.original.requester}, ${row.original.room}`,
        'data-test': `select-${row.original.id}`,
        'onUpdate:modelValue': (on: boolean) => toggle(row.original.id, on),
      }),
    } satisfies TableColumn<Request>]
    : []),
  {
    id: 'who',
    header: 'Who and what',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.requester),
      h('div', { class: 'text-xs text-muted' }, `${row.original.title} (${describePurpose(row.original.purpose)})`),
    ]),
  },
  {
    id: 'when',
    header: 'When',
    meta: { class: { td: 'whitespace-nowrap text-sm' } },
    cell: ({ row }) => h('div', {}, [
      h('div', {}, span(row.original)),
      h('div', { class: 'text-xs text-muted' }, row.original.room),
    ]),
  },
  {
    id: 'why',
    header: 'Why it is here',
    cell: ({ row }) => h('div', { class: 'space-y-1' }, [
      h('div', { class: 'flex flex-wrap gap-1' }, [
        ...(row.original.sensitive ? [h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm' }, () => 'Always asks')] : []),
        ...(row.original.isExternal ? [h(UBadge, { color: 'info', variant: 'subtle', size: 'sm' }, () => 'Booked through the SU')] : []),
        ...row.original.failures.map(fail =>
          h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm', title: fail.says }, () => fail.says)),
      ]),
      row.original.reason ? h('p', { class: 'text-sm' }, row.original.reason) : null,
    ]),
  },
  ...(when.value === 'waiting'
    ? [{
      id: 'decide',
      header: '',
      meta: { class: { td: 'text-right whitespace-nowrap' } },
      cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
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
      ]),
    } satisfies TableColumn<Request>]
    : [{
      id: 'outcome',
      header: 'Answer',
      cell: ({ row }) => h('div', {}, [
        h(UBadge, {
          color: row.original.status === 'CONFIRMED' ? 'success' : 'neutral',
          variant: 'subtle',
          size: 'sm',
        }, () => row.original.status === 'CONFIRMED' ? 'Approved' : 'Not approved'),
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
            :items="[{ label: 'Waiting', value: 'waiting' }, { label: 'Already decided', value: 'decided' }]"
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
          {{ when === 'waiting'
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
  </div>
</template>
