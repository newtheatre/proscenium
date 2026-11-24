// Reads a report's figures live, in parallel, for the page (rule R1): each readable figure by the
// rows (and the pivot), each row's and group's total and the grand total, because a distinct or
// level figure's total is never the sum of its parts (M6). Nothing is kept. The table is laid out
// by the same function a copy uses (B7).
import type { FigureAnswer, ReportView } from '../../shared/reports'
import { gather, readsFor } from '../../shared/plan'
import { layOut, type OkAnswer } from '../../shared/table'

export function useReportFigures(view: Ref<ReportView | undefined | null>, by: Ref<string | undefined>) {
  const { t } = useT()
  const { $api } = useNuxtApp()
  const { dayNamed, dateTime, monthYear } = useDates()

  const ready = computed(() => !!view.value && (view.value.scopeKind === 'none' || !!view.value.scope.id))
  const question = computed(() => {
    const v = view.value
    if (!v || !ready.value) return null
    return {
      from: v.period.from,
      to: v.period.to,
      ...(v.scope.id ? { scope: `${v.scope.kind}:${v.scope.id}` } : {}),
      ...(v.filter ? { filter: `${v.filter.key}:${v.filter.values.join(',')}` } : {}),
    }
  })
  const reads = computed(() => view.value ? readsFor(view.value.columns, by.value, view.value.acrossBy ?? undefined) : [])

  const { data, status, error, refresh } = useAsyncData(
    () => `reports:figures:${view.value?.id}:${JSON.stringify(question.value)}:${by.value ?? ''}:${JSON.stringify(view.value?.columns.map(c => c.kind === 'figure' ? c.id : c.formula))}`,
    async () => {
      if (!question.value) return null
      return await Promise.all(reads.value.map(r => $api<FigureAnswer>('/api/reports/figures', { query: { id: r.figure, ...question.value, ...(r.by.length ? { by: r.by.join(',') } : {}) } })))
    },
    { watch: [question, reads] },
  )

  function name(key: string, value: string, answer: OkAnswer) {
    if (key === 'day') return { label: dayNamed(value), sortBy: value }
    if (key === 'month') return { label: monthYear(`${value}-01`), sortBy: value }
    const title = answer.labels[value] ?? value
    const starts = key === 'performance' ? answer.starts?.[value] : undefined
    return starts ? { label: `${title}, ${dateTime(starts)}`, sortBy: starts } : { label: title, sortBy: title.toLowerCase() }
  }

  const table = computed(() => view.value && data.value
    ? layOut(view.value.columns, gather(reads.value, data.value), { rowsBy: by.value, acrossBy: view.value.acrossBy ?? undefined, name, totalLabel: t('reports.total') })
    : null)

  return { ready, table, status, error, refresh }
}
