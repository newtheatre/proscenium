// Words shared by the Budgets screens: a finance year's name, a budget's, request's or claim's badge, and money.
export type BudgetState = 'draft' | 'proposed' | 'approved' | 'closed'
export type RequestState = 'requested' | 'approved' | 'declined' | 'withdrawn' | 'fulfilled' | 'lapsed'
export type ClaimState = 'draft' | 'submitted' | 'returned' | 'approved' | 'declined' | 'withdrawn' | 'voided' | 'paid'

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
  const REQUEST_TONES: Record<RequestState, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = { requested: 'info', approved: 'success', declined: 'danger', withdrawn: 'neutral', fulfilled: 'neutral', lapsed: 'warning' }
  const requestState = (s: RequestState) => ({ tone: REQUEST_TONES[s], label: t(`budgets.screens.request-states.${s}`) })
  const CLAIM_TONES: Record<ClaimState, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = { draft: 'neutral', submitted: 'info', returned: 'warning', approved: 'success', declined: 'danger', withdrawn: 'neutral', voided: 'neutral', paid: 'success' }
  const claimState = (s: ClaimState) => ({ tone: CLAIM_TONES[s], label: t(`budgets.screens.claim-states.${s}`) })
  return { year, state, requestState, claimState, money }
}

/** What a list of budget lines needs of each line. */
export interface SectionLine { id: string, name: string, figures: { over: boolean } }
