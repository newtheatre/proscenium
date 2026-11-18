<!-- The List page type (UI-11): title, primary action, one filter bar, a table on a laptop and cards
     on a phone, paging with a stated total, export of what is filtered, bulk actions once rows are
     selected. Filters, sort and page live in the address, so a filtered list is a link and Back
     returns to it. A module supplies columns, filters, row actions and the data route. -->
<script setup lang="ts" generic="Row extends Record<string, any>">
import type { DropdownMenuItem, TableColumn, TableRow } from '@nuxt/ui'
import { activeFilterCount, filterChipText, listDefaults, type ColumnDef, type FilterDef, type ListDeclaration, type ListOption, type ListResult, type SortDef } from '../../shared/list'

/** The older, flatter way a page names its columns and filters; it is read as a declaration. */
export interface ListColumn { key: string, label: string, sortable?: boolean, /** What it sorts, which words its directions ("Lowest first"). Text by default. */ sortType?: SortDef['type'], /** Survives on a phone's card. */ card?: boolean }
export interface ListFilter { name: string, label: string, options: { value: string, label: string }[], primary?: boolean }
export interface BulkAction { label: string, icon?: string, run: (rows: any[]) => void | Promise<void> }

const props = withDefaults(defineProps<{
  title: string
  trail?: { label: string, to: string }[]
  /** The module's data route: answers { rows, total } for the query it is sent. */
  route: string
  /** The list's declaration (defineList). Leave out to describe the list with `columns` and `filters`. */
  list?: ListDeclaration
  /** For a declared choice filter whose options are the theatre's own (seasons): its key, then the options. */
  filterOptions?: Record<string, ListOption[]>
  columns?: ListColumn[]
  filters?: ListFilter[]
  rowKey?: string
  /** Row click opens the record. */
  rowTo?: (row: Row) => string
  /** What a row is called to a screen reader: "Order 4F7K2". */
  rowLabel: (row: Row) => string
  rowActions?: (row: Row) => DropdownMenuItem[]
  bulkActions?: BulkAction[]
  /** The module's export route. Offered only when the viewer holds the export ability. */
  exportRoute?: string
  canExport?: boolean
  /** The most rows one export may hold. */
  exportCeiling?: number
  sort?: string
  order?: 'asc' | 'desc'
  empty: { title: string, description: string, icon?: string, help?: string }
  width?: 'standard' | 'full'
  /** Child records shown under a row: performances under a production. At most the declaration's `subRows.max`. */
  subRows?: (row: Row) => Row[]
  /** What the children are called, for "Show performances of Hamlet". */
  subRowsNoun?: string
  /** How many children the row has in all; when more are shown than this, the last line links to them. */
  subRowsTotal?: (row: Row) => number
  /** Where "All 34 performances" goes. */
  subRowsAllTo?: (row: Row) => string
  subRowLabel?: (row: Row) => string
  subRowTo?: (row: Row) => string
}>(), { trail: undefined, subRows: undefined, subRowsNoun: undefined, subRowsTotal: undefined, subRowsAllTo: undefined, subRowLabel: undefined, subRowTo: undefined, list: undefined, filterOptions: undefined, columns: () => [], filters: () => [], rowKey: 'id', rowTo: undefined, rowActions: undefined, bulkActions: undefined, exportRoute: undefined, canExport: false, exportCeiling: 10_000, sort: undefined, order: 'asc', width: 'standard' }) // not-policy: the row ceiling's default

defineSlots<{
  'primary'?: () => unknown
  /** Above the rows: something the page shows first, such as Sessions' "Your session" card. */
  'before'?: () => unknown
  /** After the list: a panel or dialog the page opens from it. */
  'default'?: () => unknown
  [cell: `cell-${string}`]: (props: { row: Row }) => unknown
  /** A column's cell on a child row. A column the child has nothing for stays empty. */
  [subcell: `subcell-${string}`]: (props: { row: Row, parent: Row }) => unknown
  /** A line under the title of a row's card on a phone, for what the desk needs at a glance (a status and a date). */
  'card-description'?: (props: { row: Row }) => unknown
  /** A free panel under a row, for a few facts that do not merit a page. */
  'expanded'?: (props: { row: Row }) => unknown
  /** A line about the answer, such as "4 not yet signed in are not shown", from any extra field the route sends beside the rows. */
  'note'?: (props: { result: ListResult<Row> & Record<string, unknown> }) => unknown
}>()
const slots = useSlots()

const { t } = useT()

// A page that names columns and filters gets the same declaration a defined list has.
const decl = computed<ListDeclaration>(() => {
  if (props.list) {
    if (!props.filterOptions) return props.list
    const filters: Record<string, FilterDef> = {}
    for (const [k, f] of Object.entries(props.list.filters)) filters[k] = props.filterOptions[k] ? { ...f, options: props.filterOptions[k] } : f
    return { ...props.list, filters }
  }
  const sorts: Record<string, SortDef> = {}
  const columns: Record<string, ColumnDef> = {}
  for (const c of props.columns) {
    if (c.sortable) sorts[c.key] = { label: c.label, type: c.sortType ?? 'text' }
    columns[c.key] = { label: c.label, sort: c.sortable ? c.key : undefined, card: c.card, always: c === props.columns[0] }
  }
  const filters: Record<string, FilterDef> = {}
  for (const f of props.filters) filters[f.name] = { kind: 'choice', label: f.label, options: f.options }
  return { id: `route:${props.route}`, filters, sorts, columns, defaultSort: props.sort ? { key: props.sort, order: props.order } : undefined }
})
const defaults = computed(() => listDefaults(decl.value, state.value.view))
// The address this list was left at, so a way back to it lands where the person was.
const { remember } = useListMemory()
const listRoute = useRoute()
watch(() => listRoute.fullPath, () => remember(listRoute.path, listRoute.fullPath), { immediate: true })
const { state, set, setInPanel, endVisit, clear } = useListQuery(decl)
const viewDefaults = (view?: string) => listDefaults(decl.value, view)
const { hidden, toggle: toggleColumn } = useListColumns(decl.value)

const query = computed(() => ({
  q: state.value.search || undefined,
  ...state.value.filters,
  view: state.value.view,
  sort: state.value.sort,
  order: state.value.sort ? state.value.order : undefined,
  page: state.value.page,
  size: state.value.pageSize,
}))
// One key for the list whatever its query, on purpose: the rows on screen stay while the next
// query loads, where a key that followed the query would empty the list at each change. A reactive
// `query` is fetched again when it changes without being named in `watch`.
const { data, status, error, refresh } = await useAPI<ListResult<Row>>(props.route, { query, key: `core:list:${props.route}` })

const total = computed(() => data.value?.total ?? 0)
const pages = computed(() => Math.max(1, Math.ceil(total.value / state.value.pageSize)))
const filtered = computed(() => activeFilterCount(state.value) > 0)

// Search types ahead without filling the history; everything else adds an entry so Back restores it.
const search = ref(state.value.search)
watch(() => state.value.search, (value) => { if (value !== search.value) search.value = value })
let timer: ReturnType<typeof setTimeout> | undefined
function onSearch(value: string) {
  search.value = value
  clearTimeout(timer)
  timer = setTimeout(() => set({ search: value }, { replace: true }), 300) // not-policy: a typing pause
}
onBeforeUnmount(() => clearTimeout(timer))

// One panel holds every filter; a chip for each one that is on says so and opens the panel.
const panel = ref(false)
watch(panel, endVisit)
// A built-in view's own filters count as on, so the panel and the chips tell the truth about the rows.
const effective = computed(() => ({ ...(state.value.view ? decl.value.views?.[state.value.view]?.filters : undefined), ...state.value.filters }))
const chips = computed(() => Object.entries(decl.value.filters).flatMap(([name, def]) => {
  if (data.value?.dropped?.includes(name)) return []
  const value = effective.value[name]
  const text = value ? filterChipText(def, value, { yes: t('core.list.yes'), no: t('core.list.no') }) : null
  return text ? [{ name, text }] : []
}))
const onFilter = (name: string, value: string) => { void setInPanel({ filters: { [name]: value } }) }

// Pressing a heading sorts by it in its natural direction, again reverses, a third time returns to the default.
function sortBy(sortKey: string) {
  const natural = decl.value.sorts[sortKey]?.natural ?? 'asc'
  const reverse = (o: 'asc' | 'desc') => (o === 'asc' ? 'desc' : 'asc')
  if (sortKey === defaults.value.sort) void set({ sort: sortKey, order: reverse(state.value.order) })
  else if (state.value.sort !== sortKey) void set({ sort: sortKey, order: natural })
  else if (state.value.order === natural) void set({ order: reverse(natural) })
  else void set({ sort: defaults.value.sort, order: defaults.value.order ?? 'asc' })
}
// The table is told how the server sorted, so each heading says so to a screen reader.
const sorting = computed(() => {
  const column = shown.value.find(c => c.sort === state.value.sort)
  return column ? [{ id: column.key, desc: state.value.order === 'desc' }] : []
})
const sortIcon = (sortKey: string) => state.value.sort === sortKey ? (state.value.order === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down') : 'i-lucide-arrow-up-down'

// The columns on show: the declared ones less what this device has hidden. A column's heading
// sorts by the declared sort it names.
const shown = computed(() => Object.entries(decl.value.columns).filter(([key]) => !hidden.value.includes(key)).map(([key, c]) => ({ key, ...c })))
// Columns other modules add through core.list-column come after the owner's: read-only, gated by
// ability, absent when their module is off. Each cell gets the list's id, the page's query and the
// row's id, and fetches once for the page (the same key shares one request).
const { data: contributed } = props.list
  ? await useAPI<{ columns: { id: string, labelKey: string, component: string }[] }>('/api/core/list-columns', { query: { list: props.list.id }, key: `core:list-columns:${props.list.id}`, default: () => ({ columns: [] }) })
  : { data: ref({ columns: [] as { id: string, labelKey: string, component: string }[] }) }
const extra = computed(() => contributed.value.columns.flatMap((c) => {
  const component = resolveComponent(c.component)
  return typeof component === 'string' ? [] : [{ key: c.id, label: t(c.labelKey), component }]
}))
const rowId = (row: Row) => String(row[props.rowKey])
const tableColumns = computed<TableColumn<Row>[]>(() => [
  ...(expandable.value ? [{ id: 'expand', enableSorting: false }] : []),
  ...(props.bulkActions ? [{ id: 'select', enableSorting: false }] : []),
  ...shown.value.map(c => ({ id: c.key, accessorFn: (row: Row) => row[c.key], header: c.label, enableSorting: !!c.sort })),
  ...extra.value.map(c => ({ id: c.key, header: c.label, enableSorting: false })),
  ...(props.rowActions ? [{ id: 'actions', enableSorting: false }] : []),
])

// What the server could not search, said plainly; and which hidden column a row matched, so a result is never a mystery.
const searchNote = computed(() => {
  if (!state.value.search || !data.value) return ''
  if (data.value.searchTooShort) return t('core.list.search-too-short')
  const words = data.value.ignoredWords ?? []
  return words.length ? t('core.list.search-ignored', { words: words.join(', ') }) : ''
})
function matchLine(row: Row): string {
  const column = data.value?.matched?.[rowId(row)]
  if (!column) return ''
  const label = decl.value.columns[column]?.label ?? column
  const value = row[column]
  return value === undefined || value === null || typeof value === 'object' ? t('core.list.matches', { column: label }) : t('core.list.matches-value', { column: label, value: String(value) })
}

// Built-in views are tabs above the toolbar; each is a preset of filters and sort kept in the address.
const viewItems = computed(() => Object.entries(decl.value.views ?? {}).map(([value, v]) => ({ value, label: v.label })))
function pickView(name: string) {
  const cleared = Object.fromEntries(Object.keys(state.value.filters).map(k => [k, '']))
  void set({ view: name, filters: cleared, sort: undefined, order: viewDefaults(name).order })
}

// Rows that open: children under a row (indented, in the same columns) or a free panel.
const expandable = computed(() => !!props.subRows || !!slots.expanded)
const maxChildren = computed(() => decl.value.subRows?.max ?? 20) // not-policy: the specification's ceiling on children shown for each parent
const expanded = ref<Record<string, boolean>>({})
const childrenOf = (row: Row) => (props.subRows?.(row) ?? []).slice(0, maxChildren.value)
const childTotal = (row: Row) => props.subRowsTotal?.(row) ?? childrenOf(row).length
const hasMore = (row: Row) => childTotal(row) > childrenOf(row).length
const canExpand = (row: Row) => childrenOf(row).length > 0 || !!slots.expanded
// A view that opens its rows starts them open, once, when its rows arrive.
const opensRows = computed(() => !!(state.value.view && decl.value.views?.[state.value.view]?.open))
watch([() => data.value?.rows, opensRows], ([rows, open]) => {
  expanded.value = open ? Object.fromEntries((rows ?? []).filter(canExpand).map(r => [rowId(r), true])) : {}
}, { immediate: true })
const allOpen = computed(() => (data.value?.rows ?? []).filter(canExpand).every(r => expanded.value[rowId(r)]))
function toggleAll() {
  expanded.value = allOpen.value ? {} : Object.fromEntries((data.value?.rows ?? []).filter(canExpand).map(r => [rowId(r), true]))
}

// Selection is kept by row id and dropped when the rows change: a bulk action never reaches a row
// that is no longer on screen.
const rowSelection = ref<Record<string, boolean>>({})
watch(() => data.value?.rows, () => { rowSelection.value = {} })
const selectedRows = computed(() => (data.value?.rows ?? []).filter(r => rowSelection.value[rowId(r)]))
function toggle(row: Row, on: boolean) {
  const { [rowId(row)]: _, ...rest } = rowSelection.value
  rowSelection.value = on ? { ...rest, [rowId(row)]: true } : rest
}

const exportHref = computed(() => {
  if (!props.exportRoute) return undefined
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query.value)) if (v !== undefined && !['page', 'size'].includes(k)) params.set(k, String(v))
  params.set('format', 'csv')
  return `${props.exportRoute}?${params}`
})
const exportBlocked = computed(() => total.value > props.exportCeiling)

const cardColumns = computed(() => Object.entries(decl.value.columns).filter(([, c]) => c.card).slice(0, 3).map(([key, c]) => ({ key, ...c })))
function open(_event: Event, row: TableRow<Row>) {
  if (props.rowTo) void navigateTo(props.rowTo(row.original))
}
const pageLabel = computed(() => t('core.list.page-of', { page: state.value.page, pages: pages.value, total: total.value }))

// A filter, a search or a new page changes only the query, so the route announcer says nothing:
// the new count is announced here.
const { polite } = useAnnouncer()
watch(() => [status.value, pageLabel.value] as const, ([now, label], [before, old]) => {
  if (now === 'success' && (before !== 'success' || label !== old)) polite(`${props.title}. ${label}`)
})
</script>

<template>
  <PageFrame
    :title="title"
    :trail="trail"
    :width="width"
  >
    <template #primary>
      <slot name="primary" />
    </template>

    <!-- The toolbar: search first, then Filters (with a count), Sort and Columns. -->
    <template #toolbar>
      <form
        class="flex flex-wrap items-center gap-1.5"
        role="search"
        :aria-label="t('core.list.filter-bar', { title })"
        novalidate
        @submit.prevent="set({ search })"
      >
        <UInput
          :model-value="search"
          type="search"
          icon="i-lucide-search"
          :placeholder="t('core.list.search')"
          :aria-label="t('core.list.search')"
          class="sm:w-72"
          @update:model-value="onSearch(String($event))"
        />
        <ListFilters
          v-if="Object.keys(decl.filters).length"
          v-model:open="panel"
          :filters="decl.filters"
          :values="effective"
          :count="Object.keys(effective).length"
          @change="onFilter"
          @clear="set({ filters: Object.fromEntries(Object.keys(state.filters).map(k => [k, ''])) })"
        />
        <ListSort
          v-if="Object.keys(decl.sorts).length"
          :sorts="decl.sorts"
          :sort="state.sort"
          :order="state.order"
          @change="(sort, order) => set({ sort, order })"
        />
        <ListColumns
          :columns="decl.columns"
          :hidden="hidden"
          @toggle="toggleColumn"
        />
      </form>
    </template>

    <!-- Built-in views, when the list declares any: tabs kept in the address as view=. -->
    <!-- Scrolls sideways on a phone rather than cutting each tab's name short. -->
    <div
      v-if="viewItems.length"
      class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <UTabs
        :model-value="state.view"
        :items="viewItems"
        :content="false"
        color="neutral"
        variant="link"
        :ui="{ list: 'w-max min-w-full', trigger: 'shrink-0 grow-0 whitespace-nowrap' }"
        :aria-label="t('core.list.views', { title })"
        @update:model-value="pickView(String($event))"
      />
    </div>

    <div
      v-if="chips.length"
      class="flex flex-wrap items-center gap-2"
    >
      <span
        v-for="chip in chips"
        :key="chip.name"
        class="inline-flex"
      >
        <UButton
          color="neutral"
          variant="subtle"
          size="sm"
          class="rounded-e-none"
          :label="chip.text"
          :aria-label="t('core.list.change-filter', { filter: chip.text })"
          @click="panel = true"
        />
        <IconButton
          color="neutral"
          variant="subtle"
          size="sm"
          class="rounded-s-none border-s border-default"
          icon="i-lucide-x"
          :label="t('core.list.remove-filter', { filter: chip.text })"
          @click="set({ filters: { [chip.name]: '' } })"
        />
      </span>
      <UButton
        color="neutral"
        variant="link"
        size="sm"
        :label="t('core.list.clear-all')"
        @click="clear()"
      />
    </div>

    <p
      v-if="searchNote"
      class="text-sm text-muted"
      role="status"
    >
      {{ searchNote }}
    </p>

    <!-- Something the page shows above its rows, such as Sessions' "Your session" card. -->
    <slot name="before" />

    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: result }">
        <div
          v-if="slots.note"
          class="mb-3 text-sm text-muted"
          role="status"
        >
          <slot
            name="note"
            :result="(result as ListResult<Row> & Record<string, unknown>)"
          />
        </div>
        <!-- Bulk actions appear only once rows are selected, and say how many they affect. -->
        <UAlert
          v-if="bulkActions && selectedRows.length"
          color="neutral"
          role="region"
          :aria-label="t('core.list.bulk')"
          :title="t('core.list.selected', { count: selectedRows.length })"
          :actions="bulkActions.map(action => ({ label: `${action.label} (${selectedRows.length})`, icon: action.icon, color: 'neutral' as const, variant: 'outline' as const, onClick: () => { void action.run(selectedRows) } }))"
          orientation="horizontal"
          class="mb-3"
        />

        <EmptyState
          v-if="result.total === 0"
          :title="filtered ? t('core.list.empty-filter.title') : empty.title"
          :description="filtered ? t('core.list.empty-filter.description') : empty.description"
          :icon="filtered ? 'i-lucide-search-x' : empty.icon"
          :help="filtered ? undefined : empty.help"
        >
          <template #actions>
            <UButton
              v-if="filtered"
              :label="t('core.list.clear-all')"
              color="neutral"
              variant="outline"
              @click="clear()"
            />
            <slot
              v-else
              name="primary"
            />
          </template>
        </EmptyState>

        <template v-else>
          <div
            v-if="expandable && (data?.rows ?? []).some(canExpand)"
            class="mb-2 flex justify-end max-lg:hidden"
          >
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              :label="allOpen ? t('core.list.collapse-all') : t('core.list.expand-all')"
              @click="toggleAll()"
            />
          </div>
          <!-- A table above 1024 pixels. -->
          <UTable
            v-model:expanded="expanded"
            :data="result.rows"
            :columns="tableColumns"
            :caption="`${title}. ${pageLabel}`"
            :get-row-id="rowId"
            :row-selection="rowSelection"
            :sorting="sorting"
            :sorting-options="{ manualSorting: true }"
            :get-sub-rows="subRows ? childrenOf : undefined"
            :on-select="rowTo ? open : undefined"
            :ui="{ caption: 'sr-only' }"
            class="max-lg:hidden"
          >
            <template #expand-header>
              <span class="sr-only">{{ t('core.list.expand') }}</span>
            </template>
            <template #expand-cell="{ row }">
              <IconButton
                v-if="row.depth === 0 && canExpand(row.original)"
                size="sm"
                :icon="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                :aria-expanded="row.getIsExpanded()"
                :label="t(row.getIsExpanded() ? 'core.list.hide-children' : 'core.list.show-children', { what: subRowsNoun ?? t('core.list.details'), row: rowLabel(row.original) })"
                @click.stop="row.toggleExpanded()"
              />
            </template>
            <template #select-header>
              <span class="sr-only">{{ t('core.list.select') }}</span>
            </template>
            <template #select-cell="{ row }">
              <UCheckbox
                v-if="row.depth === 0"
                :model-value="!!rowSelection[row.id]"
                :aria-label="t('core.list.select-row', { row: rowLabel(row.original) })"
                @update:model-value="toggle(row.original, $event === true)"
              />
            </template>
            <template
              v-for="c in shown"
              :key="c.key"
              #[`${c.key}-header`]
            >
              <UButton
                v-if="c.sort"
                color="neutral"
                variant="ghost"
                size="sm"
                :label="c.label"
                :trailing-icon="sortIcon(c.sort)"
                class="-mx-2.5"
                @click="sortBy(c.sort)"
              />
              <template v-else>
                {{ c.label }}
              </template>
            </template>
            <template
              v-for="(c, i) in shown"
              :key="c.key"
              #[`${c.key}-cell`]="{ row }"
            >
              <template v-if="row.depth > 0">
                <ULink
                  v-if="subRowTo && i === 0"
                  :to="subRowTo(row.original)"
                  class="ps-6 font-medium text-highlighted hover:underline"
                >
                  <slot
                    :name="`subcell-${c.key}`"
                    :row="row.original"
                    :parent="row.getParentRow()!.original"
                  >
                    {{ subRowLabel?.(row.original) }}
                  </slot>
                </ULink>
                <span
                  v-else
                  :class="i === 0 ? 'ps-6' : ''"
                >
                  <slot
                    :name="`subcell-${c.key}`"
                    :row="row.original"
                    :parent="row.getParentRow()!.original"
                  >
                    <template v-if="i === 0">{{ subRowLabel?.(row.original) }}</template>
                  </slot>
                </span>
              </template>
              <template v-else>
                <ULink
                  v-if="rowTo && i === 0"
                  :to="rowTo(row.original)"
                  class="font-medium text-highlighted hover:underline"
                >
                  <slot
                    :name="`cell-${c.key}`"
                    :row="row.original"
                  >
                    {{ row.original[c.key] }}
                  </slot>
                </ULink>
                <slot
                  v-else
                  :name="`cell-${c.key}`"
                  :row="row.original"
                >
                  {{ row.original[c.key] }}
                </slot>
                <span
                  v-if="i === 0 && matchLine(row.original)"
                  class="block text-xs text-muted"
                >{{ matchLine(row.original) }}</span>
                <ULink
                  v-if="i === 0 && hasMore(row.original) && subRowsAllTo && row.getIsExpanded()"
                  :to="subRowsAllTo(row.original)"
                  class="mt-1 block text-sm text-muted hover:underline"
                >
                  {{ t('core.list.all-children', { count: childTotal(row.original), what: subRowsNoun ?? '' }) }}
                </ULink>
              </template>
            </template>
            <template
              v-for="c in extra"
              :key="c.key"
              #[`${c.key}-cell`]="{ row }"
            >
              <component
                :is="c.component"
                v-if="row.depth === 0"
                :list-id="decl.id"
                :query="query"
                :row-id="rowId(row.original)"
              />
            </template>
            <template #actions-header>
              <span class="sr-only">{{ t('core.list.actions') }}</span>
            </template>
            <template #actions-cell="{ row }">
              <RowActions
                v-if="rowActions && row.depth === 0"
                :items="rowActions(row.original)"
                :label="t('core.list.actions-for', { row: rowLabel(row.original) })"
                size="md"
              />
            </template>
            <template
              v-if="$slots.expanded"
              #expanded="{ row }"
            >
              <div class="px-4 py-3 text-sm">
                <slot
                  name="expanded"
                  :row="row.original"
                />
              </div>
            </template>
          </UTable>

          <!-- Cards below it. No sideways scrolling of a table on a phone. -->
          <ul class="space-y-3 lg:hidden">
            <li
              v-for="row in result.rows"
              :key="rowId(row)"
            >
              <UCard>
                <div class="flex items-start justify-between gap-2">
                  <div class="flex min-w-0 items-start gap-3">
                    <UCheckbox
                      v-if="bulkActions"
                      :model-value="!!rowSelection[rowId(row)]"
                      :aria-label="t('core.list.select-row', { row: rowLabel(row) })"
                      @update:model-value="toggle(row, $event === true)"
                    />
                    <ULink
                      v-if="rowTo"
                      :to="rowTo(row)"
                      class="min-w-0 truncate font-medium text-highlighted hover:underline"
                    >
                      {{ rowLabel(row) }}
                    </ULink>
                    <span
                      v-else
                      class="min-w-0 truncate font-medium text-highlighted"
                    >{{ rowLabel(row) }}</span>
                  </div>
                  <RowActions
                    v-if="rowActions"
                    :items="rowActions(row)"
                    :label="t('core.list.actions-for', { row: rowLabel(row) })"
                    size="md"
                  />
                </div>
                <div
                  v-if="slots['card-description']"
                  class="mt-1 text-sm text-muted"
                >
                  <slot
                    name="card-description"
                    :row="row"
                  />
                </div>
                <p
                  v-if="matchLine(row)"
                  class="mt-1 text-xs text-muted"
                >
                  {{ matchLine(row) }}
                </p>
                <dl
                  v-if="cardColumns.length"
                  class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm"
                >
                  <template
                    v-for="c in cardColumns"
                    :key="c.key"
                  >
                    <dt class="text-muted">
                      {{ c.label }}
                    </dt>
                    <dd>
                      <slot
                        :name="`cell-${c.key}`"
                        :row="row"
                      >
                        {{ row[c.key] }}
                      </slot>
                    </dd>
                  </template>
                </dl>
                <UCollapsible
                  v-if="subRows && childrenOf(row).length"
                  class="mt-2"
                >
                  <UButton
                    color="neutral"
                    variant="link"
                    size="sm"
                    trailing-icon="i-lucide-chevron-down"
                    :label="`${childTotal(row)} ${subRowsNoun ?? ''}`.trim()"
                  />
                  <template #content>
                    <ul class="mt-1 space-y-1 text-sm">
                      <li
                        v-for="child in childrenOf(row)"
                        :key="rowId(child)"
                      >
                        <ULink
                          v-if="subRowTo"
                          :to="subRowTo(child)"
                          class="hover:underline"
                        >
                          {{ subRowLabel?.(child) }}
                        </ULink>
                        <template v-else>
                          {{ subRowLabel?.(child) }}
                        </template>
                      </li>
                    </ul>
                  </template>
                </UCollapsible>
              </UCard>
            </li>
          </ul>

          <!-- Paging is by page with a stated total. No infinite scroll: "it is on page 3". -->
          <nav
            class="mt-4 flex flex-wrap items-center justify-between gap-3"
            :aria-label="t('core.list.paging')"
          >
            <p class="text-sm text-muted">
              {{ pageLabel }}
            </p>
            <UPagination
              :page="state.page"
              :total="total"
              :items-per-page="state.pageSize"
              @update:page="set({ page: $event })"
            />
          </nav>

          <div
            v-if="exportHref && canExport"
            class="mt-3 text-sm"
          >
            <p
              v-if="exportBlocked"
              class="text-muted"
            >
              {{ t('core.list.export-too-many', { total, ceiling: exportCeiling }) }}
            </p>
            <UButton
              v-else
              :href="exportHref"
              external
              download
              color="neutral"
              variant="outline"
              icon="i-lucide-download"
              :label="t('core.list.export', { total, count: total })"
            />
            <p
              v-if="!exportBlocked"
              class="mt-1 text-muted"
            >
              {{ filtered ? t('core.list.export-filtered', { filters: chips.map(c => c.text).concat(state.search ? [t('core.list.search-for', { term: state.search })] : []).join('; ') }) : t('core.list.export-all') }}
            </p>
          </div>
        </template>
      </template>
    </DataBoundary>
    <slot />
  </PageFrame>
</template>
