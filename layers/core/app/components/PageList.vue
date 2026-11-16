<!-- The List page type (UI-11): title, primary action, one filter bar, a table on a laptop and cards
     on a phone, paging with a stated total, export of what is filtered, bulk actions once rows are
     selected. Filters, sort and page live in the address, so a filtered list is a link and Back
     returns to it. A module supplies columns, filters, row actions and the data route. -->
<script setup lang="ts" generic="Row extends Record<string, any>">
import type { DropdownMenuItem } from '@nuxt/ui'
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
const { data, status, error, refresh } = await useFetch<ListResult<Row>>(props.route, { query, key: `core:list:${props.route}`, watch: [query] })

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
const ariaSort = (key: string) => state.value.sort === key ? (state.value.order === 'asc' ? 'ascending' : 'descending') : 'none'

const selected = ref<Set<string>>(new Set())
watch(() => data.value?.rows, () => selected.value.clear())
const rowId = (row: Row) => String(row[props.rowKey])
const selectedRows = computed(() => (data.value?.rows ?? []).filter(r => selected.value.has(rowId(r))))
function toggle(row: Row, on: boolean) {
  if (on) selected.value.add(rowId(row))
  else selected.value.delete(rowId(row))
  selected.value = new Set(selected.value)
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
function open(row: Row) {
  if (props.rowTo) void navigateTo(props.rowTo(row))
}
const pageLabel = computed(() => t('core.list.page-of', { page: state.value.page, pages: pages.value, total: total.value }))
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
    <form
      class="mb-3 flex flex-wrap items-end gap-3"
      role="search"
      :aria-label="t('core.list.filter-bar', { title })"
      @submit.prevent="set({ search })"
    >
      <UFormField
        :label="t('core.list.search')"
        class="w-full sm:w-72"
      >
        <UInput
          :model-value="search"
          type="search"
          icon="i-lucide-search"
          class="w-full"
          @update:model-value="onSearch(String($event))"
        />
      </UFormField>
      <UFormField
        v-for="f in primaryFilters"
        :key="f.name"
        :label="f.label"
      >
        <USelect
          :model-value="state.filters[f.name] || ANY"
          :items="[{ value: ANY, label: t('core.list.any') }, ...f.options]"
          value-key="value"
          class="min-w-40"
          @update:model-value="set({ filters: { [f.name]: $event === ANY ? '' : String($event) } })"
        />
      </UFormField>
      <UPopover v-if="moreFilters.length">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-sliders-horizontal"
          :label="t('core.list.more-filters')"
        />
        <template #content>
          <div class="w-72 space-y-3 p-4">
            <UFormField
              v-for="f in moreFilters"
              :key="f.name"
              :label="f.label"
            >
              <USelect
                :model-value="state.filters[f.name] || ANY"
                :items="[{ value: ANY, label: t('core.list.any') }, ...f.options]"
                value-key="value"
                class="w-full"
                @update:model-value="set({ filters: { [f.name]: $event === ANY ? '' : String($event) } })"
              />
            </UFormField>
          </div>
        </template>
      </UPopover>
    </form>

    <div
      v-if="chips.length"
      class="mb-3 flex flex-wrap items-center gap-2"
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
        <div
          v-if="bulkActions && selectedRows.length"
          class="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-elevated p-3"
          role="region"
          :aria-label="t('core.list.bulk')"
        >
          <span class="text-sm font-medium">{{ t('core.list.selected', { count: selectedRows.length }) }}</span>
          <UButton
            v-for="action in bulkActions"
            :key="action.label"
            color="neutral"
            variant="outline"
            size="sm"
            :icon="action.icon"
            :label="`${action.label} (${selectedRows.length})`"
            @click="action.run(selectedRows)"
          />
        </div>

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
          <div class="hidden lg:block">
            <div class="overflow-x-auto rounded-lg border border-default">
              <table class="w-full text-left text-sm">
                <caption class="sr-only">
                  {{ title }}. {{ pageLabel }}
                </caption>
                <thead class="bg-elevated text-muted">
                  <tr>
                    <th
                      v-if="bulkActions"
                      scope="col"
                      class="w-10 px-3 py-2"
                    >
                      <span class="sr-only">{{ t('core.list.select') }}</span>
                    </th>
                    <th
                      v-for="c in columns"
                      :key="c.key"
                      scope="col"
                      class="px-3 py-2 font-medium"
                      :aria-sort="c.sortable ? ariaSort(c.key) : undefined"
                    >
                      <UButton
                        v-if="c.sortable"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :label="c.label"
                        :trailing-icon="state.sort === c.key ? (state.order === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down') : 'i-lucide-arrow-up-down'"
                        class="-mx-2"
                        @click="sortBy(c.key)"
                      />
                      <template v-else>
                        {{ c.label }}
                      </template>
                    </th>
                    <th
                      v-if="rowActions"
                      scope="col"
                      class="w-12 px-3 py-2"
                    >
                      <span class="sr-only">{{ t('core.list.actions') }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr
                    v-for="row in result.rows"
                    :key="rowId(row)"
                    class="hover:bg-elevated/60"
                    :class="rowTo ? 'cursor-pointer' : ''"
                    @click="open(row)"
                  >
                    <td
                      v-if="bulkActions"
                      class="px-3 py-2"
                      @click.stop
                    >
                      <UCheckbox
                        :model-value="selected.has(rowId(row))"
                        :aria-label="t('core.list.select-row', { row: rowLabel(row) })"
                        @update:model-value="toggle(row, $event === true)"
                      />
                    </td>
                    <td
                      v-for="(c, i) in columns"
                      :key="c.key"
                      class="px-3 py-2"
                    >
                      <NuxtLink
                        v-if="rowTo && i === 0"
                        :to="rowTo(row)"
                        class="font-medium text-highlighted hover:underline"
                        @click.stop
                      >
                        <slot
                          :name="`cell-${c.key}`"
                          :row="row"
                        >
                          {{ row[c.key] }}
                        </slot>
                      </NuxtLink>
                      <slot
                        v-else
                        :name="`cell-${c.key}`"
                        :row="row"
                      >
                        {{ row[c.key] }}
                      </slot>
                    </td>
                    <td
                      v-if="rowActions"
                      class="px-3 py-2 text-right"
                      @click.stop
                    >
                      <UDropdownMenu :items="rowActions(row)">
                        <UButton
                          color="neutral"
                          variant="ghost"
                          icon="i-lucide-ellipsis"
                          :aria-label="t('core.list.actions-for', { row: rowLabel(row) })"
                        />
                      </UDropdownMenu>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Cards below it. No sideways scrolling of a table on a phone. -->
          <ul class="space-y-3 lg:hidden">
            <li
              v-for="row in result.rows"
              :key="rowId(row)"
              class="rounded-lg border border-default p-4"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex min-w-0 items-start gap-3">
                  <UCheckbox
                    v-if="bulkActions"
                    :model-value="selected.has(rowId(row))"
                    :aria-label="t('core.list.select-row', { row: rowLabel(row) })"
                    @update:model-value="toggle(row, $event === true)"
                  />
                  <NuxtLink
                    v-if="rowTo"
                    :to="rowTo(row)"
                    class="min-w-0 truncate font-medium text-highlighted hover:underline"
                  >
                    {{ rowLabel(row) }}
                  </NuxtLink>
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
  </PageFrame>
</template>
