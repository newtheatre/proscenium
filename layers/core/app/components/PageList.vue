<!-- The List page type (UI-11): title, primary action, one filter bar, a table on a laptop and cards
     on a phone, paging with a stated total, export of what is filtered, bulk actions once rows are
     selected. Filters, sort and page live in the address, so a filtered list is a link and Back
     returns to it. A module supplies columns, filters, row actions and the data route. -->
<script setup lang="ts" generic="Row extends Record<string, any>">
import type { DropdownMenuItem, TableColumn, TableRow } from '@nuxt/ui'
import { activeFilterCount, type ListResult } from '../../shared/list'

export interface ListColumn { key: string, label: string, sortable?: boolean, /** Survives on a phone's card. */ card?: boolean }
export interface ListFilter { name: string, label: string, options: { value: string, label: string }[], /** One of the two or three used most; the rest sit under "More filters". */ primary?: boolean }
export interface BulkAction { label: string, icon?: string, run: (rows: any[]) => void | Promise<void> }

// A select item cannot have an empty value, so "Any" has its own and the address leaves the filter out.
const ANY = '__any'

const props = withDefaults(defineProps<{
  title: string
  /** The module's data route: answers { rows, total } for the query it is sent. */
  route: string
  columns: ListColumn[]
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
}>(), { filters: () => [], rowKey: 'id', rowTo: undefined, rowActions: undefined, bulkActions: undefined, exportRoute: undefined, canExport: false, exportCeiling: 10_000, sort: undefined, order: 'asc', width: 'standard' }) // not-policy: the row ceiling's default

defineSlots<{
  primary?: () => unknown
  /** After the list: a panel or dialog the page opens from it. */
  default?: () => unknown
  [cell: `cell-${string}`]: (props: { row: Row }) => unknown
}>()

const { t } = useT()
const defaults = { sort: props.sort, order: props.order }
const { state, set, clear } = useListQuery(props.filters.map(f => f.name), defaults)

const query = computed(() => ({
  q: state.value.search || undefined,
  ...state.value.filters,
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

const primaryFilters = computed(() => props.filters.filter(f => f.primary))
const moreFilters = computed(() => props.filters.filter(f => !f.primary))
const chips = computed(() => props.filters.flatMap((f) => {
  const value = state.value.filters[f.name]
  if (!value) return []
  return [{ name: f.name, text: `${f.label}: ${f.options.find(o => o.value === value)?.label ?? value}` }]
}))

function sortBy(key: string) {
  const same = state.value.sort === key
  set({ sort: key, order: same && state.value.order === 'asc' ? 'desc' : 'asc' })
}
// The table is told how the server sorted, so each heading says so to a screen reader.
const sorting = computed(() => state.value.sort ? [{ id: state.value.sort, desc: state.value.order === 'desc' }] : [])
const sortIcon = (key: string) => state.value.sort === key ? (state.value.order === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down') : 'i-lucide-arrow-up-down'

const rowId = (row: Row) => String(row[props.rowKey])
const tableColumns = computed<TableColumn<Row>[]>(() => [
  ...(props.bulkActions ? [{ id: 'select', enableSorting: false }] : []),
  ...props.columns.map(c => ({ id: c.key, accessorFn: (row: Row) => row[c.key], header: c.label, enableSorting: !!c.sortable })),
  ...(props.rowActions ? [{ id: 'actions', enableSorting: false }] : []),
])

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

const cardColumns = computed(() => props.columns.filter(c => c.card).slice(0, 3))
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
    :width="width"
  >
    <template #primary>
      <slot name="primary" />
    </template>

    <!-- One filter bar: search first, then the filters used most, then "More filters". -->
    <template #toolbar>
      <form
        class="flex flex-wrap items-center gap-1.5"
        role="search"
        :aria-label="t('core.list.filter-bar', { title })"
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
        <USelect
          v-for="f in primaryFilters"
          :key="f.name"
          :model-value="state.filters[f.name] || undefined"
          :items="[{ value: ANY, label: t('core.list.any') }, ...f.options]"
          value-key="value"
          :placeholder="f.label"
          :aria-label="f.label"
          class="w-auto min-w-40"
          @update:model-value="set({ filters: { [f.name]: $event === ANY ? '' : String($event) } })"
        />
        <UPopover v-if="moreFilters.length">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-sliders-horizontal"
            :label="t('core.list.more-filters')"
          />
          <template #content>
            <UCard>
              <UFormField
                v-for="f in moreFilters"
                :key="f.name"
                :label="f.label"
              >
                <USelect
                  :model-value="state.filters[f.name] || ANY"
                  :items="[{ value: ANY, label: t('core.list.any') }, ...f.options]"
                  value-key="value"
                  class="min-w-56"
                  @update:model-value="set({ filters: { [f.name]: $event === ANY ? '' : String($event) } })"
                />
              </UFormField>
            </UCard>
          </template>
        </UPopover>
      </form>
    </template>

    <div
      v-if="chips.length"
      class="flex flex-wrap items-center gap-2"
    >
      <UButton
        v-for="chip in chips"
        :key="chip.name"
        color="neutral"
        variant="subtle"
        size="sm"
        trailing-icon="i-lucide-x"
        :label="chip.text"
        :aria-label="t('core.list.remove-filter', { filter: chip.text })"
        @click="set({ filters: { [chip.name]: '' } })"
      />
      <UButton
        color="neutral"
        variant="link"
        size="sm"
        :label="t('core.list.clear-all')"
        @click="clear()"
      />
    </div>

    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: result }">
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
          <!-- A table above 1024 pixels. -->
          <UTable
            :data="result.rows"
            :columns="tableColumns"
            :caption="`${title}. ${pageLabel}`"
            :get-row-id="rowId"
            :row-selection="rowSelection"
            :sorting="sorting"
            :sorting-options="{ manualSorting: true }"
            :on-select="rowTo ? open : undefined"
            :ui="{ caption: 'sr-only' }"
            class="max-lg:hidden"
          >
            <template #select-header>
              <span class="sr-only">{{ t('core.list.select') }}</span>
            </template>
            <template #select-cell="{ row }">
              <UCheckbox
                :model-value="!!rowSelection[row.id]"
                :aria-label="t('core.list.select-row', { row: rowLabel(row.original) })"
                @update:model-value="toggle(row.original, $event === true)"
              />
            </template>
            <template
              v-for="c in columns"
              :key="c.key"
              #[`${c.key}-header`]
            >
              <UButton
                v-if="c.sortable"
                color="neutral"
                variant="ghost"
                size="sm"
                :label="c.label"
                :trailing-icon="sortIcon(c.key)"
                class="-mx-2.5"
                @click="sortBy(c.key)"
              />
              <template v-else>
                {{ c.label }}
              </template>
            </template>
            <template
              v-for="(c, i) in columns"
              :key="c.key"
              #[`${c.key}-cell`]="{ row }"
            >
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
            </template>
            <template #actions-header>
              <span class="sr-only">{{ t('core.list.actions') }}</span>
            </template>
            <template #actions-cell="{ row }">
              <UDropdownMenu
                v-if="rowActions"
                :items="rowActions(row.original)"
              >
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-ellipsis"
                  :aria-label="t('core.list.actions-for', { row: rowLabel(row.original) })"
                />
              </UDropdownMenu>
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
                  <UDropdownMenu
                    v-if="rowActions"
                    :items="rowActions(row)"
                  >
                    <UButton
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-ellipsis"
                      :aria-label="t('core.list.actions-for', { row: rowLabel(row) })"
                    />
                  </UDropdownMenu>
                </div>
                <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
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
              :label="t('core.list.export', { total })"
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
