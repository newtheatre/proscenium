<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { can, viewEmergencyCard } from '#shared/utils/abilities'
import { venueForm } from '#shared/utils/venues'
import { venuesList } from '#shared/utils/venues-list'
import type { TableColumn } from '@nuxt/ui'
import type { AdminVenue } from '#shared/utils/venues'

definePageMeta({ layout: 'console', title: 'Venues', middleware: 'console', docs: '/docs/box-office/venues' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

// The cards are show night's own screen (E-113), one list for every venue: this screen links
// to that list once rather than once a row, where every row's link went to the same place.
const seeEmergencyCards = computed(() => can(useViewer().value, viewEmergencyCard))

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const saving = ref(false)

interface Listing { items: AdminVenue[], total: number, pageSize: number, pages: number }
interface RoomOption { id: string, name: string }

const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

// Search, filters, sort and page live in the URL (K-129); the list refetches when any changes.
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(venuesList)

// Searched and paged in SQL, so what the table shows and what the count says are the same
// question asked once (CONTRIBUTING).
const { data, status, error, refresh } = await useAsyncData(
  'venues',
  () => request<Listing>('/api/admin/reference-data/venues', { query: query.value }),
  { watch: [query], default: empty },
)

const { data: rooms } = await useAsyncData(
  'venues-rooms',
  () => request<RoomOption[]>('/api/admin/reference-data/rooms'),
  { default: (): RoomOption[] => [] },
)

const editing = ref<AdminVenue | null>(null)
const open = ref(false)
const removing = ref<AdminVenue | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) failure.value = null
})

// Deleting or retiring the last row of the last page would otherwise leave the reader past the
// end, with no control to get back.
async function reload(): Promise<void> {
  await refresh()
  if (page.value > data.value.pages) page.value = data.value.pages
}

interface FormState {
  name: string
  address?: string
  capacity: number | null
  isExternal: boolean
  description?: string
  roomId: string | null
}

const state = reactive<FormState>({
  name: '',
  capacity: null,
  isExternal: false,
  roomId: null,
})

const roomOptions = computed(() => [
  { label: 'No room, blackouts do not apply', value: null },
  ...(rooms.value ?? []).map(room => ({ label: room.name, value: room.id })),
])

function edit(venue: AdminVenue | null): void {
  editing.value = venue
  failure.value = null
  Object.assign(state, {
    name: venue?.name ?? '',
    address: venue?.address ?? undefined,
    capacity: venue?.capacity ?? null,
    isExternal: venue?.isExternal ?? false,
    description: venue?.description ?? undefined,
    roomId: venue?.roomId ?? null,
  })
  open.value = true
}

async function save(): Promise<void> {
  saving.value = true
  failure.value = null
  const body = {
    name: state.name.trim(),
    address: state.address?.trim() || null,
    capacity: state.capacity,
    isExternal: state.isExternal,
    description: state.description?.trim() || null,
    roomId: state.roomId,
  }
  try {
    if (editing.value) {
      await $fetch(`/api/admin/reference-data/venues/${editing.value.id}`, { method: 'PUT', body })
    }
    else {
      await $fetch('/api/admin/reference-data/venues', { method: 'POST', body })
    }
    toast.add({ title: editing.value ? 'Venue changed' : 'Venue added', icon: 'i-lucide-check', color: 'success' })
    open.value = false
    await reload()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

async function setArchived(venue: AdminVenue, archived: boolean): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/reference-data/venues/${venue.id}/archive`, { method: 'POST', body: { archived } })
    toast.add({
      title: archived ? 'Venue retired' : 'Venue back in use',
      description: archived ? 'It stops appearing for new performances and still serves every record that already points at it.' : undefined,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await reload()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
}

async function remove(): Promise<void> {
  const venue = removing.value
  if (!venue) return

  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/reference-data/venues/${venue.id}`, { method: 'DELETE' })
    toast.add({ title: 'Venue deleted', icon: 'i-lucide-check', color: 'success' })
    removing.value = null
    await reload()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const listingFailure = computed(() => (error.value ? refusalText(error.value, 'The venues could not be read.') : null))

const columns: TableColumn<AdminVenue>[] = [
  {
    id: 'name',
    header: 'Venue',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex flex-wrap items-center gap-2' }, [
        h('span', {}, row.original.name),
        row.original.isExternal
          ? h(UBadge, { color: 'info', variant: 'subtle', size: 'sm' }, () => 'External')
          : null,
        row.original.archived
          ? h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => 'Retired')
          : null,
      ]),
      row.original.address ? h('div', { class: 'text-xs text-muted' }, row.original.address) : null,
      // Below sm the capacity and whether anything uses it are hidden: shown here instead, so a
      // phone keeps the row actions in view without losing what they said (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, `${row.original.capacity === null ? 'Uncapped' : `${row.original.capacity} seats`}, ${row.original.inUse ? 'has records against it' : 'nothing yet'}`),
    ]),
  },
  {
    id: 'capacity',
    header: 'Capacity',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} text-right whitespace-nowrap font-mono` } },
    cell: ({ row }) => row.original.capacity ?? 'Uncapped',
  },
  {
    id: 'inUse',
    header: 'In use',
    meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } },
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.inUse ? 'Has records against it' : 'Nothing yet'),
  },
  {
    id: 'act',
    header: ACTIONS_HEADER,
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `edit-${row.original.id}`,
        'onClick': () => edit(row.original),
      }, () => 'Edit'),
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `archive-${row.original.id}`,
        'onClick': () => setArchived(row.original, !row.original.archived),
      }, () => (row.original.archived ? 'Bring back' : 'Retire')),
      row.original.inUse
        ? null
        : rowOverflow(row.original.id, [{
            label: 'Delete',
            color: 'error',
            onSelect: () => {
              failure.value = null
              removing.value = row.original
            },
          }]),
    ]),
  },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="listingFailure"
      data-test="listing-failure"
      color="error"
      variant="subtle"
      :description="listingFailure"
    />

    <UAlert
      v-if="failure && !open && removing === null"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <p class="text-sm text-muted">
      Where a performance happens, and what it seats.
    </p>

    <AdminToolbar
      v-model:search="search"
      :placeholder="venuesList.search?.placeholder"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="venuesList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>

      <template #actions>
        <UButton
          v-if="seeEmergencyCards"
          color="neutral"
          variant="subtle"
          icon="i-lucide-siren"
          to="/rota/manage/emergency"
          data-test="emergency-cards"
        >
          Emergency cards
        </UButton>
        <UButton
          data-test="add-venue"
          icon="i-lucide-plus"
          @click="edit(null)"
        >
          Add a venue
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="data.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="venues-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ filtered ? 'No venue matches that.' : 'No venues yet. Add one, and a performance has somewhere to happen.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="venues-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'venue') }}
      </p>
      <UPagination
        v-if="data.pages > 1"
        v-model:page="page"
        :total="data.total"
        :items-per-page="data.pageSize"
      />
    </div>

    <UModal
      v-model:open="open"
      :title="editing ? `Edit ${editing.name}` : 'Add a venue'"
      description="The name is held once. A room is optional, and its only effect is that this venue's performances apply blackouts to it."
    >
      <template #body>
        <UForm
          :schema="venueForm"
          :state="state"
          class="space-y-4"
          data-test="venue-form"
          @submit="save"
        >
          <UAlert
            v-if="failure"
            data-test="form-failure"
            color="error"
            variant="subtle"
            :description="failure"
          />
          <UFormField
            label="Name"
            name="name"
            required
            description="What the box office, the rota and every report calls it."
          >
            <UInput
              v-model="state.name"
              class="w-full"
              data-test="venue-name"
            />
          </UFormField>

          <UFormField
            label="Postal address"
            name="address"
            hint="Optional"
          >
            <UInput
              v-model="state.address"
              class="w-full"
              data-test="venue-address"
            />
          </UFormField>

          <UFormField
            label="Capacity"
            name="capacity"
            description="General admission only. Leave it empty for an uncapped house."
          >
            <UInputNumber
              v-model="state.capacity"
              :min="1"
              class="w-full"
              data-test="venue-capacity"
            />
          </UFormField>

          <UFormField
            label="Room"
            name="roomId"
            description="Attaching a room means this venue's performances apply blackouts to it, and nothing else."
          >
            <USelect
              v-model="state.roomId"
              :items="roomOptions"
              class="w-full"
              data-test="venue-room"
            />
          </UFormField>

          <UFormField
            label="What it is for"
            name="description"
            hint="Optional"
          >
            <UTextarea
              v-model="state.description"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <USwitch
            v-model="state.isExternal"
            label="External venue"
            description="A union or off-site space. It appears in reports and takes no blackouts."
            data-test="venue-external"
          />

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="venue-submit"
            >
              {{ editing ? 'Save the venue' : 'Add a venue' }}
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="open = false"
            >
              {{ CONFIRM_BACK_LABEL }}
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      :open="removing !== null"
      :title="removing ? `Delete ${removing.name}` : ''"
      description="Nothing has ever used this venue, so there is no history to keep."
      @update:open="removing = null; failure = null"
    >
      <template #body>
        <UAlert
          v-if="failure"
          data-test="delete-failure"
          color="error"
          variant="subtle"
          :description="failure"
        />
        <p
          v-else
          class="text-sm text-muted"
        >
          The venue goes. No performance and no shift is attached to it.
        </p>
      </template>

      <template #footer>
        <UButton
          color="error"
          :loading="saving"
          data-test="confirm-delete"
          @click="remove"
        >
          Delete the venue
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="removing = null"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
