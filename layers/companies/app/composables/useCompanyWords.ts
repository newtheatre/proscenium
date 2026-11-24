// How a company and its engagements are described in a line: the kinds it has had, what is live,
// its primary contact and its last date.
export function useCompanyWords() {
  const { t } = useT()
  const dates = useDates()
  const STATE_TONES = { enquiry: 'neutral', offered: 'info', agreed: 'info', confirmed: 'success', completed: 'warning', settled: 'neutral', cancelled: 'neutral' } as const
  return {
    describe(c: { kinds: string[], live: number, primaryContact: string | null, lastDate: number | null }) {
      return [
        c.kinds.map(k => t(`companies.kinds.${k}`)).join(', ') || t('companies.no-engagements'),
        c.live ? t('companies.live', { count: c.live }) : null,
        c.primaryContact ? t('companies.primary-is', { name: c.primaryContact }) : null,
        c.lastDate ? t('companies.last-date', { date: dates.day(c.lastDate) }) : null,
      ].filter(Boolean).join(' · ')
    },
    stateBadge: (state: keyof typeof STATE_TONES) => ({ label: t(`companies.states.${state}`), tone: STATE_TONES[state] }),
  }
}
