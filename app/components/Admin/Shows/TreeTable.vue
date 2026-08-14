<!--
  Shows over their performances: shows at depth 0, each show's performances as
  sub-rows at depth 1.

  Lifted out of the 798-line shows page so all three tabs — now & next, drafts,
  archive — render the same table with the same row actions, and so the page
  itself is about fetching and tabs rather than about `h()` calls.
-->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type {
  PerformanceListItem,
  ShowListItem,
  ShowRowAction,
  ShowTreeRow,
} from '~~/shared/types/shows'

const props = withDefaults(defineProps<{
  /**
   * Must be a caller-owned `computed` or `ref`, never an expression built in the
   * template. UTable rebuilds its TanStack row models whenever `data` changes
   * identity, and rebuilding writes back through the `v-model:` bindings, which
   * re-renders the parent — an expression that allocates per render has no fixed
   * point and locks the tab. See docs/02-architecture.md.
   */
  rows: ShowListItem[]
  loading?: boolean
  /** Expand every show on mount. Sensible for a handful of current shows, not for an archive page. */
  expandByDefault?: boolean
  emptyIcon?: string
  emptyTitle?: string
  emptyDescription?: string
}>(), {
  loading: false,
  expandByDefault: false,
  emptyIcon: 'i-lucide-calendar',
  emptyTitle: 'No shows here',
  emptyDescription: undefined,
})

const emit = defineEmits<{ action: [ShowRowAction] }>()

const toast = useToast()
const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UBadge = resolveComponent('UBadge')

// Kept in the script rather than the template so the union type does not read as
// a Vue filter expression.
function getSubRows(row: ShowTreeRow): ShowTreeRow[] | undefined {
  return (row as ShowListItem).performances as ShowTreeRow[] | undefined
}

const expanded = ref<Record<string, boolean>>({})

watchEffect(() => {
  if (!props.expandByDefault) return
  const next: Record<string, boolean> = {}
  props.rows.forEach((_, index) => {
    next[index] = true
  })
  expanded.value = next
})

/**
 * performanceId → its show.
 *
 * Built once per data change, because the alternative is doing it per rendered
 * row: the actions column used to resolve a performance's parent by scanning
 * every show and every one of its performances, re-run by TanStack for each
 * performance row on every sort, expand and filter. That was over a million
 * comparisons per render at archive scale, on the main thread, and is what froze
 * the admin area. Pages are bounded now, but the shape of the fix is still
 * right and costs nothing.
 */
const showByPerformanceId = computed(() => {
  const map = new Map<string, ShowListItem>()
  for (const show of props.rows) {
    for (const performance of show.performances ?? []) map.set(performance.id, show)
  }
  return map
})

function copy(value: string, what: string) {
  navigator.clipboard.writeText(value)
  toast.add({ title: 'Copied to clipboard', description: `${what} copied` })
}

function showRowItems(show: ShowListItem) {
  return [
    { type: 'label' as const, label: 'Actions' },
    { label: 'Copy ID', icon: 'i-lucide-copy', onSelect: () => copy(show.id, 'Show ID') },
    { type: 'separator' as const },
    {
      label: 'Open',
      icon: 'i-lucide-arrow-right',
      onSelect: () => emit('action', { type: 'open-show', show }),
    },
    {
      label: 'Ticket types',
      icon: 'i-lucide-ticket',
      onSelect: () => emit('action', { type: 'show-ticket-types', show }),
    },
    {
      label: 'Add performance',
      icon: 'i-lucide-calendar-plus',
      onSelect: () => emit('action', { type: 'add-performance', show }),
    },
    { type: 'separator' as const },
    {
      label: 'Delete show',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect: () => emit('action', { type: 'delete-show', show }),
    },
  ]
}

function performanceRowItems(
  performance: PerformanceListItem,
  show: ShowListItem | undefined,
  index: number,
) {
  const showStatus = show?.status ?? 'DRAFT'
  return [
    { type: 'label' as const, label: 'Actions' },
    { label: 'Copy ID', icon: 'i-lucide-copy', onSelect: () => copy(performance.id, 'Performance ID') },
    { type: 'separator' as const },
    {
      label: 'Edit performance',
      icon: 'i-lucide-pencil',
      onSelect: () => emit('action', { type: 'edit-performance', performance }),
    },
    {
      label: 'Ticket types',
      icon: 'i-lucide-ticket',
      onSelect: () => emit('action', {
        type: 'performance-ticket-types',
        performance,
        label: `Performance ${index + 1}`,
        showTitle: show?.title ?? '',
      }),
    },
    performance.status !== 'CANCELLED'
      ? {
          label: 'Cancel performance',
          icon: 'i-lucide-ban',
          color: 'error' as const,
          onSelect: () => emit('action', { type: 'cancel-performance', performance, showStatus }),
        }
      : {
          label: 'Reinstate performance',
          icon: 'i-lucide-rotate-ccw',
          onSelect: () => emit('action', { type: 'reinstate-performance', performance, showStatus }),
        },
    { type: 'separator' as const },
    {
      label: 'Delete performance',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect: () => emit('action', { type: 'delete-performance', performance }),
    },
  ]
}

const SHOW_STATUS = {
  DRAFT: { label: 'Draft', color: 'neutral' },
  PUBLISHED: { label: 'Published', color: 'success' },
} as const

const PERFORMANCE_STATUS = {
  DRAFT: { label: 'Draft', color: 'neutral' },
  ON_SALE: { label: 'On sale', color: 'success' },
  CANCELLED: { label: 'Cancelled', color: 'error' },
} as const

const columns: TableColumn<ShowTreeRow>[] = [
  {
    id: 'title',
    header: 'Show / Performance',
    cell: ({ row }) => {
      if (row.depth === 0) {
        const show = row.original as ShowListItem
        return h('div', { class: 'flex items-center gap-2' }, [
          h(UButton, {
            'color': 'neutral',
            'variant': 'ghost',
            'size': 'xs',
            'square': true,
            'icon': row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right',
            'aria-label': row.getIsExpanded() ? 'Collapse' : 'Expand',
            'class': row.getCanExpand() ? '' : 'invisible',
            'onClick': row.getToggleExpandedHandler(),
          }),
          h('div', { class: 'flex-1 min-w-0' }, [
            h('div', { class: 'flex items-center gap-2 flex-wrap' }, [
              h('button', {
                class: 'font-semibold text-highlighted text-left hover:text-primary transition-colors',
                onClick: () => emit('action', { type: 'open-show', show }),
              }, show.title),
              show.ticketTypeOverrideCount > 0
                ? h(UBadge, { label: 'Ticket overrides', color: 'warning', variant: 'subtle', size: 'sm' })
                : null,
            ]),
            show.subtitle ? h('p', { class: 'text-xs text-muted' }, show.subtitle) : null,
          ]),
        ])
      }

      const performance = row.original as PerformanceListItem
      return h('div', { class: 'flex items-center gap-2 pl-8' }, [
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
            h('p', { class: 'font-medium text-highlighted text-sm' }, `Performance ${row.index + 1}`),
            performance.ticketTypeOverrideCount > 0
              ? h(UBadge, { label: 'Ticket overrides', color: 'warning', variant: 'subtle', size: 'sm' })
              : null,
          ]),
          h('p', { class: 'text-xs text-muted' }, formatDateTime(performance.startsAt)),
        ]),
      ])
    },
  },
  {
    id: 'venue',
    header: 'Venue',
    cell: ({ row }) => {
      if (row.depth === 0) return null
      const performance = row.original as PerformanceListItem
      return h('span', { class: 'text-sm text-highlighted' }, performance.venue?.name ?? '—')
    },
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const config = row.depth === 0
        ? SHOW_STATUS[(row.original as ShowListItem).status]
        : PERFORMANCE_STATUS[(row.original as PerformanceListItem).status]
      return h(UBadge, { label: config.label, color: config.color, variant: 'subtle' })
    },
  },
  {
    id: 'run',
    header: 'Run',
    cell: ({ row }) => {
      if (row.depth !== 0) return null
      const show = row.original as ShowListItem
      if (!show.firstPerformanceAt) {
        return h('span', { class: 'text-sm text-muted' }, 'No performances')
      }
      const count = show.performanceCount ?? show.performances.length
      const sameDay = show.firstPerformanceAt === show.lastPerformanceAt
      return h('div', undefined, [
        h('p', { class: 'text-sm text-highlighted' }, formatDate(show.firstPerformanceAt)),
        h('p', { class: 'text-xs text-muted' }, sameDay
          ? `${count} performance${count === 1 ? '' : 's'}`
          : `– ${formatDate(show.lastPerformanceAt)} · ${count} performance${count === 1 ? '' : 's'}`),
      ])
    },
  },
  {
    id: 'tickets',
    header: 'Tickets',
    cell: ({ row }) => {
      if (row.depth === 0) {
        const show = row.original as ShowListItem
        const performances = show.performances ?? []
        if (performances.length === 0) return null

        const sold = performances.reduce((total, p) => total + (p.ticketsSold ?? 0), 0)
        const capacity = performances.reduce((total, p) => {
          const seats = p.capacityOverride ?? p.venue?.capacity ?? null
          return seats === null ? total : total + seats
        }, 0)
        const hasCapacity = performances.some(p => (p.capacityOverride ?? p.venue?.capacity ?? null) !== null)

        return h('div', undefined, [
          h('p', { class: 'text-sm font-medium text-highlighted tabular-nums' }, `${sold} sold`),
          hasCapacity
            ? h('p', { class: 'text-xs text-muted tabular-nums' }, `of ${capacity} total capacity`)
            : null,
        ])
      }

      const performance = row.original as PerformanceListItem
      const sold = performance.ticketsSold ?? 0
      const capacity = performance.capacityOverride ?? performance.venue?.capacity ?? null
      if (capacity === null) {
        return h('p', { class: 'text-sm tabular-nums text-highlighted' }, `${sold} sold`)
      }

      const remaining = capacity - sold
      const soldOut = remaining <= 0
      const low = !soldOut && remaining <= 10
      const tone = soldOut ? 'error' : low ? 'warning' : 'primary'

      return h('div', { class: 'flex items-center gap-2' }, [
        h('div', { class: 'flex-1 min-w-0' }, [
          h('p', {
            class: `text-sm tabular-nums font-medium ${soldOut ? 'text-error' : low ? 'text-warning' : 'text-highlighted'}`,
          }, soldOut ? 'Sold out' : `${sold} / ${capacity}`),
          h('p', { class: 'text-xs text-muted tabular-nums' },
            soldOut ? `${capacity} capacity` : `${remaining} remaining`),
        ]),
        h('div', { class: 'w-12 h-1.5 rounded-full bg-default overflow-hidden shrink-0' }, [
          h('div', {
            class: `h-full rounded-full transition-all bg-${tone}`,
            style: { width: `${Math.min(Math.round((sold / capacity) * 100), 100)}%` },
          }),
        ]),
      ])
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const items = row.depth === 0
        ? showRowItems(row.original as ShowListItem)
        : performanceRowItems(
            row.original as PerformanceListItem,
            showByPerformanceId.value.get((row.original as PerformanceListItem).id),
            row.index,
          )

      return h('div', { class: 'flex justify-end' },
        h(UDropdownMenu, { content: { align: 'end' }, items }, () =>
          h(UButton, { color: 'neutral', variant: 'ghost', icon: 'i-lucide-ellipsis-vertical' }),
        ),
      )
    },
  },
]
</script>

<template>
  <UTable
    v-model:expanded="expanded"
    :data="rows"
    :columns="columns"
    :get-sub-rows="getSubRows"
    :loading="loading"
    :ui="{
      // Only what the tree needs on top of the shared table theme in
      // app.config.ts: a row-group rule so a performance row's empty cells do
      // not draw a rule across the table.
      tr: 'group',
      td: 'empty:p-0 group-has-[td:not(:empty)]:border-b border-default',
    }"
    class="shrink-0"
  >
    <template #empty>
      <UEmpty
        :icon="emptyIcon"
        :title="emptyTitle"
        :description="emptyDescription"
      />
    </template>
  </UTable>
</template>
