<script setup lang="ts">
import { WEEKDAYS, minutesOpen, roomForm } from '#shared/utils/rooms'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { RoomHours } from '#shared/utils/rooms'
import type { z } from 'zod'

definePageMeta({ layout: 'console', title: 'Rooms', middleware: 'console' })

interface Room {
  id: string
  name: string
  description: string | null
  capacity: number | null
  isActive: boolean
  sensitive: boolean
  campus: string | null
  building: string | null
  contact: string | null
  minBookingMinutes: number | null
  maxBookingHours: number | null
  noticeHours: number | null
  horizonWeeks: number | null
  activeBookingsCap: number | null
  hours: RoomHours[]
}

interface Estate {
  minBookingMinutes: number
  maxBookingHours: number
  noticeHours: number
  horizonWeeks: number
  activeBookingsCap: number
}

interface Listing { items: Room[], total: number, estate: Estate }

// Only ever shown while the real numbers are in flight, and replaced by them on arrival.
const BLANK_ESTATE: Estate = {
  minBookingMinutes: 0,
  maxBookingHours: 0,
  noticeHours: 0,
  horizonWeeks: 0,
  activeBookingsCap: 0,
}

const toast = useToast()
const search = ref('')
const showRetired = ref(false)
const open = ref(false)
const editing = ref<Room | null>(null)
const saving = ref(false)

// useRequestFetch, not $fetch: on the server $fetch sends no cookies, so the render was
// unauthenticated, came back empty, and hydration had no reason to ask again.
const request = useRequestFetch()

const { data: listing, status, refresh } = await useAsyncData(
  () => `rooms-${showRetired.value}`,
  () => request<Listing>('/api/admin/rooms', { query: { includeInactive: showRetired.value } }),
  { watch: [showRetired], default: (): Listing => ({ items: [], total: 0, estate: BLANK_ESTATE }) },
)

const estate = computed(() => listing.value.estate)

// What a blank override means, said where the blank is.
const fallsBackTo = (value: number | boolean): string => `Estate default: ${value}`

// Searched in the browser on purpose: the estate is a handful of rooms, and a round trip to
// filter five names would be slower than the typing.
const rooms = computed(() => {
  const term = search.value.trim().toLowerCase()
  return listing.value.items.filter((room) => {
    return !term || room.name.toLowerCase().includes(term)
  })
})

const state = reactive({
  name: '',
  description: '',
  capacity: undefined as number | undefined,
  isActive: true,
  sensitive: false,
  campus: '',
  building: '',
  contact: '',
  minBookingMinutes: undefined as number | undefined,
  maxBookingHours: undefined as number | undefined,
  noticeHours: undefined as number | undefined,
  horizonWeeks: undefined as number | undefined,
  activeBookingsCap: undefined as number | undefined,
})
const hours = ref<Record<number, { opens: string, closes: string, open: boolean }>>({})

function blankHours(): Record<number, { opens: string, closes: string, open: boolean }> {
  return Object.fromEntries(WEEKDAYS.map(day => [day.index, { opens: '09:00', closes: '22:00', open: false }]))
}

function edit(room: Room | null): void {
  editing.value = room
  Object.assign(state, {
    name: room?.name ?? '',
    description: room?.description ?? '',
    capacity: room?.capacity ?? undefined,
    isActive: room?.isActive ?? true,
    sensitive: room?.sensitive ?? false,
    campus: room?.campus ?? '',
    building: room?.building ?? '',
    contact: room?.contact ?? '',
    minBookingMinutes: room?.minBookingMinutes ?? undefined,
    maxBookingHours: room?.maxBookingHours ?? undefined,
    noticeHours: room?.noticeHours ?? undefined,
    horizonWeeks: room?.horizonWeeks ?? undefined,
    activeBookingsCap: room?.activeBookingsCap ?? undefined,
  })
  hours.value = blankHours()
  for (const day of room?.hours ?? []) {
    hours.value[day.weekday] = { opens: day.opens, closes: day.closes, open: true }
  }
  open.value = true
}

async function save(event: FormSubmitEvent<z.output<typeof roomForm>>): Promise<void> {
  saving.value = true
  const body = {
    ...event.data,
    hours: WEEKDAYS
      .filter(day => hours.value[day.index]?.open)
      .map(day => ({ weekday: day.index, opens: hours.value[day.index]!.opens, closes: hours.value[day.index]!.closes })),
  }
  try {
    if (editing.value) await $fetch(`/api/admin/rooms/${editing.value.id}`, { method: 'PUT', body })
    else await $fetch('/api/admin/rooms', { method: 'POST', body })

    toast.add({ title: editing.value ? 'Room saved' : 'Room added', icon: 'i-lucide-check', color: 'success' })
    open.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function retire(room: Room): Promise<void> {
  try {
    await $fetch(`/api/admin/rooms/${room.id}`, { method: 'DELETE' })
    toast.add({ title: `${room.name} retired`, icon: 'i-lucide-archive', color: 'success' })
    await refresh()
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
}

const active = computed<ActiveFilter[]>(() => {
  const filters: ActiveFilter[] = []
  if (showRetired.value) {
    filters.push({
      key: 'retired',
      label: 'Including retired',
      icon: 'i-lucide-archive',
      clear: () => { showRetired.value = false },
    })
  }
  if (search.value) {
    filters.push({
      key: 'search',
      label: `Matching ${search.value}`,
      icon: 'i-lucide-search',
      clear: () => { search.value = '' },
    })
  }
  return filters
})

function clearFilters(): void {
  search.value = ''
  showRetired.value = false
}

const openDaysCount = computed(() => WEEKDAYS.filter(day => hours.value[day.index]?.open).length)

const OVERRIDES = ['minBookingMinutes', 'maxBookingHours', 'noticeHours', 'horizonWeeks', 'activeBookingsCap'] as const
const overrideCount = computed(() => OVERRIDES.filter(field => state[field] !== undefined).length)

function openDays(room: Room): string {
  if (room.hours.length === 0) return 'Always open'
  const days = WEEKDAYS.filter(day => minutesOpen(room.hours, day.index) > 0)
  if (days.length === 7) return 'Open every day'
  return days.map(day => day.short).join(', ')
}

const columns: TableColumn<Room>[] = [
  { id: 'name', header: 'Room', accessorKey: 'name' },
  { id: 'capacity', header: 'Capacity' },
  { id: 'hours', header: 'Open' },
  { id: 'state', header: 'State' },
  { id: 'actions', header: '' },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-door-open"
      title="The bookable estate"
      description="A room is retired, never deleted, so a booking made last term still names something. A room with no opening hours is open whenever; give it hours and it is shut outside them. Every room here is one we control; the rest live under Other rooms."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A room name"
      :active="active"
      :loading="status === 'pending'"
      @clear="clearFilters"
    >
      <template #filters>
        <UFormField label="Retired rooms">
          <USwitch
            v-model="showRetired"
            label="Show rooms no longer in use"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          to="/rooms/manage/other"
          color="neutral"
          variant="outline"
          icon="i-lucide-map-pin"
          data-test="to-other-rooms"
        >
          Other rooms
        </UButton>

        <UButton
          icon="i-lucide-plus"
          data-test="add-room"
          @click="edit(null)"
        >
          Add a room
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="rooms"
      :columns="columns"
      data-test="rooms-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No rooms yet. Add the first one and it appears on the calendar.
        </p>
      </template>

      <template #name-cell="{ row }">
        <div>
          <p class="text-sm font-medium">
            {{ row.original.name }}
          </p>
          <p
            v-if="row.original.description"
            class="text-sm text-muted"
          >
            {{ row.original.description }}
          </p>
        </div>
      </template>

      <template #capacity-cell="{ row }">
        <span class="text-sm">{{ row.original.capacity ?? 'Uncapped' }}</span>
      </template>

      <template #hours-cell="{ row }">
        <span class="text-sm text-muted">{{ openDays(row.original) }}</span>
      </template>

      <template #state-cell="{ row }">
        <div class="flex flex-wrap gap-1">
          <UBadge
            v-if="row.original.sensitive"
            color="warning"
            variant="subtle"
            size="sm"
          >
            Needs approval
          </UBadge>
          <UBadge
            v-if="!row.original.isActive"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            Retired
          </UBadge>
        </div>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-1">
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            :data-test="`edit-room-${row.original.id}`"
            @click="edit(row.original)"
          >
            Edit
          </UButton>
          <UButton
            v-if="row.original.isActive"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="retire(row.original)"
          >
            Retire
          </UButton>
        </div>
      </template>
    </UTable>

    <p class="text-sm text-muted">
      {{ plural(rooms.length, 'room') }}
    </p>

    <UModal
      v-model:open="open"
      :title="editing ? `Edit ${editing.name}` : 'Add a room'"
      description="Left alone, a room is open whenever and follows the estate settings."
    >
      <template #body>
        <UForm
          :schema="roomForm"
          :state="state"
          class="space-y-4"
          data-test="room-form"
          @submit="save"
        >
          <UFormField
            label="Name"
            name="name"
            required
          >
            <UInput
              v-model="state.name"
              class="w-full"
              data-test="room-name"
            />
          </UFormField>

          <UFormField
            label="Description"
            name="description"
            hint="Optional"
          >
            <UTextarea
              v-model="state.description"
              class="w-full"
              :rows="2"
            />
          </UFormField>

          <UFormField
            label="Capacity"
            name="capacity"
            hint="Optional"
            description="Left blank the room is uncapped. A booking for more people is a warning, never a refusal."
          >
            <UInputNumber
              v-model="state.capacity"
              :min="1"
              class="w-full"
              data-test="room-capacity"
            />
          </UFormField>

          <USeparator />

          <UCollapsible data-test="hours-section">
            <UButton
              color="neutral"
              variant="subtle"
              trailing-icon="i-lucide-chevron-down"
              block
              class="justify-between"
            >
              Opening hours ({{ openDaysCount === 0 ? 'always open' : plural(openDaysCount, 'day') }})
            </UButton>

            <template #content>
              <div class="space-y-3 pt-4">
                <p class="text-sm text-muted">
                  Leave every day closed and the room is open whenever, which is true of most
                  rooms. Open one day and the rest become closed.
                </p>

                <div
                  v-for="day in WEEKDAYS"
                  :key="day.index"
                  class="flex flex-wrap items-center gap-3"
                >
                  <USwitch
                    v-model="hours[day.index]!.open"
                    :label="day.name"
                    class="w-40"
                    :data-test="`room-open-${day.index}`"
                  />
                  <template v-if="hours[day.index]!.open">
                    <UInput
                      v-model="hours[day.index]!.opens"
                      type="time"
                      :data-test="`room-opens-${day.index}`"
                    />
                    <span class="text-sm text-muted">to</span>
                    <UInput
                      v-model="hours[day.index]!.closes"
                      type="time"
                      :data-test="`room-closes-${day.index}`"
                    />
                  </template>
                  <span
                    v-else
                    class="text-sm text-muted"
                  >Closed</span>
                </div>
              </div>
            </template>
          </UCollapsible>

          <UFormField name="sensitive">
            <USwitch
              v-model="state.sensitive"
              label="Every booking needs approval"
              description="For a space where a request is a conversation, whatever the policy says."
              data-test="room-sensitive"
            />
          </UFormField>

          <UCollapsible data-test="policy-section">
            <UButton
              color="neutral"
              variant="subtle"
              trailing-icon="i-lucide-chevron-down"
              block
              class="justify-between"
            >
              This room's own rules ({{ overrideCount === 0 ? 'follows the estate' : plural(overrideCount, 'override') }})
            </UButton>

            <template #content>
              <div class="space-y-4 pt-4">
                <p class="text-sm text-muted">
                  Left blank, a room follows the estate settings shown under each box. A number
                  here applies to this room only, and nought is a real answer meaning none needed.
                </p>

                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField
                    label="Shortest booking"
                    name="minBookingMinutes"
                    :description="fallsBackTo(estate.minBookingMinutes)"
                    hint="Minutes"
                  >
                    <UInputNumber
                      v-model="state.minBookingMinutes"
                      :min="1"
                      class="w-full"
                      data-test="room-min-minutes"
                    />
                  </UFormField>

                  <UFormField
                    label="Longest booking"
                    name="maxBookingHours"
                    :description="fallsBackTo(estate.maxBookingHours)"
                    hint="Hours"
                  >
                    <UInputNumber
                      v-model="state.maxBookingHours"
                      :min="1"
                      class="w-full"
                      data-test="room-max-hours"
                    />
                  </UFormField>

                  <UFormField
                    label="Notice needed"
                    name="noticeHours"
                    :description="fallsBackTo(estate.noticeHours)"
                    hint="Hours"
                  >
                    <UInputNumber
                      v-model="state.noticeHours"
                      :min="0"
                      class="w-full"
                      data-test="room-notice-hours"
                    />
                  </UFormField>

                  <UFormField
                    label="Booking opens"
                    name="horizonWeeks"
                    :description="fallsBackTo(estate.horizonWeeks)"
                    hint="Weeks ahead"
                  >
                    <UInputNumber
                      v-model="state.horizonWeeks"
                      :min="1"
                      class="w-full"
                      data-test="room-horizon-weeks"
                    />
                  </UFormField>

                  <UFormField
                    label="Bookings one member may hold"
                    name="activeBookingsCap"
                    :description="fallsBackTo(estate.activeBookingsCap)"
                  >
                    <UInputNumber
                      v-model="state.activeBookingsCap"
                      :min="1"
                      class="w-full"
                      data-test="room-cap"
                    />
                  </UFormField>
                </div>
              </div>
            </template>
          </UCollapsible>

          <USeparator />

          <UFormField
            v-if="editing"
            name="isActive"
          >
            <USwitch
              v-model="state.isActive"
              label="In use"
              description="A retired room keeps its history and leaves the calendar."
            />
          </UFormField>

          <UButton
            type="submit"
            :loading="saving"
            data-test="room-save"
          >
            {{ editing ? 'Save' : 'Add it' }}
          </UButton>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
