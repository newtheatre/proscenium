// Words shared by the Budgets screens: a finance year's name, a state's badge, and a line's figures.
export type BudgetState = 'draft' | 'proposed' | 'approved' | 'closed'

export function useBudgetText() {
  const { t } = useT()
  const { money } = useMoneyText()
  /** "2026 to 2027", or "2026" for a year that starts in January. */
  const year = (startsOn: string) => {
    const first = Number(startsOn.slice(0, 4)) // not-policy: the year of a date
    return startsOn.slice(5) === '01-01' ? String(first) : t('budgets.screens.year', { from: first, to: first + 1 })
  }
  const TONES: Record<BudgetState, 'neutral' | 'info' | 'success' | 'warning'> = { draft: 'neutral', proposed: 'info', approved: 'success', closed: 'neutral' }
  const state = (s: BudgetState) => ({ tone: TONES[s], label: t(`budgets.screens.states.${s}`) })
  return { year, state, money }
}
