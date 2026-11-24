// A report's question in words, as the page and every copy say it: "Hamlet, 1 to 12 December 2026,
// by performance".
import type { PageBreakdown } from '../../shared/reports'

export function useQuestionText() {
  const { t } = useT()
  const { range } = useDates()
  return (scopeTitle: string | null, from: string, to: string, by: PageBreakdown | undefined) =>
    [scopeTitle, range(from, to), by ? t('reports.by-sentence', { by: t(`reports.by.${by}`).toLowerCase() }) : null].filter(Boolean).join(', ')
}
