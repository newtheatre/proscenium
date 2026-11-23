<!-- Rows as a table from 640 pixels and as a list on a phone, chosen after hydration so only one is
     ever drawn. The table's cells are UTable's own slots (`#name-cell`); the phone's row is the
     `item` slot, a RecordListItem. `to` makes a row open its record in both. -->
<script setup lang="ts" generic="T">
import type { TableColumn } from '@nuxt/ui'

const props = defineProps<{
  rows: T[]
  columns: TableColumn<T>[]
  /** The table's caption and the list's name. */
  label: string
  /** Where a row leads: the whole table row is then pressable, as the list row is. */
  to?: (row: T) => string
}>()
defineSlots<{
  /** One row on a phone: a RecordListItem. */
  item: (props: { row: T, index: number }) => unknown
  [cell: string]: (props: any) => unknown
}>()
const phone = useScreenQuery('(max-width: 639px)') // not-policy: Tailwind's sm breakpoint
function open(_event: Event, row: { original: T }) {
  if (props.to) void navigateTo(props.to(row.original))
}
</script>

<template>
  <RecordList
    v-if="phone"
    :label="label"
  >
    <template
      v-for="(row, index) in rows"
      :key="to ? to(row) : index"
    >
      <slot
        name="item"
        :row="row"
        :index="index"
      />
    </template>
  </RecordList>
  <UTable
    v-else
    :data="rows"
    :columns="columns"
    :caption="label"
    :meta="to ? { class: { tr: 'cursor-pointer' } } : undefined"
    :on-select="to ? open : undefined"
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
  </UTable>
</template>
