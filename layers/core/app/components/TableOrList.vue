<!-- Rows as a table from 640 pixels and a list on a phone, only one drawn after hydration. Cells are
     UTable's slots (`#name-cell`); the phone's row is the `item` slot, a RecordListItem. `row-actions`
     ends each table row with its menu (and a right click), and hands the phone's row the same `actions`. -->
<script setup lang="ts" generic="T">
import type { DropdownMenuItem, TableColumn, TableRow } from '@nuxt/ui'

const props = defineProps<{
  rows: T[]
  columns: TableColumn<T>[]
  /** The table's caption and the list's name. */
  label: string
  /** Where a row leads: the whole table row is then pressable, as the list row is. */
  to?: (row: T) => string
  /** A row's own key, for the phone's list; without it a row is keyed by `to`, then by place. */
  rowKey?: (row: T) => string | number
  /** What a row's ellipsis menu offers; a row with none draws no menu. */
  rowActions?: (row: T) => DropdownMenuItem[] | DropdownMenuItem[][]
  /** A row's name, for its menu's accessible name ("Actions for Hamlet"). */
  rowLabel?: (row: T) => string
  /** The phone's list fills a PageSection: no frame of its own. */
  flush?: boolean
  /** Passed to UTable. */
  ui?: Record<string, string>
}>()
defineSlots<{
  /** One row on a phone: a RecordListItem. `actions` is what `row-actions` gives for it. */
  item: (props: { row: T, index: number, actions: DropdownMenuItem[] | DropdownMenuItem[][] }) => unknown
  [cell: string]: (props: any) => unknown
}>()
const { t } = useT()
const phone = useScreenQuery('(max-width: 639px)') // not-policy: Tailwind's sm breakpoint
const touch = useScreenQuery('(hover: none)')
const keyOf = (row: T, index: number) => props.rowKey?.(row) ?? props.to?.(row) ?? index
const tableColumns = computed<TableColumn<T>[]>(() => props.rowActions ? [...props.columns, { id: 'actions', enableSorting: false }] : props.columns)
const actionsLabel = (row: T) => t('core.list.actions-for', { row: props.rowLabel?.(row) ?? props.label })
function open(_event: Event, row: TableRow<T>) {
  if (props.to) void navigateTo(props.to(row.original))
}
// A right click on a row opens what its ellipsis menu offers, read when asked; a row with none keeps the browser's.
const menuItems = shallowRef<ReturnType<typeof rowMenu>>([])
function menuFor(event: Event, row: TableRow<T>) {
  menuItems.value = rowMenu(props.rowActions?.(row.original), props.to?.(row.original), t('core.list.open-new-tab'))
  if (!menuItems.value.length) event.stopPropagation()
}
function outsideRow(event: Event) {
  if (!(event.target as HTMLElement).closest('tbody tr')) event.stopPropagation()
}
</script>

<template>
  <RecordList
    v-if="phone"
    :label="label"
    :flush="flush"
  >
    <template
      v-for="(row, index) in rows"
      :key="keyOf(row, index)"
    >
      <slot
        name="item"
        :row="row"
        :index="index"
        :actions="rowActions?.(row) ?? []"
      />
    </template>
  </RecordList>
  <UContextMenu
    v-else
    :modal="false"
    :items="menuItems"
    :disabled="!rowActions || touch"
  >
    <div @contextmenu.capture="outsideRow">
      <UTable
        :data="rows"
        :columns="tableColumns"
        :caption="label"
        :meta="to ? { class: { tr: 'cursor-pointer' } } : undefined"
        :on-select="to ? open : undefined"
        :on-contextmenu="rowActions ? menuFor : undefined"
        :ui="ui"
      >
        <template
          v-for="name in Object.keys($slots).filter(n => n !== 'item')"
          :key="name"
          #[name]="scope"
        >
          <slot
            :name="name"
            v-bind="scope"
          />
        </template>
        <template
          v-if="rowActions"
          #actions-header
        >
          <span class="sr-only">{{ t('core.list.actions') }}</span>
        </template>
        <template
          v-if="rowActions"
          #actions-cell="{ row }"
        >
          <RowActions
            :items="rowActions(row.original)"
            :label="actionsLabel(row.original)"
            size="md"
          />
        </template>
      </UTable>
    </div>
  </UContextMenu>
</template>
