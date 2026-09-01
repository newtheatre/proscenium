<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { BLACKOUT_REASON_LIMIT } from '#shared/utils/blackouts'
import { formatLondon, fromLondonWallClock } from '#shared/utils/london'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'admin', title: 'Closures', middleware: 'signed-in' })

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

const listing = ref<{ items: Closure[], total: number } | null>(null)
const rooms = ref<{ id: string, name: string, isActive: boolean }[]>([])
const when = ref<'upcoming' | 'all'>('upcoming')
const search = ref('')
const loading = ref(false)
const failure = ref<string | null>(null)
const toast = useToast()

const closing = ref(false)
const removing = ref<Closure | null>(null)
const working = ref(false)
const form = reactive({
  roomId: EVERY_ROOM,
  reason: '',
  day: '',
  from: '09:00',
  to: '18:00',
})

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    listing.value = await $fetch<{ items: Closure[], total: number }>('/api/admin/rooms/blackouts', {
      query: { when: when.value },
    })
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    loading.value = false
  }
}

async function loadRooms(): Promise<void> {
  rooms.value = (await $fetch<{ items: typeof rooms.value }>('/api/admin/rooms')).items
}

// The wall clock the officer typed, turned into the instant it names in London (0014).
function instantOf(day: string, clock: string): string {
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute] = clock.split(':').map(Number)
  return fromLondonWallClock(year!, month!, date!, hour!, minute!).toISOString()
}

const ready = computed(() => Boolean(form.reason.trim() && form.day && form.to > form.from))

async function close(): Promise<void> {
  working.value = true
  failure.value = null
  try {
    const answer = await $fetch<{ cancelled: number, told: number }>('/api/admin/rooms/blackouts', {
      method: 'POST',
      body: {
        roomId: form.roomId === EVERY_ROOM ? null : form.roomId,
        reason: form.reason,
        startsAt: instantOf(form.day, form.from),
        endsAt: instantOf(form.day, form.to),
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
    await load()
  }
  catch (error) {
    failure.value = refusalText(error)
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
    await load()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    working.value = false
  }
}

const shown = computed(() => {
  const items = listing.value?.items ?? []
  const term = search.value.trim().toLowerCase()
  if (!term) return items
  return items.filter(item => [item.reason, item.room ?? 'every room']
    .some(field => field.toLowerCase().includes(term)))
})

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (when.value !== 'upcoming') {
    active.push({ key: 'when', label: 'Including past', icon: 'i-lucide-history', clear: () => {
      when.value = 'upcoming'
    } })
  }
  return active
})

function spanOf(closure: Closure): string {
  const from = formatLondon(new Date(closure.startsAt * 1000), { dateStyle: 'medium', timeStyle: 'short' })
  const to = formatLondon(new Date(closure.endsAt * 1000), { timeStyle: 'short' })
  return `${from} to ${to}`
}

watch(when, load)

const columns: TableColumn<Closure>[] = [
  {
    id: 'room',
    header: 'Room',
    cell: ({ row }) => (row.original.room
      ? h('span', {}, row.original.room)
      : h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm' }, () => 'Every room')),
  },
  {
    id: 'span',
    header: 'When',
    meta: { class: { td: 'whitespace-nowrap text-sm' } },
    cell: ({ row }) => spanOf(row.original),
  },
  { accessorKey: 'reason', header: 'Why' },
  { accessorKey: 'by', header: 'Closed by', meta: { class: { td: 'text-sm text-muted' } } },
  {
    id: 'remove',
    header: '',
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => h(UButton, {
      'size': 'sm',
      'color': 'neutral',
      'variant': 'ghost',
      'data-test': `reopen-${row.original.id}`,
      'onClick': () => (removing.value = row.original),
    }, () => 'Reopen'),
  },
]

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
      icon="i-lucide-construction"
      title="Closing a room cancels what is booked in it"
      description="Everybody affected is told, with the reason. Reopening restores nothing: a cancelled booking has to be made again, because the slot may be somebody else's by then."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A room or a reason"
      :active="activeFilters"
      :loading="loading"
      @clear="search = ''; when = 'upcoming'"
    >
      <template #filters>
        <UFormField label="Show">
          <USelect
            v-model="when"
            data-test="blackouts-when"
            :items="[{ label: 'Still to come', value: 'upcoming' }, { label: 'Including past', value: 'all' }]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          data-test="close-room"
          icon="i-lucide-construction"
          @click="closing = true"
        >
          Close a room
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="shown"
      :columns="columns"
      :loading="loading"
      data-test="blackouts-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No rooms are closed.
        </p>
      </template>
    </UTable>

    <p
      data-test="blackouts-total"
      class="text-sm text-muted"
    >
      {{ plural(shown.length, 'closure') }}
    </p>

    <UModal
      v-model:open="closing"
      title="Close a room"
      description="Anything booked in the span is cancelled and its member told."
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Which room"
            help="Every room is what a building closure or a fire alarm test means."
          >
            <USelect
              v-model="form.roomId"
              :items="[{ label: 'Every room', value: EVERY_ROOM },
                       ...rooms.filter(one => one.isActive).map(one => ({ label: one.name, value: one.id }))]"
              value-key="value"
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

          <UFormField
            label="Day"
            required
          >
            <DateField
              v-model="form.day"
              data-test="close-day"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
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
          :loading="working"
          :disabled="!ready"
          data-test="close-submit"
          @click="close"
        >
          Close the room
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="closing = false"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="removing !== null"
      title="Reopen this room?"
      :description="removing ? `${removing.room ?? 'Every room'}, ${spanOf(removing)}` : ''"
      @update:open="removing = null"
    >
      <template #body>
        <p class="text-sm">
          The room becomes bookable again. Bookings this closure cancelled stay cancelled and are
          not restored, because their slots may be somebody else's by now.
        </p>
      </template>
      <template #footer>
        <UButton
          :loading="working"
          data-test="reopen-confirm"
          @click="remove"
        >
          Reopen it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="removing = null"
        >
          Leave it closed
        </UButton>
      </template>
    </UModal>
  </div>
</template>
