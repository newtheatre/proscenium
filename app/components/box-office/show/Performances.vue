<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { formatLondon } from '#shared/utils/london'
import { saysWhen } from '#shared/utils/when'
import {
  MAX_RUN_NIGHTS,
  addPerformanceRefusal,
  bookingWindowSource,
  nightInstants,
  performanceScreenForm,
  preselectedVenueId,
  resolveBookingClosesHours,
  runScreenForm,
  runningTimeRefusal,
  saysBookingWindow,
  saysPerformanceStatus,
  saysVenueOption,
} from '#shared/utils/programme'
import { performancesList } from '#shared/utils/performances-list'
import type { FormError, TableColumn } from '@nuxt/ui'
import type { FilterOption } from '#shared/utils/list-filters'
import type { AdminPerformance, AdminShow, ShowVenue } from '#shared/utils/programme'

// Every performance of one show, with the four actions that belong to a performance: edit, price,
// put on or off sale, cancel or delete (D-121, D-122).

const props = defineProps<{
  show: AdminShow
  venues: ShowVenue[]
}>()

const emit = defineEmits<{ changed: [] }>()

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const request = useRequestFetch()
const toast = useToast()
const saving = ref(false)
const failure = ref<string | null>(null)

interface Listing { items: AdminPerformance[], total: number, pageSize: number, pages: number }
const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

// The venue names the chips and the picker read; the declaration names the column, not the rows.
const venueLabels = computed<Record<string, FilterOption[]>>(() => ({
  venueId: props.venues.map(one => ({ value: one.id, label: one.name })),
}))

// Search, filters, sort and page live in the URL (K-129). The tab is the page's own key, so it
// stays in the URL and never reaches the endpoint's strict schema.
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear }
  = useListQuery(performancesList, { options: venueLabels, ignore: ['tab'] })

const { data, status: loading, error: listingError, refresh } = await useAsyncData(
  () => `box-office-show-performances-${props.show.id}`,
  () => request<Listing>(`/api/admin/shows/${props.show.id}/performances`, { query: query.value }),
  { watch: [query], default: empty },
)

const rows = computed(() => data.value.items)

const listingFailure = computed(() => (listingError.value ? refusalText(listingError.value, 'The performances could not be read.') : null))

// The page above holds the status strip, which counts the same rows this list changes.
async function changed(): Promise<void> {
  await refresh()
  emit('changed')
}

const performanceOpen = ref(false)
const editingPerformance = ref<AdminPerformance | null>(null)
// The rare overrides, shown on Edit only when asked for or already set (D-132 criterion 10).
const more = ref(false)

const form = reactive({
  venueId: '',
  day: '',
  days: [''] as string[],
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

const dayOf = (at: number): string => formatLondon(new Date(at * 1000), { year: 'numeric', month: '2-digit', day: '2-digit' })
  .split('/').reverse().join('-')
const clockOf = (at: number): string => formatLondon(new Date(at * 1000), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

const NO_OVERRIDES = { capacityOverride: null, bookingClosesHoursBefore: null, holdReleaseMinutesBefore: null, externalBookingUrl: '', notes: '' }

// A run starts empty or, for Duplicate, from a performance's venue, clocks and running time; only
// its nights are new (D-132 criterion 10).
function addRun(from: AdminPerformance | null): void {
  editingPerformance.value = null
  more.value = false
  failure.value = null
  Object.assign(form, {
    ...NO_OVERRIDES,
    venueId: from?.venueId ?? preselectedVenueId(props.venues, props.show.lastVenueId),
    days: [''],
    clock: from ? clockOf(from.startsAt) : '19:30',
    doorsClock: from?.doorsAt ? clockOf(from.doorsAt) : '',
    durationMinutes: from?.durationMinutes ?? null,
    intervalCount: from?.intervalCount ?? 0,
    intervalMinutes: from?.intervalMinutes ?? null,
  })
  performanceOpen.value = true
}

function editPerformance(one: AdminPerformance): void {
  editingPerformance.value = one
  failure.value = null
  more.value = one.capacityOverride !== null || one.bookingClosesHoursBefore !== null
    || one.holdReleaseMinutesBefore !== null || one.externalBookingUrl !== null || one.notes !== null
  Object.assign(form, {
    venueId: one.venueId,
    day: dayOf(one.startsAt),
    clock: clockOf(one.startsAt),
    doorsClock: one.doorsAt ? clockOf(one.doorsAt) : '',
    durationMinutes: one.durationMinutes,
    intervalCount: one.intervalCount,
    intervalMinutes: one.intervalMinutes,
    capacityOverride: one.capacityOverride,
    bookingClosesHoursBefore: one.bookingClosesHoursBefore,
    holdReleaseMinutesBefore: one.holdReleaseMinutesBefore,
    externalBookingUrl: one.externalBookingUrl ?? '',
    notes: one.notes ?? '',
  })
  performanceOpen.value = true
}

// Every night of a run in one request, so the run lands whole or not at all (D-132 criterion 10).
function saveRun(): Promise<unknown> {
  return $fetch(`/api/admin/shows/${props.show.id}/runs`, {
    method: 'POST',
    body: {
      venueId: form.venueId,
      durationMinutes: form.durationMinutes,
      intervalCount: form.intervalCount,
      intervalMinutes: form.intervalMinutes,
      nights: form.days.map(day => nightInstants(day, form.clock, form.doorsClock)),
    },
  })
}

async function savePerformance(): Promise<void> {
  saving.value = true
  failure.value = null
  const editing = editingPerformance.value
  const added = form.days.length
  try {
    if (editing) {
      await $fetch(`/api/admin/performances/${editing.id}`, {
        method: 'PUT',
        body: {
          ...nightInstants(form.day, form.clock, form.doorsClock),
          venueId: form.venueId,
          durationMinutes: form.durationMinutes,
          intervalCount: form.intervalCount,
          intervalMinutes: form.intervalMinutes,
          capacityOverride: form.capacityOverride,
          bookingClosesHoursBefore: form.bookingClosesHoursBefore,
          holdReleaseMinutesBefore: form.holdReleaseMinutesBefore,
          externalBookingUrl: blank(form.externalBookingUrl),
          notes: blank(form.notes),
        },
      })
    }
    else {
      await saveRun()
    }
    toast.add({
      title: editing ? 'Performance changed' : `${plural(added, 'performance', 'performances')} added`,
      description: editing ? undefined : 'Off sale until you put them on sale, or publish the show.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    performanceOpen.value = false
    await changed()
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
    await changed()
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
    await changed()
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
    await changed()
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
  .map(one => ({ label: saysVenueOption(one), value: one.id })))
const bookableVenues = computed(() => props.venues.filter(one => !one.archived))
const addRefusal = computed(() => addPerformanceRefusal(bookableVenues.value.length))

const venueOf = (venueId: string): ShowVenue | undefined => props.venues.find(one => one.id === venueId)
const runningTimeOptional = computed(() => editingPerformance.value?.status === 'CANCELLED' || (venueOf(form.venueId)?.isExternal ?? false))

// The route's own rule, asked before the request so the field says it rather than a banner (D-121).
function checkRunningTime(): FormError[] {
  const venue = venueOf(form.venueId)
  const refusal = venue ? runningTimeRefusal(venue, form.durationMinutes, editingPerformance.value?.status) : null
  return refusal ? [{ name: 'durationMinutes', message: refusal }] : []
}

// A row the rota cannot window: at a venue we run, still to happen, and no running time (0078).
const untimed = (one: AdminPerformance): boolean => one.status !== 'CANCELLED' && one.durationMinutes === null
  && one.startsAt >= Date.now() / 1000 && venueOf(one.venueId)?.isExternal === false

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
        h('span', {}, saysWhen(row.original.startsAt)),
        h(UBadge, {
          color: row.original.status === 'ON_SALE' ? 'success' : row.original.status === 'CANCELLED' ? 'error' : 'neutral',
          variant: 'subtle',
          size: 'sm',
        }, () => saysPerformanceStatus(row.original.status)),
        row.original.externalBookingUrl
          ? h(UBadge, { color: 'info', variant: 'subtle', size: 'sm' }, () => 'Externally ticketed')
          : null,
        untimed(row.original)
          ? h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm' }, () => 'No running time')
          : null,
      ]),
      // The booking window rides the venue line at every width: a column of its own pushed the
      // row actions past the edge beside the rail at 1280 (issue 1351).
      h('div', { class: 'text-xs text-muted' }, `${row.original.venueName} · ${windowOf(row.original)}`),
      // Below sm the house figures are hidden: shown here instead, so a phone keeps the row
      // actions in view without losing what they said (issue 922).
      row.original.externalBookingUrl
        ? null
        : h('div', { class: 'sm:hidden text-xs text-muted' }, `${row.original.soldTickets} sold of ${row.original.capacityOverride ?? row.original.venueCapacity ?? 'an uncapped house'}`),
    ]),
  },
  {
    id: 'sold',
    header: 'Sold',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} whitespace-nowrap` } },
    // Sold against capacity in one column, the night's own words (E-112). Nought would read as
    // nobody buying, when nobody sells one here to count (D-122 criterion 2).
    cell: ({ row }) => {
      if (row.original.externalBookingUrl) return h('span', { class: 'text-sm text-muted' }, 'n/a')
      const capacity = row.original.capacityOverride ?? row.original.venueCapacity
      return h('span', { class: 'text-sm' }, capacity === null ? `${row.original.soldTickets}, uncapped` : `${row.original.soldTickets} of ${capacity}`)
    },
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
      rowOverflow(row.original.id, [
        { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: () => addRun(row.original) },
        ...(row.original.status === 'CANCELLED'
          ? []
          : [{
              label: 'Cancel the performance',
              color: 'warning' as const,
              onSelect: () => {
                failure.value = null
                cancelling.value = row.original
              },
            }]),
        ...(row.original.soldTickets > 0
          ? []
          : [{
              label: 'Delete',
              color: 'error' as const,
              onSelect: () => {
                failure.value = null
                removing.value = row.original
              },
            }]),
      ]),
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
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <AdminToolbar
      v-model:search="search"
      :placeholder="performancesList.search?.placeholder"
      :active="active"
      :loading="loading === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="performancesList"
          :conditions="conditions"
          :sort="sort"
          :options="venueLabels"
          @set="set"
          @sort="setSort"
        />
      </template>

      <template #actions>
        <UButton
          data-test="add-performance"
          icon="i-lucide-plus"
          :disabled="addRefusal !== null"
          :aria-describedby="addRefusal === null ? undefined : 'add-performance-blocked'"
          @click="addRun(null)"
        >
          Add performances
        </UButton>
      </template>
    </AdminToolbar>

    <UAlert
      v-if="addRefusal"
      id="add-performance-blocked"
      color="info"
      variant="subtle"
      icon="i-lucide-map-pin"
      data-test="add-performance-blocked"
    >
      <template #description>
        {{ addRefusal }}
        <NuxtLink
          to="/box-office/venues"
          class="underline"
        >
          Go to venues
        </NuxtLink>
      </template>
    </UAlert>

    <UTable
      :data="rows"
      :columns="columns"
      :loading="loading === 'pending'"
      data-test="performances-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ filtered ? 'No performance matches that.' : 'No performances yet. Add one, and it waits off sale until you say otherwise.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="performances-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'performance', 'performances') }}
      </p>
      <UPagination
        v-if="data.pages > 1"
        v-model:page="page"
        :total="data.total"
        :items-per-page="data.pageSize"
      />
    </div>

    <UModal
      v-model:open="performanceOpen"
      :title="editingPerformance ? 'Edit this performance' : 'Add performances'"
      :description="editingPerformance
        ? 'A performance belongs to one venue at one time. Two venues can run at once, and one venue can run a matinee and an evening.'
        : 'One night or a run: each night becomes its own performance at the venue, times and running time given here.'"
    >
      <template #body>
        <UForm
          id="performance-form"
          :schema="editingPerformance ? performanceScreenForm : runScreenForm"
          :state="form"
          :validate="checkRunningTime"
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

          <UFormField
            v-if="editingPerformance"
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
            v-else
            label="Nights"
            name="days"
            required
            description="Each night is one performance at the curtain below."
          >
            <div class="space-y-2">
              <div
                v-for="(_, index) in form.days"
                :key="index"
                class="flex items-center gap-2"
              >
                <DateField
                  v-model="form.days[index]"
                  :data-test="index === 0 ? 'performance-day' : `performance-day-${index + 1}`"
                />
                <UButton
                  v-if="index > 0"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-x"
                  :aria-label="`Remove night ${index + 1}`"
                  @click="form.days.splice(index, 1)"
                />
              </div>
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-lucide-plus"
                :disabled="form.days.length >= MAX_RUN_NIGHTS"
                data-test="run-add-night"
                @click="form.days.push('')"
              >
                Add another night
              </UButton>
            </div>
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Curtain"
              name="clock"
              required
            >
              <TimeField
                v-model="form.clock"
                data-test="performance-clock"
              />
            </UFormField>

            <UFormField
              label="Doors"
              name="doorsClock"
              hint="Optional"
            >
              <TimeField
                v-model="form.doorsClock"
                data-test="performance-doors"
              />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField
              label="Running time"
              name="durationMinutes"
              :required="!runningTimeOptional"
              :hint="runningTimeOptional ? 'Optional' : undefined"
              description="Minutes, without the intervals. Every shift ends from it."
            >
              <UInputNumber
                v-model="form.durationMinutes"
                :min="1"
                :max="600"
                class="w-full"
                data-test="performance-duration"
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

          <UButton
            v-if="editingPerformance"
            color="neutral"
            variant="link"
            :icon="more ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            :aria-expanded="more"
            data-test="performance-more"
            @click="more = !more"
          >
            {{ more ? 'Fewer' : 'More: capacity, booking window, external ticketing, notes' }}
          </UButton>

          <div
            v-if="editingPerformance && more"
            class="grid gap-4 sm:grid-cols-2"
          >
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
              description="Minutes before curtain. Leave it empty to take the house default."
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
            v-if="editingPerformance && more"
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
            v-if="editingPerformance && more"
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
        </UForm>
      </template>

      <template #footer>
        <UButton
          type="submit"
          form="performance-form"
          :loading="saving"
          data-test="performance-submit"
        >
          {{ editingPerformance ? 'Save the performance' : form.days.length > 1 ? `Add ${form.days.length} performances` : 'Add the performance' }}
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="performanceOpen = false"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
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
          Cancel the performance
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="cancelling = null"
        >
          {{ CONFIRM_BACK_LABEL }}
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
          The performance goes and the show keeps the rest. Nothing has been sold for it, so
          nobody loses a seat.
        </p>
      </template>

      <template #footer>
        <UButton
          color="error"
          :loading="saving"
          data-test="confirm-delete-performance"
          @click="deletePerformance"
        >
          Delete the performance
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

      <template #footer>
        <UButton
          color="neutral"
          variant="ghost"
          @click="pricing = null"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
