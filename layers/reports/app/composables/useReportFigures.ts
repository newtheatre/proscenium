// Reads a report's figures live, in parallel, for the page (rule R1): each readable figure once by
// the chosen breakdown and once for its total, because a distinct or level figure's total is never
// the sum of its rows (M6). Nothing is kept.
import type { FigureAnswer, FigureColumn, PageBreakdown, ReportView } from '../../shared/reports'
import { layOut, type OkAnswer } from '../../shared/table'

export function useReportFigures(view: Ref<ReportView | undefined | null>, by: Ref<PageBreakdown | undefined>) {
  const { $api } = useNuxtApp()
  const { dayNamed, dateTime, monthYear } = useDates()

  const ready = computed(() => !!view.value && (view.value.report.scope === 'none' || !!view.value.scope.id))
  const shown = computed<FigureColumn[]>(() => (view.value?.figures ?? []).filter(f => f.readable))
  const question = computed(() => view.value && ready.value
    ? { from: view.value.period.from, to: view.value.period.to, ...(view.value.scope.id ? { scope: `${view.value.scope.kind}:${view.value.scope.id}` } : {}) }
    : null)

  const read = (id: string, withBy: boolean) => $api<FigureAnswer>('/api/reports/figures', { query: { id, ...question.value, ...(withBy && by.value ? { by: by.value } : {}) } })
  const { data, status, error, refresh } = useAsyncData(
    () => `reports:figures:${view.value?.report.id}:${JSON.stringify(question.value)}:${by.value ?? ''}`,
    async () => {
      if (!question.value) return null
      const ids = shown.value.map(f => f.id)
      const [rows, totals] = await Promise.all([
        by.value ? Promise.all(ids.map(id => read(id, true))) : Promise.resolve(ids.map(() => null)),
        Promise.all(ids.map(id => read(id, false))),
      ])
      return Object.fromEntries(ids.map((id, i) => [id, { rows: rows[i] ?? null, total: totals[i]! }]))
    },
    { watch: [question, by] },
  )

  function name(key: string, answer: OkAnswer) {
    if (by.value === 'day') return { label: dayNamed(key), sortBy: key }
    if (by.value === 'month') return { label: monthYear(`${key}-01`), sortBy: key }
    const title = answer.labels[key] ?? key
    const starts = answer.starts?.[key]
    return starts ? { label: `${title}, ${dateTime(starts)}`, sortBy: starts } : { label: title, sortBy: title.toLowerCase() }
  }

  const table = computed(() => layOut(shown.value, data.value ?? {}, by.value, name))
  // A figure not yet answered counts as visible until its answer says otherwise.
  const visible = computed(() => data.value ? table.value.visible : shown.value)
  const hidden = computed(() => (view.value?.figures.length ?? 0) - visible.value.length)
  const totals = computed(() => table.value.totals)
  const rows = computed(() => table.value.rows)

  return { ready, visible, hidden, totals, rows, status, error, refresh }
}
