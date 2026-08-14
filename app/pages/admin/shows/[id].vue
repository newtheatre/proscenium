<!--
  Admin: one show.

  Everything about a production on one page, in sections: what it is, what is
  written about it, when it is on, and how to get rid of it.

  It also closes a data-loss hole. The list page used to open the editor with the
  *list row*, which is a column projection — so five fields the form could write
  were never read, and saving a title change wrote nulls over them. Editing
  starts here now, from a record fetched in full, and those five fields are on
  screen where a wipe would be obvious. See docs/09-known-issues.md.

  @route /admin/shows/:id
  @admin-only
-->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { PerformanceListItem, ShowDetail } from '~~/shared/types/shows'

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  title: 'Show',
})

const route = useRoute()
const toast = useToast()
const showId = computed(() => String(route.params.id))

const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UBadge = resolveComponent('UBadge')

const requestFetch = useRequestFetch()
const { data: show, status, error, refresh } = await useAsyncData(
  () => `admin-show-${showId.value}`,
  () => requestFetch<ShowDetail>(`/api/shows/${showId.value}`),
  { watch: [showId] },
)

// The layout's navbar renders `route.meta.title` as the page's only <h1>, so the
// show's name belongs there rather than in a second heading below it.
watchEffect(() => {
  route.meta.title = show.value?.title ?? 'Show'
})

const actions = useShowActions(async () => {
  await refresh()
})

async function deleteShow() {
  if (!show.value) return
  const before = show.value.id
  await actions.deleteShow(show.value)
  // A successful delete leaves nothing to render, so leave.
  if (!show.value || show.value.id !== before) return
  await navigateTo('/admin/shows')
}

// ── Modals ───────────────────────────────────────────────────────────────────

const addPerformanceOpen = ref(false)
const performanceToEdit = ref<PerformanceListItem | null>(null)
const performanceForTicketTypes = ref<PerformanceListItem | null>(null)
const performanceForTicketTypesLabel = ref('')

const isPublishing = ref(false)

async function publish() {
  if (!show.value) return
  isPublishing.value = true
  try {
    await $fetch(`/api/shows/${show.value.id}`, { method: 'PUT', body: { status: 'PUBLISHED' } })
    toast.add({ title: 'Show published', icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (err: unknown) {
    toast.add({
      title: 'Could not publish this show',
      description: getErrorMessage(err, 'Please try again'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isPublishing.value = false
  }
}

// ── Derived ──────────────────────────────────────────────────────────────────

const performances = computed<PerformanceListItem[]>(() => show.value?.performances ?? [])

const runSummary = computed(() => {
  const first = show.value?.firstPerformanceAt
  const last = show.value?.lastPerformanceAt
  if (!first) return 'No performances scheduled'
  const count = performances.value.length
  const range = first === last ? formatDate(first) : `${formatDate(first)} – ${formatDate(last)}`
  return `${range} · ${count} performance${count === 1 ? '' : 's'}`
})

const totals = computed(() => {
  let sold = 0
  let capacity = 0
  let hasCapacity = false
  for (const performance of performances.value) {
    sold += performance.ticketsSold ?? 0
    const seats = performance.capacityOverride ?? performance.venue?.capacity ?? null
    if (seats !== null) {
      capacity += seats
      hasCapacity = true
    }
  }
  return { sold, capacity, hasCapacity }
})

const breadcrumb = computed(() => [
  { label: 'Shows', to: '/admin/shows', icon: 'i-lucide-calendar' },
  { label: show.value?.title ?? 'Show' },
])

const PERFORMANCE_STATUS = {
  DRAFT: { label: 'Draft', color: 'neutral' },
  ON_SALE: { label: 'On sale', color: 'success' },
  CANCELLED: { label: 'Cancelled', color: 'error' },
} as const

function performanceRowItems(performance: PerformanceListItem, index: number) {
  const showStatus = show.value?.status ?? 'DRAFT'
  return [
    { type: 'label' as const, label: 'Actions' },
    {
      label: 'Copy ID',
      icon: 'i-lucide-copy',
      onSelect() {
        navigator.clipboard.writeText(performance.id)
        toast.add({ title: 'Copied to clipboard', description: 'Performance ID copied' })
      },
    },
    { type: 'separator' as const },
    {
      label: 'Edit performance',
      icon: 'i-lucide-pencil',
      onSelect() { performanceToEdit.value = performance },
    },
    {
      label: 'Ticket types',
      icon: 'i-lucide-ticket',
      onSelect() {
        performanceForTicketTypes.value = performance
        performanceForTicketTypesLabel.value = `Performance ${index + 1}`
      },
    },
    performance.status !== 'CANCELLED'
      ? {
          label: 'Cancel performance',
          icon: 'i-lucide-ban',
          color: 'error' as const,
          onSelect() { actions.cancelPerformance(performance) },
        }
      : {
          label: 'Reinstate performance',
          icon: 'i-lucide-rotate-ccw',
          onSelect() { actions.reinstatePerformance(performance, showStatus) },
        },
    { type: 'separator' as const },
    {
      label: 'Delete performance',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect() { actions.deletePerformance(performance) },
    },
  ]
}

const performanceColumns: TableColumn<PerformanceListItem>[] = [
  {
    id: 'when',
    header: 'When',
    cell: ({ row }) => h('div', undefined, [
      h('p', { class: 'font-medium text-highlighted text-sm' }, `Performance ${row.index + 1}`),
      h('p', { class: 'text-xs text-muted' }, formatDateTime(row.original.startsAt)),
    ]),
  },
  {
    id: 'venue',
    header: 'Venue',
    cell: ({ row }) => h('span', { class: 'text-sm text-highlighted' }, row.original.venue?.name ?? '—'),
  },
  {
    id: 'doors',
    header: 'Doors',
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, formatTime(row.original.doorsAt)),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const config = PERFORMANCE_STATUS[row.original.status]
      return h(UBadge, { label: config.label, color: config.color, variant: 'subtle' })
    },
  },
  {
    id: 'tickets',
    header: 'Tickets',
    cell: ({ row }) => {
      const sold = row.original.ticketsSold ?? 0
      const capacity = row.original.capacityOverride ?? row.original.venue?.capacity ?? null
      if (capacity === null) {
        return h('span', { class: 'text-sm tabular-nums text-highlighted' }, `${sold} sold`)
      }
      const remaining = capacity - sold
      const soldOut = remaining <= 0
      const low = !soldOut && remaining <= 10
      return h('div', undefined, [
        h('p', {
          class: `text-sm tabular-nums font-medium ${soldOut ? 'text-error' : low ? 'text-warning' : 'text-highlighted'}`,
        }, soldOut ? 'Sold out' : `${sold} / ${capacity}`),
        h('p', { class: 'text-xs text-muted tabular-nums' },
          soldOut ? `${capacity} capacity` : `${remaining} remaining`),
      ])
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => h('div', { class: 'flex justify-end' },
      h(UDropdownMenu, {
        content: { align: 'end' },
        items: performanceRowItems(row.original, row.index),
      }, () => h(UButton, { color: 'neutral', variant: 'ghost', icon: 'i-lucide-ellipsis-vertical' })),
    ),
  },
]
</script>

<template>
  <AdminPage>
    <UBreadcrumb :items="breadcrumb" />

    <AdminFetchError
      v-if="error"
      :error="error"
      title="Could not load this show"
      :on-retry="refresh"
    />

    <div
      v-else-if="status === 'pending' && !show"
      class="flex items-center justify-center py-20"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-8 animate-spin text-primary"
      />
    </div>

    <template v-else-if="show">
      <!-- ── Header ─────────────────────────────────────────────────────── -->
      <section class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex gap-4 min-w-0">
          <img
            v-if="show.posterUrl"
            :src="`/images/${show.posterUrl}`"
            :alt="`Poster for ${show.title}`"
            class="w-20 h-28 rounded-md object-cover border border-default shrink-0"
          >
          <div
            v-else
            class="w-20 h-28 rounded-md border border-dashed border-default flex items-center justify-center text-muted shrink-0"
          >
            <UIcon
              name="i-lucide-image"
              class="size-6"
            />
          </div>

          <div class="min-w-0 space-y-1">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="text-xl font-semibold text-highlighted">
                {{ show.title }}
              </p>
              <UBadge
                :label="show.status === 'DRAFT' ? 'Draft' : 'Published'"
                :color="show.status === 'DRAFT' ? 'neutral' : 'success'"
                variant="subtle"
              />
              <UBadge
                v-if="show.ticketTypeOverrideCount > 0"
                :label="`${show.ticketTypeOverrideCount} ticket override${show.ticketTypeOverrideCount === 1 ? '' : 's'}`"
                color="warning"
                variant="subtle"
                size="sm"
              />
            </div>
            <p
              v-if="show.subtitle"
              class="text-muted"
            >
              {{ show.subtitle }}
            </p>
            <p class="text-sm text-muted">
              {{ runSummary }}
            </p>
            <p class="text-sm text-muted tabular-nums">
              {{ totals.sold }} sold<template v-if="totals.hasCapacity">
                of {{ totals.capacity }} seats
              </template>
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            v-if="show.status === 'DRAFT'"
            label="Publish"
            icon="i-lucide-badge-check"
            color="primary"
            variant="soft"
            :loading="isPublishing"
            @click="publish"
          />
          <UButton
            v-else
            :to="`/whats-on/${show.slug}`"
            external
            target="_blank"
            label="View public page"
            icon="i-lucide-external-link"
            color="neutral"
            variant="outline"
          />
        </div>
      </section>

      <AdminShowsDetailsSection
        :show="show"
        @refresh="refresh"
      />

      <AdminShowsContentWarningsSection
        :show="show"
        @refresh="refresh"
      />

      <AdminShowsTicketTypesSection
        :show-id="show.id"
        @refresh="refresh"
      />

      <!-- ── Performances ───────────────────────────────────────────────── -->
      <section class="space-y-3">
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">
            Performances
          </h2>
          <UButton
            label="Add performance"
            icon="i-lucide-calendar-plus"
            color="neutral"
            variant="outline"
            size="sm"
            @click="addPerformanceOpen = true"
          />
        </div>

        <UTable
          :data="performances"
          :columns="performanceColumns"
          :loading="status === 'pending'"
          class="shrink-0"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-calendar-plus"
              title="No performances scheduled"
              description="Add one to start selling tickets for this show."
            />
          </template>
        </UTable>
      </section>

      <!-- ── Danger zone ────────────────────────────────────────────────── -->
      <section class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">
          Danger zone
        </h2>
        <UCard :ui="{ root: 'ring-error/30' }">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p class="font-medium text-highlighted">
                Delete this show
              </p>
              <p class="text-sm text-muted">
                Removes the show and all
                {{ performances.length }} of its performances. This cannot be undone.
              </p>
            </div>
            <UButton
              label="Delete show"
              icon="i-lucide-trash"
              color="error"
              variant="soft"
              :loading="actions.busy.value"
              @click="deleteShow"
            />
          </div>
        </UCard>
      </section>

      <!-- ── Modals ─────────────────────────────────────────────────────── -->

      <ShowPerformanceCreateModal
        :show-id="addPerformanceOpen ? show.id : null"
        :show-status="show.status"
        @close="addPerformanceOpen = false"
        @refresh="() => { refresh(); addPerformanceOpen = false }"
      />

      <ShowPerformanceEditModal
        :performance="performanceToEdit"
        @close="performanceToEdit = null"
        @refresh="() => { refresh(); performanceToEdit = null }"
      />

      <ShowPerformanceTicketTypesModal
        :performance="performanceForTicketTypes"
        :performance-label="performanceForTicketTypesLabel"
        :show-title="show.title"
        @close="performanceForTicketTypes = null"
        @refresh="refresh"
      />
    </template>
  </AdminPage>
</template>
