// A report's question in words, as the page and every copy say it: "Hamlet, 1 to 12 December 2026,
// by performance, across month".
export function useQuestionText() {
  const { t } = useT()
  const { range } = useDates()
  return (scopeTitle: string | null, from: string, to: string, byName?: string, acrossName?: string) => [
    scopeTitle,
    range(from, to),
    byName ? t('reports.by-sentence', { by: byName.toLowerCase() }) : null,
    acrossName ? t('reports.across-sentence', { by: acrossName.toLowerCase() }) : null,
  ].filter(Boolean).join(', ')
}
