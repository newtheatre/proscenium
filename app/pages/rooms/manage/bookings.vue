<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { saysBookingState } from '#shared/utils/bookings'
import { saysSpan } from '#shared/utils/blackouts'
import { roomBookingsList, saysTier } from '#shared/utils/room-bookings-list'
import type { FilterOption } from '#shared/utils/list-filters'
import type { Page } from '#shared/utils/pagination'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Bookings', middleware: 'console', docs: '/docs/spaces/bookings' })

const UBadge = resolveComponent('UBadge')

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
  convertedToRequestId: string | null
  attendees: number | null
  startsAt: number
  endsAt: number
  noShowId: string | null
}

const request = useRequestFetch()
const failure = ref<ListFailure | null>(null)
const rooms = ref<{ id: string, name: string }[]>([])

const roomOptions = computed<FilterOption[]>(() => rooms.value.map(one => ({ value: one.id, label: one.name })))

// Search, filters, sort and page live in the URL (K-129).
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(roomBookingsList, {
  options: computed(() => ({ room: roomOptions.value })),
})

const empty = (): Page<Booking> => ({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 })

const { data: listing, status, error } = await useAsyncData(
  'rooms-bookings',
  () => request<Page<Booking>>('/api/admin/rooms/bookings', { query: query.value }),
  { watch: [query], default: empty },
)

watch(error, (raised) => {
  if (raised) failure.value = listFailureFrom(raised, 'The bookings could not be read.')
})

async function loadRooms(): Promise<void> {
  rooms.value = (await $fetch<{ items: typeof rooms.value }>('/api/admin/rooms')).items
}

const spanOf = (booking: Booking): string => saysSpan(new Date(booking.startsAt * 1000), new Date(booking.endsAt * 1000))

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
]

onMounted(loadRooms)
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
  </div>
</template>
