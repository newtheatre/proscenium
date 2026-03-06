/**
 * Admin: Shows & Performances Page
 *
 * Administrative interface for managing shows and their performances.
 *
 * Features:
 * - Tree table: shows expand to reveal their performances (via UTable getSubRows)
 * - Multi-step show creation wizard (ShowCreateModal)
 * - Inline performance management per show
 * - Status badges for both show (DRAFT/PUBLISHED) and performance (DRAFT/ON_SALE/CANCELLED)
 * - Search/filter across shows
 *
 * Data Loading:
 * - GET /api/shows (includes nested performances with venue)
 *
 * Mutations:
 * - POST   /api/shows
 * - PUT    /api/shows/:id
 * - DELETE /api/shows/:id
 * - POST   /api/shows/:id/performances
 * - PUT    /api/shows/:id/performances/:performanceId
 * - DELETE /api/shows/:id/performances/:performanceId
 *
 * @route /admin/shows
 * @authenticated
 * @admin-only
 */
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Row } from '@tanstack/table-core'

const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UBadge = resolveComponent('UBadge')

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  title: 'Shows',
})

const toast = useToast()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = useTemplateRef<any>('table')

// ─── Types ───────────────────────────────────────────────────────────────────

interface Venue {
  id: string
  name: string
  capacity?: number | null
}

interface Performance {
  id: string
  showId: string
  venueId: string
  startsAt: number | string
  doorsAt?: number | string | null
  durationMinutes?: number | null
  intervalCount: number
  intervalMinutes?: number | null
  capacityOverride?: number | null
  status: 'DRAFT' | 'ON_SALE' | 'CANCELLED'
  notes?: string | null
  createdAt: string
  updatedAt: string
  venue?: Venue
  ticketTypeOverrideCount: number
  ticketsSold: number
  // Sub-row anchor — never present on real performance rows
  performances?: never
}

interface Show {
  id: string
  slug: string
  title: string
  subtitle?: string | null
  description?: string | null
  posterUrl?: string | null
  status: 'DRAFT' | 'PUBLISHED'
  createdAt: string
  updatedAt: string
  performances: Performance[]
  ticketTypeOverrideCount: number
}

type AnyRow = Show | Performance

// ─── Data ────────────────────────────────────────────────────────────────────

const globalFilter = ref('')
const { data, status, refresh } = await useFetch<Show[]>('/api/shows', { lazy: true })

// Collapsed by default — click chevrons or table header to expand
const expanded = ref<Record<string, boolean>>({})

// Sort by run (earliest performance date) descending = future shows first
const sorting = ref([{ id: 'run', desc: true }])

// ─── Modal state ─────────────────────────────────────────────────────────────

const showToEdit = ref<Show | null>(null)
const showToDelete = ref<Show | null>(null)
const showForTicketTypes = ref<Show | null>(null)
const performanceForTicketTypes = ref<Performance | null>(null)
const performanceForTicketTypesLabel = ref('')
const performanceForTicketTypesShowTitle = ref('')
const deleteShowModalOpen = ref(false)
const isDeletingShow = ref(false)

// addPerformanceToShow holds the full Show so we can pass showStatus to the create modal
const addPerformanceToShow = ref<Show | null>(null)
const performanceToEdit = ref<Performance | null>(null)
const performanceToDelete = ref<Performance | null>(null)
const deletePerformanceModalOpen = ref(false)
const isDeletingPerformance = ref(false)
const isCancellingPerformance = ref(false)

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatDate(val: number | string | null | undefined): string {
  if (!val) return '—'
  const d = new Date(typeof val === 'number' ? val * 1000 : val)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
}

// ─── Delete handlers ─────────────────────────────────────────────────────────

async function deleteShow() {
  if (!showToDelete.value) return
  isDeletingShow.value = true
  try {
    await $fetch(`/api/shows/${showToDelete.value.id}`, { method: 'DELETE' })
    toast.add({
      title: 'Show deleted',
      description: `"${showToDelete.value.title}" and all its performances have been removed`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    deleteShowModalOpen.value = false
    showToDelete.value = null
    await refresh()
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to delete show'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isDeletingShow.value = false
  }
}

async function deletePerformance() {
  if (!performanceToDelete.value) return
  isDeletingPerformance.value = true
  try {
    await $fetch(
      `/api/shows/${performanceToDelete.value.showId}/performances/${performanceToDelete.value.id}`,
      { method: 'DELETE' },
    )
    toast.add({
      title: 'Performance deleted',
      description: `${formatDate(performanceToDelete.value.startsAt)} has been removed`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    deletePerformanceModalOpen.value = false
    performanceToDelete.value = null
    await refresh()
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to delete performance'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isDeletingPerformance.value = false
  }
}

async function cancelPerformance(perf: Performance) {
  isCancellingPerformance.value = true
  try {
    await $fetch(`/api/shows/${perf.showId}/performances/${perf.id}`, {
      method: 'PUT',
      body: { status: 'CANCELLED' },
    })
    toast.add({ title: 'Performance cancelled', icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to cancel performance'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isCancellingPerformance.value = false
  }
}

async function reinstatePerformance(perf: Performance, showStatus: 'DRAFT' | 'PUBLISHED') {
  isCancellingPerformance.value = true
  try {
    await $fetch(`/api/shows/${perf.showId}/performances/${perf.id}`, {
      method: 'PUT',
      body: { status: showStatus === 'PUBLISHED' ? 'ON_SALE' : 'DRAFT' },
    })
    toast.add({ title: 'Performance reinstated', icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to reinstate performance'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isCancellingPerformance.value = false
  }
}

// ─── Row action menus ─────────────────────────────────────────────────────────

function getShowRowItems(show: Show) {
  return [
    { type: 'label' as const, label: 'Actions' },
    {
      label: 'Copy ID',
      icon: 'i-lucide-copy',
      onSelect() {
        navigator.clipboard.writeText(show.id)
        toast.add({ title: 'Copied to clipboard', description: 'Show ID copied' })
      },
    },
    { type: 'separator' as const },
    {
      label: 'Edit show',
      icon: 'i-lucide-pencil',
      onSelect() { showToEdit.value = show },
    },
    {
      label: 'Ticket types',
      icon: 'i-lucide-ticket',
      onSelect() { showForTicketTypes.value = show },
    },
    {
      label: 'Add performance',
      icon: 'i-lucide-calendar-plus',
      onSelect() { addPerformanceToShow.value = show },
    },
    { type: 'separator' as const },
    {
      label: 'Delete show',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect() {
        showToDelete.value = show
        deleteShowModalOpen.value = true
      },
    },
  ]
}

function getPerformanceRowItems(perf: Performance, showStatus: 'DRAFT' | 'PUBLISHED', perfIndex: number, showTitle: string) {
  return [
    { type: 'label' as const, label: 'Actions' },
    {
      label: 'Copy ID',
      icon: 'i-lucide-copy',
      onSelect() {
        navigator.clipboard.writeText(perf.id)
        toast.add({ title: 'Copied to clipboard', description: 'Performance ID copied' })
      },
    },
    { type: 'separator' as const },
    {
      label: 'Edit performance',
      icon: 'i-lucide-pencil',
      onSelect() { performanceToEdit.value = perf },
    },
    {
      label: 'Ticket types',
      icon: 'i-lucide-ticket',
      onSelect() {
        performanceForTicketTypes.value = perf
        performanceForTicketTypesLabel.value = `Performance ${perfIndex + 1}`
        performanceForTicketTypesShowTitle.value = showTitle
      },
    },
    perf.status !== 'CANCELLED'
      ? {
          label: 'Cancel performance',
          icon: 'i-lucide-ban',
          color: 'error' as const,
          onSelect() { cancelPerformance(perf) },
        }
      : {
          label: 'Reinstate performance',
          icon: 'i-lucide-rotate-ccw',
          onSelect() { reinstatePerformance(perf, showStatus) },
        },
    { type: 'separator' as const },
    {
      label: 'Delete performance',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect() {
        performanceToDelete.value = perf
        deletePerformanceModalOpen.value = true
      },
    },
  ]
}

// ─── Column definitions ───────────────────────────────────────────────────────

const columns: TableColumn<AnyRow>[] = [
  {
    id: 'title',
    header: 'Show / Performance',
    cell: ({ row }) => {
      const isShow = row.depth === 0
      const original = row.original

      if (isShow) {
        const show = original as Show
        const children = [
          h(UButton, {
            color: 'neutral',
            variant: 'ghost',
            size: 'xs',
            square: true,
            icon: row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right',
            'aria-label': row.getIsExpanded() ? 'Collapse' : 'Expand',
            class: row.getCanExpand() ? '' : 'invisible',
            onClick: row.getToggleExpandedHandler(),
          }),
          h('div', { class: 'flex-1 min-w-0' }, [
            h('div', { class: 'flex items-center gap-2 flex-wrap' }, [
              h('p', { class: 'font-semibold text-highlighted' }, show.title),
              show.ticketTypeOverrideCount > 0
                ? h(UBadge, { label: 'Ticket overrides', color: 'warning', variant: 'subtle', size: 'sm' })
                : null,
            ]),
            show.subtitle
              ? h('p', { class: 'text-xs text-muted' }, show.subtitle)
              : null,
          ]),
        ]
        return h('div', { class: 'flex items-center gap-2' }, children)
      }

      // Performance row
      const perf = original as Performance
      const perfNum = `Performance ${row.index + 1}`
      const dateStr = formatDate(perf.startsAt)
      return h(
        'div',
        { class: 'flex items-center gap-2 pl-8' },
        [
          h(UButton, {
            color: 'neutral',
            variant: 'ghost',
            size: 'xs',
            square: true,
            icon: 'i-lucide-calendar',
            class: 'pointer-events-none text-muted shrink-0',
          }),
          h('div', { class: 'flex-1 min-w-0' }, [
            h('div', { class: 'flex items-center gap-2 flex-wrap' }, [
              h('p', { class: 'font-medium text-highlighted text-sm' }, perfNum),
              perf.ticketTypeOverrideCount > 0
                ? h(UBadge, { label: 'Ticket overrides', color: 'warning', variant: 'subtle', size: 'sm' })
                : null,
            ]),
            h('p', { class: 'text-xs text-muted' }, dateStr),
          ]),
        ],
      )
    },
  },
  {
    id: 'venue',
    header: 'Venue',
    cell: ({ row }) => {
      if (row.depth === 0) return null
      const perf = row.original as Performance
      return h('span', { class: 'text-sm text-highlighted' }, perf.venue?.name ?? '—')
    },
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const isShow = row.depth === 0

      if (isShow) {
        const show = row.original as Show
        const colorMap = { DRAFT: 'neutral', PUBLISHED: 'success' } as const
        return h(UBadge, {
          label: show.status === 'DRAFT' ? 'Draft' : 'Published',
          color: colorMap[show.status],
          variant: 'subtle',
        })
      }

      const perf = row.original as Performance
      const colorMap = {
        DRAFT: 'neutral',
        ON_SALE: 'success',
        CANCELLED: 'error',
      } as const
      const labelMap = {
        DRAFT: 'Draft',
        ON_SALE: 'On sale',
        CANCELLED: 'Cancelled',
      }
      return h(UBadge, {
        label: labelMap[perf.status],
        color: colorMap[perf.status],
        variant: 'subtle',
      })
    },
  },
  {
    id: 'run',
    header: 'Run',
    enableSorting: true,
    // Return earliest performance timestamp (ms) for sorting; 0 for shows with no performances
    accessorFn: (row: AnyRow) => {
      if ((row as Performance).showId) return undefined // skip performance rows
      const show = row as Show
      const perfs = show.performances ?? []
      if (perfs.length === 0) return 0
      const times = perfs
        .map(p => (typeof p.startsAt === 'number' ? p.startsAt * 1000 : new Date(p.startsAt).getTime()))
        .filter(t => !Number.isNaN(t))
      return times.length ? Math.min(...times) : 0
    },
    cell: ({ row }) => {
      if (row.depth !== 0) return null
      const show = row.original as Show
      const perfs = show.performances ?? []
      if (perfs.length === 0) {
        return h('span', { class: 'text-sm text-muted' }, 'No performances')
      }
      const times = perfs
        .map(p => (typeof p.startsAt === 'number' ? p.startsAt * 1000 : new Date(p.startsAt).getTime()))
        .filter(t => !Number.isNaN(t))
        .sort((a, b) => a - b)
      const first = times[0]
      const last = times[times.length - 1]
      const fmt = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      return h('div', undefined, [
        h('p', { class: 'text-sm text-highlighted' }, fmt(first!)),
        first !== last
          ? h('p', { class: 'text-xs text-muted' }, `– ${fmt(last!)} · ${perfs.length} ${perfs.length === 1 ? 'performance' : 'performances'}`)
          : h('p', { class: 'text-xs text-muted' }, '1 performance'),
      ])
    },
  },
  {
    id: 'tickets',
    header: 'Tickets',
    cell: ({ row }) => {
      const isShow = row.depth === 0

      if (isShow) {
        const show = row.original as Show
        const perfs = show.performances ?? []
        if (perfs.length === 0) return null

        const totalSold = perfs.reduce((sum, p) => sum + (p.ticketsSold ?? 0), 0)
        const totalCapacity = perfs.reduce((sum, p) => {
          const cap = p.capacityOverride ?? p.venue?.capacity ?? null
          return cap !== null ? sum + cap : sum
        }, 0)
        const hasCapacity = perfs.some(p => (p.capacityOverride ?? p.venue?.capacity ?? null) !== null)

        return h('div', undefined, [
          h('p', { class: 'text-sm font-medium text-highlighted tabular-nums' }, `${totalSold} sold`),
          hasCapacity
            ? h('p', { class: 'text-xs text-muted tabular-nums' }, `of ${totalCapacity} total capacity`)
            : null,
        ])
      }

      // Performance row
      const perf = row.original as Performance
      const sold = perf.ticketsSold ?? 0
      const capacity = perf.capacityOverride ?? perf.venue?.capacity ?? null

      if (capacity !== null) {
        const remaining = capacity - sold
        const pct = Math.round((sold / capacity) * 100)
        const isSoldOut = remaining <= 0
        const isLow = !isSoldOut && remaining <= 10

        return h('div', { class: 'flex items-center gap-2' }, [
          h('div', { class: 'flex-1 min-w-0' }, [
            h('p', {
              class: `text-sm tabular-nums font-medium ${
                isSoldOut ? 'text-error' : isLow ? 'text-warning' : 'text-highlighted'
              }`,
            }, isSoldOut ? 'Sold out' : `${sold} / ${capacity}`),
            h('p', { class: 'text-xs text-muted tabular-nums' },
              isSoldOut ? `${capacity} capacity` : `${remaining} remaining`),
          ]),
          h('div', {
            class: 'w-12 h-1.5 rounded-full bg-default overflow-hidden shrink-0',
          }, [
            h('div', {
              class: `h-full rounded-full transition-all ${
                isSoldOut ? 'bg-error' : isLow ? 'bg-warning' : 'bg-primary'
              }`,
              style: { width: `${Math.min(pct, 100)}%` },
            }),
          ]),
        ])
      }

      return h('p', { class: 'text-sm tabular-nums text-highlighted' }, `${sold} sold`)
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const isShow = row.depth === 0
      let items
      if (isShow) {
        items = getShowRowItems(row.original as Show)
      }
      else {
        const perf = row.original as Performance
        const parentShow = data.value?.find(s => s.performances.some(p => p.id === perf.id))
        items = getPerformanceRowItems(perf, parentShow?.status ?? 'DRAFT', row.index, parentShow?.title ?? '')
      }

      return h(
        'div',
        { class: 'flex justify-end' },
        h(
          UDropdownMenu,
          {
            content: { align: 'end' },
            items,
          },
          () =>
            h(UButton, {
              color: 'neutral',
              variant: 'ghost',
              icon: 'i-lucide-ellipsis-vertical',
            }),
        ),
      )
    },
  },
]
</script>

<template>
  <div class="min-h-screen flex flex-col gap-4 p-6">
    <!-- Header -->
    <div class="flex w-full items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          Shows
        </h1>
        <p class="text-muted">
          Manage productions and their scheduled performances
        </p>
      </div>

      <ShowCreateModal @refresh="refresh" />
    </div>

    <!-- Toolbar -->
    <div class="flex gap-3">
      <UInput
        v-model="globalFilter"
        placeholder="Search shows..."
        icon="i-lucide-search"
        class="flex-1"
      />
    </div>

    <!-- Tree table: shows at depth 0, performances at depth 1 -->
    <UTable
      ref="table"
      v-model:expanded="expanded"
      v-model:global-filter="globalFilter"
      v-model:sorting="sorting"
      :data="data ?? []"
      :columns="columns"
      :get-sub-rows="(row: AnyRow) => (row as Show).performances as AnyRow[] | undefined"
      :loading="status === 'pending'"
      :ui="{
        base: 'border-separate border-spacing-0',
        tbody: '[&>tr]:last:[&>td]:border-b-0',
        tr: 'group',
        td: 'empty:p-0 group-has-[td:not(:empty)]:border-b border-default',
        thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
        th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
      }"
      class="shrink-0"
    />

    <p
      v-if="data?.length === 0 && status !== 'pending'"
      class="text-center text-muted py-12 text-sm"
    >
      No shows found. Create your first show to get started.
    </p>

    <!-- ── Modals ──────────────────────────────────────────────────────────── -->

    <ShowEditModal
      :show="showToEdit"
      @close="showToEdit = null"
      @refresh="() => { refresh(); showToEdit = null }"
    />

    <ShowTicketTypesModal
      :show="showForTicketTypes"
      @close="showForTicketTypes = null"
      @refresh="refresh"
    />

    <ShowPerformanceTicketTypesModal
      :performance="performanceForTicketTypes"
      :performance-label="performanceForTicketTypesLabel"
      :show-title="performanceForTicketTypesShowTitle"
      @close="performanceForTicketTypes = null"
      @refresh="refresh"
    />

    <ShowPerformanceCreateModal
      :show-id="addPerformanceToShow?.id ?? null"
      :show-status="addPerformanceToShow?.status"
      @close="addPerformanceToShow = null"
      @refresh="() => { refresh(); addPerformanceToShow = null }"
    />

    <ShowPerformanceEditModal
      :performance="performanceToEdit"
      @close="performanceToEdit = null"
      @refresh="() => { refresh(); performanceToEdit = null }"
    />

    <!-- Delete Show Confirmation -->
    <UModal
      v-model:open="deleteShowModalOpen"
      :title="`Delete '${showToDelete?.title ?? 'show'}'`"
      description="This will permanently delete the show and all its performances."
    >
      <template #body>
        <div class="space-y-4">
          <div class="p-3 rounded-md bg-error/10 border border-error/20 flex gap-2">
            <UIcon
              name="i-lucide-triangle-alert"
              class="text-error shrink-0 mt-0.5"
            />
            <div class="text-sm text-error">
              <p class="font-medium mb-1">
                This action cannot be undone.
              </p>
              <p>
                All {{ showToDelete?.performances?.length ?? 0 }} performance(s) will also be deleted.
              </p>
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="subtle"
              :disabled="isDeletingShow"
              @click="deleteShowModalOpen = false"
            />
            <UButton
              label="Delete show"
              color="error"
              :loading="isDeletingShow"
              @click="deleteShow"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete Performance Confirmation -->
    <UModal
      v-model:open="deletePerformanceModalOpen"
      title="Delete performance"
      :description="`Delete the performance on ${formatDate(performanceToDelete?.startsAt)}?`"
    >
      <template #body>
        <div class="space-y-4">
          <div class="p-3 rounded-md bg-error/10 border border-error/20 flex gap-2">
            <UIcon
              name="i-lucide-triangle-alert"
              class="text-error shrink-0 mt-0.5"
            />
            <p class="text-sm text-error">
              This action cannot be undone. Delete will be blocked if tickets have been issued for this performance.
            </p>
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="subtle"
              :disabled="isDeletingPerformance"
              @click="deletePerformanceModalOpen = false"
            />
            <UButton
              label="Delete performance"
              color="error"
              :loading="isDeletingPerformance"
              @click="deletePerformance"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
