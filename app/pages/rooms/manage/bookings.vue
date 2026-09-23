<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { can, manageRoomsEstate } from '#shared/utils/abilities'
import { TIERS, describePurpose, saysBookingState } from '#shared/utils/bookings'
import { saysSpan } from '#shared/utils/blackouts'
import { NO_SHOW_REASON_LIMIT } from '#shared/utils/no-shows'
import { roomBookingsList, rowActionFor, saysTier } from '#shared/utils/room-bookings-list'
import { BUMP_REASON_LIMIT, bumpForm } from '#shared/utils/tiers'
import type { FilterOption } from '#shared/utils/list-filters'
import type { Standing } from '#shared/utils/no-shows'
import type { BumpInput } from '#shared/utils/tiers'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Bookings', middleware: 'console', docs: '/docs/spaces/bookings' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Booking {
  id: string
  roomId: string
  room: string
  userId: string
  member: string
  title: string
  tier: string
  purpose: string | null
  status: string
  attendees: number | null
  startsAt: number
  endsAt: number
  noShowId: string | null
}

interface Offer {
  room: string
  startsAt: number
  endsAt: number
}

interface Listing {
  items: Booking[]
  page: number
  pageSize: number
  total: number
  pages: number
}

interface Alternatives { nearest: Offer | null, total: number }

interface StandingAnswer { count: number, standing: Standing }

const request = useRequestFetch()
const failure = ref<ListFailure | null>(null)
const rooms = ref<{ id: string, name: string }[]>([])
const purposes = ref<string[]>([])
const toast = useToast()

const writes = computed(() => can(useViewer().value, manageRoomsEstate))

const roomOptions = computed<FilterOption[]>(() => rooms.value.map(one => ({ value: one.id, label: one.name })))

// Search, filters, sort and page live in the URL (K-129).
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(roomBookingsList, {
  options: computed(() => ({ room: roomOptions.value })),
})

const empty = (): Listing => ({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 })

const { data: listing, status, refresh, error } = await useAsyncData(
  'rooms-bookings',
  () => request<Listing>('/api/admin/rooms/bookings', { query: query.value }),
  { watch: [query], default: empty },
)

watch(error, (raised) => {
  if (raised) failure.value = listFailureFrom(raised, 'The bookings could not be read.')
})

async function loadRooms(): Promise<void> {
  rooms.value = (await $fetch<{ items: typeof rooms.value }>('/api/admin/rooms')).items
}

async function loadPurposes(): Promise<void> {
  purposes.value = (await $fetch<{ purposes: string[] }>('/api/rooms/policy')).purposes
}

const spanOf = (booking: { startsAt: number, endsAt: number }): string =>
  saysSpan(new Date(booking.startsAt * 1000), new Date(booking.endsAt * 1000))

const working = ref(false)
const refusal = ref<string | null>(null)

// The account the room is taken for is chosen, never typed (0032), and the slot the displaced
// member would be offered is shown before anybody presses the button (C-115 criterion 7).
const bumping = ref<Booking | null>(null)
const bump = reactive<Partial<BumpInput>>({})
const offer = ref<Alternatives | null>(null)
// Widened to string: the form's tier is a plain string, checked against the live order by the route.
const tierItems: { label: string, value: string }[] = TIERS.map(tier => ({ label: saysTier(tier), value: tier }))

async function openBump(booking: Booking): Promise<void> {
  refusal.value = null
  offer.value = null
  Object.assign(bump, { userId: undefined, title: '', tier: TIERS[0], purpose: undefined, reason: '' })
  bumping.value = booking
  try {
    const found = await $fetch<Alternatives>(`/api/admin/rooms/bookings/${booking.id}/alternatives`)
    if (bumping.value?.id === booking.id) offer.value = found
  }
  catch (error) {
    // A late answer for a dialogue already closed must not land in the next one.
    if (bumping.value?.id === booking.id) refusal.value = refusalText(error)
  }
}

// Every row action posts once, reports in a toast and reloads the list; a dropped connection
// leaves the outcome unknown, so the refusal says what to check.
async function post<T>(url: string, body: object, whatToCheck: string, done: (answer: T) => void): Promise<void> {
  working.value = true
  refusal.value = null
  try {
    done(await $fetch<T>(url, { method: 'POST', body }))
    await refresh()
  }
  catch (error) {
    refusal.value = writeFailureText(error, whatToCheck)
  }
  finally {
    working.value = false
  }
}

async function submitBump(): Promise<void> {
  const booking = bumping.value
  if (!booking) return
  await post<{ offered: Offer | null }>(
    `/api/admin/rooms/bookings/${booking.id}/bump`,
    bump,
    'Reload the list to see whether the booking was bumped.',
    (answer) => {
      toast.add({
        title: 'Booking bumped',
        description: answer.offered
          ? `${booking.member} has been told and offered ${answer.offered.room}, ${spanOf(answer.offered)}.`
          : `${booking.member} has been told. Nothing equivalent was free to offer.`,
        icon: 'i-lucide-check',
        color: 'success',
      })
      bumping.value = null
    },
  )
}

const recording = ref<Booking | null>(null)
const noShowReason = ref('')
const withdrawing = ref<Booking | null>(null)
const withdrawal = ref('')

function openRecord(booking: Booking): void {
  refusal.value = null
  noShowReason.value = ''
  recording.value = booking
}

function openWithdraw(booking: Booking): void {
  refusal.value = null
  withdrawal.value = ''
  withdrawing.value = booking
}

// The member's standing after the change, in the officer's words rather than the member's.
function saysStandingOf(member: string, answer: StandingAnswer): string {
  const missed = `${member} has missed ${plural(answer.count, 'booking')}.`
  return answer.standing === 'PRE_APPROVAL' ? `${missed} Their bookings now go to Room requests first.` : missed
}

async function record(): Promise<void> {
  const booking = recording.value
  if (!booking) return
  await post<StandingAnswer>(
    `/api/admin/rooms/bookings/${booking.id}/no-show`,
    { reason: noShowReason.value },
    'Reload the list to see whether the no-show was recorded.',
    (answer) => {
      toast.add({ title: 'No-show recorded', description: saysStandingOf(booking.member, answer), icon: 'i-lucide-check', color: 'success' })
      recording.value = null
    },
  )
}

async function withdraw(): Promise<void> {
  const booking = withdrawing.value
  if (!booking?.noShowId) return
  await post<StandingAnswer>(
    `/api/admin/rooms/no-shows/${booking.noShowId}/withdraw`,
    { reason: withdrawal.value },
    'Reload the list to see whether the no-show was withdrawn.',
    (answer) => {
      toast.add({ title: 'No-show withdrawn', description: saysStandingOf(booking.member, answer), icon: 'i-lucide-check', color: 'success' })
      withdrawing.value = null
    },
  )
}

// One action per row at most: the three are exclusive by the booking's state and time.
const ROW_ACTION = {
  bump: { label: 'Bump', open: openBump },
  record: { label: 'Record a no-show', open: openRecord },
  withdraw: { label: 'Withdraw the no-show', open: openWithdraw },
} as const

const columns: TableColumn<Booking>[] = [
  {
    id: 'booking',
    header: 'Booking',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'font-medium' }, row.original.title),
      h('div', { class: 'text-xs text-muted' }, row.original.room),
      // Below sm the member and the span are hidden: shown here instead (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, `${row.original.member}, ${spanOf(row.original)}`),
    ]),
  },
  { accessorKey: 'member', header: 'Member', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } } },
  {
    id: 'span',
    header: 'When',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} whitespace-nowrap text-sm` } },
    cell: ({ row }) => spanOf(row.original),
  },
  {
    id: 'tier',
    header: 'Kind',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} text-sm` } },
    cell: ({ row }) => saysTier(row.original.tier),
  },
  {
    id: 'state',
    header: 'State',
    cell: ({ row }) => h('div', { class: 'flex flex-wrap gap-1' }, [
      h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => saysBookingState(row.original)),
      row.original.noShowId
        ? h(UBadge, { 'color': 'warning', 'variant': 'subtle', 'size': 'sm', 'data-test': `no-show-${row.original.id}` }, () => 'No-show')
        : null,
    ]),
  },
  {
    id: 'action',
    header: ACTIONS_HEADER,
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => {
      const action = writes.value ? rowActionFor(row.original, Math.floor(Date.now() / 1000)) : null
      if (!action) return null
      return h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'aria-label': `${ROW_ACTION[action].label}: ${row.original.title}`,
        'data-test': `${action}-${row.original.id}`,
        'onClick': () => ROW_ACTION[action].open(row.original),
      }, () => ROW_ACTION[action].label)
    },
  },
]

onMounted(() => {
  void loadRooms()
  if (writes.value) void loadPurposes()
})
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure.message"
      :actions="failure.enrolPath ? [{ label: 'Set up an authenticator app', to: failure.enrolPath, color: 'error' }] : []"
    />

    <p class="text-sm text-muted">
      Every member's room bookings, still to come unless you ask for past ones.
    </p>

    <AdminToolbar
      v-model:search="search"
      :placeholder="roomBookingsList.search.placeholder"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="roomBookingsList"
          :conditions="conditions"
          :sort="sort"
          :options="{ room: roomOptions }"
          @set="set"
          @sort="setSort"
        />
      </template>
    </AdminToolbar>

    <UTable
      :data="listing.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="bookings-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ failure ? failure.message : filtered ? 'No booking matches that.' : 'Nothing is booked from now on.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="bookings-total"
        class="text-sm text-muted"
      >
        {{ plural(listing.total, 'booking') }}
      </p>
      <UPagination
        v-if="listing.pages > 1"
        v-model:page="page"
        :total="listing.total"
        :items-per-page="listing.pageSize"
      />
    </div>

    <ConfirmModal
      :open="bumping !== null"
      name="bump-booking"
      title="Bump this booking"
      verb="Bump the booking"
      :consequence="bumping ? `${bumping.member} loses ${bumping.title} in ${bumping.room}, ${spanOf(bumping)}, and is told at once with your reason.` : ''"
      form="bump-form"
      :loading="working"
      :failure="refusal"
      @update:open="bumping = null; refusal = null"
    >
      <template #body>
        <p
          class="text-sm"
          data-test="bump-offer"
        >
          <template v-if="!offer">
            Looking for a slot to offer instead.
          </template>
          <template v-else-if="offer.nearest">
            They will be offered {{ offer.nearest.room }}, {{ spanOf(offer.nearest) }}.
          </template>
          <template v-else>
            Nothing equivalent is free, and they will be offered nothing.
          </template>
        </p>
        <UForm
          id="bump-form"
          :schema="bumpForm"
          :state="bump"
          class="space-y-4"
          @submit="submitBump"
        >
          <UFormField
            name="userId"
            label="Taken for"
            required
          >
            <PersonPicker
              v-model="bump.userId"
              data-test="bump-user"
            />
          </UFormField>
          <UFormField
            name="title"
            label="Title"
            required
          >
            <UInput
              v-model="bump.title"
              maxlength="200"
              class="w-full"
              data-test="bump-title"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              name="tier"
              label="Kind of booking"
              required
              help="It has to rank above the booking it takes."
            >
              <USelect
                v-model="bump.tier"
                :items="tierItems"
                value-key="value"
                class="w-full"
                data-test="bump-tier"
              />
            </UFormField>
            <UFormField
              name="purpose"
              label="What it is for"
              required
            >
              <USelect
                v-model="bump.purpose"
                :items="purposes.map(purpose => ({ label: describePurpose(purpose), value: purpose }))"
                value-key="value"
                class="w-full"
                data-test="bump-purpose"
              />
            </UFormField>
          </div>
          <UFormField
            name="reason"
            label="Reason"
            required
            :description="`The member reads this word for word. Up to ${BUMP_REASON_LIMIT} characters.`"
          >
            <UTextarea
              v-model="bump.reason"
              :maxlength="BUMP_REASON_LIMIT"
              :rows="3"
              autoresize
              class="w-full"
              data-test="bump-reason"
            />
          </UFormField>
        </UForm>
      </template>
    </ConfirmModal>

    <ConfirmModal
      :open="recording !== null"
      name="record-no-show"
      title="Record a no-show"
      verb="Record the no-show"
      :consequence="recording ? `${recording.member} is marked as missing ${recording.title}, ${spanOf(recording)}. Enough of these and their bookings go to Room requests first.` : ''"
      :loading="working"
      :failure="refusal"
      @update:open="recording = null; refusal = null"
      @confirm="record"
    >
      <template #body>
        <UFormField
          label="Reason"
          :description="`Optional. Up to ${NO_SHOW_REASON_LIMIT} characters.`"
        >
          <UTextarea
            v-model="noShowReason"
            :maxlength="NO_SHOW_REASON_LIMIT"
            :rows="2"
            autoresize
            class="w-full"
            data-test="no-show-reason"
          />
        </UFormField>
      </template>
    </ConfirmModal>

    <ConfirmModal
      :open="withdrawing !== null"
      name="withdraw-no-show"
      :disabled="!withdrawal.trim()"
      title="Withdraw this no-show"
      verb="Withdraw the no-show"
      color="primary"
      :consequence="withdrawing ? `The mark against ${withdrawing.member} for ${withdrawing.title} stops counting. The original stays on record beside your reason.` : ''"
      :loading="working"
      :failure="refusal"
      @update:open="withdrawing = null; refusal = null"
      @confirm="withdraw"
    >
      <template #body>
        <UFormField
          label="Reason"
          required
          :description="`Up to ${NO_SHOW_REASON_LIMIT} characters.`"
        >
          <UTextarea
            v-model="withdrawal"
            :maxlength="NO_SHOW_REASON_LIMIT"
            :rows="2"
            autoresize
            class="w-full"
            data-test="withdraw-reason"
          />
        </UFormField>
      </template>
    </ConfirmModal>
  </div>
</template>
