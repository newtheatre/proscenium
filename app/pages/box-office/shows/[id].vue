<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { formatLondon, fromLondonWallClock } from '#shared/utils/london'
import {
  LATECOMER_POLICIES,
  PERFORMANCE_STATUSES,
  bookingWindowSource,
  performanceScreenForm,
  resolveBookingClosesHours,
  saysBookingWindow,
  saysLatecomerPolicy,
  saysPerformanceStatus,
  saysShowStatus,
  showForm,
} from '#shared/utils/programme'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'
import type { AdminPerformance, AdminShow, LatecomerPolicy, PerformanceStatus } from '#shared/utils/programme'
import type { ContentWarning, ShowContentWarning } from '#shared/utils/content-warnings'

definePageMeta({ layout: 'console', title: 'Show', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const route = useRoute()
const request = useRequestFetch()
const toast = useToast()
const id = computed(() => String(route.params.id))

interface Venue { id: string, name: string, capacity: number | null }
interface Detail {
  show: AdminShow
  performances: AdminPerformance[]
  venues: Venue[]
  warnings: ShowContentWarning[]
  vocabulary: ContentWarning[]
}

const failure = ref<string | null>(null)
const saving = ref(false)

const { data, error, refresh } = await useAsyncData(
  () => `box-office-show-${id.value}`,
  () => request<Detail>(`/api/admin/shows/${id.value}`),
)

const show = computed(() => data.value?.show ?? null)
const venues = computed(() => data.value?.venues ?? [])
const warnings = computed(() => data.value?.warnings ?? [])
const vocabulary = computed(() => data.value?.vocabulary ?? [])

const copy = reactive({
  title: '',
  slug: '',
  subtitle: '',
  description: '',
  longDescription: '',
  ageGuidance: '',
  latecomerPolicy: null as LatecomerPolicy | null,
  bookingClosesHoursBefore: null as number | null,
  // Carried through rather than edited: no story administers the category or season vocabulary,
  // and a full replace that dropped them would silently clear a seeded or imported show.
  categoryId: null as string | null,
  seasonId: null as string | null,
})

watchEffect(() => {
  const one = show.value
  if (!one) return
  Object.assign(copy, {
    title: one.title,
    slug: one.slug,
    subtitle: one.subtitle ?? '',
    description: one.description ?? '',
    longDescription: one.longDescription ?? '',
    ageGuidance: one.ageGuidance ?? '',
    latecomerPolicy: one.latecomerPolicy,
    bookingClosesHoursBefore: one.bookingClosesHoursBefore,
    categoryId: one.categoryId,
    seasonId: one.seasonId,
  })
})

const blank = (value: string): string | null => (value.trim() ? value.trim() : null)

async function saveCopy(): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/shows/${id.value}`, {
      method: 'PUT',
      body: {
        title: copy.title.trim(),
        slug: copy.slug.trim(),
        subtitle: blank(copy.subtitle),
        description: blank(copy.description),
        longDescription: blank(copy.longDescription),
        ageGuidance: blank(copy.ageGuidance),
        latecomerPolicy: copy.latecomerPolicy,
        bookingClosesHoursBefore: copy.bookingClosesHoursBefore,
        categoryId: copy.categoryId,
        seasonId: copy.seasonId,
      },
    })
    toast.add({ title: 'Show changed', icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const publishing = ref(false)
const cascade = ref(true)

async function setPublished(published: boolean): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    const answer = await $fetch<{ performancesTakenOnSale: number }>(`/api/admin/shows/${id.value}/publish`, {
      method: 'POST',
      body: { published, cascadePerformances: published && cascade.value },
    })
    toast.add({
      title: published ? 'Show published' : 'Show taken off the public site',
      description: published
        ? `${plural(answer.performancesTakenOnSale, 'performance', 'performances')} put on sale.`
        : 'Sales are closed. Nothing sold has been touched.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    publishing.value = false
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const removingShow = ref(false)

async function deleteShow(): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/shows/${id.value}`, { method: 'DELETE' })
    toast.add({ title: 'Show deleted', icon: 'i-lucide-check', color: 'success' })
    await navigateTo('/box-office/shows')
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const search = ref('')
const performanceStatus = ref<PerformanceStatus | 'ALL'>('ALL')

const performances = computed(() => (data.value?.performances ?? []).filter((one) => {
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
  notes: '',
})

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
    venueId: one?.venueId ?? venues.value[0]?.id ?? '',
    day: one ? dayOf(one.startsAt) : '',
    clock: one ? clockOf(one.startsAt) : '19:30',
    doorsClock: one?.doorsAt ? clockOf(one.doorsAt) : '',
    durationMinutes: one?.durationMinutes ?? null,
    intervalCount: one?.intervalCount ?? 0,
    intervalMinutes: one?.intervalMinutes ?? null,
    capacityOverride: one?.capacityOverride ?? null,
    bookingClosesHoursBefore: one?.bookingClosesHoursBefore ?? null,
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
    notes: blank(form.notes),
  }
  try {
    if (editingPerformance.value) {
      await $fetch(`/api/admin/performances/${editingPerformance.value.id}`, { method: 'PUT', body })
    }
    else {
      await $fetch(`/api/admin/shows/${id.value}/performances`, { method: 'POST', body })
    }
    toast.add({
      title: editingPerformance.value ? 'Performance changed' : 'Performance added',
      description: editingPerformance.value ? undefined : 'It is off sale until you put it on sale, or publish the show.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    performanceOpen.value = false
    await refresh()
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
    await refresh()
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
    await refresh()
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
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const loadFailure = computed(() => (error.value ? refusalText(error.value, 'The show could not be read.') : null))

const policyOptions = [
  { label: saysLatecomerPolicy(null), value: null },
  ...LATECOMER_POLICIES.map(one => ({ label: saysLatecomerPolicy(one), value: one })),
]

const venueOptions = computed(() => venues.value.map(one => ({ label: one.name, value: one.id })))

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
  const inherited = { bookingClosesHoursBefore: show.value?.bookingClosesHoursBefore ?? null }
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
      const capacity = row.original.capacityOverride ?? row.original.venueCapacity
      return h('span', { class: 'text-sm' }, capacity === null ? 'Uncapped' : `${capacity}`)
    },
  },
  {
    id: 'sold',
    header: 'Sold',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, `${row.original.soldTickets}`),
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
      v-if="loadFailure"
      data-test="load-failure"
      color="error"
      variant="subtle"
      :description="loadFailure"
    />

    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <template v-if="show">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">
            {{ show.title }}
          </h2>
          <p class="text-sm text-muted">
            /shows/{{ show.slug }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :color="show.status === 'PUBLISHED' ? 'success' : 'neutral'"
            variant="subtle"
            data-test="show-status"
          >
            {{ saysShowStatus(show.status) }}
          </UBadge>
          <UButton
            v-if="show.status === 'DRAFT'"
            data-test="publish"
            icon="i-lucide-globe"
            @click="publishing = true"
          >
            Publish
          </UButton>
          <UButton
            v-else
            color="neutral"
            variant="outline"
            data-test="unpublish"
            @click="setPublished(false)"
          >
            Take off the site
          </UButton>
          <UButton
            v-if="show.soldTickets === 0"
            color="error"
            variant="ghost"
            data-test="delete-show"
            @click="removingShow = true"
          >
            Delete
          </UButton>
        </div>
      </div>

      <UCard>
        <UForm
          :schema="showForm"
          :state="copy"
          class="space-y-4"
          data-test="show-copy"
          @submit="saveCopy"
        >
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Title"
              name="title"
              required
            >
              <UInput
                v-model="copy.title"
                class="w-full"
                data-test="copy-title"
              />
            </UFormField>

            <UFormField
              label="Address"
              name="slug"
              required
              description="The public page is /shows/ and this."
            >
              <UInput
                v-model="copy.slug"
                class="w-full"
                data-test="copy-slug"
              />
            </UFormField>
          </div>

          <UFormField
            label="Subtitle"
            name="subtitle"
            hint="Optional"
          >
            <UInput
              v-model="copy.subtitle"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Short description"
            name="description"
            hint="Optional"
            description="What the listing shows beside the poster."
          >
            <UTextarea
              v-model="copy.description"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Full description"
            name="longDescription"
            hint="Optional"
          >
            <UTextarea
              v-model="copy.longDescription"
              :rows="5"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField
              label="Age guidance"
              name="ageGuidance"
              hint="Optional"
            >
              <UInput
                v-model="copy.ageGuidance"
                class="w-full"
                data-test="copy-age"
              />
            </UFormField>

            <UFormField
              label="Latecomers"
              name="latecomerPolicy"
            >
              <USelect
                v-model="copy.latecomerPolicy"
                :items="policyOptions"
                class="w-full"
                data-test="copy-latecomers"
              />
            </UFormField>

            <UFormField
              label="Online booking closes"
              name="bookingClosesHoursBefore"
              description="Hours before curtain. Every performance inherits this unless it states its own. Leave it empty for curtain-up."
            >
              <UInputNumber
                v-model="copy.bookingClosesHoursBefore"
                :min="0"
                :max="720"
                class="w-full"
                data-test="copy-window"
              />
            </UFormField>
          </div>

          <UButton
            type="submit"
            :loading="saving"
            data-test="copy-submit"
          >
            Save the show
          </UButton>
        </UForm>
      </UCard>

      <ShowWarnings
        :show-id="show.id"
        :warnings="warnings"
        :vocabulary="vocabulary"
        :confirmed-none="show.warningsConfirmedNone"
        @saved="refresh()"
      />

      <TicketPrices
        level="show"
        :endpoint="`/api/admin/shows/${show.id}/prices`"
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
            :disabled="venues.length === 0"
            @click="editPerformance(null)"
          >
            Add a performance
          </UButton>
        </template>
      </AdminToolbar>

      <UTable
        :data="performances"
        :columns="columns"
        data-test="performances-table"
      >
        <template #empty>
          <p class="py-6 text-center text-sm text-muted">
            {{ search || performanceStatus !== 'ALL' ? 'No performance matches that.' : 'No performances yet. Add one, and it waits off sale until you say otherwise.' }}
          </p>
        </template>
      </UTable>
    </template>

    <UModal
      v-model:open="publishing"
      title="Publish this show"
      description="The public page goes live. Performances still off sale can go on sale with it."
    >
      <template #body>
        <div class="space-y-4">
          <USwitch
            v-model="cascade"
            label="Put its performances on sale too"
            description="Cancelled performances are left alone."
            data-test="cascade"
          />
          <UButton
            :loading="saving"
            data-test="confirm-publish"
            @click="setPublished(true)"
          >
            Publish it
          </UButton>
        </div>
      </template>
    </UModal>

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
          </div>

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

    <UModal
      v-model:open="removingShow"
      title="Delete this show"
      description="Nothing has ever been sold under it, so there is no history to keep. Its performances and prices go with it."
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
          data-test="confirm-delete-show"
          @click="deleteShow"
        >
          Delete it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="removingShow = false"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
