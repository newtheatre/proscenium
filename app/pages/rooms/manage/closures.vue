<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { can, manageRoomsEstate } from '#shared/utils/abilities'
import { BLACKOUT_REASON_LIMIT, closeButtonLabel, closureSpan, saysSpan, wholeDaysByDefault } from '#shared/utils/blackouts'
import { blackoutsList } from '#shared/utils/blackouts-list'
import type { ListedPerformanceClosure } from '#shared/utils/performance-closures'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Closures', middleware: 'console', docs: '/docs/spaces/closures' })

const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')

interface Closure {
  id: string
  roomId: string | null
  room: string | null
  reason: string
  startsAt: number
  endsAt: number
  by: string | null
}

const EVERY_ROOM = 'all'

interface Listing { items: Closure[], total: number }

const request = useRequestFetch()
const route = useRoute()
const rooms = ref<{ id: string, name: string, isActive: boolean }[]>([])
const failure = ref<ListFailure | null>(null)
const toast = useToast()

const writes = computed(() => can(useViewer().value, manageRoomsEstate))

const closing = ref(false)
const removing = ref<Closure | null>(null)
const working = ref(false)
// No room is chosen for the officer: a closure cannot be undone, and a default of every room
// is one slip from closing the building (issue 1353).
const form = reactive({
  roomId: '',
  reason: '',
  day: '',
  untilDay: '',
  from: '09:00',
  to: '18:00',
})

// A closure may run over days (C-114 criterion 1), so the day it ends on follows the day it
// starts on until an officer moves it later.
watch(() => form.day, (day) => {
  if (!form.untilDay || form.untilDay < day) form.untilDay = day
})

// Search, filter and sort live in the URL (K-129).
const { search, conditions, sort, query, active, filtered, set, setSort, clear } = useListQuery(blackoutsList)

const { data: listing, status, refresh, error } = await useAsyncData(
  'rooms-blackouts',
  () => request<Listing>('/api/admin/rooms/blackouts', { query: query.value }),
  { watch: [query], default: (): Listing => ({ items: [], total: 0 }) },
)

watch(error, (raised) => {
  if (raised) failure.value = listFailureFrom(raised, 'The closures could not be read.')
})

// Derived from the programme rather than set here, so it is listed and never reopened (issue 1347).
const { data: performed, error: performedError, refresh: refreshPerformed } = await useAsyncData(
  'rooms-performance-closures',
  () => request<{ items: ListedPerformanceClosure[] }>('/api/admin/rooms/blackouts/performances'),
  { default: () => ({ items: [] as ListedPerformanceClosure[] }) },
)
const performedFailure = useListFailure(performedError, 'The closures performances make could not be read.')

const spanOf = (span: { startsAt: number, endsAt: number }): string =>
  saysSpan(new Date(span.startsAt * 1000), new Date(span.endsAt * 1000))

async function loadRooms(): Promise<void> {
  rooms.value = (await $fetch<{ items: typeof rooms.value }>('/api/admin/rooms')).items
}

const endsOn = computed(() => form.untilDay || form.day)

// Whole days unless the officer says otherwise, once the closure runs past its first day.
const wholeDaysChosen = ref<boolean | null>(null)
const wholeDays = computed({
  get: () => wholeDaysChosen.value ?? wholeDaysByDefault(form.day, endsOn.value),
  set: (chosen: boolean) => { wholeDaysChosen.value = chosen },
})

const span = computed(() => (form.day && endsOn.value >= form.day
  ? closureSpan({ day: form.day, untilDay: endsOn.value, from: form.from, to: form.to, wholeDays: wholeDays.value })
  : null))

const chosenName = computed(() => {
  if (!form.roomId) return null
  if (form.roomId === EVERY_ROOM) return 'every room'
  return rooms.value.find(one => one.id === form.roomId)?.name ?? 'the room'
})

// Counted by the same read the close makes, and again whenever the room or the span moves; a
// count overtaken by a newer one is dropped, whether it answers or fails.
const cancels = ref<number | null>(null)
const counting = ref(false)
const countFailure = ref<string | null>(null)
watch([() => form.roomId, span], async ([roomId, when], _, onCleanup) => {
  cancels.value = null
  countFailure.value = null
  if (!roomId || !when || when.endsAt <= when.startsAt) return
  let stale = false
  onCleanup(() => {
    stale = true
  })
  counting.value = true
  try {
    const answer = await $fetch<{ count: number }>('/api/admin/rooms/blackouts/stranded', {
      query: { ...(roomId === EVERY_ROOM ? {} : { roomId }), ...when },
    })
    if (!stale) cancels.value = answer.count
  }
  catch (error) {
    if (!stale) countFailure.value = `What closing would cancel could not be counted: ${refusalText(error)}`
  }
  finally {
    if (!stale) counting.value = false
  }
})

const closeLabel = computed(() => closeButtonLabel(chosenName.value, cancels.value))

// The count is part of being ready: nothing is closed that has not said what it cancels first.
const ready = computed(() => Boolean(
  form.roomId && form.reason.trim() && span.value && span.value.endsAt > span.value.startsAt && cancels.value !== null))

async function close(): Promise<void> {
  working.value = true
  failure.value = null
  try {
    const answer = await $fetch<{ cancelled: number, told: number }>('/api/admin/rooms/blackouts', {
      method: 'POST',
      body: {
        roomId: form.roomId === EVERY_ROOM ? null : form.roomId,
        reason: form.reason,
        ...span.value!,
      },
    })

    toast.add({
      title: 'Room closed',
      description: answer.cancelled
        ? `${plural(answer.cancelled, 'booking')} cancelled, and ${plural(answer.told, 'person', 'people')} told.`
        : 'Nothing was booked in that span.',
      icon: answer.cancelled ? 'i-lucide-triangle-alert' : 'i-lucide-check',
      color: answer.cancelled ? 'warning' : 'success',
    })
    closing.value = false
    form.reason = ''
    form.roomId = ''
    wholeDaysChosen.value = null
    await refresh()
  }
  catch (error) {
    failure.value = listFailureFrom(error)
  }
  finally {
    working.value = false
  }
}

async function remove(): Promise<void> {
  const closure = removing.value
  if (!closure) return

  working.value = true
  try {
    await $fetch(`/api/admin/rooms/blackouts/${closure.id}`, { method: 'DELETE' })
    toast.add({
      title: 'Room reopened',
      description: 'Bookings this closure cancelled stay cancelled, and have to be made again.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    removing.value = null
    await refresh()
  }
  catch (error) {
    failure.value = listFailureFrom(error)
  }
  finally {
    working.value = false
  }
}

const columns: TableColumn<Closure>[] = [
  {
    id: 'room',
    header: 'Room',
    cell: ({ row }) => h('div', {}, [
      row.original.room
        ? h('div', {}, row.original.room)
        : h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm' }, () => 'Every room'),
      // Below sm the reason and who closed it are hidden: shown here instead, so a phone keeps
      // the span and Reopen in view without losing what they said (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, `${row.original.reason}, closed by ${row.original.by}`),
    ]),
  },
  {
    id: 'span',
    header: 'When',
    meta: { class: { td: 'whitespace-nowrap text-sm' } },
    cell: ({ row }) => saysSpan(new Date(row.original.startsAt * 1000), new Date(row.original.endsAt * 1000)),
  },
  { accessorKey: 'reason', header: 'Why', meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} whitespace-normal` } } },
  { accessorKey: 'by', header: 'Closed by', meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} text-sm text-muted` } } },
  {
    id: 'remove',
    header: ACTIONS_HEADER,
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => (writes.value === false
      ? null
      : h(UButton, {
          'size': 'sm',
          'color': 'neutral',
          'variant': 'ghost',
          'data-test': `reopen-${row.original.id}`,
          'onClick': () => (removing.value = row.original),
        }, () => 'Reopen')),
  },
]

// Opened from a room's row on Rooms, with that room already chosen (issue 1353).
onMounted(async () => {
  await loadRooms()
  const asked = String(route.query.close ?? '')
  if (writes.value && rooms.value.some(one => one.id === asked && one.isActive)) {
    form.roomId = asked
    closing.value = true
  }
})

// A page alert renders behind an open modal's overlay, where nobody can read it, so a refusal
// is shown wherever the action was taken.
const modalOpen = computed(() => closing.value || removing.value !== null)
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure && !modalOpen"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure.message"
      :actions="failure.enrolPath ? [{ label: 'Set up an authenticator app', to: failure.enrolPath, color: 'error' }] : []"
    />

    <p class="text-sm text-muted">
      Rooms shut for a spell, and why.
    </p>

    <AdminToolbar
      v-model:search="search"
      placeholder="A room or a reason"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="blackoutsList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>

      <template #actions>
        <UButton
          v-if="writes"
          data-test="close-room"
          icon="i-lucide-construction"
          @click="closing = true"
        >
          Close a room
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="listing.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="blackouts-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ failure ? failure.message : filtered ? 'No closure matches that.' : 'No rooms are closed.' }}
        </p>
      </template>
    </UTable>

    <p
      data-test="blackouts-total"
      class="text-sm text-muted"
    >
      {{ plural(listing.total, 'closure') }}
    </p>

    <UPageCard
      title="Closed for performances"
      description="A venue's performances close the room it is attached to, from before doors until after the curtain comes down. They are not reopened here: cancel the performance, or detach the room from the venue. A booking already in the room is left standing for you to settle with whoever made it."
      data-test="performance-closures"
    >
      <ReadFailure
        v-if="performedFailure"
        :failure="performedFailure"
        @retry="refreshPerformed()"
      />
      <p
        v-else-if="performed.items.length === 0"
        class="text-sm text-muted"
      >
        No performance closes a room as far ahead as bookings open.
      </p>
      <ul
        v-else
        class="divide-y divide-default"
      >
        <li
          v-for="item in performed.items"
          :key="item.id"
          class="py-3"
          :data-test="`performance-closure-${item.performanceId}`"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span class="font-medium">
              {{ item.room }}: {{ item.show }} is on
              <UBadge
                v-if="!item.published"
                color="neutral"
                variant="subtle"
                size="sm"
              >Not yet published</UBadge>
            </span>
            <span class="text-sm text-muted">{{ spanOf(item) }}</span>
          </div>
          <p class="text-xs text-muted">
            At {{ item.venue }}
          </p>
          <div
            v-if="item.overlapping.length"
            class="mt-2"
          >
            <UBadge
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
            >
              {{ plural(item.overlapping.length, 'booking') }} to settle
            </UBadge>
            <ul class="mt-1 space-y-0.5 text-sm">
              <li
                v-for="booking in item.overlapping"
                :key="booking.id"
              >
                {{ booking.title }}, {{ booking.bookedBy ?? 'unnamed' }}, {{ spanOf(booking) }}
              </li>
            </ul>
          </div>
        </li>
      </ul>
    </UPageCard>

    <UModal
      v-model:open="closing"
      title="Close a room"
      description="Anything booked in the span is cancelled and its member told. Reopening restores none of it, so the button counts it first."
    >
      <template #body>
        <UAlert
          v-if="failure"
          data-test="failure"
          class="mb-4"
          color="error"
          variant="subtle"
          :description="failure.message"
        />
        <UAlert
          v-if="countFailure"
          data-test="close-count-failure"
          class="mb-4"
          color="warning"
          variant="subtle"
          :description="countFailure"
        />
        <div class="space-y-4">
          <UFormField
            label="Which room"
            required
            help="Every room is what a building closure or a fire alarm test means."
          >
            <USelect
              v-model="form.roomId"
              :items="[...rooms.filter(one => one.isActive).map(one => ({ label: one.name, value: one.id })),
                       { label: 'Every room', value: EVERY_ROOM }]"
              value-key="value"
              placeholder="Choose a room"
              class="w-full"
              data-test="close-room-id"
            />
          </UFormField>

          <UFormField
            label="Why"
            required
            :description="`Shown to everybody on the calendar, and to whoever loses a booking. Up to ${BLACKOUT_REASON_LIMIT} characters.`"
          >
            <UInput
              v-model="form.reason"
              :maxlength="BLACKOUT_REASON_LIMIT"
              class="w-full"
              data-test="close-reason"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Day"
              required
            >
              <DateField
                v-model="form.day"
                data-test="close-day"
              />
            </UFormField>
            <UFormField
              label="Until day"
              required
              help="The same day for one afternoon, a later one for a get-in."
            >
              <DateField
                v-model="form.untilDay"
                :min="form.day || undefined"
                data-test="close-until-day"
              />
            </UFormField>
          </div>

          <USwitch
            v-model="wholeDays"
            label="Whole days"
            description="From midnight on the first day to midnight after the last."
            data-test="close-whole-days"
          />

          <div
            v-if="!wholeDays"
            class="grid gap-4 sm:grid-cols-2"
          >
            <UFormField
              label="From"
              required
            >
              <UInput
                v-model="form.from"
                type="time"
                class="w-full"
                data-test="close-from"
              />
            </UFormField>
            <UFormField
              label="Until"
              required
            >
              <UInput
                v-model="form.to"
                type="time"
                class="w-full"
                data-test="close-to"
              />
            </UFormField>
          </div>
        </div>
      </template>

      <template #footer>
        <UButton
          color="error"
          :loading="working || counting"
          :disabled="!ready"
          data-test="close-submit"
          @click="close"
        >
          {{ closeLabel }}
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="closing = false"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>

    <ConfirmModal
      :open="removing !== null"
      name="reopen-room"
      title="Reopen this room"
      verb="Reopen the room"
      color="primary"
      consequence="The room becomes bookable again. Bookings this closure cancelled stay cancelled and are not restored. Their slots may be somebody else's by now."
      :loading="working"
      :failure="failure?.message ?? null"
      @update:open="removing = null; failure = null"
      @confirm="remove"
    >
      <template #body>
        <p class="text-sm text-muted">
          {{ removing ? `${removing.room ?? 'Every room'}, ${saysSpan(new Date(removing.startsAt * 1000), new Date(removing.endsAt * 1000))}` : '' }}
        </p>
      </template>
    </ConfirmModal>
  </div>
</template>
