// A report's question in words, as the page and every copy say it: "Hamlet, 1 to 12 December 2026,
// by performance, across month".
export function useQuestionText() {
  const { t } = useT()
  const { range } = useDates()
  return (scopeTitle: string | null, period: { from: string, to: string }, names: { by?: string, across?: string } = {}) => [
    scopeTitle,
    range(period.from, period.to),
    names.by ? t('reports.by-sentence', { by: names.by.toLowerCase() }) : null,
    names.across ? t('reports.across-sentence', { by: names.across.toLowerCase() }) : null,
  ].filter(Boolean).join(', ')
}
