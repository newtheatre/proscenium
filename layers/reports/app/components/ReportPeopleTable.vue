<!-- A people report's table (rule P8): a name, the breakdown's value where there is one, and up to six
     figures, searchable by name. The totals row is each module's own total, never the people added up. -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { PeopleRow, PeopleTable } from '../../shared/people'

const props = defineProps<{ table: PeopleTable, caption: string }>()

const { t } = useT()
const { text } = useFigureText()
const UTooltip = resolveComponent('UTooltip')
const right = { class: { th: 'text-right', td: 'text-right tabular-nums', tf: 'text-right tabular-nums' } }
const search = ref('')
const rows = computed(() => {
  const words = search.value.trim().toLowerCase()
  return words ? props.table.rows.filter(r => r.name.toLowerCase().includes(words)) : props.table.rows
})

const columns = computed<TableColumn<PeopleRow>[]>(() => [
  { id: 'name', header: t('reports.people.name'), accessorKey: 'name', footer: () => t('reports.total'), meta: { class: { td: 'font-medium text-highlighted' } } },
  ...(props.table.by ? [{ id: 'key', header: props.table.byLabel ?? '', accessorKey: 'keyLabel' } as TableColumn<PeopleRow>] : []),
  ...props.table.columns.flatMap((c, i) => c.shown
    ? [{
        id: c.id,
        header: t(c.label),
        cell: ({ row }: { row: { original: PeopleRow } }) => text(c.unit, { state: 'ok', amounts: [{ value: row.original.values[i] ?? 0 }] }).text,
        footer: () => {
          const { text: words, reason } = text(c.unit, props.table.totals[i])
          return reason ? h(UTooltip, { text: reason }, () => h('span', { tabindex: 0 }, words)) : words
        },
        meta: right,
      } as TableColumn<PeopleRow>]
    : []),
])
</script>

<template>
  <div class="space-y-3">
    <UInput
      v-model="search"
      icon="i-lucide-search"
      :placeholder="t('reports.people.search')"
      :aria-label="t('reports.people.search')"
      class="max-w-xs"
    />
    <div class="overflow-x-auto rounded-lg border border-default">
      <UTable
        :data="rows"
        :columns="columns"
        :caption="caption"
        :empty="t('reports.people.none')"
        sticky
        :ui="{ tfoot: 'font-medium' }"
      />
    </div>
  </div>
</template>
