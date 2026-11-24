<!-- A report's table: a row for each part of the breakdown, a column for each figure and the totals
     row read on their own (M6). A figure that could not answer shows a dash with the reason. -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { FigureColumn, PageBreakdown } from '../../shared/reports'
import type { ReportRow, Shown } from '../../shared/table'

const props = defineProps<{ figures: FigureColumn[], rows: ReportRow[], totals: Record<string, Shown>, by: PageBreakdown, caption: string }>()

const { t } = useT()
const { text } = useFigureText()
const UTooltip = resolveComponent('UTooltip')
const right = { class: { th: 'text-right', td: 'text-right tabular-nums', tf: 'text-right tabular-nums' } }

function value(figure: FigureColumn, shown: Shown | undefined) {
  const { text: words, reason } = text(figure.unit, shown)
  return reason ? h(UTooltip, { text: reason }, () => h('span', { tabindex: 0 }, words)) : words
}

const columns = computed<TableColumn<ReportRow>[]>(() => [
  { id: 'key', header: t(`reports.by.${props.by}`), accessorKey: 'label', footer: () => t('reports.total'), meta: { class: { td: 'font-medium text-highlighted' } } },
  ...props.figures.map((f, i) => ({
    id: `f${i}`,
    header: t(f.label),
    cell: ({ row }: { row: { original: ReportRow } }) => value(f, row.original.cells[f.id]),
    footer: () => value(f, props.totals[f.id]),
    meta: right,
  })),
])
</script>

<template>
  <!-- On a phone the table scrolls sideways inside its card, and the page never does. -->
  <div class="overflow-x-auto rounded-lg border border-default">
    <UTable
      :data="rows"
      :columns="columns"
      :caption="caption"
      sticky
      :ui="{ tfoot: 'font-medium' }"
    />
  </div>
</template>
