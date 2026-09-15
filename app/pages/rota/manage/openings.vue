<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { fromLondonWallClock, formatLondon, londonClock } from '#shared/utils/london'
import { daysAfter } from '#shared/utils/membership'
import { MAX_PAGE_SIZE } from '#shared/utils/pagination'
import { can, manageRota } from '#shared/utils/abilities'
import { BAR_OPENING_LABEL_LIMIT, saysBarOpeningStatus } from '#shared/utils/rota-openings'
import { rotaOpeningsList } from '#shared/utils/rota-openings-list'
import { showNightOf } from '#shared/utils/show-night'
import { saysShiftStatus } from '#shared/utils/rota'
import type { BarOpeningStatus } from '#shared/utils/rota-openings'
import type { ShiftStatus, TemplateSlot } from '#shared/utils/rota'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Bar openings', middleware: 'console', docs: '/docs/rota/bar-openings' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Opening {
  openingId: string
  venueId: string
  venueName: string
  night: string
  label: string
  startsAt: number
  endsAt: number
  status: BarOpeningStatus
}

interface Slot {
  slotId: string
  openingId: string
  slot: number
  status: ShiftStatus
  userId: string | null
  holderName: string | null
}

interface Listing {
  items: Opening[]
  slots: Slot[]
  page: number
  pageSize: number
  total: number
  pages: number
}

interface VenueTemplate { venueId: string, venueName: string, slots: TemplateSlot[] }

const request = useRequestFetch()
const toast = useToast()
// Tidiness rather than enforcement: the routes are what refuse (0040).
const writes = computed(() => can(useViewer().value, manageRota))
const failure = ref<string | null>(null)
const cancelling = ref<string | null>(null)
const planning = ref(false)
const saving = ref(false)

const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(rotaOpeningsList)

const empty = (): Listing => ({ items: [], slots: [], page: 1, pageSize: 0, total: 0, pages: 1 })

const { data: listing, status, refresh } = await useAsyncData(
  'rota-openings',
  () => request<Listing>('/api/rota/openings', { query: query.value }),
  { watch: [query], default: empty },
)

// Only venues whose template staffs a bar: anywhere else stamps nothing, and offering it would
// be a form that always refuses (E-130 criterion 2).
const { data: templates } = await useAsyncData(
  'rota-openings-venues',
  () => request<{ venues: VenueTemplate[] }>('/api/admin/rota/templates', { query: { pageSize: MAX_PAGE_SIZE } }),
  { default: () => ({ venues: [] as VenueTemplate[] }) },
)

const venueOptions = computed(() => templates.value.venues
  .filter(venue => venue.slots.some(slot => slot.role === 'BAR'))
  .map(venue => ({ label: venue.venueName, value: venue.venueId })))

const plan = reactive({ venueId: '', evening: '', opensAt: '18:00', closesAt: '23:00', label: '' })

// A wall-clock time as typed, or null: an empty field is a missing answer, never midnight.
function clockParts(value: string): [number, number] | null {
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return [hour!, minute!]
}

// The night is the evening's own show night, worked out from the instant rather than typed: a bar
// opening at 00:30 belongs to the night before, and the write path refuses a pair that disagrees.
function instantsFor(): { night: string, startsAt: number, endsAt: number } | null {
  const [year, month, day] = plan.evening.split('-').map(Number)
  const opensAt = clockParts(plan.opensAt)
  const closesAt = clockParts(plan.closesAt)
  if (!year || !month || !day || !opensAt || !closesAt) return null

  const opens = fromLondonWallClock(year, month, day, opensAt[0], opensAt[1])
  const sameDay = fromLondonWallClock(year, month, day, closesAt[0], closesAt[1])
  // A bar closing earlier on the clock than it opened closes the next morning, on the next London
  // day rather than this instant plus 86400: a clock-change night is not that long (0014).
  const [nextYear, nextMonth, nextDay] = daysAfter(plan.evening, 1).split('-').map(Number)
  const closes = sameDay <= opens
    ? fromLondonWallClock(nextYear!, nextMonth!, nextDay!, closesAt[0], closesAt[1])
    : sameDay
  return { night: showNightOf(opens), startsAt: Math.floor(opens.getTime() / 1000), endsAt: Math.floor(closes.getTime() / 1000) }
}

async function submitPlan(): Promise<void> {
  const when = instantsFor()
  if (!when) {
    failure.value = 'Give the evening, the time the bar opens and the time it closes'
    return
  }
  saving.value = true
  failure.value = null
  try {
    const answer = await $fetch<{ stamped: number }>('/api/rota/openings', {
      method: 'POST',
      body: { venueId: plan.venueId, label: plan.label.trim(), ...when },
    })
    toast.add({
      title: 'Bar opening planned',
      description: `${plural(answer.stamped, 'bar slot')} stamped from the venue's template.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    planning.value = false
    plan.label = ''
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}

async function cancel(opening: Opening): Promise<void> {
  cancelling.value = opening.openingId
  failure.value = null
  try {
    const answer = await $fetch<{ shiftsCancelled: number }>(`/api/rota/openings/${opening.openingId}/cancel`, { method: 'POST' })
    toast.add({
      title: 'Bar opening cancelled',
      description: `${plural(answer.shiftsCancelled, 'slot')} cancelled. Whoever held one has been told.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    cancelling.value = null
  }
}

async function standDown(slot: Slot): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/rota/openings/shifts/${slot.slotId}/unconfirm`, { method: 'POST' })
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

const slotsOf = (openingId: string): Slot[] => listing.value.slots.filter(slot => slot.openingId === openingId)

function spanOf(opening: Opening): string {
  const opens = formatLondon(new Date(opening.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
  return `${opens} to ${londonClock(new Date(opening.endsAt * 1000))}`
}

const columns: TableColumn<Opening>[] = [
  {
    accessorKey: 'label',
    header: 'Opening',
    cell: ({ row }) => h('div', { 'data-test': `opening-${row.original.openingId}` }, [
      h('p', { class: 'font-medium' }, `${row.original.label}, ${row.original.venueName}`),
      h('p', { class: 'text-sm text-muted' }, spanOf(row.original)),
    ]),
  },
  {
    id: 'staffing',
    header: 'Staffing',
    cell: ({ row }) => h('div', { 'class': 'space-y-1', 'data-test': `staffing-${row.original.openingId}` },
      slotsOf(row.original.openingId).map(slot => h('div', { class: 'flex items-center gap-2 text-sm' }, [
        h('span', {}, `Slot ${slot.slot}`),
        h(UBadge, {
          color: slot.status === 'CONFIRMED' ? 'success' : slot.status === 'OPEN' ? 'neutral' : 'warning',
          variant: 'subtle',
          size: 'sm',
        }, () => saysShiftStatus(slot.status)),
        h('span', { class: 'text-muted' }, slot.holderName ?? 'Nobody yet'),
        ...(writes.value && slot.status !== 'OPEN' && slot.status !== 'CANCELLED'
          ? [h(UButton, {
              'size': 'xs',
              'color': 'neutral',
              'variant': 'ghost',
              'data-test': `stand-down-${slot.slotId}`,
              'onClick': () => standDown(slot),
            }, () => 'Stand down')]
          : []),
      ]))),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => h(UBadge, {
      color: row.original.status === 'PLANNED' ? 'success' : 'neutral',
      variant: 'subtle',
      size: 'sm',
    }, () => saysBarOpeningStatus(row.original.status)),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => (writes.value && row.original.status === 'PLANNED'
      ? h(UButton, {
          'size': 'sm',
          'color': 'error',
          'variant': 'ghost',
          'loading': cancelling.value === row.original.openingId,
          'data-test': `cancel-${row.original.openingId}`,
          'onClick': () => cancel(row.original),
        }, () => 'Cancel')
      : null),
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

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-beer"
      title="An evening with no performance, staffed like any other"
      description="A hire, a society social or a get-in. Planning one stamps bar slots from the venue's template, and they are claimed and confirmed exactly as a shift is. It names no show, because there is none."
    />

    <AdminToolbar
      v-model:search="search"
      :placeholder="rotaOpeningsList.search?.placeholder"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="rotaOpeningsList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>
      <template #actions>
        <UButton
          v-if="writes"
          icon="i-lucide-plus"
          data-test="plan-opening"
          @click="planning = true"
        >
          Plan an opening
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="listing.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="openings-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ filtered ? 'Nothing matches that.' : 'No bar openings planned. Plan one when the theatre opens the bar with nothing running.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="openings-total"
        class="text-sm text-muted"
      >
        {{ plural(listing.total, 'opening') }}
      </p>
      <UPagination
        v-if="listing.pages > 1"
        v-model:page="page"
        :total="listing.total"
        :items-per-page="listing.pageSize"
      />
    </div>

    <UModal
      :open="planning"
      title="Plan a bar opening"
      description="The evening, the venue and what to call it. Bar slots are stamped from the venue's template; a venue with no bar row stamps nothing and says so."
      @update:open="planning = $event"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Venue"
            required
          >
            <USelectMenu
              v-model="plan.venueId"
              :items="venueOptions"
              value-key="value"
              data-test="opening-venue"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Evening"
            required
          >
            <UInput
              v-model="plan.evening"
              type="date"
              data-test="opening-evening"
              class="w-full"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField
              label="Opens"
              required
            >
              <UInput
                v-model="plan.opensAt"
                type="time"
                data-test="opening-opens"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Closes"
              required
            >
              <UInput
                v-model="plan.closesAt"
                type="time"
                data-test="opening-closes"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField
            label="What it is"
            required
            hint="Stands in for a show title on the rota"
          >
            <UInput
              v-model="plan.label"
              :maxlength="BAR_OPENING_LABEL_LIMIT"
              placeholder="A society social"
              data-test="opening-label"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="button"
            :loading="saving"
            data-test="opening-submit"
            @click="submitPlan"
          >
            Plan it
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
