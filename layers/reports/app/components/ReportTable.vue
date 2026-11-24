<!-- A report's table: a row for each part of the breakdown, a column for each figure and formula, the
     same columns again under each value of a pivot with the totals last (B2), and a totals row read on
     its own (M6). A figure that could not answer shows a dash with the reason; a formula says itself. -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { formulaWords, parseFormula } from '../../shared/formula'
import { cellKey, type ReportRow, type ReportTable, type Shown } from '../../shared/table'

const props = defineProps<{ table: ReportTable, byLabel: string, caption: string }>()

const { t } = useT()
const { text } = useFigureText()
const UTooltip = resolveComponent('UTooltip')
const right = { class: { th: 'text-right', td: 'text-right tabular-nums', tf: 'text-right tabular-nums' } }

const labels = computed(() => props.table.columns.map(c => c.kind === 'formula' ? c.label : t(c.label)))

function value(unit: ReportTable['columns'][number]['unit'], shown: Shown | undefined) {
  const { text: words, reason } = text(unit, shown)
  return reason ? h(UTooltip, { text: reason }, () => h('span', { tabindex: 0 }, words)) : words
}

function header(i: number) {
  const c = props.table.columns[i]!
  if (c.kind !== 'formula') return labels.value[i]
  const said = formulaWords(parseFormula(c.formula, i), labels.value)
  return h(UTooltip, { text: said }, () => h('span', { tabindex: 0, class: 'inline-flex items-center gap-1' }, [labels.value[i], h('span', { 'class': 'text-xs text-muted italic', 'aria-label': t('reports.formula') }, 'fx')]))
}

const shown = computed(() => props.table.columns.map((c, i) => ({ c, i })).filter(({ c }) => c.shown))
const pivoted = computed(() => props.table.groups.length > 1)

const leaves = (group: string | null) => shown.value.map(({ c, i }) => ({
  id: cellKey(i, group),
  header: () => header(i),
  cell: ({ row }: { row: { original: ReportRow } }) => value(c.unit, row.original.cells[cellKey(i, group)]),
  footer: () => value(c.unit, props.table.totals[cellKey(i, group)]),
  meta: right,
}))

const columns = computed<TableColumn<ReportRow>[]>(() => [
  { id: 'key', header: props.byLabel, accessorKey: 'label', footer: () => t('reports.total'), meta: { class: { td: 'font-medium text-highlighted' } } },
  ...(pivoted.value
    ? props.table.groups.map(g => ({ id: `group|${g.value ?? ''}`, header: g.label, columns: leaves(g.value) }))
    : leaves(null)),
])
</script>

<template>
  <!-- On a phone the table scrolls sideways inside its card, and the page never does. -->
  <div class="overflow-x-auto rounded-lg border border-default">
    <UTable
      :data="table.rows"
      :columns="columns"
      :caption="caption"
      sticky
      :ui="{ tfoot: 'font-medium' }"
    />
  </div>
</template>
