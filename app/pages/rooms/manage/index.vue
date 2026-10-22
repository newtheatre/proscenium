<script setup lang="ts">
import { can, manageRoomsEstate } from '#shared/utils/abilities'
import { SU_ROOMS } from '#shared/utils/external-requests'
import { HOURS_MODES, ROOM_OVERRIDE_FLOORS, WEEKDAYS, hoursForMode, hoursModeOf, roomForm, roomOverrides, saysHouseDefault, saysHoursMode, saysOpeningHours } from '#shared/utils/rooms'
import { roomsList } from '#shared/utils/rooms-list'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import type { HoursMode, RoomHours } from '#shared/utils/rooms'
import type { z } from 'zod'

definePageMeta({ layout: 'console', title: 'Rooms', middleware: 'console', docs: '/docs/spaces/rooms' })

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
const open = ref(false)
const editing = ref<Room | null>(null)
const saving = ref(false)

// Tidiness rather than enforcement: the routes are what refuse, and this is what stops a
// read-only role seeing three controls that all answer 403 (0040, issue 911).
const writes = computed(() => can(useViewer().value, manageRoomsEstate))

// useRequestFetch, not $fetch: on the server $fetch sends no cookies, so the render was
// unauthenticated, came back empty, and hydration had no reason to ask again.
const request = useRequestFetch()

// Search, filter and sort live in the URL (K-129).
const { search, conditions, sort, query, active, filtered, set, setSort, clear } = useListQuery(roomsList)

const { data: listing, status, refresh, error } = await useAsyncData(
  'rooms',
  () => request<Listing>('/api/admin/rooms', { query: query.value }),
  { watch: [query], default: (): Listing => ({ items: [], total: 0, estate: BLANK_ESTATE }) },
)
const failure = useListFailure(error, 'The rooms could not be read.')

const estate = computed(() => listing.value.estate)

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

// Chosen as a pattern first: a room with no hours is open all day, and only "Set each day" shows a
// row per day, so an unset room never reads as seven closed days (issue 1353).
const hoursMode = ref<HoursMode>('ALWAYS')
const pattern = reactive({ opens: '09:00', closes: '22:00' })

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
  hoursMode.value = hoursModeOf(room?.hours ?? [])
  Object.assign(pattern, { opens: room?.hours[0]?.opens ?? '09:00', closes: room?.hours[0]?.closes ?? '22:00' })
  open.value = true
}

// Set each day starts afresh from the pattern last chosen, Always open giving every day at its times.
function chooseMode(mode: HoursMode): void {
  if (mode === 'EACH_DAY' && hoursMode.value !== 'EACH_DAY') {
    hours.value = blankHours()
    const from = hoursForMode(hoursMode.value === 'WEEKDAYS' ? 'WEEKDAYS' : 'EACH_DAY', pattern.opens, pattern.closes)
    for (const day of from) hours.value[day.weekday] = { opens: day.opens, closes: day.closes, open: true }
  }
  hoursMode.value = mode
}

const chosenHours = computed<RoomHours[]>(() => (hoursMode.value === 'EACH_DAY'
  ? WEEKDAYS
      .filter(day => hours.value[day.index]?.open)
      .map(day => ({ weekday: day.index, opens: hours.value[day.index]!.opens, closes: hours.value[day.index]!.closes }))
  : hoursForMode(hoursMode.value, pattern.opens, pattern.closes)))

async function save(event: FormSubmitEvent<z.output<typeof roomForm>>): Promise<void> {
  saving.value = true
  const body = { ...event.data, hours: chosenHours.value }
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

const retiring = ref<Room | null>(null)
const retireFailure = ref<string | null>(null)
const retireWorking = ref(false)

// Counted before the verb is offered, the way a closure counts what it cancels (0204).
const held = ref<{ waiting: number, upcoming: number } | null>(null)
const settle = reactive({ turnDown: true, cancel: true })

async function askRetire(room: Room): Promise<void> {
  retireFailure.value = null
  held.value = null
  Object.assign(settle, { turnDown: true, cancel: true })
  retiring.value = room
  try {
    const counted = await $fetch<{ waiting: number, upcoming: number }>(`/api/admin/rooms/${room.id}/held`)
    if (retiring.value?.id === room.id) held.value = counted
  }
  catch (error) {
    retireFailure.value = `What the room still holds could not be counted: ${refusalText(error)}`
  }
}

async function retire(): Promise<void> {
  const room = retiring.value
  if (!room) return
  retireWorking.value = true
  retireFailure.value = null
  try {
    const answer = await $fetch<{ turnedDown: number, cancelled: number }>(`/api/admin/rooms/${room.id}`, {
      method: 'DELETE',
      query: {
        turnDown: String(settle.turnDown && (held.value?.waiting ?? 0) > 0),
        cancel: String(settle.cancel && (held.value?.upcoming ?? 0) > 0),
      },
    })
    const settled = [
      ...(answer.turnedDown ? [`${plural(answer.turnedDown, 'request')} turned down`] : []),
      ...(answer.cancelled ? [`${plural(answer.cancelled, 'booking')} cancelled`] : []),
    ]
    toast.add({
      title: `${room.name} retired`,
      ...(settled.length ? { description: `${settled.join(', ')}, and each member told.` } : {}),
      icon: 'i-lucide-archive',
      color: 'success',
    })
    retiring.value = null
    await refresh()
  }
  catch (error) {
    retireFailure.value = refusalText(error)
  }
  finally {
    retireWorking.value = false
  }
}

const hoursSummary = computed(() => (hoursMode.value === 'EACH_DAY'
  ? plural(chosenHours.value.length, 'day')
  : saysHoursMode(hoursMode.value).toLowerCase()))

const OVERRIDES = ['minBookingMinutes', 'maxBookingHours', 'noticeHours', 'horizonWeeks', 'activeBookingsCap'] as const
const overrideCount = computed(() => OVERRIDES.filter(field => state[field] !== undefined).length)

const columns: TableColumn<Room>[] = [
  { id: 'name', header: 'Room', accessorKey: 'name' },
  { id: 'capacity', header: 'Capacity', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } } },
  { id: 'hours', header: 'Open', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } } },
  { id: 'state', header: 'State' },
  { id: 'actions', header: ACTIONS_HEADER, meta: ACTIONS_COLUMN },
]
</script>

<template>
  <ReadGate
    :failure="failure"
    class="space-y-6"
    @retry="refresh"
  >
    <p class="text-sm text-muted">
      The rooms we control, their hours and their own rules.
    </p>

    <AdminToolbar
      v-model:search="search"
      placeholder="A room name"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="roomsList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>

      <template #actions>
        <UButton
          to="/rooms/manage/other"
          color="neutral"
          variant="outline"
          icon="i-lucide-map-pin"
          data-test="to-other-rooms"
        >
          {{ SU_ROOMS }}
        </UButton>

        <UButton
          v-if="writes"
          icon="i-lucide-plus"
          data-test="add-room"
          @click="edit(null)"
        >
          Add a room
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="listing.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="rooms-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ filtered ? 'No room matches that.' : 'No rooms yet. Add the first one and it appears on the calendar.' }}
        </p>
      </template>

      <template #name-cell="{ row }">
        <div>
          <p class="text-sm font-medium">
            {{ row.original.name }}
          </p>
          <p
            v-if="row.original.description"
            class="text-sm text-muted whitespace-normal"
          >
            {{ row.original.description }}
          </p>
          <!-- Below sm the capacity and the opening days are hidden: shown here instead, so a
            phone keeps the state and the row actions in view (issue 922). -->
          <p class="text-xs text-muted sm:hidden">
            {{ row.original.capacity ?? 'Uncapped' }}, {{ saysOpeningHours(row.original.hours) }}
          </p>
        </div>
      </template>

      <template #capacity-cell="{ row }">
        <span class="text-sm">{{ row.original.capacity ?? 'Uncapped' }}</span>
      </template>

      <template #hours-cell="{ row }">
        <span class="text-sm text-muted">{{ saysOpeningHours(row.original.hours) }}</span>
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
          <UBadge
            v-if="roomOverrides(row.original).length"
            color="info"
            variant="subtle"
            size="sm"
            :data-test="`own-rules-${row.original.id}`"
          >
            Own rules
          </UBadge>
        </div>
        <p
          v-if="roomOverrides(row.original).length"
          class="mt-1 text-xs text-muted whitespace-normal"
        >
          {{ roomOverrides(row.original).join(', ') }}
        </p>
      </template>

      <template #actions-cell="{ row }">
        <div
          v-if="writes"
          class="flex justify-end gap-1"
        >
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
            :to="`/rooms/manage/closures?close=${row.original.id}`"
            :data-test="`close-room-${row.original.id}`"
          >
            Close for a spell
          </UButton>
          <UButton
            v-if="row.original.isActive"
            size="sm"
            color="neutral"
            variant="ghost"
            :data-test="`retire-room-${row.original.id}`"
            @click="askRetire(row.original)"
          >
            Retire
          </UButton>
        </div>
      </template>
    </UTable>

    <p class="text-sm text-muted">
      {{ plural(listing.total, 'room') }}
    </p>

    <UModal
      v-model:open="open"
      :title="editing ? `Edit ${editing.name}` : 'Add a room'"
      description="Left alone, a room is open whenever and follows the house settings."
    >
      <template #body>
        <UForm
          id="room-form"
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
              Opening hours ({{ hoursSummary }})
            </UButton>

            <template #content>
              <div class="space-y-3 pt-4">
                <URadioGroup
                  :model-value="hoursMode"
                  :items="HOURS_MODES.map(mode => ({ label: saysHoursMode(mode), value: mode }))"
                  orientation="horizontal"
                  data-test="hours-mode"
                  @update:model-value="chooseMode($event as HoursMode)"
                />

                <p
                  v-if="hoursMode === 'ALWAYS'"
                  class="text-sm text-muted"
                >
                  Open all day, every day. Nothing is recorded, which is true of most rooms.
                </p>

                <div
                  v-else-if="hoursMode === 'WEEKDAYS'"
                  class="flex flex-wrap items-center gap-3"
                >
                  <span class="text-sm">Monday to Friday, from</span>
                  <UInput
                    v-model="pattern.opens"
                    type="time"
                    aria-label="Weekdays open"
                    data-test="room-weekdays-opens"
                  />
                  <span class="text-sm">to</span>
                  <UInput
                    v-model="pattern.closes"
                    type="time"
                    aria-label="Weekdays close"
                    data-test="room-weekdays-closes"
                  />
                  <span class="text-sm text-muted">Closed at weekends.</span>
                </div>

                <template v-else>
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
                        :aria-label="`${day.name} opens`"
                        :data-test="`room-opens-${day.index}`"
                      />
                      <span class="text-sm text-muted">to</span>
                      <UInput
                        v-model="hours[day.index]!.closes"
                        type="time"
                        :aria-label="`${day.name} closes`"
                        :data-test="`room-closes-${day.index}`"
                      />
                    </template>
                    <span
                      v-else
                      class="text-sm text-muted"
                    >Closed</span>
                  </div>
                  <p class="text-sm text-muted">
                    A day switched off is closed all day.
                  </p>
                </template>
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
              This room's own rules ({{ overrideCount === 0 ? 'follows the house' : plural(overrideCount, 'override') }})
            </UButton>

            <template #content>
              <div class="space-y-4 pt-4">
                <p class="text-sm text-muted">
                  Left blank, a room follows the house settings shown under each box. A number
                  here applies to this room only. Each box says the smallest it accepts.
                </p>

                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField
                    label="Shortest booking"
                    name="minBookingMinutes"
                    :description="saysHouseDefault('minBookingMinutes', estate.minBookingMinutes)"
                    hint="Minutes"
                  >
                    <UInputNumber
                      v-model="state.minBookingMinutes"
                      :min="ROOM_OVERRIDE_FLOORS.minBookingMinutes"
                      class="w-full"
                      data-test="room-min-minutes"
                    />
                  </UFormField>

                  <UFormField
                    label="Longest booking"
                    name="maxBookingHours"
                    :description="saysHouseDefault('maxBookingHours', estate.maxBookingHours)"
                    hint="Hours"
                  >
                    <UInputNumber
                      v-model="state.maxBookingHours"
                      :min="ROOM_OVERRIDE_FLOORS.maxBookingHours"
                      class="w-full"
                      data-test="room-max-hours"
                    />
                  </UFormField>

                  <UFormField
                    label="Notice needed"
                    name="noticeHours"
                    :description="saysHouseDefault('noticeHours', estate.noticeHours)"
                    hint="Hours"
                  >
                    <UInputNumber
                      v-model="state.noticeHours"
                      :min="ROOM_OVERRIDE_FLOORS.noticeHours"
                      class="w-full"
                      data-test="room-notice-hours"
                    />
                  </UFormField>

                  <UFormField
                    label="Booking opens"
                    name="horizonWeeks"
                    :description="saysHouseDefault('horizonWeeks', estate.horizonWeeks)"
                    hint="Weeks ahead"
                  >
                    <UInputNumber
                      v-model="state.horizonWeeks"
                      :min="ROOM_OVERRIDE_FLOORS.horizonWeeks"
                      class="w-full"
                      data-test="room-horizon-weeks"
                    />
                  </UFormField>

                  <UFormField
                    label="Bookings one member may hold"
                    name="activeBookingsCap"
                    :description="saysHouseDefault('activeBookingsCap', estate.activeBookingsCap)"
                  >
                    <UInputNumber
                      v-model="state.activeBookingsCap"
                      :min="ROOM_OVERRIDE_FLOORS.activeBookingsCap"
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
              description="A retired room keeps its history and leaves the calendar. Switched off here, nothing it holds is touched; Retire on the list offers to settle it."
            />
          </UFormField>
        </UForm>
      </template>

      <template #footer>
        <UButton
          type="submit"
          form="room-form"
          :loading="saving"
          data-test="room-save"
        >
          {{ editing ? 'Save changes' : 'Add the room' }}
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="open = false"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>

    <ConfirmModal
      :open="retiring !== null"
      name="retire-room"
      :title="retiring ? `Retire ${retiring.name}` : ''"
      :verb="retiring ? `Retire ${retiring.name}` : ''"
      consequence="It comes off the calendar from now, and keeps its history."
      :loading="retireWorking || (held === null && retireFailure === null)"
      :disabled="held === null"
      :failure="retireFailure"
      @update:open="value => { if (!value) retiring = null }"
      @confirm="retire"
    >
      <template #body>
        <div
          v-if="held"
          class="space-y-3"
          data-test="retire-held"
        >
          <p
            v-if="held.waiting === 0 && held.upcoming === 0"
            class="text-sm text-muted"
          >
            Nothing is waiting on it or booked in it from now.
          </p>
          <UCheckbox
            v-if="held.waiting > 0"
            v-model="settle.turnDown"
            :label="`Turn down ${plural(held.waiting, 'waiting request')}`"
            description="Each member is told the room is no longer in use. Left unticked, they wait in the queue, and approving one into this room is refused."
            data-test="retire-turn-down"
          />
          <UCheckbox
            v-if="held.upcoming > 0"
            v-model="settle.cancel"
            :label="`Cancel ${plural(held.upcoming, 'booking')} yet to come`"
            description="Each member is told, and nothing is rebooked. Left unticked, they stand."
            data-test="retire-cancel"
          />
          <p
            v-if="held.waiting > 0"
            class="text-sm text-muted"
          >
            To move a request to another room instead, decide it on
            <ULink
              to="/rooms/manage/requests"
              class="underline"
            >Room requests</ULink>
            first.
          </p>
        </div>
      </template>
    </ConfirmModal>
  </ReadGate>
</template>
