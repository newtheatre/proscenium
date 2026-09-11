<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { formatLondon, fromLondonWallClock } from '#shared/utils/london'
import {
  PERFORMANCE_STATUSES,
  bookingWindowSource,
  performanceScreenForm,
  resolveBookingClosesHours,
  saysBookingWindow,
  saysPerformanceStatus,
} from '#shared/utils/programme'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'
import type { AdminPerformance, AdminShow, PerformanceStatus, ShowVenue } from '#shared/utils/programme'

// Every performance of one show, with the four actions that belong to a performance: edit, price,
// put on or off sale, cancel or delete (D-121, D-122).

const props = defineProps<{
  show: AdminShow
  performances: AdminPerformance[]
  venues: ShowVenue[]
}>()

const emit = defineEmits<{ changed: [] }>()

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const toast = useToast()
const saving = ref(false)
const failure = ref<string | null>(null)

const search = ref('')
const performanceStatus = ref<PerformanceStatus | 'ALL'>('ALL')

const rows = computed(() => props.performances.filter((one) => {
  const matchesStatus = performanceStatus.value === 'ALL' || one.status === performanceStatus.value
  const term = search.value.trim().toLowerCase()
  return matchesStatus && (!term || one.venueName.toLowerCase().includes(term))
}))

const performanceOpen = ref(false)
const editingPerformance = ref<AdminPerformance | null>(null)

const form = reactive({
  venueId: '',
  day: '',
  clock: '19:30',
  doorsClock: '',
  durationMinutes: null as number | null,
  intervalCount: 0,
  intervalMinutes: null as number | null,
  capacityOverride: null as number | null,
  bookingClosesHoursBefore: null as number | null,
  holdReleaseMinutesBefore: null as number | null,
  externalBookingUrl: '',
  notes: '',
})

const blank = (value: string): string | null => (value.trim() ? value.trim() : null)

// The wall clock an officer typed, turned into the instant it names in London (0014).
function instantOf(day: string, clock: string): number {
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute] = clock.split(':').map(Number)
  return Math.floor(fromLondonWallClock(year!, month!, date!, hour!, minute!).getTime() / 1000)
}

// Counted on the civil date, never by subtracting a day of seconds, which is wrong twice a year.
function dayBefore(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  const at = new Date(Date.UTC(year!, month! - 1, date!))
  at.setUTCDate(at.getUTCDate() - 1)
  return at.toISOString().slice(0, 10)
}

// The show night runs 04:00 to 04:00, so a curtain after midnight has its doors on the London day
// before it (0014). Only the clocks are typed, so this is where that is worked out.
function doorsBefore(day: string, clock: string, startsAt: number): number {
  const sameDay = instantOf(day, clock)
  return sameDay > startsAt ? instantOf(dayBefore(day), clock) : sameDay
}

const dayOf = (at: number): string => formatLondon(new Date(at * 1000), { year: 'numeric', month: '2-digit', day: '2-digit' })
  .split('/').reverse().join('-')
const clockOf = (at: number): string => formatLondon(new Date(at * 1000), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function editPerformance(one: AdminPerformance | null): void {
  editingPerformance.value = one
  failure.value = null
  Object.assign(form, {
    venueId: one?.venueId ?? bookableVenues.value[0]?.id ?? '',
    day: one ? dayOf(one.startsAt) : '',
    clock: one ? clockOf(one.startsAt) : '19:30',
    doorsClock: one?.doorsAt ? clockOf(one.doorsAt) : '',
    durationMinutes: one?.durationMinutes ?? null,
    intervalCount: one?.intervalCount ?? 0,
    intervalMinutes: one?.intervalMinutes ?? null,
    capacityOverride: one?.capacityOverride ?? null,
    bookingClosesHoursBefore: one?.bookingClosesHoursBefore ?? null,
    holdReleaseMinutesBefore: one?.holdReleaseMinutesBefore ?? null,
    externalBookingUrl: one?.externalBookingUrl ?? '',
    notes: one?.notes ?? '',
  })
  performanceOpen.value = true
}

async function savePerformance(): Promise<void> {
  saving.value = true
  failure.value = null
  const startsAt = instantOf(form.day, form.clock)
  const body = {
    venueId: form.venueId,
    startsAt,
    doorsAt: form.doorsClock ? doorsBefore(form.day, form.doorsClock, startsAt) : null,
    durationMinutes: form.durationMinutes,
    intervalCount: form.intervalCount,
    intervalMinutes: form.intervalMinutes,
    capacityOverride: form.capacityOverride,
    bookingClosesHoursBefore: form.bookingClosesHoursBefore,
    holdReleaseMinutesBefore: form.holdReleaseMinutesBefore,
    externalBookingUrl: blank(form.externalBookingUrl),
    notes: blank(form.notes),
  }
  try {
    if (editingPerformance.value) {
      await $fetch(`/api/admin/performances/${editingPerformance.value.id}`, { method: 'PUT', body })
    }
    else {
      await $fetch(`/api/admin/shows/${props.show.id}/performances`, { method: 'POST', body })
    }
    toast.add({
      title: editingPerformance.value ? 'Performance changed' : 'Performance added',
      description: editingPerformance.value ? undefined : 'It is off sale until you put it on sale, or publish the show.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    performanceOpen.value = false
    emit('changed')
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

async function setOnSale(one: AdminPerformance, onSale: boolean): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/performances/${one.id}/sale`, { method: 'POST', body: { onSale } })
    toast.add({ title: onSale ? 'Performance on sale' : 'Performance off sale', icon: 'i-lucide-check', color: 'success' })
    emit('changed')
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
}

const cancelling = ref<AdminPerformance | null>(null)
const removing = ref<AdminPerformance | null>(null)
const pricing = ref<AdminPerformance | null>(null)

async function cancelPerformance(): Promise<void> {
  const one = cancelling.value
  if (!one) return
  saving.value = true
  failure.value = null
  try {
    const answer = await $fetch<{ ticketsOwedARefund: number }>(`/api/admin/performances/${one.id}/cancel`, { method: 'POST' })
    toast.add({
      title: 'Performance cancelled',
      description: answer.ticketsOwedARefund
        ? `${plural(answer.ticketsOwedARefund, 'ticket')} to refund at the desk, and their holders to tell.`
        : 'Nothing was sold for it.',
      icon: answer.ticketsOwedARefund ? 'i-lucide-triangle-alert' : 'i-lucide-check',
      color: answer.ticketsOwedARefund ? 'warning' : 'success',
    })
    cancelling.value = null
    emit('changed')
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

async function deletePerformance(): Promise<void> {
  const one = removing.value
  if (!one) return
  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/performances/${one.id}`, { method: 'DELETE' })
    toast.add({ title: 'Performance deleted', icon: 'i-lucide-check', color: 'success' })
    removing.value = null
    emit('changed')
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

// A retired venue cannot be chosen for a new performance; one already booked into it keeps
// showing so the picker never blanks out from under an existing edit (D-131 criterion 5).
const venueOptions = computed(() => props.venues
  .filter(one => !one.archived || one.id === editingPerformance.value?.venueId)
  .map(one => ({ label: one.name, value: one.id })))
const bookableVenues = computed(() => props.venues.filter(one => !one.archived))

const statusOptions = [
  { label: 'Every performance', value: 'ALL' },
  ...PERFORMANCE_STATUSES.map(one => ({ label: saysPerformanceStatus(one), value: one })),
]

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `At ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (performanceStatus.value !== 'ALL') {
    active.push({ key: 'status', label: saysPerformanceStatus(performanceStatus.value), icon: 'i-lucide-ticket', clear: () => {
      performanceStatus.value = 'ALL'
    } })
  }
  return active
})

function windowOf(one: AdminPerformance): string {
  const inherited = { bookingClosesHoursBefore: props.show.bookingClosesHoursBefore }
  const hours = resolveBookingClosesHours(one, inherited)
  const source = bookingWindowSource(one, inherited)
  return `${saysBookingWindow(hours)}${source === 'show' ? ', from the show' : ''}`
}

const columns: TableColumn<AdminPerformance>[] = [
  {
    id: 'when',
    header: 'When',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex flex-wrap items-center gap-2' }, [
        h('span', {}, formatLondon(new Date(row.original.startsAt * 1000), { dateStyle: 'medium', timeStyle: 'short' })),
        h(UBadge, {
          color: row.original.status === 'ON_SALE' ? 'success' : row.original.status === 'CANCELLED' ? 'error' : 'neutral',
          variant: 'subtle',
          size: 'sm',
        }, () => saysPerformanceStatus(row.original.status)),
        row.original.externalBookingUrl
          ? h(UBadge, { color: 'info', variant: 'subtle', size: 'sm' }, () => 'Externally ticketed')
          : null,
      ]),
      h('div', { class: 'text-xs text-muted' }, row.original.venueName),
    ]),
  },
  {
    id: 'window',
    header: 'Online booking',
    cell: ({ row }) => h('span', { class: 'text-sm' }, windowOf(row.original)),
  },
  {
    id: 'capacity',
    header: 'Capacity',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => {
      // Tickets for this performance are sold elsewhere, so a house figure would answer a
      // question nobody asked here (D-122 criterion 2).
      if (row.original.externalBookingUrl) return h('span', { class: 'text-sm text-muted' }, 'Externally ticketed')
      const capacity = row.original.capacityOverride ?? row.original.venueCapacity
      return h('span', { class: 'text-sm' }, capacity === null ? 'Uncapped' : `${capacity}`)
    },
  },
  {
    id: 'sold',
    header: 'Sold',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => {
      // Nought here would read as nobody has bought a ticket, when nobody sells one internally
      // to count (D-122 criterion 2).
      if (row.original.externalBookingUrl) return h('span', { class: 'text-sm text-muted' }, 'n/a')
      return h('span', { class: 'text-sm text-muted' }, `${row.original.soldTickets}`)
    },
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `edit-performance-${row.original.id}`,
        'onClick': () => editPerformance(row.original),
      }, () => 'Edit'),
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `prices-${row.original.id}`,
        'onClick': () => {
          failure.value = null
          pricing.value = row.original
        },
      }, () => 'Prices'),
      row.original.status === 'CANCELLED'
        ? null
        : h(UButton, {
            'size': 'sm',
            'color': 'neutral',
            'variant': 'ghost',
            'data-test': `sale-${row.original.id}`,
            'onClick': () => setOnSale(row.original, row.original.status !== 'ON_SALE'),
          }, () => (row.original.status === 'ON_SALE' ? 'Off sale' : 'On sale')),
      row.original.status === 'CANCELLED'
        ? null
        : h(UButton, {
            'size': 'sm',
            'color': 'warning',
            'variant': 'ghost',
            'data-test': `cancel-${row.original.id}`,
            'onClick': () => {
              failure.value = null
              cancelling.value = row.original
            },
          }, () => 'Cancel'),
      row.original.soldTickets > 0
        ? null
        : h(UButton, {
            'size': 'sm',
            'color': 'error',
            'variant': 'ghost',
            'data-test': `delete-performance-${row.original.id}`,
            'onClick': () => {
              failure.value = null
              removing.value = row.original
            },
          }, () => 'Delete'),
    ]),
  },
]
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

    <AdminToolbar
      v-model:search="search"
      placeholder="A venue"
      :active="activeFilters"
      @clear="search = ''; performanceStatus = 'ALL'"
    >
      <template #filters>
        <UFormField label="Show">
          <USelect
            v-model="performanceStatus"
            :items="statusOptions"
            class="w-full"
            data-test="performances-status"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          data-test="add-performance"
          icon="i-lucide-plus"
          :disabled="bookableVenues.length === 0"
          @click="editPerformance(null)"
        >
          Add a performance
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="rows"
      :columns="columns"
      data-test="performances-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ search || performanceStatus !== 'ALL' ? 'No performance matches that.' : 'No performances yet. Add one, and it waits off sale until you say otherwise.' }}
        </p>
      </template>
    </UTable>

    <UModal
      v-model:open="performanceOpen"
      :title="editingPerformance ? 'Edit this performance' : 'Add a performance'"
      description="A performance belongs to one venue at one time. Two venues can run at once, and one venue can run a matinee and an evening."
    >
      <template #body>
        <UForm
          :schema="performanceScreenForm"
          :state="form"
          class="space-y-4"
          data-test="performance-form"
          @submit="savePerformance"
        >
          <UAlert
            v-if="failure"
            data-test="performance-failure"
            color="error"
            variant="subtle"
            :description="failure"
          />

          <UFormField
            label="Venue"
            name="venueId"
            required
          >
            <USelect
              v-model="form.venueId"
              :items="venueOptions"
              class="w-full"
              data-test="performance-venue"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField
              label="Day"
              name="day"
              required
            >
              <DateField
                v-model="form.day"
                data-test="performance-day"
              />
            </UFormField>

            <UFormField
              label="Curtain"
              name="clock"
              required
            >
              <UInput
                v-model="form.clock"
                type="time"
                class="w-full"
                data-test="performance-clock"
              />
            </UFormField>

            <UFormField
              label="Doors"
              name="doorsClock"
              hint="Optional"
            >
              <UInput
                v-model="form.doorsClock"
                type="time"
                class="w-full"
                data-test="performance-doors"
              />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField
              label="Running time"
              name="durationMinutes"
              hint="Optional"
              description="Minutes."
            >
              <UInputNumber
                v-model="form.durationMinutes"
                :min="1"
                :max="600"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Intervals"
              name="intervalCount"
            >
              <UInputNumber
                v-model="form.intervalCount"
                :min="0"
                :max="5"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Interval length"
              name="intervalMinutes"
              hint="Optional"
              description="Minutes."
            >
              <UInputNumber
                v-model="form.intervalMinutes"
                :min="0"
                :max="120"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Capacity"
              name="capacityOverride"
              hint="Optional"
              description="Leave it empty to take the venue's. Nought is a closed house."
            >
              <UInputNumber
                v-model="form.capacityOverride"
                :min="0"
                class="w-full"
                data-test="performance-capacity"
              />
            </UFormField>

            <UFormField
              label="Online booking closes"
              name="bookingClosesHoursBefore"
              hint="Optional"
              description="Hours before curtain. Leave it empty to inherit the show's."
            >
              <UInputNumber
                v-model="form.bookingClosesHoursBefore"
                :min="0"
                :max="720"
                class="w-full"
                data-test="performance-window"
              />
            </UFormField>

            <UFormField
              label="Unpaid holds release"
              name="holdReleaseMinutesBefore"
              hint="Optional"
              description="Minutes before curtain. Leave it empty to take the configured default."
            >
              <UInputNumber
                v-model="form.holdReleaseMinutesBefore"
                :min="0"
                :max="1440"
                class="w-full"
                data-test="performance-hold-release"
              />
            </UFormField>
          </div>

          <UFormField
            label="External ticketing"
            name="externalBookingUrl"
            hint="Optional"
            description="Set a link and every internal sales path refuses, pointing here instead. Clearing it does not put the performance back on sale; use On sale for that."
          >
            <UInput
              v-model="form.externalBookingUrl"
              type="url"
              placeholder="https://"
              class="w-full"
              data-test="performance-external-url"
            />
          </UFormField>

          <UFormField
            label="Internal notes"
            name="notes"
            hint="Optional"
            description="Nobody outside the committee sees these."
          >
            <UTextarea
              v-model="form.notes"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="performance-submit"
            >
              {{ editingPerformance ? 'Save it' : 'Add it' }}
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="performanceOpen = false"
            >
              Back
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      :open="cancelling !== null"
      title="Cancel this performance"
      description="It stops selling and stays on the record. Everybody holding a ticket has to be refunded at the desk and told."
      @update:open="cancelling = null"
    >
      <template #body>
        <p class="text-sm text-muted">
          {{ cancelling && cancelling.soldTickets > 0
            ? `${plural(cancelling.soldTickets, 'ticket')} sold. Refund them at the desk after cancelling.`
            : 'Nothing has been sold for it.' }}
        </p>
      </template>

      <template #footer>
        <UButton
          color="warning"
          :loading="saving"
          data-test="confirm-cancel"
          @click="cancelPerformance"
        >
          Cancel it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="cancelling = null"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="removing !== null"
      title="Delete this performance"
      description="Nothing has been sold for it, so there is no history to keep. A performance with sold tickets is cancelled instead."
      @update:open="removing = null"
    >
      <template #body>
        <p class="text-sm text-muted">
          This cannot be undone, and there is nothing behind it to lose.
        </p>
      </template>

      <template #footer>
        <UButton
          color="error"
          :loading="saving"
          data-test="confirm-delete-performance"
          @click="deletePerformance"
        >
          Delete it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="removing = null"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="pricing !== null"
      title="Prices for this performance"
      description="What this performance charges, and what it inherits from the show and the ticket type. A change takes effect for new reservations only."
      @update:open="value => { if (!value) pricing = null }"
    >
      <template #body>
        <TicketPrices
          v-if="pricing"
          :key="pricing.id"
          level="performance"
          :endpoint="`/api/admin/performances/${pricing.id}/prices`"
        />
      </template>
    </UModal>
  </div>
</template>
